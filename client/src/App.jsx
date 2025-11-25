import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import {
  AuthProvider,
  useAuth,
} from "./contexts/AuthContext";
import LandingPage from "./components/LandingPage";
import Layout from "./components/Layout";
import Dashboard from "./components/Dashboard";
import Settings from "./components/Settings";
import Fitness from "./components/Fitness";
import Notifications from "./components/Notifications";
import "./App.css";

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className='loading-container'>
        <div className='loading'>Loading...</div>
      </div>
    );
  }

  return user ? (
    children
  ) : (
    <Navigate
      to='/'
      replace
    />
  );
}

function AppRoutes() {
  const { user, loading, login } = useAuth();

  if (loading) {
    return (
      <div className='loading-container'>
        <div className='loading'>Loading...</div>
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path='/'
        element={
          user ? (
            <Navigate
              to='/dashboard'
              replace
            />
          ) : (
            <LandingPage onLogin={login} />
          )
        }
      />
      <Route
        path='/dashboard'
        element={
          <ProtectedRoute>
            <Layout>
              <Dashboard />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path='/dashboard/settings'
        element={
          <ProtectedRoute>
            <Layout>
              <Settings />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path='/dashboard/meetings'
        element={
          <ProtectedRoute>
            <Layout>
              <Dashboard />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path='/dashboard/fitness'
        element={
          <ProtectedRoute>
            <Layout>
              <Fitness />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path='/dashboard/notifications'
        element={
          <ProtectedRoute>
            <Layout>
              <Notifications />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path='*'
        element={
          <Navigate
            to='/'
            replace
          />
        }
      />
    </Routes>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </Router>
  );
}

export default App;
