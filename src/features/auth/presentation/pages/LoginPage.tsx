import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../AuthProvider';
import { useDensity, DENSITY_OPTIONS, type Density } from '../../../../core/theme/density-provider';
import { setLocale, SUPPORTED_LOCALES, LOCALE_LABELS, type Locale } from '../../../../core/i18n';
import { btnCls } from '../../../shared/components/ui';
import { apiClient } from '../../../../core/http/client';
import { BaseUrls } from '../../../../core/config/base-urls';

/**
 * Login page — mirrors lib/features/auth/presentation/pages/login_page.dart.
 * Validation: username required, password min 6 chars (as in the Dart form).
 */
export function LoginPage() {
  const { t, i18n } = useTranslation();
  const { signIn, register, status, error, errorCode, licenseError } = useAuth();
  const { density, setDensity } = useDensity();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [wantDesigner, setWantDesigner] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});
  const [regInfo, setRegInfo] = useState<{ activation: string; url?: string } | null>(null);
  const [emailTaken, setEmailTaken] = useState(false);

  // Mirrors the Dart BlocListener: on sign-in success, pushReplacement('/myprocesses').
  useEffect(() => {
    if (status === 'signedIn') navigate('/myprocesses', { replace: true });
  }, [status, navigate]);

  const loading = status === 'loading';
  // Human, translated error copy: the backend error CODE selects the i18n
  // message; unknown/legacy raw messages fall back to a generic message.
  const authErrorText = errorCode ? t(`authErr.${errorCode}`) : error ? t('authErr.generic') : null;
  const banner = licenseError ?? authErrorText;

  // Live email-availability check while the user types (debounced). The
  // server check fails open, so a false "available" can never block a
  // legitimate registration — the register call is the authoritative check.
  useEffect(() => {
    setEmailTaken(false);
    const e = email.trim();
    if (!e.includes('@')) return;
    const h = setTimeout(async () => {
      try {
        const resp = await apiClient.get(
          `${BaseUrls.oummaUrl.replace(/\/+$/, '')}/api/auth/email-available?email=${encodeURIComponent(e)}`,
        );
        if (resp.data?.checked === true && resp.data?.available === false) {
          setEmailTaken(true);
        }
      } catch {
        // network error: stay silent, register will surface the real error
      }
    }, 500);
    return () => clearTimeout(h);
  }, [email]);

  const onLogin = async (e: FormEvent) => {
    e.preventDefault();
    setRegInfo(null);
    const errors: Record<string, string | undefined> = {};
    if (username.trim().length === 0) errors.username = t('loginInvalidUser');
    if (password.length < 6) errors.password = t('loginPasswordTooShort');
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    await signIn(username, password);
  };

  const onRegister = async (e: FormEvent) => {
    e.preventDefault();
    setRegInfo(null);
    const errors: Record<string, string | undefined> = {};
    if (username.trim().length < 3) errors.username = t('regUserTooShort');
    if (password.length < 6) errors.password = t('loginPasswordTooShort');
    if (firstName.trim().length < 2) errors.firstName = t('regNameRequired');
    if (lastName.trim().length < 2) errors.lastName = t('regNameRequired');
    if (!email.trim().includes('@')) errors.email = t('regEmailRequired');
    else if (emailTaken) errors.email = t('regEmailTaken');
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const res = await register({ username: username.trim(), password, email: email.trim(), firstName: firstName.trim(), lastName: lastName.trim(), designer: wantDesigner });
    if (!res) { setMode('login'); return; }
    if (res.activation && res.activation !== 'skipped') {
      setRegInfo({ activation: res.activation, url: res.activation_url });
    }
  };

  return (
    <div className="flex h-full items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm rounded-(--app-radius) border border-separator bg-surface p-6 shadow-surface">
        {/* Logo — logoumma.png (wide 2.3:1 image, so size by width, not a square box) */}
        <div className="mb-4 flex flex-col items-center gap-2.5">
          <img src="/images/logoumma.png" alt="Oumma" className="h-auto w-[150px] object-contain" />
          <p className="font-mono text-center text-(--app-fs-small) tracking-[0.12em] text-muted">
            {t('loginWorkspace')}
          </p>
        </div>

        {banner ? (
          <div className="alert alert--danger mb-4 gap-3 px-3 py-2">
            <div className="alert__content">
              <span className="alert__description text-(--app-fs-small)">{banner}</span>
            </div>
          </div>
        ) : null}

        {mode === 'login' ? (
          <form onSubmit={onLogin} className="space-y-4" noValidate>
            <div>
              <label htmlFor="login-username" className="label mb-1 block text-(--app-fs-base)">
                {t('username')}
              </label>
              <input
                id="login-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t('loginUsernameHint')}
                aria-invalid={!!fieldErrors.username}
                className="input w-full"
              />
              {fieldErrors.username ? (
                <p className="mt-1 text-(--app-fs-small) text-(--danger)">{fieldErrors.username}</p>
              ) : null}
            </div>

            <div>
              <label htmlFor="login-password" className="label mb-1 block text-(--app-fs-base)">
                {t('password')}
              </label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('loginPasswordHint')}
                aria-invalid={!!fieldErrors.password}
                className="input w-full"
              />
              {fieldErrors.password ? (
                <p className="mt-1 text-(--app-fs-small) text-(--danger)">{fieldErrors.password}</p>
              ) : null}
            </div>

            <button type="submit" disabled={loading} className={`${btnCls('primary')} button--full-width`}>
              {loading ? t('signingIn') : t('signIn')}
            </button>
          </form>
        ) : (
          <form onSubmit={onRegister} className="space-y-3" noValidate>
            <div>
              <label htmlFor="reg-username" className="label mb-1 block text-(--app-fs-base)">
                {t('username')}
              </label>
              <input
                id="reg-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t('regUsernameHint')}
                aria-invalid={!!fieldErrors.username}
                className="input w-full"
              />
              {fieldErrors.username ? (
                <p className="mt-1 text-(--app-fs-small) text-(--danger)">{fieldErrors.username}</p>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="reg-firstname" className="label mb-1 block text-(--app-fs-base)">
                  {t('regFirstName')}
                </label>
                <input id="reg-firstname" type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)}
                  aria-invalid={!!fieldErrors.firstName} className="input w-full" />
                {fieldErrors.firstName ? (
                  <p className="mt-1 text-(--app-fs-small) text-(--danger)">{fieldErrors.firstName}</p>
                ) : null}
              </div>
              <div>
                <label htmlFor="reg-lastname" className="label mb-1 block text-(--app-fs-base)">
                  {t('regLastName')}
                </label>
                <input id="reg-lastname" type="text" value={lastName} onChange={(e) => setLastName(e.target.value)}
                  aria-invalid={!!fieldErrors.lastName} className="input w-full" />
                {fieldErrors.lastName ? (
                  <p className="mt-1 text-(--app-fs-small) text-(--danger)">{fieldErrors.lastName}</p>
                ) : null}
              </div>
            </div>
            <div>
              <label htmlFor="reg-email" className="label mb-1 block text-(--app-fs-base)">
                {t('regEmail')}
              </label>
              <input id="reg-email" type="email" required value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (fieldErrors.email) setFieldErrors((f) => ({ ...f, email: undefined }));
                }}
                placeholder={t('regEmailHint')} aria-invalid={emailTaken || !!fieldErrors.email}
                className="input w-full" />
              {emailTaken ? (
                <p className="mt-1 text-(--app-fs-small) text-(--danger)">{t('regEmailTaken')}</p>
              ) : null}
              {fieldErrors.email && !emailTaken ? (
                <p className="mt-1 text-(--app-fs-small) text-(--danger)">{fieldErrors.email}</p>
              ) : null}
            </div>
            <div>
              <label htmlFor="reg-password" className="label mb-1 block text-(--app-fs-base)">
                {t('password')}
              </label>
              <input
                id="reg-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('loginPasswordHint')}
                aria-invalid={!!fieldErrors.password}
                className="input w-full"
              />
              {fieldErrors.password ? (
                <p className="mt-1 text-(--app-fs-small) text-(--danger)">{fieldErrors.password}</p>
              ) : null}
            </div>
            <label className="flex items-start gap-2 rounded-(--app-radius) border border-separator p-2 text-(--app-fs-small)">
              <input
                type="checkbox"
                checked={wantDesigner}
                onChange={(e) => setWantDesigner(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">{t('regDesignerRole')}</span>
                <span className="mt-0.5 block text-muted">{t('regDesignerRoleHint')}</span>
              </span>
            </label>
            <button type="submit" disabled={loading} className={`${btnCls('primary')} button--full-width`}>
              {loading ? t('regCreating') : t('regCreate')}
            </button>
          </form>
        )}

        {/* Email-activation notice after registration */}
        {regInfo && (
          <div className="mb-3 rounded-(--app-radius) border border-separator bg-surface-2 px-3 py-2 text-(--app-fs-small) text-muted">
            <p>{t(regInfo.activation === 'email_sent' ? 'regActivationSent' : 'regActivationLink')}</p>
            {regInfo.url && (
              <a href={regInfo.url} target="_blank" rel="noreferrer"
                 className="mt-1 block break-all font-mono text-(--accent) hover:underline">{regInfo.url}</a>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setFieldErrors({}); }}
          className="mt-3 w-full text-center text-(--app-fs-small) text-(--accent) hover:underline"
        >
          {mode === 'login' ? t('regGoTo') : t('regBackToLogin')}
        </button>

        <div className="mt-4 flex items-center justify-between gap-2">
          <p className="font-mono text-(--app-fs-small) text-muted">{t('loginSecureShell')}</p>
          {/* Language preference (available pre-login) */}
          <div className="flex overflow-hidden rounded-(--app-radius) border border-separator" role="group" aria-label={t('language')}>
            {SUPPORTED_LOCALES.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLocale(l as Locale)}
                className={`px-1.5 py-0.5 text-[10px] font-medium ${
                  i18n.resolvedLanguage === l
                    ? 'bg-(--accent) text-(--accent-foreground)'
                    : 'text-muted hover:bg-surface-secondary'
                }`}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          {/* Density preference (available pre-login) */}
          <div className="flex overflow-hidden rounded-(--app-radius) border border-separator" role="group" aria-label={t('density')}>
            {DENSITY_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                title={o.label}
                onClick={() => setDensity(o.value as Density)}
                className={`px-1.5 py-0.5 text-[10px] font-medium ${
                  density === o.value
                    ? 'bg-(--accent) text-(--accent-foreground)'
                    : 'text-muted hover:bg-surface-secondary'
                }`}
              >
                {o.value[0].toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
