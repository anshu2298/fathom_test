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
  userId,
  token,
  refreshToken,
  expires
) => {
  const expiresSeconds = Math.floor(expires || 0);
  const { error } = await supabase
    .from("fathom_connections")
    .upsert({
      user_id: userId,
      access_token: token,
      refresh_token: refreshToken,
      token_expires_at: expiresSeconds,
    });

  if (error) {
    console.error("❌ Error storing tokens:", error);
    throw error;
  }

  console.log(
    `✅ Tokens stored successfully for user: ${userId}`
  );
};

const fetchConnectionRow = async (userId) => {
  const { data, error } = await supabase
    .from("fathom_connections")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("❌ Error fetching connection:", error);
    throw error;
  }

  return data;
};

const refreshStoredAccessToken = async (
  userId,
  connection
) => {
  ensureFathomEnv();

  if (!connection?.refresh_token) {
    throw new Error(
      "No refresh token stored for this user"
    );
  }

  console.log(
    `🔄 Refreshing Fathom access token for user: ${userId}...`
  );

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
    userId,
    json.access_token,
    json.refresh_token ?? connection.refresh_token,
    expiresAt
  );

  return json.access_token;
};

const getValidAccessToken = async (userId) => {
  ensureFathomEnv();
  const connection = await fetchConnectionRow(userId);

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

  return refreshStoredAccessToken(userId, connection);
};

// Helper function to extract user_id from request
const getUserId = (req) => {
  // Try query parameter first, then header, then body
  return (
    req.query.user_id ||
    req.headers["x-user-id"] ||
    req.body?.user_id ||
    null
  );
};

// Helper function to validate user_id
const validateUserId = (userId) => {
  if (
    !userId ||
    typeof userId !== "string" ||
    userId.trim() === ""
  ) {
    throw new Error(
      "user_id is required and must be a non-empty string"
    );
  }
  return userId.trim();
};

