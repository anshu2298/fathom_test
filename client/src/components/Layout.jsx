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
import ProfileDropdown from "./ProfileDropdown";
import "./Layout.css";

function Layout({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();

  const isActive = (path) => {
    return location.pathname === path;
  };

  const handleLogout = async () => {
    await logout();
  };

  return (
    <div className='layout'>
      {/* Sidebar */}
      <aside className='sidebar'>
        <nav className='sidebar-nav'>
          <div
            className='nav-item nav-notification'
            title='Notifications'
          >
            <FiBell className='nav-icon' />
            <span className='notification-dot'></span>
          </div>
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
            to='/dashboard/sports'
            className={`nav-item ${
              isActive("/dashboard/sports")
                ? "active"
                : ""
            }`}
            title='Sports'
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
            }'s Dashboard`}</p>
          </div>
          {/* <div className='header-center'></div> */}
          <div className='header-right'>
            <div className='search-bar'>
              <FiSearch className='search-icon' />
              <input
                type='text'
                placeholder='Search'
                className='search-input'
              />
            </div>
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
