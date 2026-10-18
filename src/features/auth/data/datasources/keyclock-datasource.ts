import axios from 'axios';
import { apiClient } from '../../../../core/http/client';
import { appLogger } from '../../../../core/logging/app-logger';
import { throwIfLicenseInvalid } from '../../../../core/errors';
import { AuthApiError, type AuthErrorCode } from '../../domain/errors';
import type { User } from '../../domain/entities/user';
import { userFromJson, type SignInResponseDto } from '../models/user-model';

function axiosStatus(error: unknown): number | undefined {
  if (axios.isAxiosError(error)) return error.response?.status;
  return undefined;
}

function axiosBody(error: unknown): unknown {
  if (axios.isAxiosError(error)) return error.response?.data;
  return undefined;
}

/** Builds a translated-friendly auth error from an axios failure:
 *  extracts the backend {error, code} payload when present. */
function authError(e: unknown, fallback: string): AuthApiError {
  if (axios.isAxiosError(e)) {
    const data = e.response?.data as { error?: string; code?: string } | undefined;
    const code = (data?.code ?? 'generic') as AuthErrorCode;
    return new AuthApiError(data?.error ?? fallback, code);
  }
  return new AuthApiError(fallback, 'network');
}

/** Result of self-registration (POST /api/auth/register). */
export interface RegisterResult {
  registered: boolean;
  username: string;
  designer: boolean;
  /** 'skipped' | 'email_sent' | 'logged' | 'email_failed' */
  activation?: string;
  /** present in dev mode (no email gateway) or on send failure */
  activation_url?: string;
}

/**
 * Keycloak (backend proxy) datasource — mirrors
 * lib/features/auth/data/datasources/keyclock_datasource.dart.
 * A 403 on any of these endpoints raises LicenseInvalidError (the "loose"
 * license check: the Dart version raises on every 403, body optional).
 */
export class KeyClockDataSource {
  constructor(
    private readonly loginUrl: string,
    private readonly checkTokenUrl: string,
    private readonly logoutUrl: string,
    private readonly refreshUrl: string,
  ) {}

  async signIn(username: string, password: string): Promise<User> {
    try {
      const response = await apiClient.post(this.loginUrl, {
        username,
        password,
      });
      if (response.status !== 200) {
        throwIfLicenseInvalid(response.status, response.data);
        throw new Error(`Login failed: ${response.status}`);
      }
      return userFromJson(response.data as SignInResponseDto);
    } catch (e) {
      if (axiosStatus(e) === 403) {
        throwIfLicenseInvalid(403, axiosBody(e));
      }
      appLogger.error('Keycloak login exception', {
        error: e,
        name: 'KeyClock_DataSource',
      });
      throw authError(e, 'Login failed');
    }
  }

  /** POST /api/auth/register — self-registration in Keycloak (via oumma);
   *  the designer flag joins the new account to the `Designer` group. */
  async register(payload: {
    username: string;
    password: string;
    email?: string;
    firstName: string;
    lastName: string;
    designer: boolean;
  }): Promise<RegisterResult> {
    try {
      const response = await apiClient.post(`${this.loginUrl.replace(/\/signin$/, '/register')}`,
        {
          username: payload.username,
          password: payload.password,
          email: payload.email ?? '',
          firstName: payload.firstName,
          lastName: payload.lastName,
          designer: payload.designer,
        },
      );
      if (response.status !== 201) {
        throw new Error(`Registration failed: ${response.status}`);
      }
      return response.data as RegisterResult;
    } catch (e) {
      if (axios.isAxiosError(e)) {
        const data = e.response?.data as { error?: string; code?: string } | undefined;
        const code = (data?.code ?? 'generic') as AuthErrorCode;
        throw new AuthApiError(data?.error ?? 'Registration failed', code);
      }
      throw new AuthApiError('Registration failed', 'network');
    }
  }

  async refreshToken(refreshToken: string): Promise<Record<string, unknown>> {
    try {
      const response = await apiClient.post(this.refreshUrl, {
        refresh_token: refreshToken,
      });
      if (response.status !== 200) {
        throwIfLicenseInvalid(response.status, response.data);
        throw new Error(`Token refresh failed: ${response.status}`);
      }
      return response.data as Record<string, unknown>;
    } catch (e) {
      if (axiosStatus(e) === 403) {
        throwIfLicenseInvalid(403, axiosBody(e));
      }
      appLogger.error('Token refresh exception', {
        error: e,
        name: 'KeyClock_DataSource',
      });
      throw new Error(`Token refresh failed: ${e}`);
    }
  }

  async signOut(refreshToken: string): Promise<boolean> {
    try {
      const response = await apiClient.post(this.logoutUrl, {
        refresh_token: refreshToken,
      });
      if (response.status !== 200) {
        throwIfLicenseInvalid(response.status, response.data);
        throw new Error(`Logout failed: ${response.status}`);
      }
      return true;
    } catch (e) {
      if (axiosStatus(e) === 403) {
        throwIfLicenseInvalid(403, axiosBody(e));
      }
      appLogger.error('Logout exception', {
        error: e,
        name: 'KeyClock_DataSource',
      });
      throw new Error(`Logout failed: ${e}`);
    }
  }

  /**
   * Checks the session is still active in Keycloak.
   * Returns false on any transport/CORS error (mirrors Dart: Right(false)).
   */
  async isSessionActive(accessToken: string): Promise<boolean> {
    try {
      const response = await apiClient.get(this.checkTokenUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (response.status !== 200) {
        throwIfLicenseInvalid(response.status, response.data);
        throw new Error(`Failed to validate session: ${response.status}`);
      }
      const data = response.data as { active?: boolean };
      return data.active === true;
    } catch (e) {
      if (axiosStatus(e) === 403) {
        throwIfLicenseInvalid(403, axiosBody(e));
      }
      appLogger.error('isSessionActive error', {
        error: e,
        name: 'KeyClock_DataSource',
      });
      return false;
    }
  }
}
