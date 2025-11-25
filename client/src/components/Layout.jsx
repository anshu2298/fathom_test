import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { Link, useLocation } from "react-router-dom";
import {
  FiBell,
  FiHome,
  FiFileText,
  FiActivity,
  FiPlay,
  FiSettings,
  FiLogOut,
  FiSearch,
} from "react-icons/fi";
import Clock from "./Clock";
import WeatherWidget from "./WeatherWidget";
import "./Layout.css";

function Layout({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [notificationCount, setNotificationCount] =
    useState(0);

  const isActive = (path) => {
    return location.pathname === path;
  };

  const handleLogout = async () => {
    await logout();
  };

  // Fetch notification count
  useEffect(() => {
    if (user) {
      const fetchCount = async () => {
        try {
          const res = await fetch(
            "/api/notifications/count",
            {
              credentials: "include",
            }
          );
          if (res.ok) {
            const data = await res.json();
            setNotificationCount(data.count || 0);
          }
        } catch (error) {
          console.error(
            "Error fetching notification count:",
            error
          );
        }
      };

      fetchCount();
      // Refresh count every 5 minutes
      const interval = setInterval(
        fetchCount,
        5 * 60 * 1000
      );
      return () => clearInterval(interval);
    }
  }, [user]);

  return (
    <div className='layout'>
      {/* Sidebar */}
      <aside className='sidebar'>
        <nav className='sidebar-nav'>
          <Link
            to='/dashboard/notifications'
            className={`nav-item nav-notification ${
              isActive("/dashboard/notifications")
                ? "active"
                : ""
            }`}
            title='Notifications'
          >
            <FiBell className='nav-icon' />
            {notificationCount > 0 && (
              <span className='notification-badge'>
                {notificationCount > 9
                  ? "9+"
                  : notificationCount}
              </span>
            )}
          </Link>
          <Link
            to='/dashboard'
            className={`nav-item ${
              isActive("/dashboard") &&
              !isActive("/dashboard/settings") &&
              !isActive("/dashboard/meetings")
                ? "active"
                : ""
            }`}
            title='Dashboard'
          >
            <FiHome className='nav-icon' />
          </Link>
          <Link
            to='/dashboard/meetings'
            className={`nav-item ${
              isActive("/dashboard/meetings")
                ? "active"
                : ""
            }`}
            title='Meetings'
          >
            <FiFileText className='nav-icon' />
          </Link>
          <Link
            to='/dashboard/fitness'
            className={`nav-item ${
              isActive("/dashboard/fitness") ? "active" : ""
            }`}
            title='Fitness'
          >
            <FiActivity className='nav-icon' />
          </Link>
          <div
            className='nav-item'
            title='Media'
          >
            <FiPlay className='nav-icon' />
          </div>
          <Link
            to='/dashboard/settings'
            className={`nav-item ${
              isActive("/dashboard/settings")
                ? "active"
                : ""
            }`}
            title='Settings'
          >
            <FiSettings className='nav-icon' />
          </Link>
          <div className='nav-spacer' />
          <button
            className='nav-item nav-logout'
            onClick={handleLogout}
            title='Logout'
          >
            <FiLogOut className='nav-icon' />
          </button>
        </nav>
      </aside>

      {/* Main Content */}
      <div className='main-content'>
        {/* Header */}
        <header className='app-header'>
          <div className='header-left'>
            <p className='app-title'>{`${
              user?.name?.split(" ")[0]
            }'s`}</p>
            <p className='header-title'>Dashboard</p>
          </div>
          <div className='header-center'></div>
          <div className='header-right'>
            <div className='search-bar'>
              <FiSearch className='search-icon' />
              <input
                type='text'
                placeholder='Search'
                className='search-input'
              />
            </div>
            <div className='header-widgets'>
              <Clock />
              <WeatherWidget />
            </div>
            {user && (
              <div className='profile-image-container'>
                {user.picture ? (
                  <img
                    src={user.picture}
                    alt={user.name || "Profile"}
                    className='profile-image'
                  />
                ) : (
                  <div className='profile-image-placeholder'>
                    {user.name?.charAt(0).toUpperCase() ||
                      "U"}
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        {/* Page Content */}
        <main className='page-content'>{children}</main>
      </div>
    </div>
  );
}

export default Layout;
