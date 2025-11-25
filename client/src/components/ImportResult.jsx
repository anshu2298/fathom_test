import { FiXCircle, FiCheckCircle, FiInfo, FiRefreshCw, FiSkipForward } from "react-icons/fi";

function ImportResult({ result }) {
  if (!result) return null;

  if (result.error) {
    return (
      <div className="result-message error">
        <FiXCircle style={{ marginRight: "8px", verticalAlign: "middle" }} />
        <strong>Import failed:</strong> {result.error}
      </div>
    );
  }

  const importedCount = result.imported || 0;
  const skippedCount = result.skipped || 0;
  const hasImported = importedCount > 0;
  const isIncremental = result.is_incremental === true;

  return (
    <div>
        <div
          className={`result-message ${hasImported ? "success" : ""}`}
          style={{
            background: hasImported ? "rgba(139, 174, 102, 0.3)" : "#8BAE66",
            color: hasImported ? "#222222" : "#222222",
            border: `1px solid ${hasImported ? "#628141" : "rgba(98, 129, 65, 0.2)"}`,
          }}
        >
          {hasImported ? (
            <FiCheckCircle style={{ marginRight: "8px", verticalAlign: "middle" }} />
          ) : (
            <FiInfo style={{ marginRight: "8px", verticalAlign: "middle" }} />
          )}{" "}
          <strong>Sync completed!</strong>
        <br />
        <small>
          {result.message ||
            `Synced ${importedCount} new meeting(s). ${skippedCount} meeting(s) were skipped.`}
            {isIncremental && (
              <>
                <br />
                <span
                  style={{
                    fontSize: "12px",
                    color: "#222222",
                    opacity: 0.6,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <FiRefreshCw />
                  Incremental sync: Only new meetings since last sync were
                  processed.
                </span>
              </>
            )}
        </small>
      </div>
        {result.meetings && result.meetings.length > 0 && (
          <div className="import-result-list">
            <strong>
              <FiCheckCircle style={{ marginRight: "8px", verticalAlign: "middle" }} />
              Newly imported meetings ({importedCount}):
            </strong>
          <ul>
            {result.meetings.map((m, idx) => (
              <li key={idx}>
                {m.title || "Untitled"} -{" "}
                {new Date(m.createdAt).toLocaleDateString()} (
                {m.transcriptItems || 0} transcript items)
                {m.transcript_id ? ` [ID: ${m.transcript_id}]` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
      {result.skipped_meetings && result.skipped_meetings.length > 0 && (
        <div className="import-result-list">
          <strong>
            <FiSkipForward style={{ marginRight: "8px", verticalAlign: "middle" }} />
            Skipped meetings ({skippedCount}):
          </strong>
          <ul className="skipped">
            {result.skipped_meetings.slice(0, 10).map((m, idx) => (
              <li key={idx}>
                {m.title || "Untitled"} -{" "}
                {m.reason === "already_exists"
                  ? "Already in database"
                  : `Error: ${m.error || "Unknown"}`}
              </li>
            ))}
            {result.skipped_meetings.length > 10 && (
              <li style={{ fontStyle: "italic" }}>
                ... and {result.skipped_meetings.length - 10} more
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

export default ImportResult;

