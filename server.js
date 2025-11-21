import express from "express";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { setupFathomAuth } from "./fathomAuth.js";
import { setupMeetingRoutes } from "./meetingRoutes.js";

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static("public"));

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ============================================
// Setup Fathom Authentication Routes
// ============================================
setupFathomAuth(app);

// ============================================
// Setup Meeting Routes
// ============================================
setupMeetingRoutes(app);

// ============================================
// Server Startup
// ============================================
app.listen(3000, () => {
  console.log("🚀 Server running on http://localhost:3000");
  console.log("📡 Fathom OAuth: /api/fathom/connect");
  console.log("📋 Meetings: GET /api/fathom/meetings");
  console.log("🔄 Sync: POST /api/fathom/import");
});
