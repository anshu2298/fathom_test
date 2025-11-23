import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
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
 * Sets up user management routes
 * @param {Express} app - Express application instance
 */
export const setupUserRoutes = (app) => {
  // Middleware to ensure user is authenticated
  const requireAuth = (req, res, next) => {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    next();
  };

  // Update user profile (name)
  app.put("/api/user/profile", requireAuth, async (req, res) => {
    try {
      const userId = req.user.userId;
      const { name } = req.body;

      if (!name || typeof name !== "string" || name.trim() === "") {
        return res.status(400).json({ error: "Name is required" });
      }

      const { data, error } = await supabase
        .from("fathom_connections")
        .update({
          name: name.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .select()
        .single();

      if (error) {
        console.error("Error updating user profile:", error);
        return res.status(500).json({ error: "Failed to update profile" });
      }

      res.json({
        success: true,
        user: {
          userId: data.user_id,
          email: data.email,
          name: data.name,
          picture: data.picture,
        },
      });
    } catch (error) {
      console.error("Profile update error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get user profile
  app.get("/api/user/profile", requireAuth, async (req, res) => {
    try {
      const userId = req.user.userId;

      const { data, error } = await supabase
        .from("fathom_connections")
        .select("user_id, email, name, picture, google_id")
        .eq("user_id", userId)
        .single();

      if (error || !data) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({
        userId: data.user_id,
        email: data.email,
        name: data.name,
        picture: data.picture,
        googleId: data.google_id,
      });
    } catch (error) {
      console.error("Get profile error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
};

