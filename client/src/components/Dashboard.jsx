import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import Actions from "./Actions";
import SyncMeetings from "./SyncMeetings";
import MeetingsList from "./MeetingsList";
import MeetingDetailsModal from "./MeetingDetailsModal";
import { SkeletonCard } from "./SkeletonLoader";

function Dashboard() {
  const { user } = useAuth();
  const [meetings, setMeetings] = useState([]);
  const [meetingsLoading, setMeetingsLoading] = useState(true);
  const [importResult, setImportResult] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState(null);

  // Load meetings from database
  const loadMeetings = useCallback(async () => {
    if (!user) return;

    setMeetingsLoading(true);
    try {
      const res = await fetch(
        `/api/fathom/meetings?user_id=${encodeURIComponent(user.userId)}`,
        {
          credentials: "include",
        }
      );
      const data = await res.json();

      if (data.error) {
        throw new Error(data.error);
      }

      setMeetings(data.meetings || []);
    } catch (error) {
      console.error("Load meetings error:", error);
      setMeetings([]);
    } finally {
      setMeetingsLoading(false);
    }
  }, [user]);

  // Import historical meetings
  const importHistoricalMeetings = async () => {
    if (!user) return;

    setImportLoading(true);
    setImportResult(null);

    try {
      const res = await fetch(
        `/api/fathom/import?user_id=${encodeURIComponent(user.userId)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({ user_id: user.userId }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Import failed");
      }

      setImportResult(data);

      // Auto-reload meetings after 5 seconds
      setTimeout(() => {
        loadMeetings();
      }, 5000);
    } catch (error) {
      console.error("Import error:", error);
      setImportResult({
        error: error.message,
      });
    } finally {
      setImportLoading(false);
    }
  };

  // Initialize on mount
  useEffect(() => {
    if (user) {
      loadMeetings().catch((err) => {
        console.error("Failed to load meetings:", err);
      });
    }
  }, [user, loadMeetings]);

  // Auto-refresh meetings every 30 seconds
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(() => {
      loadMeetings().catch((err) => {
        console.error("Failed to refresh meetings:", err);
      });
    }, 30000);

    return () => clearInterval(interval);
  }, [user, loadMeetings]);

  // Handle OAuth success message
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected") === "true") {
      // Show success alert
      setTimeout(() => {
        alert(
          `Fathom Connected Successfully!\n\nUser ID: ${user?.userId}\n\nYour meetings will now be automatically synced every 30 minutes.`
        );
      }, 500);

      // Clean up URL parameters
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, "", cleanUrl);
    }
  }, [user]);

  if (!user) {
    return (
      <div className="dashboard-content">
        <SkeletonCard height="200px" />
      </div>
    );
  }

  return (
    <div className="dashboard-content">
      <Actions onReloadMeetings={loadMeetings} />

      <SyncMeetings
        importLoading={importLoading}
        importResult={importResult}
        onSync={importHistoricalMeetings}
      />

      <MeetingsList
        meetings={meetings}
        loading={meetingsLoading}
        onMeetingClick={setSelectedMeeting}
      />

      {selectedMeeting && (
        <MeetingDetailsModal
          meeting={selectedMeeting}
          onClose={() => setSelectedMeeting(null)}
        />
      )}
    </div>
  );
}

export default Dashboard;

