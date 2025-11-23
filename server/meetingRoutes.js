import { Fathom } from "fathom-typescript";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import {
  getUserId,
  validateUserId,
  getValidAccessToken,
} from "./fathomAuth.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from project root (one level up)
dotenv.config({ path: join(__dirname, "..", ".env") });

// ============================================================
// Supabase Client
// ============================================================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const GROQ_API_KEY = process.env.GROQ_API_KEY;

if (!GROQ_API_KEY) {
  console.warn(
    "⚠️ GROQ_API_KEY not set - AI summaries will be disabled"
  );
}

// ============================================================
// AI Summary Generation
// ============================================================

/**
 * Convert JSONB transcript to readable text for AI
 */
function formatTranscriptForAI(transcriptJsonb) {
  return transcriptJsonb
    .map((entry) => {
      const speaker =
        entry.speaker?.display_name || "Unknown";
      const time = entry.timestamp || "";
      const text = entry.text || "";
      return `[${time}] ${speaker}: ${text}`;
    })
    .join("\n");
}

/**
 * Generate AI summary using Groq
 * Returns summary string or null if fails
 */
async function generateAISummary(transcript) {
  if (!GROQ_API_KEY) {
    console.warn(
      "⚠️ Skipping AI summary - GROQ_API_KEY not configured"
    );
    return null;
  }

  try {
    const transcriptText =
      formatTranscriptForAI(transcript);

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            {
              role: "system",
              content:
                "You are an AI assistant that summarizes meeting transcripts. Provide a concise paragraph (4-6 sentences) that captures the main topics discussed, key points, and overall purpose of the meeting. Be clear and professional.",
            },
            {
              role: "user",
              content: `Please provide a brief paragraph summary of this meeting:\n\n${transcriptText}`,
            },
          ],
          temperature: 0.5,
          max_tokens: 500,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "❌ Groq API error:",
        response.status,
        errorText
      );
      return null;
    }

    const data = await response.json();
    const summary = data.choices[0].message.content.trim();
    return summary;
  } catch (error) {
    console.error("❌ Groq API error:", error.message);
    return null;
  }
}

/**
 * Retry failed summaries for meetings that don't have them
 */
async function retryFailedSummaries(
  userId,
  failedTranscriptIds
) {
  if (failedTranscriptIds.length === 0) return;

  console.log(
    `🔄 Retrying AI summaries for ${failedTranscriptIds.length} failed meeting(s)...`
  );

  for (const transcriptId of failedTranscriptIds) {
    try {
      // Fetch the transcript from database
      const { data: meeting, error } = await supabase
        .from("meeting_transcripts")
        .select("transcript")
        .eq("transcript_id", transcriptId)
        .eq("user_id", userId)
        .single();

      if (error || !meeting) {
        console.error(
          `❌ Could not fetch transcript ${transcriptId} for retry:`,
          error
        );
        continue;
      }

      console.log(
        `🔄 Retrying summary for: ${transcriptId}`
      );
      const summary = await generateAISummary(
        meeting.transcript
      );

      if (summary) {
        await supabase
          .from("meeting_transcripts")
          .update({ ai_summary: summary })
          .eq("transcript_id", transcriptId)
          .eq("user_id", userId);

        console.log(
          `✅ Retry successful for ${transcriptId}`
        );
      } else {
        console.error(
          `❌ Retry failed for ${transcriptId}`
        );
      }
    } catch (err) {
      console.error(
        `❌ Error retrying summary for ${transcriptId}:`,
        err.message
      );
    }
  }
}

// ============================================================
// Sync Function with AI Summary Integration
// ============================================================

