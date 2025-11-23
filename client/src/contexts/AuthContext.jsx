import {
  createContext,
  useContext,
  useState,
  useEffect,
} from "react";

const AuthContext = createContext(null);

// Dummy user data for development
const DUMMY_USER = {
  userId: "google_123456789",
  googleId: "123456789",
  email: "dev.user@example.com",
  name: "Dev User",
  picture:
    "https://via.placeholder.com/150/4285F4/FFFFFF?text=DU",
};

// Check if we should use dummy data (development mode)
const USE_DUMMY_DATA =
  import.meta.env.DEV ||
  import.meta.env.VITE_USE_DUMMY_AUTH === "true" ||
  localStorage.getItem("useDummyAuth") === "true";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

  const [loading, setLoading] = useState(true);

  // Check authentication status on mount
  useEffect(() => {
    // Initial check
    checkAuth();

    // Re-check after a short delay (handles OAuth redirects where session might not be immediately available)
    const timeoutId = setTimeout(() => {
      checkAuth();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, []);

  // Re-check auth periodically if on dashboard but not authenticated (handles OAuth redirects)
  useEffect(() => {
    if (
      window.location.pathname === "/dashboard" &&
      !user &&
      !loading &&
      !USE_DUMMY_DATA
    ) {
      // Check auth again after redirect
      const intervalId = setInterval(() => {
        checkAuth();
      }, 500);

      // Stop checking after 5 seconds
      const stopId = setTimeout(() => {
        clearInterval(intervalId);
      }, 5000);

      return () => {
        clearInterval(intervalId);
        clearTimeout(stopId);
      };
    }
  }, [user, loading]);

  const checkAuth = async () => {
    // Use dummy data in development mode
    if (USE_DUMMY_DATA) {
      console.log(
        "🔧 Using dummy authentication data for development"
      );
      setUser(DUMMY_USER);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/me", {
        credentials: "include",
      });
      const data = await res.json();

      if (data.authenticated && data.user) {
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error("Auth check error:", error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = () => {
    // In dummy mode, just set the user directly
    if (USE_DUMMY_DATA) {
      setUser(DUMMY_USER);
      window.location.href = "/dashboard";
      return;
    }
    // Redirect to Google OAuth
    window.location.href = "/api/auth/google";
  };

  const logout = async () => {
    // In dummy mode, just clear the user
    if (USE_DUMMY_DATA) {
      setUser(null);
      window.location.href = "/";
      return;
    }

    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
      setUser(null);
      window.location.href = "/";
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const value = {
    user,
    loading,
    isAuthenticated: !!user,
    login,
    logout,
    checkAuth,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error(
      "useAuth must be used within AuthProvider"
    );
  }
  return context;
}
