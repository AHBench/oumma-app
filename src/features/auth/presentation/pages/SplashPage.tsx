import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthProvider';

/**
 * Splash route — mirrors the /splash route in main.dart:
 * waits for the restored session, then redirects to /login or /myprocesses.
 */
export function SplashPage() {
  const { status } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (status === 'signedIn') navigate('/myprocesses', { replace: true });
    else if (status === 'initial' || status === 'failed') {
      navigate('/login', { replace: true });
    }
  }, [status, navigate]);

  return (
    <div className="flex h-full items-center justify-center bg-ink-50 dark:bg-brand-950">
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded bg-brand-600 text-white">
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
            <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
          </svg>
        </div>
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    </div>
  );
}

export default SplashPage;
