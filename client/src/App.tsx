import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { configApi } from './lib/api';
import AppLayout from './components/AppLayout';
import ProtectedRoute from './components/ProtectedRoute';
import CustomersPage from './pages/CustomersPage';
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';
import NewProjectPage from './pages/NewProjectPage';
import PlaceholderPage from './pages/PlaceholderPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import ProjectsPage from './pages/ProjectsPage';
import SearchPage from './pages/SearchPage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import SettingsPage from './pages/SettingsPage';
import SuppliersPage from './pages/SuppliersPage';

/** Route table. Everything except /login sits behind ProtectedRoute. */
export default function App() {
  const [sandbox, setSandbox] = useState(false);
  useEffect(() => {
    configApi.get().then((c) => setSandbox(c.sandbox)).catch(() => undefined);
  }, []);
  return (
    <div className="flex h-full flex-col">
      {sandbox && (
        <div className="shrink-0 bg-amber-500 px-4 py-1.5 text-center text-xs font-bold uppercase tracking-widest text-black">
          Sandbox environment — not production data
        </div>
      )}
      <div className="min-h-0 flex-1">
        <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/new" element={<NewProjectPage />} />
          <Route path="/projects/:id" element={<ProjectDetailPage />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route
            path="/suppliers"
            element={<SuppliersPage />}
          />
          <Route
            path="/reports"
            element={
              <PlaceholderPage
                title="Reports"
                description="Pipeline analytics and quote reporting arrive in a later phase."
              />
            }
          />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/change-password" element={<ChangePasswordPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </div>
    </div>
  );
}
