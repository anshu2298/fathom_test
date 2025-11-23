import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { google } from "googleapis";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from project root (one level up)
dotenv.config({ path: join(__dirname, "..", ".env") });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Sets up Google Calendar routes
 * @param {Express} app - Express application instance
 */
export const setupCalendarRoutes = (app) => {
  // Middleware to ensure user is authenticated
  const requireAuth = (req, res, next) => {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    next();
  };

  // Get Google Calendar connection status
  app.get("/api/calendar/status", requireAuth, async (req, res) => {
    try {
      const userId = req.user.userId;

      const { data, error } = await supabase
        .from("fathom_connections")
        .select("calendar_access_token, calendar_refresh_token, calendar_token_expires_at")
        .eq("user_id", userId)
        .single();

      if (error && error.code !== "PGRST116") {
        console.error("Error fetching calendar status:", error);
        return res.status(500).json({ error: "Failed to check calendar status" });
      }

      const hasToken = !!(data?.calendar_access_token || data?.calendar_refresh_token);
      const isExpired = data?.calendar_token_expires_at 
        ? new Date(data.calendar_token_expires_at * 1000) < new Date()
        : true;

      res.json({
        connected: hasToken && !isExpired,
        hasRefreshToken: !!data?.calendar_refresh_token,
      });
    } catch (error) {
      console.error("Calendar status check error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Connect Google Calendar (OAuth flow)
  app.get("/api/calendar/connect", requireAuth, async (req, res) => {
    try {
      const userId = req.user.userId;
      const redirectUri = `${process.env.APP_URL || "http://localhost:3000"}/api/calendar/callback`;
      
      // Log the redirect URI for debugging
      console.log("🔗 Calendar OAuth redirect URI:", redirectUri);
      
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        redirectUri
      );

      // Generate auth URL with calendar scopes
      const scopes = [
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/calendar.events.readonly",
      ];

      const authUrl = oauth2Client.generateAuthUrl({
        access_type: "offline",
        scope: scopes,
        prompt: "consent",
        state: userId, // Pass user ID in state for security
      });

      res.redirect(authUrl);
    } catch (error) {
      console.error("Calendar connect error:", error);
      res.status(500).json({ error: "Failed to initiate calendar connection" });
    }
  });

  // Google Calendar OAuth callback
  app.get("/api/calendar/callback", async (req, res) => {
    try {
      const { code, state } = req.query;
      const userId = state;

      if (!code || !userId) {
        return res.redirect("/dashboard/settings?calendar_error=missing_params");
      }

      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        `${process.env.APP_URL || "http://localhost:3000"}/api/calendar/callback`
      );

      // Exchange code for tokens
      const { tokens } = await oauth2Client.getToken(code);
      const { access_token, refresh_token, expiry_date } = tokens;

      // Store tokens in database
      const updateData = {
        calendar_access_token: access_token,
        calendar_refresh_token: refresh_token,
        calendar_token_expires_at: expiry_date ? Math.floor(expiry_date / 1000) : null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("fathom_connections")
        .update(updateData)
        .eq("user_id", userId);

      if (error) {
        console.error("Error storing calendar tokens:", error);
        return res.redirect("/dashboard/settings?calendar_error=storage_failed");
      }

      res.redirect("/dashboard/settings?calendar_connected=true");
    } catch (error) {
      console.error("Calendar callback error:", error);
      res.redirect("/dashboard/settings?calendar_error=callback_failed");
    }
  });

  // Disconnect Google Calendar
  app.post("/api/calendar/disconnect", requireAuth, async (req, res) => {
    try {
      const userId = req.user.userId;

      const { error } = await supabase
        .from("fathom_connections")
        .update({
          calendar_access_token: null,
          calendar_refresh_token: null,
          calendar_token_expires_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);

      if (error) {
        console.error("Error disconnecting calendar:", error);
        return res.status(500).json({ error: "Failed to disconnect calendar" });
      }

      res.json({ success: true, message: "Calendar disconnected successfully" });
    } catch (error) {
      console.error("Calendar disconnect error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get calendar events
  app.get("/api/calendar/events", requireAuth, async (req, res) => {
    try {
      const userId = req.user.userId;
      const { maxResults = 10, timeMin, timeMax } = req.query;

      // Get user's calendar tokens
      const { data, error: fetchError } = await supabase
        .from("fathom_connections")
        .select("calendar_access_token, calendar_refresh_token, calendar_token_expires_at")
        .eq("user_id", userId)
        .single();

      if (fetchError || !data?.calendar_access_token) {
        return res.status(401).json({ error: "Calendar not connected" });
      }

      // Check if token is expired and refresh if needed
      let accessToken = data.calendar_access_token;
      const isExpired = data.calendar_token_expires_at 
        ? new Date(data.calendar_token_expires_at * 1000) < new Date()
        : false;

      if (isExpired && data.calendar_refresh_token) {
        // Refresh the token
        const oauth2Client = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET,
          `${process.env.APP_URL || "http://localhost:3000"}/api/calendar/callback`
        );

        oauth2Client.setCredentials({
          refresh_token: data.calendar_refresh_token,
        });

        const { credentials } = await oauth2Client.refreshAccessToken();
        accessToken = credentials.access_token;

        // Update stored token
        await supabase
          .from("fathom_connections")
          .update({
            calendar_access_token: credentials.access_token,
            calendar_token_expires_at: credentials.expiry_date 
              ? Math.floor(credentials.expiry_date / 1000) 
              : null,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId);
      }

      // Initialize Google Calendar API
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        `${process.env.APP_URL || "http://localhost:3000"}/api/calendar/callback`
      );

      oauth2Client.setCredentials({
        access_token: accessToken,
      });

      const calendar = google.calendar({ version: "v3", auth: oauth2Client });

      // Get events
      const timeMinParam = timeMin || new Date().toISOString();
      const timeMaxParam = timeMax || undefined;

      const response = await calendar.events.list({
        calendarId: "primary",
        timeMin: timeMinParam,
        timeMax: timeMaxParam,
        maxResults: parseInt(maxResults),
        singleEvents: true,
        orderBy: "startTime",
      });

      const events = (response.data.items || []).map((event) => ({
        id: event.id,
        summary: event.summary || "No title",
        description: event.description || "",
        start: event.start?.dateTime || event.start?.date,
        end: event.end?.dateTime || event.end?.date,
        location: event.location || "",
        htmlLink: event.htmlLink,
        attendees: event.attendees || [],
        status: event.status,
      }));

      res.json({ events });
    } catch (error) {
      console.error("Get calendar events error:", error);
      res.status(500).json({ error: "Failed to fetch calendar events" });
    }
  });
};

