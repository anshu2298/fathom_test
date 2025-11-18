import express from "express";
import { Fathom } from "fathom-typescript";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();
const app = express();
app.use(express.json());
app.use(express.static("public"));

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

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
        const { data } = await supabase
          .from("fathom_connections")
          .select("*")
          .eq("user_id", TEST_USER_ID)
          .single();

        if (!data) {
          console.log(
            "📭 No existing token found in database"
          );
          return null;
        }
        console.log("📦 Found existing token in database");
        return {
          token: data.access_token,
          refresh_token: data.refresh_token,
          expires: data.token_expires_at,
        };
      },

      set: async (token, refresh_token, expires) => {
        console.log("💾 Storing tokens in database");
        const { error } = await supabase
          .from("fathom_connections")
          .upsert({
            user_id: TEST_USER_ID,
            access_token: token,
            refresh_token: refresh_token,
            token_expires_at: expires,
          });
        if (error) {
          console.error("❌ Error storing tokens:", error);
          throw error;
        }
        console.log("✅ Tokens stored successfully");
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
