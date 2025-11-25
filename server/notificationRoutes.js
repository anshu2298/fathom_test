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
 * Sets up notification routes
 * @param {Express} app - Express application instance
 */
export const setupNotificationRoutes = (app) => {
  // Middleware to ensure user is authenticated
  const requireAuth = (req, res, next) => {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    next();
  };

  // Get notifications (computed on-the-fly)
  app.get("/api/notifications", requireAuth, async (req, res) => {
    try {
      const userId = req.user.userId;
      const notifications = [];

      // Check Google Fit connection and fetch activity data
      const { data: fitData, error: fitError } = await supabase
        .from("fathom_connections")
        .select("googlefit_access_token, googlefit_refresh_token, googlefit_token_expires_at")
        .eq("user_id", userId)
        .single();

      const isFitConnected = !fitError && fitData?.googlefit_access_token;
      let fitActivityData = null;

      if (isFitConnected) {
        try {
          // Get today's date range
          const now = new Date();
          const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const endOfDay = new Date(startOfDay);
          endOfDay.setDate(endOfDay.getDate() + 1);

          const startTimeMillis = startOfDay.getTime();
          const endTimeMillis = endOfDay.getTime();

          // Check if token is expired and refresh if needed
          let accessToken = fitData.googlefit_access_token;
          const isExpired = fitData.googlefit_token_expires_at 
            ? new Date(fitData.googlefit_token_expires_at * 1000) < new Date()
            : false;

          if (isExpired && fitData.googlefit_refresh_token) {
            const oauth2Client = new google.auth.OAuth2(
              process.env.GOOGLE_CLIENT_ID,
              process.env.GOOGLE_CLIENT_SECRET,
              `${process.env.APP_URL || "http://localhost:3000"}/api/googlefit/callback`
            );

            oauth2Client.setCredentials({
              refresh_token: fitData.googlefit_refresh_token,
            });

            const { credentials } = await oauth2Client.refreshAccessToken();
            accessToken = credentials.access_token;

            await supabase
              .from("fathom_connections")
              .update({
                googlefit_access_token: credentials.access_token,
                googlefit_token_expires_at: credentials.expiry_date 
                  ? Math.floor(credentials.expiry_date / 1000) 
                  : null,
                updated_at: new Date().toISOString(),
              })
              .eq("user_id", userId);
          }

          // Fetch steps data directly from Google Fit API
          const baseUrl = "https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate";
          
          const stepsResponse = await fetch(baseUrl, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              aggregateBy: [{ 
                dataTypeName: "com.google.step_count.delta",
              }],
              bucketByTime: { durationMillis: 86400000 },
              startTimeMillis: startTimeMillis,
              endTimeMillis: endTimeMillis,
            }),
          });

          if (stepsResponse.ok) {
            const stepsData = await stepsResponse.json();
            let steps = 0;
            
            if (stepsData.bucket && stepsData.bucket.length > 0) {
              stepsData.bucket.forEach((bucket) => {
                if (bucket.dataset && bucket.dataset.length > 0) {
                  bucket.dataset.forEach((dataset) => {
                    if (dataset.point && dataset.point.length > 0) {
                      dataset.point.forEach((point) => {
                        if (point.value && point.value.length > 0) {
                          const value = point.value[0].intVal !== undefined 
                            ? point.value[0].intVal 
                            : (point.value[0].fpVal !== undefined ? point.value[0].fpVal : 0);
                          steps += value;
                        }
                      });
                    }
                  });
                }
              });
            }

            fitActivityData = { steps };
          }
        } catch (error) {
          console.error("Error fetching Fit data for notifications:", error);
        }
      }

      // Generate activity notifications
      if (fitActivityData) {
        const now = new Date();
        const currentHour = now.getHours();
        const currentSteps = fitActivityData.steps || 0;

        // Check steps threshold based on time
        if (currentHour < 14 && currentSteps < 5000) {
          // Before 2 PM, need at least 5,000 steps
          notifications.push({
            id: `activity-steps-${now.getDate()}-${currentHour}`,
            type: "activity",
            title: "Low Activity Alert",
            message: "You're not active enough today. Get up and do some exercise! You've only taken " + currentSteps.toLocaleString() + " steps so far.",
            timestamp: now.toISOString(),
            actionUrl: "/dashboard/fitness",
            icon: "activity",
          });
        } else if (currentHour >= 14 && currentHour < 18 && currentSteps < 8000) {
          // Between 2 PM and 6 PM, need at least 8,000 steps
          notifications.push({
            id: `activity-steps-${now.getDate()}-${currentHour}`,
            type: "activity",
            title: "Activity Reminder",
            message: "Keep moving! You're at " + currentSteps.toLocaleString() + " steps. Aim for 10,000 steps today!",
            timestamp: now.toISOString(),
            actionUrl: "/dashboard/fitness",
            icon: "activity",
          });
        }

        // Check for inactivity (if we have last activity timestamp)
        // Note: Google Fit API doesn't provide last activity timestamp directly,
        // so we'll check if steps haven't increased in the last check
        // For now, we'll skip this check as it requires storing previous state
      }

      // Check Google Calendar connection and fetch upcoming events
      const { data: calendarData, error: calendarError } = await supabase
        .from("fathom_connections")
        .select("calendar_access_token, calendar_refresh_token, calendar_token_expires_at")
        .eq("user_id", userId)
        .single();

      const isCalendarConnected = !calendarError && calendarData?.calendar_access_token;

      if (isCalendarConnected) {
        try {
          // Get calendar events
          let accessToken = calendarData.calendar_access_token;
          const isExpired = calendarData.calendar_token_expires_at 
            ? new Date(calendarData.calendar_token_expires_at * 1000) < new Date()
            : false;

          if (isExpired && calendarData.calendar_refresh_token) {
            const oauth2Client = new google.auth.OAuth2(
              process.env.GOOGLE_CLIENT_ID,
              process.env.GOOGLE_CLIENT_SECRET,
              `${process.env.APP_URL || "http://localhost:3000"}/api/calendar/callback`
            );

            oauth2Client.setCredentials({
              refresh_token: calendarData.calendar_refresh_token,
            });

            const { credentials } = await oauth2Client.refreshAccessToken();
            accessToken = credentials.access_token;

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

          const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            `${process.env.APP_URL || "http://localhost:3000"}/api/calendar/callback`
          );

          oauth2Client.setCredentials({
            access_token: accessToken,
          });

          const calendar = google.calendar({ version: "v3", auth: oauth2Client });

          // Get next 10 events
          const response = await calendar.events.list({
            calendarId: "primary",
            timeMin: new Date().toISOString(),
            maxResults: 10,
            singleEvents: true,
            orderBy: "startTime",
          });

          const events = response.data.items || [];

          // Format events as notifications
          events.forEach((event) => {
            const startTime = event.start?.dateTime || event.start?.date;
            if (startTime) {
              notifications.push({
                id: `calendar-${event.id}`,
                type: "calendar",
                title: event.summary || "Meeting",
                message: event.location 
                  ? `Location: ${event.location}` 
                  : event.description 
                    ? event.description.substring(0, 100) 
                    : "No additional details",
                timestamp: startTime,
                actionUrl: event.htmlLink || "/dashboard",
                icon: "calendar",
              });
            }
          });
        } catch (error) {
          console.error("Error fetching calendar events for notifications:", error);
        }
      }

      // Sort notifications by timestamp (upcoming first)
      notifications.sort((a, b) => {
        const timeA = new Date(a.timestamp).getTime();
        const timeB = new Date(b.timestamp).getTime();
        return timeA - timeB;
      });

      res.json({ notifications });
    } catch (error) {
      console.error("Get notifications error:", error);
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  // Get notification count (lightweight endpoint for badge)
  app.get("/api/notifications/count", requireAuth, async (req, res) => {
    try {
      const userId = req.user.userId;
      let count = 0;

      // Quick check for activity notifications (simplified)
      const { data: fitData } = await supabase
        .from("fathom_connections")
        .select("googlefit_access_token")
        .eq("user_id", userId)
        .single();

      if (fitData?.googlefit_access_token) {
        try {
          const now = new Date();
          const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const endOfDay = new Date(startOfDay);
          endOfDay.setDate(endOfDay.getDate() + 1);

          const baseUrl = "https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate";
          
          const stepsResponse = await fetch(baseUrl, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${fitData.googlefit_access_token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              aggregateBy: [{ dataTypeName: "com.google.step_count.delta" }],
              bucketByTime: { durationMillis: 86400000 },
              startTimeMillis: startOfDay.getTime(),
              endTimeMillis: endOfDay.getTime(),
            }),
          });

          if (stepsResponse.ok) {
            const stepsData = await stepsResponse.json();
            let steps = 0;
            
            if (stepsData.bucket && stepsData.bucket.length > 0) {
              stepsData.bucket.forEach((bucket) => {
                if (bucket.dataset && bucket.dataset.length > 0) {
                  bucket.dataset.forEach((dataset) => {
                    if (dataset.point && dataset.point.length > 0) {
                      dataset.point.forEach((point) => {
                        if (point.value && point.value.length > 0) {
                          steps += point.value[0].intVal || point.value[0].fpVal || 0;
                        }
                      });
                    }
                  });
                }
              });
            }

            const currentHour = now.getHours();
            if ((currentHour < 14 && steps < 5000) || (currentHour >= 14 && currentHour < 18 && steps < 8000)) {
              count++;
            }
          }
        } catch (error) {
          // Silently fail for count endpoint
        }
      }

      // Check calendar for upcoming events
      const { data: calendarData } = await supabase
        .from("fathom_connections")
        .select("calendar_access_token")
        .eq("user_id", userId)
        .single();

      if (calendarData?.calendar_access_token) {
        try {
          let accessToken = calendarData.calendar_access_token;
          const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            `${process.env.APP_URL || "http://localhost:3000"}/api/calendar/callback`
          );

          oauth2Client.setCredentials({ access_token: accessToken });
          const calendar = google.calendar({ version: "v3", auth: oauth2Client });

          const response = await calendar.events.list({
            calendarId: "primary",
            timeMin: new Date().toISOString(),
            maxResults: 10,
            singleEvents: true,
            orderBy: "startTime",
          });

          count += Math.min(response.data.items?.length || 0, 10);
        } catch (error) {
          // Silently fail for count endpoint
        }
      }

      res.json({ count });
    } catch (error) {
      res.json({ count: 0 });
    }
  });
};

