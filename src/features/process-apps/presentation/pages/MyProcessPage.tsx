import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../auth/presentation/AuthProvider';
import { useTheme } from '../../../../core/theme/theme-provider';
import { effectiveDesigner } from '../../../process-design/domain/user-mode';
import { AppShell } from '.././components/AppShell';

/**
 * /myprocesses — mirrors lib/features/process_apps/presentation/main.dart.
 * Left: the list of accessible processes. Center: welcome until a process
 * is selected (selection navigates to the process workspace).
 */
export function MyProcessPage() {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const { t } = useTranslation();
  const [processListExpanded, setProcessListExpanded] = useState(true);

  return (
    <AppShell
      processListExpanded={processListExpanded}
      onToggleProcessList={() => setProcessListExpanded((v) => !v)}
    >
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted">
        <div
          className={`flex h-14 w-14 items-center justify-center rounded-full ${
            isDark ? 'bg-brand-900/60' : 'bg-brand-50'
          }`}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-7 w-7 text-(--accent)">
            <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
          </svg>
        </div>
        <h1 className="text-base font-semibold text-foreground">
          {t('welcome', { name: user?.username ?? '' })}
        </h1>
        <p className="max-w-xs text-center text-(--app-fs-base)">
          {t('selectProcessHint')}
        </p>

        <div className="mt-2 max-w-sm rounded-(--app-radius) border border-separator p-3">
          <div className="mb-2 text-(--app-fs-small) font-semibold text-foreground">
            {t('welcomeWhatYouCanDo')}
          </div>
          <ul className="space-y-1.5 text-(--app-fs-small)">
            <WelcomeItem text={t('welcomeCapLaunch')} />
            <WelcomeItem text={t('welcomeCapTasks')} />
            <WelcomeItem text={t('welcomeCapDocuments')} />
            {effectiveDesigner(user) && <WelcomeItem text={t('welcomeCapDesigner')} highlight />}
            {effectiveDesigner(user) && <WelcomeItem text={t('welcomeCapChat')} highlight />}
          </ul>
        </div>
      </div>
    </AppShell>
  );
}

function WelcomeItem({ text, highlight }: { text: string; highlight?: boolean }) {
  return (
    <li className={`flex items-start gap-2 ${highlight ? 'text-(--accent)' : 'text-muted'}`}>
      <svg viewBox="0 0 24 24" fill="currentColor" className="mt-0.5 h-3.5 w-3.5 shrink-0">
        <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2Z" />
      </svg>
      <span>{text}</span>
    </li>
  );
}

export default MyProcessPage;
