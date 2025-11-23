import { FiRefreshCw } from "react-icons/fi";

function ConnectionStatus({ status, onRefresh }) {
  return (
    <div className="card">
      <h3>Connection Status</h3>
      <div
        className={`status ${
          status.loading
            ? "loading"
            : status.connected
            ? "connected"
            : "disconnected"
        }`}
      >
        {status.message.split("\n").map((line, idx) => (
          <div key={idx}>
            {line}
            {idx < status.message.split("\n").length - 1 && <br />}
          </div>
        ))}
      </div>
      <div className="actions-container">
        <button className="btn-secondary" onClick={onRefresh}>
          <FiRefreshCw style={{ marginRight: "8px" }} />
          Refresh Status
        </button>
      </div>
    </div>
  );
}

export default ConnectionStatus;

