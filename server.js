import express from "express";
import { Fathom } from "fathom-typescript";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();
const app = express();
app.use(express.json());
app.use(express.static("public"));

// ============================================================
// Debug helper: log Fathom OAuth token exchange failures
// ============================================================
if (typeof fetch === "function") {
  const originalFetch = fetch;
  global.fetch = async (url, options) => {
    const response = await originalFetch(url, options);

    const isTokenEndpoint =
      typeof url === "string" &&
      url.includes("fathom.video/external/v1/oauth2/token");

    if (isTokenEndpoint && !response.ok) {
      try {
        const cloned = response.clone();
        const errorBody = await cloned.text();
        console.error(
          "🛑 Fathom OAuth token exchange failed:",
          response.status,
          errorBody
        );
      } catch (cloneError) {
        console.error(
          "🛑 Fathom OAuth token exchange failed and response body could not be read:",
          cloneError
        );
      }
    }

    return response;
  };
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const FATHOM_TOKEN_URL =
  "https://fathom.video/external/v1/oauth2/token";
const TOKEN_REFRESH_BUFFER_SECONDS = 60;

const ensureFathomEnv = () => {
  if (
    !process.env.FATHOM_CLIENT_ID ||
    !process.env.FATHOM_CLIENT_SECRET
  ) {
    throw new Error(
      "Missing FATHOM_CLIENT_ID or FATHOM_CLIENT_SECRET"
    );
  }
};

const persistConnectionTokens = async (
  token,
  refreshToken,
  expires
) => {
  const expiresSeconds = Math.floor(expires || 0);
  const { error } = await supabase
    .from("fathom_connections")
    .upsert({
      user_id: TEST_USER_ID,
      access_token: token,
      refresh_token: refreshToken,
      token_expires_at: expiresSeconds,
    });

  if (error) {
    console.error("❌ Error storing tokens:", error);
    throw error;
  }

  console.log("✅ Tokens stored successfully");
};

const fetchConnectionRow = async () => {
  const { data, error } = await supabase
    .from("fathom_connections")
    .select("*")
    .eq("user_id", TEST_USER_ID)
    .maybeSingle();

  if (error) {
    console.error("❌ Error fetching connection:", error);
    throw error;
  }

  return data;
};

const refreshStoredAccessToken = async (connection) => {
  ensureFathomEnv();

  if (!connection?.refresh_token) {
    throw new Error(
      "No refresh token stored for this user"
    );
  }

  console.log("🔄 Refreshing Fathom access token...");

  const response = await fetch(FATHOM_TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: process.env.FATHOM_CLIENT_ID,
      client_secret: process.env.FATHOM_CLIENT_SECRET,
      refresh_token: connection.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(
      "🛑 Token refresh failed:",
      response.status,
      errorText
    );
    throw new Error(
      `Failed to refresh access token (${response.status})`
    );
  }

  const json = await response.json();
  const expiresAt =
    Math.floor(Date.now() / 1000) +
    (json.expires_in ?? 0) -
    TOKEN_REFRESH_BUFFER_SECONDS;

  await persistConnectionTokens(
    json.access_token,
    json.refresh_token ?? connection.refresh_token,
    expiresAt
  );

  return json.access_token;
};

const getValidAccessToken = async () => {
  ensureFathomEnv();
  const connection = await fetchConnectionRow();

  if (!connection || !connection.access_token) {
    throw new Error(
      "This user has not connected Fathom yet. Please run the OAuth flow first."
    );
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const expiresAt = connection.token_expires_at || 0;

  if (
    expiresAt >
    nowSeconds + TOKEN_REFRESH_BUFFER_SECONDS
  ) {
    return connection.access_token;
  }

  return refreshStoredAccessToken(connection);
};

// For testing, use a hardcoded test user ID
const TEST_USER_ID = "test-user-123";

// ============================================
// Route 1: Start OAuth
// ============================================
app.get("/api/fathom/connect", (req, res) => {
  const authUrl = Fathom.getAuthorizationUrl({
    clientId: process.env.FATHOM_CLIENT_ID,
    clientSecret: process.env.FATHOM_CLIENT_SECRET,
    redirectUri: `${process.env.APP_URL}/api/fathom/callback`,
    scope: "public_api",
    state: "test-state",
  });

  res.redirect(authUrl);
});

// ============================================
// Route 2: Handle OAuth Callback
// ============================================
app.get("/api/fathom/callback", async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send("No authorization code");
  }

  try {
    console.log(
      "🔐 Starting OAuth callback with code:",
      code
    );

    // Verify environment variables
    if (
      !process.env.FATHOM_CLIENT_ID ||
      !process.env.FATHOM_CLIENT_SECRET
    ) {
      throw new Error(
        "Missing FATHOM_CLIENT_ID or FATHOM_CLIENT_SECRET"
      );
    }

    const redirectUri = `${process.env.APP_URL}/api/fathom/callback`;
    console.log("🔗 Redirect URI:", redirectUri);
    console.log(
      "🔑 Client ID:",
      process.env.FATHOM_CLIENT_ID?.substring(0, 10) + "..."
    );

    // Token store for Supabase
    const tokenStore = {
      get: async () => {
        const data = await fetchConnectionRow();

        if (!data || !data.access_token) {
          console.log(
            "📭 No existing token found in database"
          );
          return {
            token: "",
            refresh_token: "",
            expires: 0,
          };
        }

        console.log("📦 Found existing token in database");
        return {
          token: data.access_token || "",
          refresh_token: data.refresh_token || "",
          expires: data.token_expires_at || 0,
        };
      },

      set: async (token, refresh_token, expires) => {
        console.log("💾 Storing tokens in database");
        await persistConnectionTokens(
          token,
          refresh_token,
          expires
        );
      },
    };

    // Initialize Fathom with OAuth
    console.log("🚀 Initializing Fathom client...");
    const getSecurity = Fathom.withAuthorization({
      clientId: process.env.FATHOM_CLIENT_ID,
      clientSecret: process.env.FATHOM_CLIENT_SECRET,
      code: String(code), // Ensure code is a string
      redirectUri: redirectUri,
      tokenStore,
    });

    const fathom = new Fathom({
      security: getSecurity,
    });

    // Verify Fathom instance is properly initialized
    console.log("🔍 Fathom instance created");

    if (!fathom) {
      throw new Error(
        "Fathom instance not properly initialized"
      );
    }

    // Create webhook
    const webhookUrl = `${process.env.APP_URL}/api/fathom/webhook/${TEST_USER_ID}`;
    console.log(
      "📡 Creating webhook with URL:",
      webhookUrl
    );

    const webhook = await fathom.createWebhook({
      destinationUrl: webhookUrl,
      includeTranscript: true,
      includeSummary: true,
      triggeredFor: ["my_recordings"], // Required: array of recording types to trigger on
    });

    // Store webhook ID
    await supabase
      .from("fathom_connections")
      .update({ webhook_id: webhook.id })
      .eq("user_id", TEST_USER_ID);

    res.send(`
      <h1>✅ Fathom Connected!</h1>
      <p>Webhook created: ${webhook.id}</p>
      <p>Webhook URL: ${webhookUrl}</p>
      <a href="/">Back to test page</a>
    `);
  } catch (error) {
    console.error("❌ OAuth error:", error);
    console.error("Error stack:", error.stack);

    // Provide helpful error message
    let errorDetails = error.message;
    if (error.message.includes("status code: 400")) {
      errorDetails = `
        <p><strong>OAuth Token Exchange Failed (400)</strong></p>
        <p>Common causes:</p>
        <ul>
          <li>The redirect URI in your Fathom OAuth app settings must match exactly: <code>${process.env.APP_URL}/api/fathom/callback</code></li>
          <li>Authorization codes can only be used once - try clicking "Connect Fathom" again</li>
          <li>Authorization codes expire quickly - make sure you're completing the flow promptly</li>
          <li>Check that your FATHOM_CLIENT_ID and FATHOM_CLIENT_SECRET are correct</li>
        </ul>
        <p><strong>Redirect URI used:</strong> <code>${process.env.APP_URL}/api/fathom/callback</code></p>
      `;
    }

    res.status(500).send(`
      <h1>❌ Error Connecting to Fathom</h1>
      <p><strong>Error:</strong> ${error.message}</p>
      ${errorDetails}
      <p><strong>Server logs:</strong> Check server console for more information</p>
      <a href="/">Back to test page</a>
      <br><br>
      <a href="/api/fathom/connect">Try connecting again</a>
    `);
  }
});

