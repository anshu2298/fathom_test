import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { FiActivity, FiHeart, FiTrendingUp, FiTarget, FiZap } from "react-icons/fi";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { SkeletonWidget, SkeletonGraph } from "./SkeletonLoader";
import "./Fitness.css";

function Fitness() {
  const { user } = useAuth();
  const [todayData, setTodayData] = useState({
    steps: null,
    calories: null,
    heartRate: null,
    distance: null,
    activeMinutes: null,
    heartPoints: null,
  });
  const [weeklyData, setWeeklyData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [weeklyLoading, setWeeklyLoading] = useState(true);
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

  // Load today's Google Fit data
  const loadTodayData = useCallback(async () => {
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
      setTodayData({
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

  // Load weekly Google Fit data
  const loadWeeklyData = useCallback(async () => {
    if (!user || !connected) {
      setWeeklyLoading(false);
      return;
    }

    setWeeklyLoading(true);

    try {
      const res = await fetch("/api/googlefit/weekly", {
        credentials: "include",
      });

      if (!res.ok) {
        if (res.status === 401) {
          setConnected(false);
          return;
        }
        throw new Error("Failed to load weekly data");
      }

      const data = await res.json();
      setWeeklyData(data.weeklyData || []);
    } catch (error) {
      console.error("Load weekly data error:", error);
    } finally {
      setWeeklyLoading(false);
    }
  }, [user, connected]);

  useEffect(() => {
    if (user) {
      checkConnection();
    }
  }, [user, checkConnection]);

  useEffect(() => {
    if (connected) {
      loadTodayData();
      loadWeeklyData();
      // Refresh data every 5 minutes
      const interval = setInterval(() => {
        loadTodayData();
        loadWeeklyData();
      }, 5 * 60 * 1000);
      return () => clearInterval(interval);
    } else {
      setLoading(false);
      setWeeklyLoading(false);
    }
  }, [connected, loadTodayData, loadWeeklyData]);

  const formatNumber = (num) => {
    if (num === null || num === undefined) return "—";
    return new Intl.NumberFormat().format(Math.round(num));
  };

  const formatDistance = (meters) => {
    if (!meters) return "0 km";
    const km = meters / 1000;
    return `${km.toFixed(2)} km`;
  };

  // Calculate weekly heart points total
  const weeklyHeartPointsTotal = weeklyData.reduce((sum, day) => sum + (day.heartPoints || 0), 0);
  const weeklyHeartPointsGoal = 150 * 7; // 150 per day for 7 days

  if (!user) {
    return (
      <div className="fitness-content">
        <div className="fitness-loading">Loading...</div>
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="fitness-content">
        <div className="fitness-not-connected">
          <FiActivity className="fitness-icon-large" />
          <h2>Connect Google Fit</h2>
          <p>Connect your Google Fit account to view your fitness data</p>
          <button
            className="fitness-connect-btn"
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

  return (
    <div className="fitness-content">
      <div className="fitness-header">
        <h1>Fitness</h1>
        <p className="fitness-subtitle">Track your health and activity</p>
      </div>

      {error && (
        <div className="fitness-error">
          <p>Error loading data: {error}</p>
          <button onClick={() => { loadTodayData(); loadWeeklyData(); }}>Retry</button>
        </div>
      )}

      {/* Large Today's Stats Widget */}
      <div className="fitness-today-widget">
        {loading ? (
          <SkeletonWidget />
        ) : (
          <>
            <div className="today-widget-header">
              <h2>Today's Activity</h2>
              <span className="today-date">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
            </div>
            <div className="today-stats-grid">
              <div className="today-stat">
                <div className="today-stat-icon steps">
                  <FiActivity />
                </div>
                <div className="today-stat-content">
                  <div className="today-stat-value">{formatNumber(todayData.steps)}</div>
                  <div className="today-stat-label">Steps</div>
                  <div className="today-stat-progress">
                    <div className="progress-bar">
                      <div
                        className="progress-fill steps"
                        style={{ width: `${Math.min((todayData.steps / 10000) * 100, 100)}%` }}
                      ></div>
                    </div>
                    <span className="progress-text">{Math.round((todayData.steps / 10000) * 100)}% of goal</span>
                  </div>
                </div>
              </div>

              <div className="today-stat">
                <div className="today-stat-icon calories">
                  <FiZap />
                </div>
                <div className="today-stat-content">
                  <div className="today-stat-value">{formatNumber(todayData.calories)}</div>
                  <div className="today-stat-label">Calories</div>
                  <div className="today-stat-unit">kcal</div>
                </div>
              </div>

              <div className="today-stat">
                <div className="today-stat-icon distance">
                  <FiTarget />
                </div>
                <div className="today-stat-content">
                  <div className="today-stat-value">{formatDistance(todayData.distance)}</div>
                  <div className="today-stat-label">Distance</div>
                </div>
              </div>

              <div className="today-stat">
                <div className="today-stat-icon minutes">
                  <FiActivity />
                </div>
                <div className="today-stat-content">
                  <div className="today-stat-value">{formatNumber(todayData.activeMinutes)}</div>
                  <div className="today-stat-label">Active Minutes</div>
                  <div className="today-stat-progress">
                    <div className="progress-bar">
                      <div
                        className="progress-fill minutes"
                        style={{ width: `${Math.min((todayData.activeMinutes / 30) * 100, 100)}%` }}
                      ></div>
                    </div>
                    <span className="progress-text">{Math.round((todayData.activeMinutes / 30) * 100)}% of goal</span>
                  </div>
                </div>
              </div>

              <div className="today-stat">
                <div className="today-stat-icon heart">
                  <FiHeart />
                </div>
                <div className="today-stat-content">
                  <div className="today-stat-value">
                    {todayData.heartRate ? formatNumber(todayData.heartRate) : "—"}
                  </div>
                  <div className="today-stat-label">Heart Rate</div>
                  <div className="today-stat-unit">{todayData.heartRate ? "bpm" : "No data"}</div>
                </div>
              </div>

              <div className="today-stat">
                <div className="today-stat-icon points">
                  <FiTrendingUp />
                </div>
                <div className="today-stat-content">
                  <div className="today-stat-value">{formatNumber(todayData.heartPoints)}</div>
                  <div className="today-stat-label">Heart Points</div>
                  <div className="today-stat-progress">
                    <div className="progress-bar">
                      <div
                        className="progress-fill points"
                        style={{ width: `${Math.min((todayData.heartPoints / 150) * 100, 100)}%` }}
                      ></div>
                    </div>
                    <span className="progress-text">{Math.round((todayData.heartPoints / 150) * 100)}% of goal</span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Weekly Charts Section */}
      <div className="fitness-charts-section">
        {/* Weekly Steps Chart */}
        <div className="fitness-chart-widget">
          <div className="chart-header">
            <h3>Weekly Steps</h3>
            <span className="chart-subtitle">Last 7 days</span>
          </div>
          {weeklyLoading ? (
            <SkeletonGraph height="300px" />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={weeklyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(34, 34, 34, 0.1)" />
                <XAxis 
                  dataKey="date" 
                  stroke="#222222"
                  tick={{ fontSize: 12 }}
                />
                <YAxis 
                  stroke="#222222"
                  tick={{ fontSize: 12 }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#EBD5AB', 
                    border: '1px solid rgba(34, 34, 34, 0.1)',
                    borderRadius: '8px'
                  }}
                  formatter={(value) => [formatNumber(value), 'Steps']}
                />
                <Bar dataKey="steps" fill="#E67E22" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Weekly Energy Expended Chart */}
        <div className="fitness-chart-widget">
          <div className="chart-header">
            <h3>Energy Expended</h3>
            <span className="chart-subtitle">Last 7 days (kcal)</span>
          </div>
          {weeklyLoading ? (
            <SkeletonGraph height="300px" />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={weeklyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(34, 34, 34, 0.1)" />
                <XAxis 
                  dataKey="date" 
                  stroke="#222222"
                  tick={{ fontSize: 12 }}
                />
                <YAxis 
                  stroke="#222222"
                  tick={{ fontSize: 12 }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#EBD5AB', 
                    border: '1px solid rgba(34, 34, 34, 0.1)',
                    borderRadius: '8px'
                  }}
                  formatter={(value) => [formatNumber(value), 'kcal']}
                />
                <Line 
                  type="monotone" 
                  dataKey="calories" 
                  stroke="#E67E22" 
                  strokeWidth={3}
                  dot={{ fill: '#E67E22', r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Weekly Heart Points Target */}
      <div className="fitness-weekly-target">
        {weeklyLoading ? (
          <SkeletonWidget />
        ) : (
          <>
            <div className="weekly-target-header">
              <div>
                <h3>Weekly Heart Points</h3>
                <p className="weekly-target-subtitle">Target: {formatNumber(weeklyHeartPointsGoal)} points</p>
              </div>
              <div className="weekly-target-value">
                {formatNumber(weeklyHeartPointsTotal)}
              </div>
            </div>
            <div className="weekly-target-progress">
              <div className="progress-bar-large">
                <div
                  className="progress-fill-large"
                  style={{ width: `${Math.min((weeklyHeartPointsTotal / weeklyHeartPointsGoal) * 100, 100)}%` }}
                ></div>
              </div>
              <div className="weekly-target-stats">
                <span>{Math.round((weeklyHeartPointsTotal / weeklyHeartPointsGoal) * 100)}% Complete</span>
                <span>{formatNumber(weeklyHeartPointsGoal - weeklyHeartPointsTotal)} remaining</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default Fitness;

