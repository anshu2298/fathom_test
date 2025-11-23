import { FiX, FiCalendar, FiClock, FiMessageSquare, FiHash } from "react-icons/fi";
import { parseTranscript } from "../utils/transcript";

function MeetingDetailsModal({ meeting, onClose }) {
  if (!meeting) return null;

  const transcript = parseTranscript(meeting.transcript);
  const metadata = meeting.metadata || {};
  const callDuration = metadata.call_duration;
  const callDate = metadata.call_date;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{meeting.meeting_title || meeting.title || "Untitled Meeting"}</h2>
          <button className="modal-close" onClick={onClose}>
            <FiX />
          </button>
        </div>
        <div className="modal-body">
          <div className="meeting-details-section">
            <h3>Meeting Information</h3>
            <div className="detail-item">
              <strong>
                <FiCalendar style={{ marginRight: "6px", verticalAlign: "middle" }} />
                Date:
              </strong>{" "}
              {callDate
                ? new Date(callDate).toLocaleString()
                : meeting.created_at
                ? new Date(meeting.created_at).toLocaleString()
                : "N/A"}
            </div>
            {callDuration && (
              <div className="detail-item">
                <strong>
                  <FiClock style={{ marginRight: "6px", verticalAlign: "middle" }} />
                  Duration:
                </strong>{" "}
                {callDuration} minutes
              </div>
            )}
            {metadata.meeting_id && (
              <div className="detail-item">
                <strong>
                  <FiHash style={{ marginRight: "6px", verticalAlign: "middle" }} />
                  Meeting ID:
                </strong>{" "}
                {metadata.meeting_id}
              </div>
            )}
            {meeting.transcript_id && (
              <div className="detail-item">
                <strong>
                  <FiHash style={{ marginRight: "6px", verticalAlign: "middle" }} />
                  Transcript ID:
                </strong>{" "}
                {meeting.transcript_id}
              </div>
            )}
            <div className="detail-item">
              <strong>
                <FiMessageSquare style={{ marginRight: "6px", verticalAlign: "middle" }} />
                Transcript Items:
              </strong>{" "}
              {transcript.length}
            </div>
          </div>

          {transcript.length > 0 && (
            <div className="meeting-details-section">
              <h3>Full Transcript</h3>
              <div className="full-transcript">
                {transcript.map((item, idx) => (
                  <div key={idx} className="transcript-item-full">
                    <div className="transcript-header">
                      <span className="speaker">
                        {item.speaker?.display_name || "Unknown"}
                      </span>
                      {item.timestamp && (
                        <span className="timestamp">{item.timestamp}</span>
                      )}
                    </div>
                    <div className="text">{item.text || ""}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {transcript.length === 0 && (
            <div className="meeting-details-section">
              <p className="no-transcript">No transcript available for this meeting.</p>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default MeetingDetailsModal;

