import {
  createContext,
  useContext,
  useState,
  useEffect,
} from "react";

const AuthContext = createContext(null);

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
      !loading
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
    // Redirect to Google OAuth
    window.location.href = "/api/auth/google";
  };

  const logout = async () => {
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
