import { useAuth } from "../contexts/AuthContext";
import { FiLink2, FiDownload } from "react-icons/fi";

function Actions({ onReloadMeetings }) {
  const { user } = useAuth();

  const handleConnect = () => {
    if (!user) return;
    window.location.href = `/api/fathom/connect?user_id=${encodeURIComponent(
      user.userId
    )}`;
  };

  return (
    <div className="card">
      <h3>Actions</h3>
      <button className="btn-primary" onClick={handleConnect}>
        <FiLink2 style={{ marginRight: "8px" }} />
        Connect Fathom
      </button>
      <button className="btn-secondary" onClick={onReloadMeetings}>
        <FiDownload style={{ marginRight: "8px" }} />
        Reload Meetings
      </button>
    </div>
  );
}

export default Actions;

