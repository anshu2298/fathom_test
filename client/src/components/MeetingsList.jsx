import { FiInbox } from "react-icons/fi";
import MeetingItem from "./MeetingItem";
import { SkeletonCard } from "./SkeletonLoader";

function MeetingsList({ meetings, loading, onMeetingClick }) {
  return (
    <div className="card">
      <h3>
        Received Meetings
        {!loading && <span className="badge badge-info">{meetings.length}</span>}
      </h3>
      <div>
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {[...Array(3)].map((_, i) => (
              <SkeletonCard key={i} height="120px" />
            ))}
          </div>
        ) : meetings.length === 0 ? (
          <div className="empty-state">
            <FiInbox
              style={{
                fontSize: "48px",
                marginBottom: "16px",
                color: "#222222",
                opacity: 0.5,
              }}
            />
            <p>
              <strong>No meetings yet</strong>
            </p>
            <p style={{ marginTop: "8px" }}>
              Record a meeting in Fathom or import historical meetings!
            </p>
          </div>
        ) : (
          meetings.map((meeting) => (
            <MeetingItem
              key={meeting.transcript_id || meeting.id || Math.random()}
              meeting={meeting}
              onClick={onMeetingClick}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default MeetingsList;

