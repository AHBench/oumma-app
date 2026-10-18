import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { getDependencies } from '../../../core/di';
import { tokenStore } from '../../../core/http/token-store';
import { setSessionExpiredHandler } from '../../../core/http/client';
import { storage } from '../../../core/utils/storage';
import { LicenseInvalidError } from '../../../core/errors';
import { AuthApiError } from '../domain/errors';
import { isDesigner as isDesignerUser } from '../../process-design/domain/designer-gate';
import { clearMode } from '../../process-design/domain/user-mode';
import type { User } from '../domain/entities/user';
import { copyUser } from '../domain/entities/user';
import { userFromStoredJson, userToStoredJson } from '../data/models/user-model';

type AuthStatus = 'initial' | 'loading' | 'signedIn' | 'failed';

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  error: string | null;
  // Stable machine code of the last auth failure (for translated UI copy).
  errorCode: import('../domain/errors').AuthErrorCode | null;
  licenseError: string | null;
  signIn(username: string, password: string): Promise<void>;
  register(payload: {
    username: string;
    password: string;
    email?: string;
    firstName: string;
    lastName: string;
    designer: boolean;
  }): Promise<import('../../data/datasources/keyclock-datasource').RegisterResult | null>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * AuthProvider — the React port of lib/features/auth/presentation/bloc/auth_bloc.dart
 * (session restore → isSessionActive → token refresh; 401 expiry handling).
 */

// Extract the auth error code (for translated UI copy) from a caught
// exception; falls back to 'generic' / 'network'.
function authErrorCode(e: unknown): import('../domain/errors').AuthErrorCode {
  if (e instanceof AuthApiError) return e.code;
  if (e instanceof TypeError) return 'network'; // fetch/axios network failure
  return 'generic';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<import('../domain/errors').AuthErrorCode | null>(null);
  const [licenseError, setLicenseError] = useState<string | null>(null);
  const userRef = useRef<User | null>(null);

  const setMyUser = useCallback((u: User | null) => {
    userRef.current = u;
    setUser(u);
  }, []);

  const saveUser = useCallback((u: User) => {
    storage.saveUser(userToStoredJson(u));
    tokenStore.set(u.accessToken ?? null, u.refreshToken ?? null);
    setMyUser(u);
  }, [setMyUser]);

  const clearSavedUser = useCallback(() => {
    storage.clearUser();
    tokenStore.clear();
    setMyUser(null);
  }, [setMyUser]);

  const attemptTokenRefresh = useCallback(
    async (u: User): Promise<User | null> => {
      if (!u.refreshToken) throw new Error('No refresh token available');
      const repo = getDependencies().authRepository;
      const tokenData = await repo.refreshToken(u.refreshToken);
      const updated = copyUser(u, {
        accessToken: (tokenData.access_token as string) ?? null,
        refreshToken: (tokenData.refresh_token as string) ?? u.refreshToken,
      });
      saveUser(updated);
      setStatus('signedIn');
      setError(null);
      return updated;
    },
    [saveUser],
  );

  const restoreSession = useCallback(async () => {
    setStatus('loading');
    const repo = getDependencies().authRepository;
    try {
      const stored = storage.getSavedUser<Record<string, unknown>>();
      const u = stored ? userFromStoredJson(stored) : null;
      if (u && u.accessToken) {
        try {
          const isActive = await repo.isUserActive(u.accessToken);
          if (isActive) {
            // Session active: refresh the access token (as in the Dart bloc).
            await attemptTokenRefresh(u);
          } else {
            clearSavedUser();
            setStatus('initial');
          }
        } catch (e) {
          if (e instanceof LicenseInvalidError) {
            setLicenseError(e.message);
            return;
          }
          // Session check failed (not expired) → try refreshing.
          await attemptTokenRefresh(u);
        }
      } else if (u && u.refreshToken) {
        await attemptTokenRefresh(u);
      } else {
        clearSavedUser();
        setStatus('initial');
      }
    } catch (e) {
      if (e instanceof LicenseInvalidError) {
        setLicenseError(e.message);
        return;
      }
      clearSavedUser();
      setStatus('initial');
    }
  }, [attemptTokenRefresh, clearSavedUser]);

  const signIn = useCallback(
    async (username: string, password: string) => {
      setStatus('loading');
      setError(null);
      setErrorCode(null);
      setLicenseError(null);
      const repo = getDependencies().authRepository;
      try {
        const u = await repo.signIn(username, password);
        // Designer accounts always choose their mode right after login
        // (the orientation dialog reappears; the choice is remembered for
        // the session until the next login).
        if (isDesignerUser(u)) clearMode();
        saveUser(u);
        setStatus('signedIn');
      } catch (e) {
        if (e instanceof LicenseInvalidError) {
          setLicenseError(e.message);
          setStatus('failed');
        } else {
          setError(e instanceof Error ? e.message : String(e));
          setErrorCode(authErrorCode(e));
          setStatus('failed');
        }
      }
    },
    [saveUser],
  );

  const register = useCallback(
    async (payload: {
      username: string;
      password: string;
      email?: string;
      firstName: string;
      lastName: string;
      designer: boolean;
    }) => {
      setStatus('loading');
      setError(null);
      setErrorCode(null);
      setLicenseError(null);
      const repo = getDependencies().authRepository;
      try {
        const result = await repo.register(payload);
        // Sign in right away — unless the account needs email activation,
        // in which case we stay on the page and show the activation notice.
        if (!result.activation || result.activation === 'skipped') {
          await signIn(payload.username, payload.password);
        } else {
          // Account needs email activation — settle the status so the page
          // is interactive again (show the activation notice, not a spinner).
          setStatus('initial');
        }
        return result;
      } catch (e) {
        if (e instanceof LicenseInvalidError) {
          setLicenseError(e.message);
          setStatus('failed');
        } else {
          setError(e instanceof Error ? e.message : String(e));
          setErrorCode(authErrorCode(e));
          setStatus('failed');
        }
        return null;
      }
    },
    [signIn],
  );

  const signOut = useCallback(async () => {
    setStatus('loading');
    setError(null);
    const current = userRef.current;
    const repo = getDependencies().authRepository;
    try {
      if (current?.refreshToken) {
        await repo.signOut(current.refreshToken);
      }
    } catch (e) {
      if (e instanceof LicenseInvalidError) {
        setLicenseError(e.message);
        setStatus('failed');
        return;
      }
      // Swallow sign-out backend errors: still clear locally (as in Dart).
    }
    clearSavedUser();
    setStatus('initial');
  }, [clearSavedUser]);

  useEffect(() => {
    restoreSession();
    setSessionExpiredHandler(() => {
      clearSavedUser();
      setStatus('initial');
    });
  }, [restoreSession, clearSavedUser]);

  return (
    <AuthContext.Provider
      value={{ status, user, error, errorCode, licenseError, signIn, register, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
