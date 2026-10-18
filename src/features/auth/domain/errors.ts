/**
 * AuthApiError — an auth failure carrying the backend's stable machine
 * code (e.g. "email_taken", "invalid_credentials"). The UI maps the code
 * to a translated, human message; `message` is the English fallback.
 */
export type AuthErrorCode =
  | 'invalid_credentials'
  | 'account_not_activated'
  | 'account_disabled'
  | 'sign_in_failed'
  | 'username_invalid'
  | 'password_short'
  | 'names_required'
  | 'email_required'
  | 'email_invalid'
  | 'email_taken'
  | 'username_taken'
  | 'account_creation_failed'
  | 'password_set_failed'
  | 'network'
  | 'generic';

export class AuthApiError extends Error {
  constructor(
    message: string,
    public readonly code: AuthErrorCode = 'generic',
  ) {
    super(message);
    this.name = 'AuthApiError';
  }
}
