import { FiPackage, FiRefreshCw, FiClock } from "react-icons/fi";
import ImportResult from "./ImportResult";

function SyncMeetings({ importLoading, importResult, onSync }) {
  return (
    <div className="card">
      <h3>
        <FiPackage style={{ marginRight: "8px", verticalAlign: "middle" }} />
        Sync Meetings
      </h3>
      <p className="sync-description">
        Sync meetings from Fathom into your database. Uses incremental sync to
        only fetch new meetings since last sync.
        <br />
        <br />
        <strong>Automatic Sync:</strong> Meetings are automatically synced every
        30 minutes for all connected users.
        <br />
        <strong>Manual Sync:</strong> Click the button below to manually
        trigger a sync now.
      </p>

        <button
          className="btn-success"
          onClick={onSync}
          disabled={importLoading}
        >
          {importLoading ? (
            <>
              <FiClock style={{ marginRight: "8px" }} />
              Syncing...
            </>
          ) : (
            <>
              <FiRefreshCw style={{ marginRight: "8px" }} />
              Sync Meetings Now
            </>
          )}
        </button>

        {importLoading && (
          <div className="loading" style={{ marginTop: "12px" }}>
            Syncing meetings from Fathom...
          </div>
        )}

      <ImportResult result={importResult} />
    </div>
  );
}

export default SyncMeetings;

