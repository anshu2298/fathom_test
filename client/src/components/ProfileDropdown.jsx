import { useState, useRef, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { FiSettings, FiLogOut } from "react-icons/fi";
import "./ProfileDropdown.css";

function ProfileDropdown({ user }) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleLogout = async () => {
    await logout();
    setIsOpen(false);
  };

  const handleSettings = () => {
    navigate("/dashboard/settings");
    setIsOpen(false);
  };

  return (
    <div className="profile-dropdown" ref={dropdownRef}>
      <button
        className="profile-trigger"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Profile menu"
      >
        {user.picture ? (
          <img
            src={user.picture}
            alt={user.name || "Profile"}
            className="profile-avatar"
          />
        ) : (
          <div className="profile-avatar-placeholder">
            {user.name?.charAt(0).toUpperCase() || "U"}
          </div>
        )}
      </button>

      {isOpen && (
        <div className="dropdown-menu">
          <div className="dropdown-header">
            <div className="dropdown-user-info">
              {user.picture ? (
                <img
                  src={user.picture}
                  alt={user.name}
                  className="dropdown-avatar"
                />
              ) : (
                <div className="dropdown-avatar-placeholder">
                  {user.name?.charAt(0).toUpperCase() || "U"}
                </div>
              )}
              <div className="dropdown-user-details">
                <div className="dropdown-user-name">{user.name}</div>
                <div className="dropdown-user-email">{user.email}</div>
              </div>
            </div>
          </div>
          <div className="dropdown-divider"></div>
          <button className="dropdown-item" onClick={handleSettings}>
            <FiSettings className="dropdown-icon" />
            Settings
          </button>
          <div className="dropdown-divider"></div>
          <button className="dropdown-item" onClick={handleLogout}>
            <FiLogOut className="dropdown-icon" />
            Logout
          </button>
        </div>
      )}
    </div>
  );
}

export default ProfileDropdown;