// ============================================
// Route 3: Webhook Receiver
// ============================================
app.post(
  "/api/fathom/webhook/:userId",
  async (req, res) => {
    const { userId } = req.params;
    const payload = req.body;

    console.log("📩 Webhook received for user:", userId);
    console.log("Meeting title:", payload.title);

    try {
      // Insert into database
      await supabase.from("meeting_transcripts").insert({
        user_id: userId,
        title: payload.title || payload.meeting_title,
        transcript: payload.transcript || [],
        created_at: payload.created_at,
      });

      console.log("✅ Meeting saved to database");
      res.status(200).json({ success: true });
    } catch (error) {
      console.error("Webhook error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// ============================================
// Route 4: Get Meetings (for testing UI)
// ============================================
app.get("/api/fathom/meetings", async (req, res) => {
  const { data, error } = await supabase
    .from("meeting_transcripts")
    .select("*")
    .eq("user_id", TEST_USER_ID)
    .order("created_at", { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ meetings: data });
});

// ============================================
// Route 5: Backfill Historical Meetings
// ============================================
app.post("/api/fathom/import", async (req, res) => {
  try {
    const limitRaw = req.body?.limit;
    const limit = Math.min(
      Math.max(parseInt(limitRaw, 10) || 20, 1),
      100
    );

    const filters = {};

    if (req.body?.createdAfter) {
      filters.createdAfter = req.body.createdAfter;
    }
    if (req.body?.createdBefore) {
      filters.createdBefore = req.body.createdBefore;
    }

    const accessToken = await getValidAccessToken();
    const fathom = new Fathom({
      security: {
        bearerAuth: accessToken,
      },
    });

    // CORRECTED: Use recordings.getTranscript instead of getRecordingTranscript
    const iterator = await fathom.listMeetings(filters);
    const requested = [];
    const webhookDestination = `${process.env.APP_URL}/api/fathom/webhook/${TEST_USER_ID}?source=backfill`;

    for await (const page of iterator) {
      const meetings = page?.result?.items || [];

      for (const meeting of meetings) {
        if (!meeting.recordingId) {
          console.log(
            "⚠️ Skipping meeting without recordingId:",
            meeting.title
          );
          continue;
        }

        console.log(
          "🗂️ Requesting transcript backfill for recording:",
          meeting.recordingId
        );

        try {
          // CORRECTED: Proper SDK method call
          await fathom.recordings.getTranscript({
            recordingId: String(meeting.recordingId),
            destinationUrl: webhookDestination,
          });

          requested.push({
            recordingId: meeting.recordingId,
            title: meeting.title,
            createdAt: meeting.createdAt,
          });
        } catch (err) {
          console.error(
            `❌ Failed to request transcript for ${meeting.recordingId}:`,
            err.message
          );
        }

        if (requested.length >= limit) {
          break;
        }
      }

      if (requested.length >= limit) {
        break;
      }
    }

    if (requested.length === 0) {
      return res.json({
        requested: 0,
        message:
          "No historical meetings matched the provided filters.",
      });
    }

    res.json({
      requested: requested.length,
      message:
        "Requested transcripts for existing meetings. They will be delivered via the webhook shortly.",
      meetings: requested,
    });
  } catch (error) {
    console.error("❌ Historical import error:", error);
    res.status(500).json({
      error:
        error?.message ||
        "Failed to import historical meetings from Fathom",
    });
  }
});

// ============================================
// Bonus: Check connection status
// ============================================
app.get("/api/fathom/status", async (req, res) => {
  const { data } = await supabase
    .from("fathom_connections")
    .select("*")
    .eq("user_id", TEST_USER_ID)
    .single();

  res.json({
    connected: !!data,
    webhook_id: data?.webhook_id,
  });
});

app.listen(3000, () => {
  console.log(
    "🚀 Test server running on http://localhost:3000"
  );
});
