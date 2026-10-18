import { useEffect, type ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './features/auth/presentation/AuthProvider';
import { ThemeProvider } from './core/theme/theme-provider';
import { DensityProvider } from './core/theme/density-provider';
import { Routes } from './routes';
import { ModeOrientationGate } from './features/process-design/presentation/components/ModeOrientation';

/**
 * RequireAuth — the React analog of AuthWrapper (routes.dart):
 * redirects to /login while unauthenticated, shows a spinner while the
 * session is being restored.
 */
function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (status === 'signedIn' && location.pathname === '/login') {
      navigate('/myprocesses', { replace: true });
    }
  }, [status, location.pathname, navigate]);

  if (status === 'signedIn') return <ModeOrientationGate>{children}</ModeOrientationGate>;
  if (status === 'loading') {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    );
  }
  return <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <ThemeProvider>
      <DensityProvider>
        <AuthProvider>
          <Routes />
        </AuthProvider>
      </DensityProvider>
    </ThemeProvider>
  );
}

export { RequireAuth };
