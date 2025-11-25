import express from "express";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import session from "express-session";
import { existsSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { setupFathomAuth } from "./fathomAuth.js";
import { setupMeetingRoutes } from "./meetingRoutes.js";
import { setupGoogleAuth } from "./googleAuth.js";
import { setupUserRoutes } from "./userRoutes.js";
import { setupCalendarRoutes } from "./calendarRoutes.js";
import { setupGoogleFitRoutes } from "./googleFitRoutes.js";
import { setupNotificationRoutes } from "./notificationRoutes.js";
import { setupWeatherRoutes } from "./weatherRoutes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from project root (one level up)
dotenv.config({ path: join(__dirname, "..", ".env") });

const app = express();
app.use(express.json());

// Session configuration
// For production, use a proper store (Redis, PostgreSQL, etc.)
// For development, MemoryStore is fine (warning is expected)
// Note: Top-level await not supported, so Redis setup would need to be async
const sessionMiddleware = session({
  secret:
    process.env.SESSION_SECRET ||
    "your-secret-key-change-in-production",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true only with HTTPS
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: "lax", // Changed from "none" to "lax" for better compatibility
  },
  // Note: In production, consider using Redis or PostgreSQL session store
  // For now, MemoryStore will work but has limitations (single process, memory leaks)
});

// Apply session middleware
app.use(sessionMiddleware);

// Serve static files from client/dist in production, public in development
// IMPORTANT: This must come before the catch-all route
if (process.env.NODE_ENV === "production") {
  // Serve static files with proper MIME types
  // client/dist is one level up from server folder
  app.use(express.static(join(__dirname, "..", "client/dist"), {
    maxAge: "1y", // Cache static assets
    etag: true,
    lastModified: true,
    setHeaders: (res, path) => {
      // Ensure proper MIME types for JavaScript modules
      if (path.endsWith(".js")) {
        res.setHeader("Content-Type", "application/javascript; charset=utf-8");
      } else if (path.endsWith(".css")) {
        res.setHeader("Content-Type", "text/css; charset=utf-8");
      }
    }
  }));
} else {
  app.use(express.static(join(__dirname, "..", "public")));
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ============================================
// Setup Google OAuth Authentication
// ============================================
setupGoogleAuth(app, sessionMiddleware);

// ============================================
// Setup Fathom Authentication Routes
// ============================================
setupFathomAuth(app);

// ============================================
// Setup Meeting Routes
// ============================================
setupMeetingRoutes(app);

// ============================================
// Setup User Routes
// ============================================
setupUserRoutes(app);

// ============================================
// Setup Calendar Routes
// ============================================
setupCalendarRoutes(app);

// ============================================
// Setup Google Fit Routes
// ============================================
setupGoogleFitRoutes(app);

// ============================================
// Setup Notification Routes
// ============================================
setupNotificationRoutes(app);

// ============================================
// Setup Weather Routes
// ============================================
setupWeatherRoutes(app);

// ============================================
// Catch-all route for React Router (must be last)
// ============================================
// Serve the built React app for all non-API routes
// Note: Static files should already be handled by express.static above
app.get("*", (req, res) => {
  // Skip API routes - return 404 for missing API endpoints
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "API endpoint not found", path: req.path });
  }
  
  // Skip static asset requests - these should have been handled by express.static
  // If we reach here for a static file, it means the file doesn't exist
  if (req.path.match(/\.(js|css|json|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/)) {
    return res.status(404).json({ error: "Static file not found", path: req.path });
  }
  
  // Serve index.html for all other routes (React Router will handle routing)
  if (process.env.NODE_ENV === "production") {
    res.sendFile("index.html", { root: join(__dirname, "..", "client/dist") });
  } else {
    // In development, try to serve from client/dist if it exists
    const indexPath = join(__dirname, "..", "client/dist/index.html");
    
    if (existsSync(indexPath)) {
      res.sendFile("index.html", { root: join(__dirname, "..", "client/dist") });
    } else {
      res.status(404).json({
        error: "Route not found",
        message: "Build the client first with 'npm run build' in the client folder, or set NODE_ENV=production",
        path: req.path,
      });
    }
  }
});

// ============================================
// Server Startup
// ============================================
app.listen(3000, () => {
  console.log("🚀 Server running on http://localhost:3000");
  console.log("📡 Fathom OAuth: /api/fathom/connect");
  console.log("📋 Meetings: GET /api/fathom/meetings");
  console.log("🔄 Sync: POST /api/fathom/import");
});
