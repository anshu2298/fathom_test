import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { FiActivity, FiCalendar, FiAlertCircle, FiClock, FiArrowRight } from "react-icons/fi";
import { SkeletonCard, SkeletonText } from "./SkeletonLoader";
import "./Notifications.css";

function Notifications() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadNotifications = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/notifications", {
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error("Failed to load notifications");
      }

      const data = await res.json();
      setNotifications(data.notifications || []);
    } catch (error) {
      console.error("Load notifications error:", error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      loadNotifications();
      // Refresh notifications every 5 minutes
      const interval = setInterval(loadNotifications, 5 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [user, loadNotifications]);

  const handleNotificationClick = (notification) => {
    if (notification.actionUrl) {
      if (notification.actionUrl.startsWith("http")) {
        window.open(notification.actionUrl, "_blank");
      } else {
        navigate(notification.actionUrl);
      }
    }
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 0) {
      return "Now";
    } else if (diffMins < 60) {
      return `in ${diffMins} min`;
    } else if (diffHours < 24) {
      return `in ${diffHours} hour${diffHours > 1 ? "s" : ""}`;
    } else if (diffDays < 7) {
      return `in ${diffDays} day${diffDays > 1 ? "s" : ""}`;
    } else {
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }
  };

  const formatDateTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const activityNotifications = notifications.filter((n) => n.type === "activity");
  const calendarNotifications = notifications.filter((n) => n.type === "calendar");

  if (!user) {
    return (
      <div className="notifications-content">
        <div className="notifications-loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="notifications-content">
      <div className="notifications-header">
        <h1>Notifications</h1>
        <p className="notifications-subtitle">Stay updated with your activity and schedule</p>
      </div>

      {error && (
        <div className="notifications-error">
          <p>Error loading notifications: {error}</p>
          <button onClick={loadNotifications}>Retry</button>
        </div>
      )}

      {loading ? (
        <div className="notifications-skeleton">
          {[...Array(5)].map((_, i) => (
            <SkeletonCard key={i} height="100px" />
          ))}
        </div>
      ) : (
        <>
          {/* Activity Alerts Section */}
          {activityNotifications.length > 0 && (
            <div className="notifications-section">
              <div className="section-header">
                <FiActivity className="section-icon activity" />
                <h2>Activity Alerts</h2>
              </div>
              <div className="notifications-list">
                {activityNotifications.map((notification) => (
                  <div
                    key={notification.id}
                    className="notification-card activity-card"
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <div className="notification-icon activity">
                      <FiAlertCircle />
                    </div>
                    <div className="notification-content">
                      <div className="notification-title">{notification.title}</div>
                      <div className="notification-message">{notification.message}</div>
                      <div className="notification-time">
                        <FiClock /> {formatTime(notification.timestamp)}
                      </div>
                    </div>
                    <div className="notification-action">
                      <FiArrowRight />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upcoming Meetings Section */}
          {calendarNotifications.length > 0 && (
            <div className="notifications-section">
              <div className="section-header">
                <FiCalendar className="section-icon calendar" />
                <h2>Upcoming Meetings</h2>
              </div>
              <div className="notifications-list">
                {calendarNotifications.map((notification) => (
                  <div
                    key={notification.id}
                    className="notification-card calendar-card"
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <div className="notification-icon calendar">
                      <FiCalendar />
                    </div>
                    <div className="notification-content">
                      <div className="notification-title">{notification.title}</div>
                      <div className="notification-message">{notification.message}</div>
                      <div className="notification-time">
                        <FiClock /> {formatDateTime(notification.timestamp)}
                      </div>
                    </div>
                    <div className="notification-action">
                      <FiArrowRight />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {notifications.length === 0 && !loading && (
            <div className="notifications-empty">
              <FiActivity className="empty-icon" />
              <h3>All caught up!</h3>
              <p>You have no new notifications at this time.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default Notifications;