// ============================================
// Route 1: Start OAuth
// ============================================
app.get("/api/fathom/connect", (req, res) => {
  const userId = getUserId(req);

  if (!userId) {
    return res.status(400).json({
      error:
        "user_id is required. Provide it as a query parameter: ?user_id=your-user-id",
    });
  }

  try {
    validateUserId(userId);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  // Store user_id in state for callback
  const state = Buffer.from(
    JSON.stringify({ userId })
  ).toString("base64");

  const authUrl = Fathom.getAuthorizationUrl({
    clientId: process.env.FATHOM_CLIENT_ID,
    clientSecret: process.env.FATHOM_CLIENT_SECRET,
    redirectUri: `${process.env.APP_URL}/api/fathom/callback`,
    scope: "public_api",
    state: state,
  });

  res.redirect(authUrl);
});

// ============================================
// Route 2: Handle OAuth Callback
// ============================================
app.get("/api/fathom/callback", async (req, res) => {
  const { code, state } = req.query;

  if (!code) {
    return res.status(400).send("No authorization code");
  }

  // Extract user_id from state
  let userId;
  try {
    if (state) {
      const decodedState = JSON.parse(
        Buffer.from(state, "base64").toString()
      );
      userId = decodedState.userId;
    }
  } catch (e) {
    console.warn(
      "Could not decode state, user_id may be missing"
    );
  }

  if (!userId) {
    return res.status(400).send(`
      <h1>❌ Missing User ID</h1>
      <p>User ID is required for OAuth callback. Please initiate the connection from the main page.</p>
      <a href="/">Back to test page</a>
    `);
  }

  try {
    validateUserId(userId);
    console.log(
      `🔐 Starting OAuth callback for user: ${userId} with code:`,
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

    // Token store for Supabase (scoped to user_id)
    const tokenStore = {
      get: async () => {
        const data = await fetchConnectionRow(userId);

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
        console.log(
          `💾 Storing tokens in database for user: ${userId}`
        );
        await persistConnectionTokens(
          userId,
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

    // Create webhook with user-specific URL
    const webhookUrl = `${process.env.APP_URL}/api/fathom/webhook/${userId}`;
    console.log(
      `📡 Creating webhook for user ${userId} with URL:`,
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
      .eq("user_id", userId);

    res.send(`
      <h1>✅ Fathom Connected!</h1>
      <p><strong>User ID:</strong> ${userId}</p>
      <p><strong>Webhook created:</strong> ${webhook.id}</p>
      <p><strong>Webhook URL:</strong> ${webhookUrl}</p>
      <a href="/?user_id=${userId}">Back to test page</a>
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
      <p><strong>User ID:</strong> ${
        userId || "Unknown"
      }</p>
      <p><strong>Error:</strong> ${error.message}</p>
      ${errorDetails}
      <p><strong>Server logs:</strong> Check server console for more information</p>
      <a href="/?user_id=${
        userId || ""
      }">Back to test page</a>
      <br><br>
      <a href="/api/fathom/connect?user_id=${
        userId || ""
      }">Try connecting again</a>
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

    try {
      validateUserId(userId);
    } catch (error) {
      console.error(
        "❌ Invalid user_id in webhook:",
        error.message
      );
      return res.status(400).json({ error: error.message });
    }

    console.log(`📩 Webhook received for user: ${userId}`);
    console.log(
      "Meeting title:",
      payload.title || payload.meeting_title
    );

    try {
      // Normalize transcript format - ensure it's always an array
      let transcript = payload.transcript || [];
      if (
        transcript &&
        typeof transcript === "object" &&
        !Array.isArray(transcript)
      ) {
        // If it's an object with a transcript property, extract it
        if (
          transcript.transcript &&
          Array.isArray(transcript.transcript)
        ) {
          transcript = transcript.transcript;
        } else {
          // Otherwise, wrap it in an array or use empty array
          transcript = [];
        }
      }

      // Insert into database (scoped to user_id)
      await supabase.from("meeting_transcripts").insert({
        user_id: userId,
        title: payload.title || payload.meeting_title,
        transcript: transcript,
        created_at:
          payload.created_at || new Date().toISOString(),
      });

      console.log(
        `✅ Meeting saved to database for user: ${userId}`
      );
      res
        .status(200)
        .json({ success: true, user_id: userId });
    } catch (error) {
      console.error(
        `❌ Webhook error for user ${userId}:`,
        error
      );
      res.status(500).json({ error: error.message });
    }
  }
);

// ============================================
// Route 4: Get Meetings (for testing UI)
// ============================================
app.get("/api/fathom/meetings", async (req, res) => {
  const userId = getUserId(req);

  if (!userId) {
    return res.status(400).json({
      error:
        "user_id is required. Provide it as a query parameter: ?user_id=your-user-id",
    });
  }

  try {
    validateUserId(userId);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  const { data, error } = await supabase
    .from("meeting_transcripts")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ meetings: data || [] });
});

// ============================================
// Route 5: Backfill Historical Meetings
// ============================================

app.post("/api/fathom/import", async (req, res) => {
  const userId = getUserId(req);

  if (!userId) {
    return res.status(400).json({
      error:
        "user_id is required. Provide it as a query parameter, header (x-user-id), or in request body",
    });
  }

  try {
    validateUserId(userId);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  try {
    const accessToken = await getValidAccessToken(userId);
    const fathom = new Fathom({
      security: {
        bearerAuth: accessToken,
      },
    });

    // Get all meetings with full details
    const iterator = await fathom.listMeetings({});
    const processed = [];
    const skipped = [];

    console.log(
      `🗂️ Starting import of all historical meetings for user: ${userId}...`
    );

    for await (const page of iterator) {
      const meetings = page?.result?.items || [];
      console.log(
        `📄 Processing page with ${meetings.length} meetings`
      );

      for (const meeting of meetings) {
        if (!meeting.recordingId) {
          console.log(
            "⚠️ Skipping meeting without recordingId:",
            meeting.title
          );
          continue;
        }

        // Check if meeting already exists in database
        const { data: existingMeeting } = await supabase
          .from("meeting_transcripts")
          .select("recording_id")
          .eq("user_id", userId)
          .eq("recording_id", meeting.recordingId)
          .maybeSingle();

        if (existingMeeting) {
          console.log(
            `⏭️ Skipping meeting ${meeting.recordingId} - already exists in database:`,
            meeting.title
          );
          skipped.push({
            recordingId: meeting.recordingId,
            title: meeting.title,
            createdAt: meeting.createdAt,
            reason: "already_exists",
          });
          continue;
        }

        console.log(
          "🗂️ Fetching transcript for:",
          meeting.recordingId,
          "-",
          meeting.title
        );

        try {
          // Fetch transcript directly (not via webhook)
          const url = `https://api.fathom.ai/external/v1/recordings/${meeting.recordingId}/transcript`;

          const response = await fetch(url, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error(
              `❌ API error for ${meeting.recordingId}:`,
              response.status,
              errorText
            );
            throw new Error(
              `API returned ${response.status}`
            );
          }

          const transcript = await response.json();
          console.log(
            `✅ Got transcript with ${transcript.length} items`
          );

          // Insert directly into database with full meeting details (scoped to user_id)
          await supabase
            .from("meeting_transcripts")
            .insert({
              user_id: userId,
              recording_id: meeting.recordingId,
              title: meeting.title,
              meeting_title:
                meeting.meetingTitle || meeting.title,
              url: meeting.url,
              transcript: transcript,
              raw_payload: { meeting, transcript },
              created_at:
                meeting.createdAt ||
                new Date().toISOString(),
            });

          processed.push({
            recordingId: meeting.recordingId,
            title: meeting.title,
            createdAt: meeting.createdAt,
            transcriptItems: transcript.length,
          });

          console.log(
            `✅ Saved meeting ${processed.length} to database for user: ${userId}`
          );
        } catch (err) {
          console.error(
            `❌ Failed to process ${meeting.recordingId}:`,
            err.message
          );
          skipped.push({
            recordingId: meeting.recordingId,
            title: meeting.title,
            createdAt: meeting.createdAt,
            reason: "error",
            error: err.message,
          });
        }
      }
    }

    const totalProcessed = processed.length;
    const totalSkipped = skipped.length;

    console.log(
      `🎉 Finished importing for user: ${userId} - ${totalProcessed} new meetings imported, ${totalSkipped} skipped`
    );

    if (totalProcessed === 0 && totalSkipped === 0) {
      return res.json({
        imported: 0,
        skipped: 0,
        message: "No meetings found.",
      });
    }

    res.json({
      imported: totalProcessed,
      skipped: totalSkipped,
      message: `Successfully imported ${totalProcessed} new meeting(s). ${totalSkipped} meeting(s) were skipped (already exist or errors).`,
      meetings: processed,
      skipped_meetings: skipped,
    });
  } catch (error) {
    console.error("❌ Historical import error:", error);
    res.status(500).json({
      error:
        error?.message ||
        "Failed to import historical meetings",
    });
  }
});

// ============================================
// Bonus: Check connection status
// ============================================
app.get("/api/fathom/status", async (req, res) => {
  const userId = getUserId(req);

  if (!userId) {
    return res.status(400).json({
      error:
        "user_id is required. Provide it as a query parameter: ?user_id=your-user-id",
    });
  }

  try {
    validateUserId(userId);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  const { data } = await supabase
    .from("fathom_connections")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  res.json({
    connected: !!data,
    webhook_id: data?.webhook_id,
    user_id: userId,
  });
});

app.listen(3000, () => {
  console.log(
    "🚀 Test server running on http://localhost:3000"
  );
});
