import { Fathom } from "fathom-typescript";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from project root (one level up)
dotenv.config({ path: join(__dirname, "..", ".env") });

// ============================================================
// Constants
// ============================================================
const FATHOM_TOKEN_URL =
  "https://fathom.video/external/v1/oauth2/token";
const TOKEN_REFRESH_BUFFER_SECONDS = 60;

// ============================================================
// Supabase Client
// ============================================================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ============================================================
// Helper Functions
// ============================================================
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

const getUserId = (req) => {
  // First try authenticated user from session
  if (req.user && req.user.userId) {
    return req.user.userId;
  }
  // Fallback to query parameter, header, or body (for backward compatibility)
  return (
    req.query.user_id ||
    req.headers["x-user-id"] ||
    req.body?.user_id ||
    null
  );
};

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
    throw error;
  }
};

const fetchConnectionRow = async (userId) => {
  const { data, error } = await supabase
    .from("fathom_connections")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
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

// ============================================================
// Authentication Routes
// ============================================================

/**
 * Sets up Fathom authentication routes on an Express app
 * @param {Express} app - Express application instance
 */
export const setupFathomAuth = (app) => {
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

    let userId;
    try {
      if (state) {
        const decodedState = JSON.parse(
          Buffer.from(state, "base64").toString()
        );
        userId = decodedState.userId;
      }
    } catch (e) {
      // State decoding failed
    }

    if (!userId) {
      return res.status(400).send(`
        <h1>❌ Missing User ID</h1>
        <p>User ID is required for OAuth callback.</p>
        <a href="/">Back to test page</a>
      `);
    }

    try {
      validateUserId(userId);
      ensureFathomEnv();

      console.log(
        `🔐 Starting OAuth connection for user: ${userId}`
      );

      const redirectUri = `${process.env.APP_URL}/api/fathom/callback`;

      // Step 1: Exchange authorization code for tokens
      const tokenResponse = await fetch(FATHOM_TOKEN_URL, {
        method: "POST",
        headers: {
          "content-type":
            "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: process.env.FATHOM_CLIENT_ID,
          client_secret: process.env.FATHOM_CLIENT_SECRET,
          code: String(code),
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error(
          "❌ Token exchange failed:",
          tokenResponse.status,
          errorText
        );
        throw new Error(
          `Failed to exchange authorization code: ${tokenResponse.status} - ${errorText}`
        );
      }

      const tokenData = await tokenResponse.json();
      console.log("✅ Token exchange successful");

      // Step 2: Calculate token expiration time
      const expiresAt =
        Math.floor(Date.now() / 1000) +
        (tokenData.expires_in ?? 0) -
        TOKEN_REFRESH_BUFFER_SECONDS;

      // Step 3: Store tokens in database
      await persistConnectionTokens(
        userId,
        tokenData.access_token,
        tokenData.refresh_token,
        expiresAt
      );

      console.log(
        "✅ Connection established - tokens stored in database"
      );

      // Redirect to home page with success message
      res.redirect(
        `/?user_id=${encodeURIComponent(
          userId
        )}&connected=true`
      );
    } catch (error) {
      console.error("❌ OAuth callback error:", error);
      res.status(500).json({
        error: error.message,
        user_id: userId || null,
      });
    }
  });
};

// ============================================================
// Exported Helper Functions (for use in other files)
// ============================================================
export { getValidAccessToken, getUserId, validateUserId };
