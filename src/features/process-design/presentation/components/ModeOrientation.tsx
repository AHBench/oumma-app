/**
 * Mode orientation dialog — shown right after login when the account has
 * the Designer Keycloak group but no mode has been chosen yet. The user
 * picks between the full Designer experience and the regular (Normal)
 * user experience; the choice is persisted per account (localStorage).
 */
import { useTranslation } from 'react-i18next';
import { setMode, useMode, type UserMode } from '../../domain/user-mode';
import { isDesigner } from '../../domain/designer-gate';
import { useAuth } from '../../../auth/presentation/AuthProvider';
import type { ReactNode } from 'react';

function ModeChoice() {
  const { t } = useTranslation();
  return (
    <div className="flex h-full items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-(--app-radius) border border-separator bg-surface p-6 shadow-surface">
        <h2 className="mb-1 text-(--app-fs-title) font-semibold">{t('modeTitle')}</h2>
        <p className="mb-4 text-(--app-fs-small) text-muted">{t('modeIntro')}</p>
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setMode('designer')}
            className="w-full rounded-(--app-radius) border-2 border-(--accent)/60 bg-(--accent)/10 p-4 text-start hover:bg-(--accent)/20"
          >
            <div className="mb-1 flex items-center gap-2 text-(--app-fs-base) font-semibold">
              <span aria-hidden>🛠️</span> {t('modeDesigner')}
            </div>
            <p className="text-(--app-fs-small) text-muted">{t('modeDesignerDesc')}</p>
          </button>
          <button
            type="button"
            onClick={() => setMode('normal')}
            className="w-full rounded-(--app-radius) border border-separator p-4 text-start hover:bg-surface-secondary"
          >
            <div className="mb-1 flex items-center gap-2 text-(--app-fs-base) font-semibold">
              <span aria-hidden>👤</span> {t('modeNormal')}
            </div>
            <p className="text-(--app-fs-small) text-muted">{t('modeNormalDesc')}</p>
          </button>
        </div>
        <p className="mt-4 text-center text-(--app-fs-tiny, 0.7rem) text-muted">{t('modeChangeLater')}</p>
      </div>
    </div>
  );
}

/**
 * Gate rendered inside RequireAuth: designer accounts without a chosen
 * mode see the orientation dialog instead of the app.
 */
export function ModeOrientationGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const mode = useMode();
  if (isDesigner(user) && mode === null) {
    return <ModeChoice />;
  }
  return <>{children}</>;
}

export type { UserMode };
