import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { ProtectedRoute } from './auth/ProtectedRoute';

const LandingPage = lazy(() => import('./features/landing/LandingPage').then(m => ({ default: m.LandingPage })));
const LoginPage = lazy(() => import('./features/auth/LoginPage').then(m => ({ default: m.LoginPage })));
const ForbiddenPage = lazy(() => import('./features/auth/ForbiddenPage').then(m => ({ default: m.ForbiddenPage })));
const NurseScreen = lazy(() => import('./features/nurse/NurseScreen').then(m => ({ default: m.NurseScreen })));
const DeskScreen = lazy(() => import('./features/desk/DeskScreen').then(m => ({ default: m.DeskScreen })));
const DispatchScreen = lazy(() => import('./features/dispatch/DispatchScreen').then(m => ({ default: m.DispatchScreen })));
const CrewScreen = lazy(() => import('./features/crew/CrewScreen').then(m => ({ default: m.CrewScreen })));
const AdminScreen = lazy(() => import('./features/admin/AdminScreen').then(m => ({ default: m.AdminScreen })));
const DemoPanel = lazy(() => import('./features/demo/DemoPanel').then(m => ({ default: m.DemoPanel })));

function RouteFallback() {
  return (
    <div className="min-h-screen bg-[var(--bg-app)] flex flex-col items-center justify-center gap-3">
      <div className="w-8 h-8 rounded-xl bg-[var(--primary-soft)] border border-[var(--primary)]/30 flex items-center justify-center animate-pulse">
        <div className="w-3 h-3 rounded-full bg-[var(--primary)]" />
      </div>
      <span className="text-xs font-mono font-medium text-[var(--text-muted)] tracking-wider uppercase">
        Loading BedLink...
      </span>
    </div>
  );
}

export function App() {
  return (
    <div className="h-screen overflow-hidden bg-[var(--bg-app)] text-[var(--text-app)] font-sans antialiased selection:bg-[var(--primary)] selection:text-white flex flex-col">
      {/* Route Architecture with RBAC Route Guards */}
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          {/* Public Landing & Authentication */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forbidden" element={<ForbiddenPage />} />

          {/* 1. Ward Nurse App (Phone / Field Shell) */}
          <Route 
            path="/nurse" 
            element={
              <ProtectedRoute allowedRoles={['nurse', 'admin', 'coordinator']}>
                <NurseScreen />
              </ProtectedRoute>
            } 
          />

          {/* 2. ED Desk Console (Tablet / Desktop / Console Shell) */}
          <Route 
            path="/desk" 
            element={
              <ProtectedRoute allowedRoles={['coordinator', 'admin']}>
                <DeskScreen />
              </ProtectedRoute>
            } 
          />

          {/* 3. Dispatch Console (Desktop / Console Shell) */}
          <Route 
            path="/dispatch" 
            element={
              <ProtectedRoute allowedRoles={['dispatcher', 'admin']}>
                <DispatchScreen />
              </ProtectedRoute>
            } 
          />

          {/* 4. Ambulance Crew App (Phone / Rugged Tablet / Field Shell) */}
          <Route 
            path="/crew" 
            element={
              <ProtectedRoute allowedRoles={['crew', 'admin', 'dispatcher']}>
                <CrewScreen />
              </ProtectedRoute>
            } 
          />

          {/* 5. Network Admin Console (Desktop / Console Shell) */}
          <Route 
            path="/admin" 
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminScreen />
              </ProtectedRoute>
            } 
          />

          {/* Scenario Player & Simulator (Multi-Actor Evaluation) */}
          <Route path="/demo" element={<DemoPanel />} />

          {/* Backwards Compatibility Redirects */}
          <Route path="/hospital" element={<Navigate to="/nurse" replace />} />
          <Route path="/hospital/requests" element={<Navigate to="/desk" replace />} />
          <Route path="/dispatch/request/:id" element={<Navigate to="/dispatch?tab=active" replace />} />

          {/* Catch-All */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>

      {/* Global Toast Notifications */}
      <Toaster 
        position="top-right" 
        toastOptions={{
          style: {
            background: 'var(--bg-surface)',
            color: 'var(--text-app)',
            border: '1px solid var(--border-app)',
            borderRadius: 'var(--radius-md)'
          }
        }}
      />
    </div>
  );
}

export default App;
