import { FiUser, FiRefreshCw } from "react-icons/fi";
import { USER_ID_KEY, generateUserId } from "../utils/userId";

function UserIDCard({ userId, onUserIdChange }) {
  const handleGenerateNewUserId = () => {
    const newUserId = generateUserId();
    localStorage.setItem(USER_ID_KEY, newUserId);
    onUserIdChange(newUserId);
    // Reload page to reset state
    window.location.href = `/?user_id=${newUserId}`;
  };

  return (
    <div className="card">
      <h3>
        <FiUser style={{ marginRight: "8px", verticalAlign: "middle" }} />
        User ID (for Testing)
      </h3>
      <div style={{ margin: "16px 0" }}>
        <div className="user-id-display">
          <strong className="user-id-label">Your User ID:</strong>
          <code className="user-id-code">{userId || "Loading..."}</code>
        </div>
        <p className="user-id-description">
          Each user gets a unique ID for data isolation. In production, this
          will come from your auth system.
        </p>
          <button
            className="btn-secondary"
            onClick={handleGenerateNewUserId}
            style={{
              fontSize: "14px",
              padding: "8px 16px",
            }}
          >
            <FiRefreshCw style={{ marginRight: "6px" }} />
            Generate New User ID
          </button>
      </div>
    </div>
  );
}

export default UserIDCard;

