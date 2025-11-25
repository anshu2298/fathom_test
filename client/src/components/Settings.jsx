import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  FiLink2,
  FiEdit2,
  FiCheck,
  FiX,
  FiCalendar,
  FiCheckCircle,
  FiActivity,
} from "react-icons/fi";
import "./Settings.css";

function Settings() {
  const { user, checkAuth } = useAuth();
  const [connectionStatus, setConnectionStatus] = useState({
    loading: true,
    connected: false,
    message: "Checking connection...",
    error: null,
  });
  const [calendarStatus, setCalendarStatus] = useState({
    loading: true,
    connected: false,
  });
  const [googleFitStatus, setGoogleFitStatus] = useState({
    loading: true,
    connected: false,
  });
  const [name, setName] = useState(user?.name || "");
  const [isEditingName, setIsEditingName] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const checkConnectionStatus = useCallback(async () => {
    if (!user) return;

    try {
      setConnectionStatus((prev) => ({
        ...prev,
        loading: true,
      }));
      const res = await fetch(
        `/api/fathom/status?user_id=${encodeURIComponent(
          user.userId
        )}`,
        {
          credentials: "include",
        }
      );

      if (!res.ok) {
        throw new Error(
          `HTTP ${res.status}: ${res.statusText}`
        );
      }

      const data = await res.json();

      if (data.connected) {
        setConnectionStatus({
          loading: false,
          connected: true,
          message: `✅ Connected\nMeetings will sync automatically every 30 minutes`,
          error: null,
        });
      } else {
        setConnectionStatus({
          loading: false,
          connected: false,
          message: `❌ Not Connected\nClick "Connect Fathom" to set up integration`,
          error: null,
        });
      }
    } catch (error) {
      console.error("Status check error:", error);
      setConnectionStatus({
        loading: false,
        connected: false,
        message: `⚠️ Error checking status`,
        error: error.message,
      });
    }
  }, [user]);

  const checkCalendarStatus = useCallback(async () => {
    if (!user) return;

    try {
      setCalendarStatus((prev) => ({
        ...prev,
        loading: true,
      }));
      const res = await fetch("/api/calendar/status", {
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error(
          `HTTP ${res.status}: ${res.statusText}`
        );
      }

      const data = await res.json();
      setCalendarStatus({
        loading: false,
        connected: data.connected || false,
      });
    } catch (error) {
      console.error("Calendar status check error:", error);
      setCalendarStatus({
        loading: false,
        connected: false,
      });
    }
  }, [user]);

  const checkGoogleFitStatus = useCallback(async () => {
    if (!user) return;

    try {
      setGoogleFitStatus((prev) => ({
        ...prev,
        loading: true,
      }));
      const res = await fetch("/api/googlefit/status", {
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error(
          `HTTP ${res.status}: ${res.statusText}`
        );
      }

      const data = await res.json();
      setGoogleFitStatus({
        loading: false,
        connected: data.connected || false,
      });
    } catch (error) {
      console.error(
        "Google Fit status check error:",
        error
      );
      setGoogleFitStatus({
        loading: false,
        connected: false,
      });
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      setName(user.name || "");
      checkConnectionStatus();
      checkCalendarStatus();
      checkGoogleFitStatus();
    }
  }, [
    user,
    checkConnectionStatus,
    checkCalendarStatus,
    checkGoogleFitStatus,
  ]);

  // Check for OAuth redirects
  useEffect(() => {
    const params = new URLSearchParams(
      window.location.search
    );
    if (params.get("calendar_connected") === "true") {
      checkCalendarStatus();
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, "", cleanUrl);
    }
    if (params.get("googlefit_connected") === "true") {
      checkGoogleFitStatus();
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, "", cleanUrl);
    }
    // Check for Fathom connection success
    if (params.get("connected") === "true") {
      checkConnectionStatus();
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, "", cleanUrl);
    }
  }, [
    checkCalendarStatus,
    checkGoogleFitStatus,
    checkConnectionStatus,
  ]);

  const handleConnectFathom = () => {
    if (!user) return;
    window.location.href = `/api/fathom/connect?user_id=${encodeURIComponent(
      user.userId
    )}`;
  };

  const handleConnectCalendar = () => {
    if (!user) return;
    window.location.href = "/api/calendar/connect";
  };

  const handleDisconnectCalendar = async () => {
    if (!user) return;

    try {
      const res = await fetch("/api/calendar/disconnect", {
        method: "POST",
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error("Failed to disconnect calendar");
      }

      await checkCalendarStatus();
      alert("Google Calendar disconnected successfully");
    } catch (error) {
      console.error("Disconnect calendar error:", error);
      alert("Failed to disconnect calendar");
    }
  };

  const handleConnectGoogleFit = () => {
    if (!user) return;
    window.location.href = "/api/googlefit/connect";
  };

  const handleDisconnectGoogleFit = async () => {
    if (!user) return;

    try {
      const res = await fetch("/api/googlefit/disconnect", {
        method: "POST",
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error("Failed to disconnect Google Fit");
      }

      await checkGoogleFitStatus();
      alert("Google Fit disconnected successfully");
    } catch (error) {
      console.error("Disconnect Google Fit error:", error);
      alert("Failed to disconnect Google Fit");
    }
  };

  const handleSaveName = async () => {
    if (!user || !name.trim()) return;

    setIsSaving(true);
    try {
      const res = await fetch("/api/user/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ name: name.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data.error || "Failed to update name"
        );
      }

      // Update was successful
      setIsEditingName(false);
      // Refresh auth to get updated user data
      await checkAuth();
      // Show success message
      alert("Name updated successfully!");
    } catch (error) {
      console.error("Error saving name:", error);
      alert(`Failed to update name: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setName(user?.name || "");
    setIsEditingName(false);
  };

  if (!user) {
    return <div>Loading...</div>;
  }

  return (
    <div className='settings-page'>
      <h2 className='settings-title'>Settings</h2>

      <div className='settings-layout'>
        {/* Left Column - Profile Section */}
        <div className='settings-column settings-column-left'>
          <div className='settings-section'>
            <h3 className='settings-section-title'>
              Profile
            </h3>
            <div className='settings-content'>
              <div className='setting-item'>
                <label className='setting-label'>
                  Profile Photo
                </label>
                <div className='profile-photo-container'>
                  {user.picture ? (
                    <img
                      src={user.picture}
                      alt={user.name}
                      className='settings-profile-photo'
                    />
                  ) : (
                    <div className='settings-profile-photo-placeholder'>
                      {user.name?.charAt(0).toUpperCase() ||
                        "U"}
                    </div>
                  )}
                  <div className='profile-photo-note'>
                    <p>
                      Profile photo is managed by Google
                      OAuth.
                    </p>
                    <p className='note-text'>
                      To change your profile photo, update
                      it in your Google account.
                    </p>
                  </div>
                </div>
              </div>

              <div className='setting-item'>
                <label className='setting-label'>
                  Display Name
                </label>
                {isEditingName ? (
                  <div className='name-edit-container'>
                    <input
                      type='text'
                      value={name}
                      onChange={(e) =>
                        setName(e.target.value)
                      }
                      className='name-input'
                      placeholder='Enter your name'
                      disabled={isSaving}
                    />
                    <div className='name-edit-actions'>
                      <button
                        className='btn-secondary'
                        onClick={handleCancelEdit}
                        disabled={isSaving}
                      >
                        Cancel
                      </button>
                      <button
                        className='btn-primary'
                        onClick={handleSaveName}
                        disabled={isSaving || !name.trim()}
                      >
                        {isSaving ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className='name-display-container'>
                    <span className='name-display'>
                      {user.name || "Not set"}
                    </span>
                    <button
                      className='btn-secondary'
                      onClick={() => setIsEditingName(true)}
                    >
                      <FiEdit2
                        style={{ marginRight: "6px" }}
                      />
                      Edit
                    </button>
                  </div>
                )}
              </div>

              <div className='setting-item'>
                <label className='setting-label'>
                  Email
                </label>
                <div className='email-display'>
                  {user.email}
                </div>
                <p className='setting-note'>
                  Email is managed by Google OAuth and
                  cannot be changed here.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - Integrations Section */}
        <div className='settings-column settings-column-right'>
          <div className='settings-section'>
            <h3 className='settings-section-title'>
              Integrations
            </h3>
            <div className='settings-content'>
              {/* Fathom Integration */}
              <div className='setting-item'>
                <label className='setting-label'>
                  Fathom
                </label>
                {/* <p className='integration-description'>
                  Fathom is a meeting recording and
                  transcription service. By connecting your
                  Fathom account, you can automatically sync
                  meeting transcripts, view summaries, and
                  access AI-generated insights from your
                  recorded meetings directly in this
                  dashboard.
                </p> */}
                <button
                  className={`integration-btn ${
                    connectionStatus.connected
                      ? "connected"
                      : ""
                  }`}
                  onClick={handleConnectFathom}
                  disabled={connectionStatus.loading}
                >
                  {connectionStatus.connected ? (
                    <>
                      <FiCheckCircle
                        style={{ marginRight: "8px" }}
                      />
                      Connected
                    </>
                  ) : (
                    <>
                      <FiLink2
                        style={{ marginRight: "8px" }}
                      />
                      Connect Fathom
                    </>
                  )}
                </button>
                <p className='setting-note'>
                  {connectionStatus.connected
                    ? "Your Fathom account is connected. Meetings will sync automatically every 30 minutes."
                    : "Connect your Fathom account to automatically sync meeting transcripts."}
                </p>
              </div>

              {/* Google Calendar Integration */}
              <div className='setting-item'>
                <label className='setting-label'>
                  Google Calendar
                </label>
                {/* <p className='integration-description'>
                  Google Calendar integration allows you to
                  sync your calendar events and meetings
                  with this dashboard. This helps you view
                  your scheduled meetings, important dates,
                  and upcoming events alongside your meeting
                  transcripts and summaries.
                </p> */}
                {calendarStatus.loading ? (
                  <div className='loading'>
                    Checking connection...
                  </div>
                ) : calendarStatus.connected ? (
                  <>
                    <button
                      className='integration-btn connected'
                      onClick={handleDisconnectCalendar}
                    >
                      <FiCheckCircle
                        style={{ marginRight: "8px" }}
                      />
                      Connected
                    </button>
                    <p className='setting-note'>
                      Your Google Calendar is connected.
                      Important dates and events will be
                      synced.
                    </p>
                  </>
                ) : (
                  <>
                    <button
                      className='integration-btn'
                      onClick={handleConnectCalendar}
                    >
                      <FiCalendar
                        style={{ marginRight: "8px" }}
                      />
                      Connect Google Calendar
                    </button>
                    <p className='setting-note'>
                      Connect your Google Calendar to sync
                      important dates and events.
                    </p>
                  </>
                )}
              </div>

              {/* Google Fit Integration */}
              <div className='setting-item'>
                <label className='setting-label'>
                  Google Fit
                </label>
                {/* <p className='integration-description'>
                  Google Fit integration allows you to sync
                  your fitness and health data with this
                  dashboard. By connecting your Google Fit
                  account, you can view your activity data,
                  workout summaries, step counts, and health
                  metrics alongside your meeting transcripts
                  and calendar events.
                </p> */}
                {googleFitStatus.loading ? (
                  <div className='loading'>
                    Checking connection...
                  </div>
                ) : googleFitStatus.connected ? (
                  <>
                    <button
                      className='integration-btn connected'
                      onClick={handleDisconnectGoogleFit}
                    >
                      <FiCheckCircle
                        style={{ marginRight: "8px" }}
                      />
                      Connected
                    </button>
                    <p className='setting-note'>
                      Your Google Fit account is connected.
                      Activity data and health metrics will
                      be synced.
                    </p>
                  </>
                ) : (
                  <>
                    <button
                      className='integration-btn'
                      onClick={handleConnectGoogleFit}
                    >
                      <FiActivity
                        style={{ marginRight: "8px" }}
                      />
                      Connect Google Fit
                    </button>
                    <p className='setting-note'>
                      Connect your Google Fit account to
                      sync activity data and health metrics.
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Settings;
