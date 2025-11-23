import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
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

// Configure Passport Google Strategy
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${process.env.APP_URL || "http://localhost:3000"}/api/auth/google/callback`,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const googleId = profile.id;
        const email = profile.emails?.[0]?.value;
        const name = profile.displayName;
        const picture = profile.photos?.[0]?.value;

        // Use Google ID as the user_id
        const userId = `google_${googleId}`;

        // Store or update user in database (using merged fathom_connections table)
        const { data: existingUser, error: fetchError } = await supabase
          .from("fathom_connections")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle();

        if (fetchError && fetchError.code !== "PGRST116") {
          // PGRST116 is "not found" which is fine
          console.error("Error fetching user:", fetchError);
        }

        const userData = {
          user_id: userId,
          google_id: googleId,
          email: email,
          name: name,
          picture: picture,
          updated_at: new Date().toISOString(),
        };

        if (existingUser) {
          // Update existing user
          const { error: updateError } = await supabase
            .from("fathom_connections")
            .update(userData)
            .eq("user_id", userId);

          if (updateError) {
            console.error("Error updating user:", updateError);
            return done(updateError, null);
          }
        } else {
          // Insert new user (upsert to handle race conditions)
          const { error: upsertError } = await supabase
            .from("fathom_connections")
            .upsert({
              ...userData,
              inserted_at: new Date().toISOString(),
            }, {
              onConflict: "user_id"
            });

          if (upsertError) {
            console.error("Error inserting user:", upsertError);
            return done(upsertError, null);
          }
        }

        return done(null, {
          userId,
          googleId,
          email,
          name,
          picture,
        });
      } catch (error) {
        console.error("Google OAuth error:", error);
        return done(error, null);
      }
    }
  )
);

// Serialize user for session
passport.serializeUser((user, done) => {
  done(null, user.userId);
});

// Deserialize user from session
passport.deserializeUser(async (userId, done) => {
  try {
    const { data: user, error } = await supabase
      .from("fathom_connections")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error || !user) {
      return done(null, false);
    }

    done(null, {
      userId: user.user_id,
      googleId: user.google_id,
      email: user.email,
      name: user.name,
      picture: user.picture,
    });
  } catch (error) {
    done(error, null);
  }
});

/**
 * Sets up Google OAuth authentication routes
 * @param {Express} app - Express application instance
 * @param {Express} sessionMiddleware - Express session middleware
 */
export const setupGoogleAuth = (app, sessionMiddleware) => {
  // Initialize Passport
  app.use(sessionMiddleware);
  app.use(passport.initialize());
  app.use(passport.session());

  // Route to initiate Google OAuth
  app.get(
    "/api/auth/google",
    passport.authenticate("google", {
      scope: ["profile", "email"],
    })
  );

  // Google OAuth callback
  app.get(
    "/api/auth/google/callback",
    passport.authenticate("google", {
      failureRedirect: "/?auth_error=1",
    }),
    (req, res) => {
      // Successful authentication
      // Log for debugging
      console.log("✅ Google OAuth successful for user:", req.user?.userId);
      console.log("✅ Session ID:", req.sessionID);
      console.log("✅ Session user:", req.user);
      
      // Ensure session is saved before redirect
      req.session.save((err) => {
        if (err) {
          console.error("❌ Session save error:", err);
          return res.redirect("/?auth_error=session");
        }
        // Redirect to dashboard
        res.redirect("/dashboard");
      });
    }
  );

  // Get current user (reads fresh from database)
  app.get("/api/auth/me", async (req, res) => {
    // Debug logging
    console.log("Auth check - Session ID:", req.sessionID);
    console.log("Auth check - User ID:", req.user?.userId || "Not authenticated");
    
    if (req.user && req.user.userId) {
      try {
        // Read fresh data from database to get latest name/profile updates
        const { data: userData, error } = await supabase
          .from("fathom_connections")
          .select("user_id, email, name, picture, google_id")
          .eq("user_id", req.user.userId)
          .single();

        if (error || !userData) {
          // Fallback to session data if DB read fails
          return res.json({
            authenticated: true,
            user: {
              userId: req.user.userId,
              email: req.user.email,
              name: req.user.name,
              picture: req.user.picture,
            },
          });
        }

        // Return fresh data from database
        res.json({
          authenticated: true,
          user: {
            userId: userData.user_id,
            email: userData.email,
            name: userData.name,
            picture: userData.picture,
          },
        });
      } catch (error) {
        console.error("Error fetching user from database:", error);
        // Fallback to session data
        res.json({
          authenticated: true,
          user: {
            userId: req.user.userId,
            email: req.user.email,
            name: req.user.name,
            picture: req.user.picture,
          },
        });
      }
    } else {
      res.json({
        authenticated: false,
        user: null,
      });
    }
  });

  // Logout route
  app.post("/api/auth/logout", (req, res) => {
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ error: "Logout failed" });
      }
      req.session.destroy((err) => {
        if (err) {
          return res.status(500).json({ error: "Session destroy failed" });
        }
        res.clearCookie("connect.sid");
        res.json({ success: true });
      });
    });
  });
};