/**
 * Sync meetings from Fathom API to database for a specific user
 * Supports incremental sync by tracking last_sync_at timestamp
 * Generates AI summaries for each meeting
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
    const failedSummaries = []; // Track meetings where AI summary failed

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

          const transcriptData = await response.json();

          // Ensure transcript is an array
          let transcript = [];
          if (Array.isArray(transcriptData)) {
            transcript = transcriptData;
          } else if (
            transcriptData &&
            Array.isArray(transcriptData.transcript)
          ) {
            transcript = transcriptData.transcript;
          } else if (
            transcriptData &&
            Array.isArray(transcriptData.items)
          ) {
            transcript = transcriptData.items;
          }

          console.log(
            `✅ Got transcript with ${transcript.length} items`
          );

          // Calculate call duration from recordingStartTime and recordingEndTime
          let callDuration = null;
          if (
            meeting.recordingStartTime &&
            meeting.recordingEndTime
          ) {
            try {
              const startTime = new Date(
                meeting.recordingStartTime
              );
              const endTime = new Date(
                meeting.recordingEndTime
              );
              const durationMs =
                endTime.getTime() - startTime.getTime();
              if (durationMs > 0) {
                callDuration = Math.round(
                  durationMs / (1000 * 60)
                );
                console.log(
                  `⏱️ Calculated duration: ${callDuration} min for ${meeting.recordingId}`
                );
              }
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
              meeting.recordingStartTime ||
              meeting.createdAt ||
              new Date().toISOString(),
          };

          // ✅ STEP 1: Insert transcript into database (without summary first)
          const { error: insertError } = await supabase
            .from("meeting_transcripts")
            .insert({
              transcript_id: meeting.recordingId,
              transcript: transcript,
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

          console.log(
            `✅ Saved transcript to database for: ${meeting.recordingId}`
          );

          // ✅ STEP 2: Generate AI Summary
          console.log(
            `🤖 Generating AI summary for: ${meeting.recordingId}`
          );

          const aiSummary = await generateAISummary(
            transcript
          );

          if (aiSummary) {
            // Update the record with AI summary
            const { error: updateError } = await supabase
              .from("meeting_transcripts")
              .update({ ai_summary: aiSummary })
              .eq("transcript_id", meeting.recordingId)
              .eq("user_id", userId);

            if (updateError) {
              console.error(
                `❌ Failed to save AI summary for ${meeting.recordingId}:`,
                updateError
              );
              failedSummaries.push(meeting.recordingId);
            } else {
              console.log(
                `✅ AI summary saved for: ${meeting.recordingId}`
              );
            }
          } else {
            console.warn(
              `⚠️ AI summary generation failed for: ${meeting.recordingId}`
            );
            failedSummaries.push(meeting.recordingId);
          }

          processed.push({
            transcript_id: meeting.recordingId,
            title: meeting.title,
            createdAt: meeting.createdAt,
            transcriptItems: transcript.length,
            hasSummary: !!aiSummary,
          });

          console.log(
            `✅ Completed processing meeting ${processed.length} for user: ${userId}`
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

    // ✅ STEP 3: Retry failed summaries
    if (failedSummaries.length > 0) {
      console.log(
        `\n🔄 Retrying ${failedSummaries.length} failed AI summaries...`
      );
      await retryFailedSummaries(userId, failedSummaries);
    }

    // Update last_sync_at timestamp after successful sync
    if (totalProcessed > 0 || totalSkipped > 0) {
      try {
        const now = new Date().toISOString();
        const { error: updateError } = await supabase
          .from("fathom_connections")
          .update({ last_sync_at: now })
          .eq("user_id", userId);

        if (updateError) {
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
      failed_summaries: failedSummaries.length,
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
      failed_summaries: 0,
      error: error?.message || "Failed to sync meetings",
      is_incremental: isIncremental,
    };
  }
}

// ============================================================
// Route Setup Function
// ============================================================

/**
 * Sets up meeting-related routes on an Express app
 * @param {Express} app - Express application instance
 */
export const setupMeetingRoutes = (app) => {
  // ============================================
  // Route 1: Check Fathom Connection Status
  // ============================================
  app.get("/api/fathom/status", async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(400).json({
          error: "user_id is required",
        });
      }

      validateUserId(userId);

      // Check if user has a connection
      const { data: connection, error } = await supabase
        .from("fathom_connections")
        .select("user_id, access_token, token_expires_at")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        console.error("Status check error:", error);
        return res.status(500).json({
          error: "Failed to check connection status",
        });
      }

      const hasToken = !!connection?.access_token;
      const isExpired = connection?.token_expires_at
        ? connection.token_expires_at <
          Math.floor(Date.now() / 1000)
        : true;

      res.json({
        connected: hasToken && !isExpired,
        user_id: userId,
      });
    } catch (error) {
      console.error("Status check error:", error);
      res.status(500).json({
        error: error.message || "Internal server error",
      });
    }
  });

  // ============================================
  // Route 2: Get Meetings from Database
  // ============================================
  app.get("/api/fathom/meetings", async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(400).json({
          error: "user_id is required",
        });
      }

      validateUserId(userId);

      // Get meetings from database
      const { data: meetings, error } = await supabase
        .from("meeting_transcripts")
        .select(
          "transcript_id, meeting_title, transcript, metadata, ai_summary, created_at"
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Get meetings error:", error);
        return res.status(500).json({
          error: "Failed to fetch meetings",
        });
      }

      // Format meetings for frontend
      const formattedMeetings = (meetings || []).map(
        (meeting) => ({
          transcript_id: meeting.transcript_id,
          title: meeting.meeting_title,
          transcript: meeting.transcript,
          metadata: meeting.metadata,
          ai_summary: meeting.ai_summary,
          created_at: meeting.created_at,
        })
      );

      res.json({
        meetings: formattedMeetings,
      });
    } catch (error) {
      console.error("Get meetings error:", error);
      res.status(500).json({
        error: error.message || "Internal server error",
      });
    }
  });

  // ============================================
  // Route 3: Import/Sync Meetings
  // ============================================
  app.post("/api/fathom/import", async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(400).json({
          error: "user_id is required",
        });
      }

      validateUserId(userId);

      console.log(
        `🔄 Starting manual sync for user: ${userId}`
      );

      // Call the sync function
      const result = await syncUserMeetings(userId);

      if (result.error) {
        return res.status(500).json({
          error: result.error,
          imported: result.imported,
          skipped: result.skipped,
          is_incremental: result.is_incremental,
        });
      }

      res.json({
        success: true,
        imported: result.imported,
        skipped: result.skipped,
        meetings: result.meetings,
        skipped_meetings: result.skipped_meetings,
        failed_summaries: result.failed_summaries || 0,
        is_incremental: result.is_incremental,
      });
    } catch (error) {
      console.error("Import error:", error);
      res.status(500).json({
        error: error.message || "Internal server error",
      });
    }
  });
};

// Export the sync function
export { syncUserMeetings };
