import { Navigate, Route, Routes } from 'react-router-dom';
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
import SuppliersPage from './pages/SuppliersPage';

/** Route table. Everything except /login sits behind ProtectedRoute. */
export default function App() {
  return (
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
          <Route
            path="/settings"
            element={
              <PlaceholderPage
                title="Settings"
                description="User administration and workspace preferences arrive in a later phase."
              />
            }
          />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
