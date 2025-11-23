import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { Link, useLocation } from "react-router-dom";
import {
  FiLayout,
  FiMessageSquare,
  FiSettings,
  FiChevronLeft,
  FiChevronRight,
} from "react-icons/fi";
import ProfileDropdown from "./ProfileDropdown";
import "./Layout.css";

function Layout({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const isActive = (path) => {
    return location.pathname === path;
  };

  return (
    <div className='layout'>
      {/* Sidebar */}
      <aside
        className={`sidebar ${
          sidebarOpen ? "open" : "closed"
        }`}
      >
        <div className='sidebar-header'>
          <h2 className='sidebar-logo'>
            {`${user.name.split(" ")[0]}'s Dashboard`}
          </h2>
          <button
            className='sidebar-toggle'
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? (
              <FiChevronLeft />
            ) : (
              <FiChevronRight />
            )}
          </button>
        </div>
        <nav className='sidebar-nav'>
          <Link
            to='/dashboard'
            className={`nav-item ${
              isActive("/dashboard") &&
              !isActive("/dashboard/settings") &&
              !isActive("/dashboard/meetings")
                ? "active"
                : ""
            }`}
          >
            <FiLayout className='nav-icon' />
            {sidebarOpen && (
              <span className='nav-text'>Dashboard</span>
            )}
          </Link>
          <Link
            to='/dashboard/meetings'
            className={`nav-item ${
              isActive("/dashboard/meetings")
                ? "active"
                : ""
            }`}
          >
            <FiMessageSquare className='nav-icon' />
            {sidebarOpen && (
              <span className='nav-text'>Meetings</span>
            )}
          </Link>
          <Link
            to='/dashboard/settings'
            className={`nav-item ${
              isActive("/dashboard/settings")
                ? "active"
                : ""
            }`}
          >
            <FiSettings className='nav-icon' />
            {sidebarOpen && (
              <span className='nav-text'>Settings</span>
            )}
          </Link>
        </nav>
      </aside>

      {/* Main Content */}
      <div className='main-content'>
        {/* Header */}
        <header className='app-header'>
          <div className='header-left'>
            <h1 className='app-title'>{`${
              user.name.split(" ")[0]
            }'s Dashboard`}</h1>
          </div>
          <div className='header-right'>
            {user && <ProfileDropdown user={user} />}
          </div>
        </header>

        {/* Page Content */}
        <main className='page-content'>{children}</main>
      </div>
    </div>
  );
}

export default Layout;
