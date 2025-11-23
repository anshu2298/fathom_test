import { FaGoogle } from "react-icons/fa";
import { FiBarChart2, FiMessageSquare, FiSearch } from "react-icons/fi";
import "./LandingPage.css";

function LandingPage({ onLogin }) {
  return (
    <div className="landing-page">
      <div className="landing-container">
        <div className="landing-hero">
          <h1 className="landing-title">Anshu's Dashboard</h1>
          <p className="landing-subtitle">
            Manage your Fathom meeting transcripts in one place
          </p>
          <p className="landing-description">
            Connect your Fathom account to automatically sync and view all your
            meeting transcripts. Get insights from your conversations with
            ease.
          </p>
          <button className="btn-google-login" onClick={onLogin}>
            <FaGoogle className="google-icon" />
            Sign in with Google
          </button>
        </div>
        <div className="landing-features">
          <div className="feature-card">
            <FiBarChart2 className="feature-icon" />
            <h3>Sync Meetings</h3>
            <p>Automatically sync your Fathom meetings every 30 minutes</p>
          </div>
          <div className="feature-card">
            <FiMessageSquare className="feature-icon" />
            <h3>View Transcripts</h3>
            <p>Browse and search through all your meeting transcripts</p>
          </div>
          <div className="feature-card">
            <FiSearch className="feature-icon" />
            <h3>Detailed Insights</h3>
            <p>Get detailed information about each meeting and conversation</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LandingPage;

