import { Fathom } from "fathom-typescript";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import {
  getUserId,
  validateUserId,
  getValidAccessToken,
} from "./fathomAuth.js";

dotenv.config();

// ============================================================
// Supabase Client
// ============================================================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ============================================================
// Sync Function with Incremental Sync Support
// ============================================================

/**
 * Sync meetings from Fathom API to database for a specific user
 * Supports incremental sync by tracking last_sync_at timestamp
 *
 * @param {string} userId - User ID to sync meetings for
 * @returns {Promise<object>} Sync results with imported, skipped, meetings, skipped_meetings, error, is_incremental
 */
async function syncUserMeetings(userId) {
  let isIncremental = false;
  let lastSyncAt = null;

  try {
    // Get last sync time from fathom_connections table
    try {
      const { data: connection } = await supabase
        .from("fathom_connections")
        .select("last_sync_at")
        .eq("user_id", userId)
        .maybeSingle();

      if (connection?.last_sync_at) {
        lastSyncAt = new Date(connection.last_sync_at);
        isIncremental = true;
        console.log(
          `🔄 Incremental sync for user ${userId} - last sync: ${lastSyncAt.toISOString()}`
        );
      } else {
        console.log(
          `🔄 Full sync for user ${userId} - no previous sync found`
        );
      }
    } catch (error) {
      // Column might not exist yet, fallback to full sync
      console.log(
        `⚠️ Could not check last_sync_at (column may not exist), doing full sync for user ${userId}`
      );
      isIncremental = false;
    }

    // Get valid access token for Fathom API
    let accessToken;
    try {
      accessToken = await getValidAccessToken(userId);
    } catch (error) {
      return {
        imported: 0,
        skipped: 0,
        meetings: [],
        skipped_meetings: [],
        error:
          error.message ||
          "Failed to get Fathom access token",
        is_incremental: false,
      };
    }

    // Initialize Fathom client
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
      `🗂️ Starting ${
        isIncremental ? "incremental" : "full"
      } sync for user: ${userId}...`
    );

    // Iterate through paginated results
    for await (const page of iterator) {
      const meetings = page?.result?.items || [];
      console.log(
        `📄 Processing page with ${meetings.length} meetings`
      );

      for (const meeting of meetings) {
        // Skip meetings without recordingId
        if (!meeting.recordingId) {
          console.log(
            "⚠️ Skipping meeting without recordingId:",
            meeting.title
          );
          skipped.push({
            transcript_id: null,
            title: meeting.title,
            createdAt: meeting.createdAt,
            reason: "no_recording_id",
          });
          continue;
        }

        // For incremental sync, filter out meetings created before last_sync_at
        if (isIncremental && lastSyncAt) {
          const meetingCreatedAt = meeting.createdAt
            ? new Date(meeting.createdAt)
            : null;

          if (
            meetingCreatedAt &&
            meetingCreatedAt <= lastSyncAt
          ) {
            // Meeting is older than last sync, skip it
            continue;
          }
        }

        // Check if meeting already exists in database (safety check)
        const { data: existingMeeting } = await supabase
          .from("meeting_transcripts")
          .select("transcript_id")
          .eq("user_id", userId)
          .eq("transcript_id", meeting.recordingId)
          .maybeSingle();

        if (existingMeeting) {
          console.log(
            `⏭️ Skipping meeting ${meeting.recordingId} - already exists in database:`,
            meeting.title
          );
          skipped.push({
            transcript_id: meeting.recordingId,
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

          // Calculate call duration from recording_start_time and recording_end_time
          let callDuration = null;
          if (
            meeting.recording_start_time &&
            meeting.recording_end_time
          ) {
            try {
              const startTime = new Date(
                meeting.recording_start_time
              );
              const endTime = new Date(
                meeting.recording_end_time
              );
              const durationMs = endTime - startTime;
              callDuration = Math.round(
                durationMs / (1000 * 60)
              ); // Convert to minutes
            } catch (error) {
              console.warn(
                `⚠️ Could not calculate duration for ${meeting.recordingId}:`,
                error.message
              );
            }
          }

          // Prepare metadata object
          const metadata = {
            meeting_id: meeting.recordingId || null,
            call_duration: callDuration,
            call_date:
              meeting.recording_start_time ||
              meeting.createdAt ||
              new Date().toISOString(),
          };

          // Insert directly into database with structure matching the image format
          // Keep transcript as JSONB array (not string)
          const { error: insertError } = await supabase
            .from("meeting_transcripts")
            .insert({
              transcript_id: meeting.recordingId, // Use recording_id as transcript_id
              transcript: transcript, // Keep as JSONB array
              meeting_title:
                meeting.meetingTitle || meeting.title,
              user_id: userId,
              metadata: metadata,
              created_at:
                meeting.createdAt ||
                new Date().toISOString(),
            });

          if (insertError) {
            console.error(
              `❌ Database insert error for ${meeting.recordingId}:`,
              insertError
            );
            throw insertError;
          }

          processed.push({
            transcript_id: meeting.recordingId,
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
            transcript_id: meeting.recordingId,
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

    // Update last_sync_at timestamp after successful sync
    if (totalProcessed > 0 || totalSkipped > 0) {
      try {
        const now = new Date().toISOString();
        const { error: updateError } = await supabase
          .from("fathom_connections")
          .update({ last_sync_at: now })
          .eq("user_id", userId);

        if (updateError) {
          // Column might not exist yet, log but don't fail
          console.warn(
            `⚠️ Could not update last_sync_at for user ${userId}:`,
            updateError.message
          );
        } else {
          console.log(
            `✅ Updated last_sync_at for user ${userId} to ${now}`
          );
        }
      } catch (error) {
        // Column might not exist yet, log but don't fail
        console.warn(
          `⚠️ Could not update last_sync_at for user ${userId}:`,
          error.message
        );
      }
    }

    console.log(
      `🎉 Finished ${
        isIncremental ? "incremental" : "full"
      } sync for user: ${userId} - ${totalProcessed} new meetings imported, ${totalSkipped} skipped`
    );

    return {
      imported: totalProcessed,
      skipped: totalSkipped,
      meetings: processed,
      skipped_meetings: skipped,
      error: null,
      is_incremental: isIncremental,
    };
  } catch (error) {
    console.error(
      `❌ Sync error for user ${userId}:`,
      error
    );
    return {
      imported: 0,
      skipped: 0,
      meetings: [],
      skipped_meetings: [],
      error: error?.message || "Failed to sync meetings",
      is_incremental: isIncremental,
    };
  }
}

// ============================================================
// Meeting Routes
// ============================================================

/**
 * Sets up meeting-related routes on an Express app
 * @param {Express} app - Express application instance
 */
export const setupMeetingRoutes = (app) => {
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
  // Route 5: Backfill Historical Meetings (with incremental sync)
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
      const syncResult = await syncUserMeetings(userId);

      if (syncResult.error) {
        return res.status(500).json({
          error: syncResult.error,
          imported: syncResult.imported,
          skipped: syncResult.skipped,
        });
      }

      if (
        syncResult.imported === 0 &&
        syncResult.skipped === 0
      ) {
        return res.json({
          imported: 0,
          skipped: 0,
          message: "No meetings found.",
          is_incremental: syncResult.is_incremental,
        });
      }

      res.json({
        imported: syncResult.imported,
        skipped: syncResult.skipped,
        message: `Successfully imported ${syncResult.imported} new meeting(s). ${syncResult.skipped} meeting(s) were skipped (already exist or errors).`,
        meetings: syncResult.meetings,
        skipped_meetings: syncResult.skipped_meetings,
        is_incremental: syncResult.is_incremental,
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
};

// ============================================================
// Automatic Sync Interval (runs every 30 minutes)
// ============================================================
if (process.env.ENABLE_AUTO_SYNC !== "false") {
  const SYNC_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

  // Run sync immediately on startup (optional)
  const runInitialSync = async () => {
    try {
      console.log(
        "🔄 Running initial automatic sync on startup..."
      );
      await runAutomaticSync();
    } catch (error) {
      console.error("❌ Initial sync error:", error);
    }
  };

  // Run sync for all users with Fathom connections
  const runAutomaticSync = async () => {
    try {
      console.log(
        "🔄 Starting automatic sync for all users..."
      );

      // Get all users with Fathom connections
      const { data: connections, error: connectionsError } =
        await supabase
          .from("fathom_connections")
          .select("user_id")
          .not("access_token", "is", null);

      if (connectionsError) {
        console.error(
          "❌ Error fetching Fathom connections:",
          connectionsError
        );
        return;
      }

      if (!connections || connections.length === 0) {
        console.log(
          "ℹ️ No users with Fathom connections found"
        );
        return;
      }

      const userIds = connections.map(
        (conn) => conn.user_id
      );
      console.log(
        `🔄 Syncing meetings for ${userIds.length} user(s)...`
      );

      const results = [];
      let successfulSyncs = 0;
      let failedSyncs = 0;

      // Process each user
      for (const userId of userIds) {
        try {
          console.log(
            `🔄 Syncing meetings for user: ${userId}`
          );
          const syncResult = await syncUserMeetings(userId);

          if (syncResult.error) {
            failedSyncs++;
            results.push({
              user_id: userId,
              success: false,
              error: syncResult.error,
              imported: syncResult.imported,
              skipped: syncResult.skipped,
              is_incremental: syncResult.is_incremental,
            });
            console.error(
              `❌ Sync failed for user ${userId}:`,
              syncResult.error
            );
          } else {
            successfulSyncs++;
            results.push({
              user_id: userId,
              success: true,
              imported: syncResult.imported,
              skipped: syncResult.skipped,
              is_incremental: syncResult.is_incremental,
              meetings_count: syncResult.meetings.length,
            });
            console.log(
              `✅ Sync completed for user ${userId}: ${syncResult.imported} imported, ${syncResult.skipped} skipped`
            );
          }
        } catch (error) {
          failedSyncs++;
          results.push({
            user_id: userId,
            success: false,
            error: error?.message || "Unknown error",
            imported: 0,
            skipped: 0,
            is_incremental: false,
          });
          console.error(
            `❌ Unexpected error syncing user ${userId}:`,
            error
          );
        }
      }

      console.log(
        `🎉 Automatic sync completed: ${successfulSyncs} successful, ${failedSyncs} failed`
      );
    } catch (error) {
      console.error("❌ Automatic sync error:", error);
    }
  };

  // Set up interval to run sync every 30 minutes
  setInterval(runAutomaticSync, SYNC_INTERVAL_MS);

  console.log(
    `✅ Automatic sync enabled - will run every 30 minutes`
  );
  console.log(
    `   Set ENABLE_AUTO_SYNC=false to disable automatic syncing`
  );

  // Optionally run sync on startup (comment out if not desired)
  // runInitialSync();
}
