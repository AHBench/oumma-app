/** App-level errors — mirrors lib/core/error/failures.dart. */

export class LicenseInvalidError extends Error {
  readonly detail: string | null;
  readonly errorCode: string | null;

  constructor(message: string, detail?: string | null, error?: string | null) {
    super(message);
    this.name = 'LicenseInvalidError';
    this.detail = detail ?? null;
    this.errorCode = error ?? null;
  }
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * Inspects an axios-style error/response and rethrows as
 * LicenseInvalidError when the backend answered 403 with a license payload —
 * same contract as the Dart `_checkLicenseError` helpers.
 */
export function throwIfLicenseInvalid(status: number, body: unknown): void {
  if (status !== 403) return;
  try {
    const payload = typeof body === 'string' ? JSON.parse(body) : body;
    if (payload && typeof payload === 'object') {
      const err = (payload as Record<string, unknown>).error;
      const message = (payload as Record<string, unknown>).message;
      const detail = (payload as Record<string, unknown>).detail;
      throw new LicenseInvalidError(
        typeof message === 'string'
          ? message
          : 'Your license is invalid or has expired. Please contact your administrator.',
        typeof detail === 'string' ? detail : null,
        typeof err === 'string' ? err : null,
      );
    }
  } catch (e) {
    if (e instanceof LicenseInvalidError) throw e;
    // body was not JSON — still a 403: some datasources treat every 403
    // as a license error (auth + document service).
    throw new LicenseInvalidError(
      'Your license is invalid or has expired. Please contact your administrator.',
    );
  }
}

/**
 * Variant used by the kogito/forms/llm datasources: only raises when the
 * 403 body explicitly carries error === 'LICENSE_INVALID' | 'LICENCE_INVALID'.
 */
export function throwIfLicenseInvalidStrict(status: number, body: unknown): void {
  if (status !== 403) return;
  try {
    const payload = typeof body === 'string' ? JSON.parse(body) : body;
    if (payload && typeof payload === 'object') {
      const err = (payload as Record<string, unknown>).error;
      if (err === 'LICENSE_INVALID' || err === 'LICENCE_INVALID') {
        const message = (payload as Record<string, unknown>).message;
        const detail = (payload as Record<string, unknown>).detail;
        throw new LicenseInvalidError(
          typeof message === 'string'
            ? message
            : 'Your license is invalid or has expired.',
          typeof detail === 'string' ? detail : null,
          typeof err === 'string' ? err : null,
        );
      }
    }
  } catch (e) {
    if (e instanceof LicenseInvalidError) throw e;
  }
}
