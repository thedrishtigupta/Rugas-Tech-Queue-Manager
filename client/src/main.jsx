import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, ToastProvider, useAuth } from './context.jsx';
import Layout from './components/Layout.jsx';
import AuthPage from './pages/AuthPage.jsx';
import QueuesPage from './pages/QueuesPage.jsx';
import QueueDetailPage from './pages/QueueDetailPage.jsx';
const DashboardPage = lazy(() => import('./pages/DashboardPage.jsx'));
import './styles.css';

function RequireAuth({ children }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <div className="splash"><div className="spinner" /></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return children;
}

function GuestOnly({ children }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <div className="splash"><div className="spinner" /></div>;
  if (user) return <Navigate to={location.state?.from || '/queues'} replace />;
  return children;
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<GuestOnly><AuthPage key="login" mode="login" /></GuestOnly>} />
      <Route path="/register" element={<GuestOnly><AuthPage key="register" mode="register" /></GuestOnly>} />
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route path="/queues" element={<QueuesPage />} />
        <Route path="/queues/:id" element={<QueueDetailPage />} />
        <Route path="/dashboard" element={<Suspense fallback={<div className="splash"><div className="spinner" /></div>}><DashboardPage /></Suspense>} />
      </Route>
      <Route path="*" element={<Navigate to="/queues" replace />} />
    </Routes>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>
);
