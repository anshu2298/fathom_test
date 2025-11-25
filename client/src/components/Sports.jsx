import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { FiActivity, FiHeart, FiTrendingUp, FiTarget } from "react-icons/fi";
import "./Sports.css";

function Sports() {
  const { user } = useAuth();
  const [fitData, setFitData] = useState({
    steps: null,
    calories: null,
    heartRate: null,
    distance: null,
    activeMinutes: null,
    heartPoints: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [connected, setConnected] = useState(false);

  // Check Google Fit connection status
  const checkConnection = useCallback(async () => {
    if (!user) return;

    try {
      const res = await fetch("/api/googlefit/status", {
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error("Failed to check connection status");
      }

      const data = await res.json();
      setConnected(data.connected || false);
    } catch (error) {
      console.error("Connection check error:", error);
      setConnected(false);
    }
  }, [user]);

  // Load Google Fit data
  const loadFitData = useCallback(async () => {
    if (!user || !connected) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/googlefit/data", {
        credentials: "include",
      });

      if (!res.ok) {
        if (res.status === 401) {
          setConnected(false);
          return;
        }
        throw new Error("Failed to load Google Fit data");
      }

      const data = await res.json();
      setFitData({
        steps: data.steps || 0,
        calories: data.calories || 0,
        heartRate: data.heartRate || null,
        distance: data.distance || 0,
        activeMinutes: data.activeMinutes || 0,
        heartPoints: data.heartPoints || 0,
      });
    } catch (error) {
      console.error("Load Fit data error:", error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }, [user, connected]);

  useEffect(() => {
    if (user) {
      checkConnection();
    }
  }, [user, checkConnection]);

  useEffect(() => {
    if (connected) {
      loadFitData();
      // Refresh data every 5 minutes
      const interval = setInterval(loadFitData, 5 * 60 * 1000);
      return () => clearInterval(interval);
    } else {
      setLoading(false);
    }
  }, [connected, loadFitData]);

  const formatNumber = (num) => {
    if (num === null || num === undefined) return "—";
    return new Intl.NumberFormat().format(Math.round(num));
  };

  const formatDistance = (meters) => {
    if (!meters) return "0 km";
    const km = meters / 1000;
    return `${km.toFixed(2)} km`;
  };

  if (!user) {
    return <div className="sports-loading">Loading...</div>;
  }

  if (!connected) {
    return (
      <div className="sports-content">
        <div className="sports-not-connected">
          <FiActivity className="sports-icon-large" />
          <h2>Connect Google Fit</h2>
          <p>Connect your Google Fit account to view your fitness data</p>
          <button
            className="sports-connect-btn"
            onClick={() => {
              window.location.href = "/api/googlefit/connect";
            }}
          >
            Connect Google Fit
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="sports-content">
        <div className="sports-loading">Loading fitness data...</div>
      </div>
    );
  }

  return (
    <div className="sports-content">
      <div className="sports-header">
        <h1>Sports & Fitness</h1>
        <p className="sports-subtitle">Today's Activity</p>
      </div>

      {error && (
        <div className="sports-error">
          <p>Error loading data: {error}</p>
          <button onClick={loadFitData}>Retry</button>
        </div>
      )}

      <div className="sports-widgets">
        {/* Steps Widget */}
        <div className="sports-widget steps-widget">
          <div className="widget-header">
            <FiActivity className="widget-icon" />
            <span className="widget-label">Steps</span>
          </div>
          <div className="widget-value">{formatNumber(fitData.steps)}</div>
          <div className="widget-footer">
            <span className="widget-goal">Goal: 10,000</span>
            <div className="widget-progress">
              <div
                className="widget-progress-bar"
                style={{
                  width: `${Math.min((fitData.steps / 10000) * 100, 100)}%`,
                }}
              ></div>
            </div>
          </div>
        </div>

        {/* Calories Widget */}
        <div className="sports-widget calories-widget">
          <div className="widget-header">
            <FiTrendingUp className="widget-icon" />
            <span className="widget-label">Calories</span>
          </div>
          <div className="widget-value">{formatNumber(fitData.calories)}</div>
          <div className="widget-footer">
            <span className="widget-unit">kcal</span>
          </div>
        </div>

        {/* Heart Rate Widget */}
        <div className="sports-widget heart-widget">
          <div className="widget-header">
            <FiHeart className="widget-icon" />
            <span className="widget-label">Heart Rate</span>
          </div>
          <div className="widget-value">
            {fitData.heartRate ? `${formatNumber(fitData.heartRate)}` : "—"}
          </div>
          <div className="widget-footer">
            <span className="widget-unit">
              {fitData.heartRate ? "bpm" : "No data"}
            </span>
          </div>
        </div>

        {/* Distance Widget */}
        <div className="sports-widget distance-widget">
          <div className="widget-header">
            <FiTarget className="widget-icon" />
            <span className="widget-label">Distance</span>
          </div>
          <div className="widget-value">
            {formatDistance(fitData.distance)}
          </div>
          <div className="widget-footer">
            <span className="widget-unit">Today</span>
          </div>
        </div>

        {/* Active Minutes Widget */}
        <div className="sports-widget minutes-widget">
          <div className="widget-header">
            <FiActivity className="widget-icon" />
            <span className="widget-label">Active Minutes</span>
          </div>
          <div className="widget-value">{formatNumber(fitData.activeMinutes)}</div>
          <div className="widget-footer">
            <span className="widget-goal">Goal: 30 min</span>
            <div className="widget-progress">
              <div
                className="widget-progress-bar"
                style={{
                  width: `${Math.min((fitData.activeMinutes / 30) * 100, 100)}%`,
                }}
              ></div>
            </div>
          </div>
        </div>

        {/* Heart Points Widget */}
        <div className="sports-widget points-widget">
          <div className="widget-header">
            <FiHeart className="widget-icon" />
            <span className="widget-label">Heart Points</span>
          </div>
          <div className="widget-value">{formatNumber(fitData.heartPoints)}</div>
          <div className="widget-footer">
            <span className="widget-goal">Goal: 150</span>
            <div className="widget-progress">
              <div
                className="widget-progress-bar"
                style={{
                  width: `${Math.min((fitData.heartPoints / 150) * 100, 100)}%`,
                }}
              ></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Sports;

