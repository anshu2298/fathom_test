import { FiInbox } from "react-icons/fi";
import MeetingItem from "./MeetingItem";

function MeetingsList({ meetings, loading, onMeetingClick }) {
  return (
    <div className="card">
      <h3>
        Received Meetings
        <span className="badge badge-info">{meetings.length}</span>
      </h3>
      <div>
        {loading ? (
          <div className="loading">Loading meetings...</div>
        ) : meetings.length === 0 ? (
          <div className="empty-state">
            <FiInbox
              style={{
                fontSize: "48px",
                marginBottom: "16px",
                color: "#9ca3af",
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

