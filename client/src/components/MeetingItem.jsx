import { FiCalendar, FiClock, FiMessageSquare } from "react-icons/fi";
import { parseTranscript } from "../utils/transcript";

function MeetingItem({ meeting, onClick }) {
  const transcript = parseTranscript(meeting.transcript);
  const metadata = meeting.metadata || {};
  const callDuration = metadata.call_duration;
  const callDate = metadata.call_date;
  const transcriptPreview = transcript.slice(0, 5);

  return (
    <div className="meeting" onClick={() => onClick && onClick(meeting)}>
      <div className="meeting-title">
        {meeting.meeting_title || meeting.title || "Untitled Meeting"}
      </div>
      <div className="meeting-meta">
        <FiCalendar style={{ marginRight: "6px", verticalAlign: "middle" }} />
        {callDate
          ? new Date(callDate).toLocaleString()
          : meeting.created_at
          ? new Date(meeting.created_at).toLocaleString()
          : "N/A"}
        {callDuration && (
          <>
            {" • "}
            <FiClock style={{ marginRight: "4px", verticalAlign: "middle" }} />
            {callDuration} min
          </>
        )}
      </div>
      <div className="meeting-meta">
        <FiMessageSquare style={{ marginRight: "6px", verticalAlign: "middle" }} />
        Transcript items: {transcript.length}
        {transcript.length > 5 ? " (showing first 5)" : ""}
      </div>
      {metadata.meeting_id && (
        <div className="meeting-meta meeting-id-meta">
          ID: {metadata.meeting_id}
        </div>
      )}
      {transcriptPreview.length > 0 && (
        <div className="meeting-transcript">
          {transcriptPreview.map((item, idx) => (
            <div key={idx} className="transcript-item">
              <div>
                <span className="speaker">
                  {item.speaker?.display_name || "Unknown"}
                </span>
                <span className="timestamp">{item.timestamp || ""}</span>
              </div>
              <div className="text">{item.text || ""}</div>
            </div>
          ))}
          {transcript.length > 5 && (
            <div className="transcript-more">
              ... and {transcript.length - 5} more items
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default MeetingItem;

