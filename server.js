import express from "express";
import { Fathom } from "fathom-typescript";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import crypto from "crypto";
dotenv.config();
const app = express();
app.use(express.json());
app.use(express.static("public"));

// ============================================================
// Webhook Logging Middleware
// ============================================================
app.use("/api/fathom/webhook/:userId", (req, res, next) => {
  const requestId = `webhook-${Date.now()}-${Math.random()
    .toString(36)
    .substring(7)}`;
  const timestamp = new Date().toISOString();

  console.log("=".repeat(80));
  console.log(
    `🔔 WEBHOOK REQUEST [${requestId}] at ${timestamp}`
  );
  console.log(`📍 URL: ${req.method} ${req.originalUrl}`);
  console.log(`👤 User ID: ${req.params.userId}`);
  console.log(
    `📦 Headers:`,
    JSON.stringify(req.headers, null, 2)
  );
  console.log(`📄 Body keys:`, Object.keys(req.body || {}));
  console.log(
    `📄 Body preview:`,
    JSON.stringify(req.body).substring(0, 500)
  );
  console.log("=".repeat(80));

  // Attach request ID to request for later use
  req.webhookRequestId = requestId;
  next();
});

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

    // Create webhook according to official Fathom API
    // Try SDK first (may use camelCase), fallback to raw API if needed
    let webhook;
    try {
      // Try with camelCase (typical TypeScript SDK format)
      webhook = await fathom.createWebhook({
        destinationUrl: webhookUrl,
        includeTranscript: true,
        includeSummary: false, // We don't use summary
        includeActionItems: false, // We don't use action items
        includeCrmMatches: false, // We don't use CRM matches
        triggeredFor: ["my_recordings"], // Required: array of recording types to trigger on
      });
    } catch (sdkError) {
      // If SDK fails, use raw API call with snake_case (official API format)
      console.log(
        "⚠️ SDK webhook creation failed, trying raw API..."
      );
      const accessToken = await getValidAccessToken(userId);
      const response = await fetch(
        "https://api.fathom.ai/external/v1/webhooks",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            destination_url: webhookUrl,
            include_transcript: true,
            include_summary: false,
            include_action_items: false,
            include_crm_matches: false,
            triggered_for: ["my_recordings"],
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Webhook creation failed: ${response.status} - ${errorText}`
        );
      }

      webhook = await response.json();
    }

    // Verify webhook was created successfully
    if (!webhook || !webhook.id) {
      throw new Error(
        "Webhook creation failed: No webhook ID returned"
      );
    }

    console.log("✅ Webhook created successfully:", {
      id: webhook.id,
      url: webhook.url || webhookUrl,
      secret: webhook.secret
        ? "***" + webhook.secret.slice(-4)
        : "none",
      created_at: webhook.created_at,
      include_transcript:
        webhook.include_transcript ||
        webhook.includeTranscript,
      triggered_for:
        webhook.triggered_for || webhook.triggeredFor,
    });

    // Store webhook ID and secret for signature verification
    const { error: updateError } = await supabase
      .from("fathom_connections")
      .update({
        webhook_id: webhook.id,
        webhook_secret: webhook.secret || null, // Store secret for signature verification
        webhook_created_at:
          webhook.created_at || new Date().toISOString(),
      })
      .eq("user_id", userId);

    if (updateError) {
      console.error(
        "❌ Error storing webhook info:",
        updateError
      );
      throw new Error(
        `Failed to store webhook: ${updateError.message}`
      );
    }

    console.log(
      `✅ Webhook info stored for user: ${userId}`
    );

    // Verify webhook exists in Fathom by fetching it
    try {
      const accessToken = await getValidAccessToken(userId);
      const verifyResponse = await fetch(
        `https://api.fathom.ai/external/v1/webhooks/${webhook.id}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (verifyResponse.ok) {
        const verifiedWebhook = await verifyResponse.json();
        console.log("✅ Webhook verified in Fathom:", {
          id: verifiedWebhook.id,
          url: verifiedWebhook.url,
          active: true,
        });
      } else {
        console.warn(
          "⚠️ Could not verify webhook in Fathom:",
          verifyResponse.status
        );
      }
    } catch (verifyError) {
      console.warn(
        "⚠️ Webhook verification failed (non-critical):",
        verifyError.message
      );
    }

    // Redirect to home page with success message
    res.redirect(
      `/?user_id=${encodeURIComponent(
        userId
      )}&connected=true&webhook_id=${encodeURIComponent(
        webhook.id
      )}`
    );
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
// Helper function to verify webhook signature (if Fathom provides it)
async function verifyWebhookSignature(req, webhookSecret) {
  if (!webhookSecret) {
    console.warn(
      "⚠️ No webhook secret available for signature verification"
    );
    return true; // Allow if no secret configured
  }

  // Check for signature in headers (common patterns)
  const signature =
    req.headers["x-fathom-signature"] ||
    req.headers["x-webhook-signature"] ||
    req.headers["signature"];

  if (!signature) {
    console.warn(
      "⚠️ No signature header found in webhook request"
    );
    return true; // Allow if no signature (Fathom may not send it)
  }

  // Verify signature using HMAC
  try {
    const rawBody = JSON.stringify(req.body);
    const hmac = crypto.createHmac("sha256", webhookSecret);
    hmac.update(rawBody);
    const expectedSignature = hmac.digest("hex");

    // Compare signatures (constant-time comparison)
    const providedSignature = signature.replace(
      /^sha256=/,
      ""
    );
    const isValid = crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(providedSignature)
    );

    if (!isValid) {
      console.error(
        "❌ Webhook signature verification failed"
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error(
      "❌ Error verifying webhook signature:",
      error
    );
    return false;
  }
}

app.post(
  "/api/fathom/webhook/:userId",
  async (req, res) => {
    const requestId = req.webhookRequestId || "unknown";
    const { userId } = req.params;
    const payload = req.body;
    const startTime = Date.now();

    // CRITICAL: Respond quickly to avoid webhook timeouts
    // We'll process the data asynchronously after responding
    let responded = false;

    // Helper to send response once
    const sendResponse = (status, data) => {
      if (responded) return;
      responded = true;
      res.status(status).json(data);
    };

    // Wrap entire handler in try-catch for comprehensive error handling
    try {
      // Validate user_id
      try {
        validateUserId(userId);
      } catch (error) {
        console.error(
          `❌ [${requestId}] Invalid user_id in webhook:`,
          error.message
        );
        return sendResponse(400, {
          error: error.message,
          request_id: requestId,
        });
      }

      // Get webhook secret for signature verification
      let webhookSecret = null;
      try {
        const { data: connection } = await supabase
          .from("fathom_connections")
          .select("webhook_secret")
          .eq("user_id", userId)
          .maybeSingle();
        webhookSecret = connection?.webhook_secret;
      } catch (dbError) {
        console.warn(
          `⚠️ [${requestId}] Could not fetch webhook secret:`,
          dbError
        );
      }

      // Verify webhook signature (non-blocking if verification fails)
      const signatureValid = await verifyWebhookSignature(
        req,
        webhookSecret
      );
      if (!signatureValid) {
        console.error(
          `❌ [${requestId}] Webhook signature verification failed`
        );
        return sendResponse(401, {
          error: "Invalid webhook signature",
          request_id: requestId,
        });
      }

      console.log(
        `📩 [${requestId}] Webhook received for user: ${userId}`
      );
      console.log(
        `📩 [${requestId}] Payload keys:`,
        Object.keys(payload || {})
      );

      // Log full payload only in development or for debugging
      if (process.env.NODE_ENV !== "production") {
        console.log(
          `📩 [${requestId}] Full payload:`,
          JSON.stringify(payload, null, 2)
        );
      }

      // Extract meeting information from Fathom webhook payload
      // Fathom may send data in different formats, so we check multiple possible fields
      const meetingTitle =
        payload.title ||
        payload.meeting_title ||
        payload.name ||
        "Untitled Meeting";
      const recordingId =
        payload.recording_id ||
        payload.recordingId ||
        payload.id ||
        null;
      const meetingUrl =
        payload.url || payload.recording_url || null;
      const createdAt =
        payload.created_at ||
        payload.createdAt ||
        payload.timestamp ||
        new Date().toISOString();

      console.log(`📋 [${requestId}] Meeting info:`, {
        title: meetingTitle,
        recording_id: recordingId,
        url: meetingUrl,
        created_at: createdAt,
      });
      // Check for duplicate if recording_id exists
      if (recordingId) {
        console.log(
          `🔍 [${requestId}] Checking for duplicate meeting: ${recordingId}`
        );
        const { data: existingMeeting, error: checkError } =
          await supabase
            .from("meeting_transcripts")
            .select("recording_id")
            .eq("user_id", userId)
            .eq("recording_id", recordingId)
            .maybeSingle();

        if (checkError) {
          console.error(
            `❌ [${requestId}] Error checking for duplicate:`,
            checkError
          );
        }

        if (existingMeeting) {
          console.log(
            `⏭️ [${requestId}] Skipping duplicate meeting ${recordingId} for user: ${userId}`
          );
          const responseTime = Date.now() - startTime;
          console.log(
            `✅ [${requestId}] Webhook processed (duplicate) in ${responseTime}ms`
          );
          return sendResponse(200, {
            success: true,
            user_id: userId,
            message: "Meeting already exists",
            duplicate: true,
            request_id: requestId,
            response_time_ms: responseTime,
          });
        }
      }

      // Normalize transcript format - ensure it's always an array
      // Fathom sends transcript as an array when include_transcript: true
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

      // Validate transcript is an array
      if (!Array.isArray(transcript)) {
        console.warn(
          "⚠️ Transcript is not an array, converting to empty array"
        );
        transcript = [];
      }

      // Insert into database (scoped to user_id)
      // Store all available fields from Fathom webhook
      const insertData = {
        user_id: userId,
        title: meetingTitle,
        transcript: transcript,
        created_at: createdAt,
      };

      // Add optional fields if available
      if (recordingId) {
        insertData.recording_id = recordingId;
      }
      if (meetingUrl) {
        insertData.url = meetingUrl;
      }
      if (
        payload.meeting_title &&
        payload.meeting_title !== meetingTitle
      ) {
        insertData.meeting_title = payload.meeting_title;
      }

      // Respond quickly to Fathom (within 2 seconds) to avoid timeout
      // Process database insert asynchronously after response
      const responseTime = Date.now() - startTime;

      // Send immediate response
      sendResponse(200, {
        success: true,
        user_id: userId,
        recording_id: recordingId,
        transcript_items: transcript.length,
        request_id: requestId,
        response_time_ms: responseTime,
        processing: "async",
      });

      // Process database insert asynchronously (don't await)
      (async () => {
        try {
          console.log(
            `💾 [${requestId}] Inserting meeting into database (async):`,
            {
              ...insertData,
              transcript: `[${transcript.length} items]`,
            }
          );

          const { data: insertedData, error: insertError } =
            await supabase
              .from("meeting_transcripts")
              .insert(insertData)
              .select();

          if (insertError) {
            console.error(
              `❌ [${requestId}] Database insert error:`,
              insertError
            );
            console.error(
              `❌ [${requestId}] Insert data was:`,
              insertData
            );
            // Log error but don't fail webhook (already responded)
            return;
          }

          const totalTime = Date.now() - startTime;
          console.log(
            `✅ [${requestId}] Meeting saved to database for user: ${userId}${
              recordingId
                ? ` (recording_id: ${recordingId})`
                : ""
            } in ${totalTime}ms`
          );
          if (process.env.NODE_ENV !== "production") {
            console.log(
              `✅ [${requestId}] Inserted record:`,
              insertedData
            );
          }
        } catch (asyncError) {
          console.error(
            `❌ [${requestId}] Async processing error:`,
            asyncError
          );
        }
      })();
    } catch (error) {
      const responseTime = Date.now() - startTime;
      console.error("=".repeat(80));
      console.error(
        `❌ [${requestId}] WEBHOOK ERROR after ${responseTime}ms`
      );
      console.error(
        `❌ [${requestId}] Error message:`,
        error.message
      );
      console.error(
        `❌ [${requestId}] Error stack:`,
        error.stack
      );
      console.error(`❌ [${requestId}] User ID:`, userId);
      if (process.env.NODE_ENV !== "production") {
        console.error(
          `❌ [${requestId}] Payload:`,
          JSON.stringify(payload, null, 2)
        );
      }
      console.error("=".repeat(80));

      sendResponse(500, {
        error: error.message,
        request_id: requestId,
        response_time_ms: responseTime,
      });
    }
  }
);

// ============================================
// Route 3.5: Webhook Status Check
// ============================================
app.get("/api/fathom/webhook-status", async (req, res) => {
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

  try {
    // Get webhook info from database
    const { data: connection, error: dbError } =
      await supabase
        .from("fathom_connections")
        .select("webhook_id, webhook_secret")
        .eq("user_id", userId)
        .maybeSingle();

    if (dbError) {
      throw new Error(`Database error: ${dbError.message}`);
    }

    if (!connection || !connection.webhook_id) {
      return res.json({
        connected: false,
        webhook_exists: false,
        message:
          "No webhook found. Please connect Fathom first.",
        user_id: userId,
      });
    }

    // Use ensureWebhookExists to verify and auto-recreate if needed
    const webhookStatus = await ensureWebhookExists(userId);

    if (!webhookStatus.exists) {
      return res.json({
        connected: true,
        webhook_exists: false,
        webhook_id: connection.webhook_id,
        error:
          webhookStatus.error ||
          "Webhook not found in Fathom",
        message:
          "Webhook was deleted or doesn't exist. It will be recreated automatically on next check.",
        user_id: userId,
      });
    }

    // Webhook exists and is verified (may have been recreated)
    const webhook = webhookStatus.webhook;
    return res.json({
      connected: true,
      webhook_exists: true,
      webhook_id: webhook.id,
      webhook_recreated: webhookStatus.recreated || false,
      webhook_details: {
        id: webhook.id,
        url: webhook.url,
        created_at: webhook.created_at,
        include_transcript: webhook.include_transcript,
        include_summary: webhook.include_summary,
        include_action_items: webhook.include_action_items,
        include_crm_matches: webhook.include_crm_matches,
        triggered_for: webhook.triggered_for,
      },
      user_id: userId,
    });
  } catch (error) {
    console.error("❌ Webhook status check error:", error);
    return res.status(500).json({
      error: error.message,
      user_id: userId,
    });
  }
});

// ============================================
// Route 3.6: Webhook Health Check
// ============================================
// Helper function to recreate webhook if it's missing
async function ensureWebhookExists(userId) {
  try {
    // Get connection info
    const { data: connection, error: dbError } =
      await supabase
        .from("fathom_connections")
        .select("webhook_id, webhook_secret")
        .eq("user_id", userId)
        .maybeSingle();

    if (dbError || !connection?.webhook_id) {
      return {
        exists: false,
        error: "No webhook configured",
      };
    }

    // Verify webhook exists in Fathom
    try {
      const accessToken = await getValidAccessToken(userId);
      const response = await fetch(
        `https://api.fathom.ai/external/v1/webhooks/${connection.webhook_id}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (response.ok) {
        const webhook = await response.json();
        return { exists: true, webhook, verified: true };
      } else if (response.status === 404) {
        // Webhook was deleted, need to recreate
        console.log(
          `⚠️ Webhook ${connection.webhook_id} not found in Fathom, recreating...`
        );

        const webhookUrl = `${process.env.APP_URL}/api/fathom/webhook/${userId}`;
        const createResponse = await fetch(
          "https://api.fathom.ai/external/v1/webhooks",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              destination_url: webhookUrl,
              include_transcript: true,
              include_summary: false,
              include_action_items: false,
              include_crm_matches: false,
              triggered_for: ["my_recordings"],
            }),
          }
        );

        if (!createResponse.ok) {
          const errorText = await createResponse.text();
          throw new Error(
            `Failed to recreate webhook: ${createResponse.status} - ${errorText}`
          );
        }

        const newWebhook = await createResponse.json();

        // Update database with new webhook info
        await supabase
          .from("fathom_connections")
          .update({
            webhook_id: newWebhook.id,
            webhook_secret: newWebhook.secret || null,
            webhook_created_at:
              newWebhook.created_at ||
              new Date().toISOString(),
          })
          .eq("user_id", userId);

        console.log(
          `✅ Webhook recreated: ${newWebhook.id}`
        );
        return {
          exists: true,
          webhook: newWebhook,
          recreated: true,
        };
      } else {
        const errorText = await response.text();
        return {
          exists: false,
          error: `Fathom API error: ${response.status} - ${errorText}`,
        };
      }
    } catch (apiError) {
      return {
        exists: false,
        error: `API error: ${apiError.message}`,
      };
    }
  } catch (error) {
    return { exists: false, error: error.message };
  }
}

app.get("/api/fathom/webhook-health", async (req, res) => {
  const userId = getUserId(req);
  const autoFix = req.query.auto_fix === "true";

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

  try {
    // Check database connection
    const { data: connection, error: dbError } =
      await supabase
        .from("fathom_connections")
        .select("webhook_id, webhook_secret")
        .eq("user_id", userId)
        .maybeSingle();

    const webhookUrl = `${process.env.APP_URL}/api/fathom/webhook/${userId}`;

    if (!connection || !connection.webhook_id) {
      return res.json({
        healthy: false,
        user_id: userId,
        webhook_url: webhookUrl,
        webhook_configured: false,
        webhook_id: null,
        database_accessible: !dbError,
        message:
          "No webhook configured. Please connect Fathom first.",
        timestamp: new Date().toISOString(),
      });
    }

    // Verify webhook exists in Fathom
    const webhookStatus = await ensureWebhookExists(userId);

    if (!webhookStatus.exists && autoFix) {
      // Try to fix it
      const fixedStatus = await ensureWebhookExists(userId);
      return res.json({
        healthy: fixedStatus.exists,
        user_id: userId,
        webhook_url: webhookUrl,
        webhook_configured: true,
        webhook_id: connection.webhook_id,
        webhook_verified: fixedStatus.verified || false,
        webhook_recreated: fixedStatus.recreated || false,
        database_accessible: !dbError,
        error: fixedStatus.error || null,
        timestamp: new Date().toISOString(),
      });
    }

    return res.json({
      healthy: webhookStatus.exists,
      user_id: userId,
      webhook_url: webhookUrl,
      webhook_configured: true,
      webhook_id: connection.webhook_id,
      webhook_verified: webhookStatus.verified || false,
      webhook_recreated: webhookStatus.recreated || false,
      database_accessible: !dbError,
      error: webhookStatus.error || null,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Webhook health check error:", error);
    return res.status(500).json({
      healthy: false,
      error: error.message,
      user_id: userId,
    });
  }
});

// ============================================
// Route 3.7: Test Webhook Endpoint
// ============================================
app.post("/api/fathom/test-webhook", async (req, res) => {
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

  // Simulate a Fathom webhook payload
  const testPayload = {
    title: "Test Meeting - " + new Date().toISOString(),
    meeting_title: "Test Meeting",
    recording_id: `test-${Date.now()}`,
    url: "https://fathom.video/recording/test",
    transcript: [
      {
        text: "This is a test transcript item.",
        speaker: {
          display_name: "Test Speaker",
          matched_calendar_invitee_email:
            "test@example.com",
        },
        timestamp: "00:00:01",
      },
      {
        text: "Another test message.",
        speaker: {
          display_name: "Test Speaker 2",
          matched_calendar_invitee_email:
            "test2@example.com",
        },
        timestamp: "00:00:05",
      },
    ],
    created_at: new Date().toISOString(),
  };

  const webhookUrl = `${process.env.APP_URL}/api/fathom/webhook/${userId}`;
  console.log(
    `🧪 Testing webhook with payload:`,
    testPayload
  );

  // Create a mock request object to call webhook handler directly
  const mockReq = {
    params: { userId },
    body: testPayload,
    webhookRequestId: `test-${Date.now()}`,
    method: "POST",
    originalUrl: `/api/fathom/webhook/${userId}`,
    headers: {
      "content-type": "application/json",
    },
  };

  const mockRes = {
    status: (code) => ({
      json: (data) => ({ statusCode: code, data }),
    }),
    json: (data) => ({ statusCode: 200, data }),
  };

  // Call webhook handler directly
  try {
    // Import the webhook handler logic (we'll extract it)
    // For now, simulate the webhook processing
    const requestId = mockReq.webhookRequestId;
    const payload = testPayload;
    const startTime = Date.now();

    try {
      validateUserId(userId);

      const meetingTitle =
        payload.title ||
        payload.meeting_title ||
        "Test Meeting";
      const recordingId =
        payload.recording_id || `test-${Date.now()}`;
      const meetingUrl = payload.url || null;
      const createdAt =
        payload.created_at || new Date().toISOString();

      // Check for duplicate
      const { data: existingMeeting } = await supabase
        .from("meeting_transcripts")
        .select("recording_id")
        .eq("user_id", userId)
        .eq("recording_id", recordingId)
        .maybeSingle();

      if (existingMeeting) {
        return res.json({
          success: true,
          status: 200,
          message:
            "Test meeting already exists (duplicate)",
          webhook_url: webhookUrl,
          test_payload: testPayload,
        });
      }

      // Normalize transcript
      let transcript = payload.transcript || [];
      if (!Array.isArray(transcript)) {
        transcript = [];
      }

      // Insert into database
      const insertData = {
        user_id: userId,
        title: meetingTitle,
        transcript: transcript,
        created_at: createdAt,
      };

      if (recordingId) {
        insertData.recording_id = recordingId;
      }
      if (meetingUrl) {
        insertData.url = meetingUrl;
      }

      const { data: insertedData, error: insertError } =
        await supabase
          .from("meeting_transcripts")
          .insert(insertData)
          .select();

      if (insertError) {
        throw insertError;
      }

      const responseTime = Date.now() - startTime;
      console.log(
        `✅ [${requestId}] Test webhook processed successfully in ${responseTime}ms`
      );

      return res.json({
        success: true,
        status: 200,
        webhook_url: webhookUrl,
        test_payload: testPayload,
        webhook_response: {
          success: true,
          user_id: userId,
          recording_id: recordingId,
          transcript_items: transcript.length,
          request_id: requestId,
          response_time_ms: responseTime,
        },
      });
    } catch (error) {
      console.error(`❌ Test webhook error:`, error);
      return res.status(500).json({
        success: false,
        status: 500,
        error: error.message,
        webhook_url: webhookUrl,
      });
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
      webhook_url: webhookUrl,
    });
  }
});

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

// ============================================
// Route: Recreate Webhook (Manual Fix)
// ============================================
app.post(
  "/api/fathom/recreate-webhook",
  async (req, res) => {
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

    try {
      const webhookStatus = await ensureWebhookExists(
        userId
      );

      if (webhookStatus.recreated) {
        return res.json({
          success: true,
          message: "Webhook recreated successfully",
          webhook_id: webhookStatus.webhook.id,
          user_id: userId,
        });
      } else if (webhookStatus.exists) {
        return res.json({
          success: true,
          message: "Webhook already exists and is valid",
          webhook_id: webhookStatus.webhook.id,
          user_id: userId,
        });
      } else {
        return res.status(500).json({
          success: false,
          error:
            webhookStatus.error ||
            "Failed to recreate webhook",
          user_id: userId,
        });
      }
    } catch (error) {
      console.error("❌ Webhook recreation error:", error);
      return res.status(500).json({
        success: false,
        error: error.message,
        user_id: userId,
      });
    }
  }
);

// ============================================
// Periodic Webhook Health Check (Background)
// ============================================
// Check webhook health every 30 minutes
if (process.env.ENABLE_WEBHOOK_MONITORING !== "false") {
  setInterval(async () => {
    try {
      console.log(
        "🔍 Running periodic webhook health check..."
      );

      // Get all users with webhooks
      const { data: connections, error } = await supabase
        .from("fathom_connections")
        .select("user_id, webhook_id")
        .not("webhook_id", "is", null);

      if (error) {
        console.error(
          "❌ Error fetching connections for health check:",
          error
        );
        return;
      }

      if (!connections || connections.length === 0) {
        console.log("ℹ️ No webhooks to check");
        return;
      }

      console.log(
        `🔍 Checking ${connections.length} webhook(s)...`
      );

      for (const connection of connections) {
        try {
          const status = await ensureWebhookExists(
            connection.user_id
          );
          if (!status.exists) {
            console.error(
              `❌ Webhook health check failed for user ${connection.user_id}: ${status.error}`
            );
          } else if (status.recreated) {
            console.log(
              `✅ Webhook recreated for user ${connection.user_id}: ${status.webhook.id}`
            );
          } else {
            console.log(
              `✅ Webhook healthy for user ${connection.user_id}: ${connection.webhook_id}`
            );
          }
        } catch (userError) {
          console.error(
            `❌ Error checking webhook for user ${connection.user_id}:`,
            userError.message
          );
        }
      }

      console.log(
        "✅ Periodic webhook health check completed"
      );
    } catch (error) {
      console.error(
        "❌ Periodic webhook health check error:",
        error
      );
    }
  }, 30 * 60 * 1000); // 30 minutes

  console.log(
    "✅ Periodic webhook health monitoring enabled (every 30 minutes)"
  );
}

app.listen(3000, () => {
  console.log(
    "🚀 Test server running on http://localhost:3000"
  );
  console.log(
    "📡 Webhook endpoint: /api/fathom/webhook/:userId"
  );
  console.log(
    "🔍 Health check: /api/fathom/webhook-health?user_id=:userId"
  );
  console.log(
    "🔧 Recreate webhook: POST /api/fathom/recreate-webhook?user_id=:userId"
  );
});
