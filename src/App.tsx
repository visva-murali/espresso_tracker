import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { ShotListPage } from './pages/ShotListPage';
import { NewShotPage } from './pages/NewShotPage';
import { ShotDetailPage } from './pages/ShotDetailPage';
import { EditShotPage } from './pages/EditShotPage';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <ShotListPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/shots/new"
            element={
              <ProtectedRoute>
                <NewShotPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/shots/:id"
            element={
              <ProtectedRoute>
                <ShotDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/shots/:id/edit"
            element={
              <ProtectedRoute>
                <EditShotPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
