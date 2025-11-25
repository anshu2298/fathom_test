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
 * Sets up Google Fit routes
 * @param {Express} app - Express application instance
 */
export const setupGoogleFitRoutes = (app) => {
  // Middleware to ensure user is authenticated
  const requireAuth = (req, res, next) => {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    next();
  };

  // Get Google Fit connection status
  app.get("/api/googlefit/status", requireAuth, async (req, res) => {
    try {
      const userId = req.user.userId;

      const { data, error } = await supabase
        .from("fathom_connections")
        .select("googlefit_access_token, googlefit_refresh_token, googlefit_token_expires_at")
        .eq("user_id", userId)
        .single();

      if (error && error.code !== "PGRST116") {
        console.error("Error fetching Google Fit status:", error);
        return res.status(500).json({ error: "Failed to check Google Fit status" });
      }

      const hasToken = !!(data?.googlefit_access_token || data?.googlefit_refresh_token);
      const isExpired = data?.googlefit_token_expires_at 
        ? new Date(data.googlefit_token_expires_at * 1000) < new Date()
        : true;

      res.json({
        connected: hasToken && !isExpired,
        hasRefreshToken: !!data?.googlefit_refresh_token,
      });
    } catch (error) {
      console.error("Google Fit status check error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Connect Google Fit (OAuth flow)
  app.get("/api/googlefit/connect", requireAuth, async (req, res) => {
    try {
      const userId = req.user.userId;
      const redirectUri = `${process.env.APP_URL || "http://localhost:3000"}/api/googlefit/callback`;
      
      // Log the redirect URI for debugging
      console.log("🔗 Google Fit OAuth redirect URI:", redirectUri);
      
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        redirectUri
      );

      // Generate auth URL with Google Fit scopes
      const scopes = [
        "https://www.googleapis.com/auth/fitness.activity.read",
        "https://www.googleapis.com/auth/fitness.body.read",
        "https://www.googleapis.com/auth/fitness.location.read",
      ];

      const authUrl = oauth2Client.generateAuthUrl({
        access_type: "offline",
        scope: scopes,
        prompt: "consent",
        state: userId, // Pass user ID in state for security
      });

      res.redirect(authUrl);
    } catch (error) {
      console.error("Google Fit connect error:", error);
      res.status(500).json({ error: "Failed to initiate Google Fit connection" });
    }
  });

  // Google Fit OAuth callback
  app.get("/api/googlefit/callback", async (req, res) => {
    try {
      const { code, state } = req.query;
      const userId = state;

      if (!code || !userId) {
        return res.redirect("/dashboard/settings?googlefit_error=missing_params");
      }

      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        `${process.env.APP_URL || "http://localhost:3000"}/api/googlefit/callback`
      );

      // Exchange code for tokens
      const { tokens } = await oauth2Client.getToken(code);
      const { access_token, refresh_token, expiry_date } = tokens;

      // Store tokens in database
      const updateData = {
        googlefit_access_token: access_token,
        googlefit_refresh_token: refresh_token,
        googlefit_token_expires_at: expiry_date ? Math.floor(expiry_date / 1000) : null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("fathom_connections")
        .update(updateData)
        .eq("user_id", userId);

      if (error) {
        console.error("Error storing Google Fit tokens:", error);
        return res.redirect("/dashboard/settings?googlefit_error=storage_failed");
      }

      res.redirect("/dashboard/settings?googlefit_connected=true");
    } catch (error) {
      console.error("Google Fit callback error:", error);
      res.redirect("/dashboard/settings?googlefit_error=callback_failed");
    }
  });

  // Disconnect Google Fit
  app.post("/api/googlefit/disconnect", requireAuth, async (req, res) => {
    try {
      const userId = req.user.userId;

      const { error } = await supabase
        .from("fathom_connections")
        .update({
          googlefit_access_token: null,
          googlefit_refresh_token: null,
          googlefit_token_expires_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);

      if (error) {
        console.error("Error disconnecting Google Fit:", error);
        return res.status(500).json({ error: "Failed to disconnect Google Fit" });
      }

      res.json({ success: true, message: "Google Fit disconnected successfully" });
    } catch (error) {
      console.error("Google Fit disconnect error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Debug endpoint to list available data sources
  app.get("/api/googlefit/datasources", requireAuth, async (req, res) => {
    try {
      const userId = req.user.userId;

      const { data, error: fetchError } = await supabase
        .from("fathom_connections")
        .select("googlefit_access_token, googlefit_refresh_token, googlefit_token_expires_at")
        .eq("user_id", userId)
        .single();

      if (fetchError || !data?.googlefit_access_token) {
        return res.status(401).json({ error: "Google Fit not connected" });
      }

      let accessToken = data.googlefit_access_token;

      const response = await fetch("https://www.googleapis.com/fitness/v1/users/me/dataSources", {
        headers: {
          "Authorization": `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        return res.status(response.status).json({ error: errorText });
      }

      const dataSources = await response.json();
      res.json(dataSources);
    } catch (error) {
      console.error("Error listing data sources:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get Google Fit data
  app.get("/api/googlefit/data", requireAuth, async (req, res) => {
    try {
      const userId = req.user.userId;

      // Get user's Google Fit tokens
      const { data, error: fetchError } = await supabase
        .from("fathom_connections")
        .select("googlefit_access_token, googlefit_refresh_token, googlefit_token_expires_at")
        .eq("user_id", userId)
        .single();

      if (fetchError || !data?.googlefit_access_token) {
        return res.status(401).json({ error: "Google Fit not connected" });
      }

      // Check if token is expired and refresh if needed
      let accessToken = data.googlefit_access_token;
      const isExpired = data.googlefit_token_expires_at 
        ? new Date(data.googlefit_token_expires_at * 1000) < new Date()
        : false;

      if (isExpired && data.googlefit_refresh_token) {
        // Refresh the token
        const oauth2Client = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET,
          `${process.env.APP_URL || "http://localhost:3000"}/api/googlefit/callback`
        );

        oauth2Client.setCredentials({
          refresh_token: data.googlefit_refresh_token,
        });

        const { credentials } = await oauth2Client.refreshAccessToken();
        accessToken = credentials.access_token;

        // Update stored token
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

      // Get today's date range (start and end of day in milliseconds)
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endOfDay = new Date(startOfDay);
      endOfDay.setDate(endOfDay.getDate() + 1);

      const startTimeMillis = startOfDay.getTime();
      const endTimeMillis = endOfDay.getTime();

      // Fetch data from Google Fit API
      const baseUrl = "https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate";
      
      // Helper function to list available data sources (for debugging)
      const listDataSources = async () => {
        try {
          const response = await fetch("https://www.googleapis.com/fitness/v1/users/me/dataSources", {
            headers: {
              "Authorization": `Bearer ${accessToken}`,
            },
          });
          if (response.ok) {
            const data = await response.json();
            console.log("Available data sources:", JSON.stringify(data, null, 2));
          }
        } catch (error) {
          console.error("Error listing data sources:", error);
        }
      };

      // List data sources in development for debugging
      if (process.env.NODE_ENV !== "production") {
        await listDataSources();
      }

      // Helper function to extract value from API response
      const extractValueFromResponse = (data, metricName) => {
        if (!data.bucket || data.bucket.length === 0) {
          return null;
        }
        
        let total = 0;
        
        // Iterate through all buckets
        data.bucket.forEach((bucket) => {
          if (bucket.dataset && bucket.dataset.length > 0) {
            bucket.dataset.forEach((dataset) => {
              if (dataset.point && dataset.point.length > 0) {
                dataset.point.forEach((point) => {
                  if (point.value && point.value.length > 0) {
                    // Handle both intVal and fpVal
                    const value = point.value[0].intVal !== undefined 
                      ? point.value[0].intVal 
                      : (point.value[0].fpVal !== undefined ? point.value[0].fpVal : 0);
                    total += value;
                  }
                });
              }
            });
          }
        });
        
        return total > 0 ? total : null;
      };

      // Data types for different metrics (using dataTypeName is more reliable)
      const dataTypes = {
        steps: "com.google.step_count.delta",
        distance: "com.google.distance.delta",
        calories: "com.google.calories.expended",
        activeMinutes: "com.google.active_minutes",
        heartPoints: "com.google.heart_minutes",
      };

      // Fallback data source IDs if dataTypeName doesn't work
      const dataSourceIds = {
        steps: [
          "derived:com.google.step_count.delta:com.google.android.gms:aggregated",
          "derived:com.google.step_count.delta:com.google.android.gms:estimated_steps",
        ],
        distance: [
          "derived:com.google.distance.delta:com.google.android.gms:aggregated",
        ],
        calories: [
          "derived:com.google.calories.expended:com.google.android.gms:aggregated",
        ],
        activeMinutes: [
          "derived:com.google.active_minutes:com.google.android.gms:aggregated",
        ],
        heartPoints: [
          "derived:com.google.heart_minutes:com.google.android.gms:aggregated",
        ],
      };

      // Fetch metric using dataTypeName (preferred method)
      const fetchMetricByType = async (dataTypeName, metricName) => {
        try {
          const response = await fetch(baseUrl, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              aggregateBy: [{ 
                dataTypeName: dataTypeName,
              }],
              bucketByTime: { durationMillis: 86400000 }, // 24 hours
              startTimeMillis: startTimeMillis,
              endTimeMillis: endTimeMillis,
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`Error fetching ${metricName} by type (${response.status}):`, errorText);
            return null;
          }

          const data = await response.json();
          
          if (process.env.NODE_ENV !== "production") {
            console.log(`${metricName} (by type) API response:`, JSON.stringify(data, null, 2));
          }
          
          return extractValueFromResponse(data, metricName);
        } catch (error) {
          console.error(`Error fetching ${metricName} by type:`, error.message);
          return null;
        }
      };

      // Fetch metric using dataSourceId (fallback)
      const fetchMetric = async (dataSourceId, metricName) => {
        try {
          const response = await fetch(baseUrl, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              aggregateBy: [{ 
                dataSourceId: dataSourceId,
              }],
              bucketByTime: { durationMillis: 86400000 }, // 24 hours
              startTimeMillis: startTimeMillis,
              endTimeMillis: endTimeMillis,
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`Error fetching ${metricName} (${response.status}):`, errorText);
            return null;
          }

          const data = await response.json();
          
          if (process.env.NODE_ENV !== "production") {
            console.log(`${metricName} (by source) API response:`, JSON.stringify(data, null, 2));
          }
          
          return extractValueFromResponse(data, metricName);
        } catch (error) {
          console.error(`Error fetching ${metricName}:`, error.message);
          return null;
        }
      };

      // Fetch heart rate (different endpoint - needs different handling)
      const fetchHeartRate = async () => {
        try {
          const heartRateSource = "derived:com.google.heart_rate.bpm:com.google.android.gms:merge_heart_rate_bpm";
          const response = await fetch(baseUrl, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              aggregateBy: [{
                dataSourceId: heartRateSource,
              }],
              bucketByTime: { durationMillis: 3600000 }, // 1 hour buckets
              startTimeMillis: startTimeMillis,
              endTimeMillis: endTimeMillis,
            }),
          });

          if (!response.ok) {
            return null;
          }

          const data = await response.json();
          
          // Get the most recent heart rate reading
          if (data.bucket && data.bucket.length > 0) {
            // Get the last bucket with data
            for (let i = data.bucket.length - 1; i >= 0; i--) {
              const dataset = data.bucket[i].dataset;
              if (dataset && dataset.length > 0 && dataset[0].point && dataset[0].point.length > 0) {
                const lastPoint = dataset[0].point[dataset[0].point.length - 1];
                if (lastPoint.value && lastPoint.value.length > 0) {
                  return lastPoint.value[0].fpVal || null;
                }
              }
            }
          }
          return null;
        } catch (error) {
          console.error("Error fetching heart rate:", error);
          return null;
        }
      };

      // Fetch all metrics - try dataTypeName first, then fallback to dataSourceId
      const fetchMetricWithFallback = async (dataTypeName, dataSourceIdArray, metricName) => {
        // Try dataTypeName first (more reliable)
        let result = await fetchMetricByType(dataTypeName, metricName);
        if (result !== null && result !== undefined && result > 0) {
          return result;
        }
        
        // Fallback to dataSourceId
        for (const dataSourceId of dataSourceIdArray) {
          result = await fetchMetric(dataSourceId, metricName);
          if (result !== null && result !== undefined && result > 0) {
            return result;
          }
        }
        return null;
      };

      const [steps, distance, calories, activeMinutes, heartPoints, heartRate] = await Promise.all([
        fetchMetricWithFallback(dataTypes.steps, dataSourceIds.steps, "steps"),
        fetchMetricWithFallback(dataTypes.distance, dataSourceIds.distance, "distance"),
        fetchMetricWithFallback(dataTypes.calories, dataSourceIds.calories, "calories"),
        fetchMetricWithFallback(dataTypes.activeMinutes, dataSourceIds.activeMinutes, "activeMinutes"),
        fetchMetricWithFallback(dataTypes.heartPoints, dataSourceIds.heartPoints, "heartPoints"),
        fetchHeartRate(),
      ]);

      // Log the results for debugging
      console.log("Google Fit data fetched:", {
        steps,
        distance,
        calories,
        activeMinutes,
        heartPoints,
        heartRate,
      });

      res.json({
        steps: steps ?? 0,
        distance: distance ?? 0, // in meters
        calories: calories ?? 0,
        activeMinutes: activeMinutes ?? 0,
        heartPoints: heartPoints ?? 0,
        heartRate: heartRate ?? null,
      });
    } catch (error) {
      console.error("Get Google Fit data error:", error);
      res.status(500).json({ error: "Failed to fetch Google Fit data" });
    }
  });
};

