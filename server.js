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
    // Token store for Supabase
    const tokenStore = {
      get: async () => {
        const { data } = await supabase
          .from("fathom_connections")
          .select("*")
          .eq("user_id", TEST_USER_ID)
          .single();

        if (!data) return null;
        return {
          token: data.access_token,
          refresh_token: data.refresh_token,
          expires: data.token_expires_at,
        };
      },

      set: async (token, refresh_token, expires) => {
        await supabase.from("fathom_connections").upsert({
          user_id: TEST_USER_ID,
          access_token: token,
          refresh_token: refresh_token,
          token_expires_at: expires,
        });
      },
    };

    // Initialize Fathom with OAuth
    const fathom = new Fathom({
      security: Fathom.withAuthorization({
        clientId: process.env.FATHOM_CLIENT_ID,
        clientSecret: process.env.FATHOM_CLIENT_SECRET,
        code,
        redirectUri: `${process.env.APP_URL}/api/fathom/callback`,
        tokenStore,
      }),
    });

    // Create webhook
    const webhookUrl = `${process.env.APP_URL}/api/fathom/webhook/${TEST_USER_ID}`;

    const webhook = await fathom.webhooks.create({
      requestBody: {
        destination_url: webhookUrl,
        include_transcript: true,
        include_summary: true,
      },
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
    console.error("OAuth error:", error);
    res.status(500).send(`Error: ${error.message}`);
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
