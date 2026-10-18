import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dropdown } from '@heroui/react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../auth/presentation/AuthProvider';
import { effectiveDesigner } from '../../../process-design/domain/user-mode';
import { isDesigner } from '../../../process-design/domain/designer-gate';
import { setMode, useMode } from '../../../process-design/domain/user-mode';
import { StatusBar } from '../../../shared/status/StatusBar';
import { useTheme } from '../../../../core/theme/theme-provider';
import { useDensity, DENSITY_OPTIONS, type Density } from '../../../../core/theme/density-provider';
import { setLocale, SUPPORTED_LOCALES, LOCALE_LABELS, type Locale } from '../../../../core/i18n';
import { useProcessApps } from '../../../shared/hooks/use-queries';
import { useProcessNotificationsScan } from '../../../shared/notifications/use-process-notifications';
import { NotificationBell } from '../../../shared/notifications/NotificationBell';
import { QuotaBanner } from '../../../shared/components/QuotaBanner';
import { Spinner, ErrorBox, AppTooltip, btnCls } from '../../../shared/components/ui';
import { useColumnWidth } from '../../../../core/hooks/use-resize';
import { ProcessIcon } from '../../../../core/process-icons';

interface AppShellProps {
  children: ReactNode;
  processListExpanded: boolean;
  onToggleProcessList(): void;
  selectedProcessId?: string | null;
  rightSidebar?: ReactNode;
  /** Center header pill: process name + description (workspace only). */
  processPill?: { name: string; description: string } | null;
}

/**
 * Three-zone application shell (header + process list + content [+ action
 * sidebar]) — mirrors the layout in process_apps/presentation/main.dart and
 * process_page/presentation/pages/main.dart.
 */
export function AppShell({
  children,
  processListExpanded,
  onToggleProcessList,
  selectedProcessId,
  rightSidebar,
  processPill,
}: AppShellProps) {
  const { user, signOut } = useAuth();
  const mode = useMode();
  const { t, i18n } = useTranslation();
  const { isDark, toggleTheme } = useTheme();
  const { density, setDensity } = useDensity();
  const navigate = useNavigate();
  const leftCol = useColumnWidth(240);
  const { data: processes, isLoading, isError, refetch } = useProcessApps(
    user?.accessToken ?? null,
  );

  // Global poll of all process instances → notifications for the user's tasks.
  useProcessNotificationsScan(processes ?? [], user, user?.accessToken ?? null);

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-separator bg-surface px-3">
        <div className="flex items-center gap-3">
          <img src="/images/logoummasymbole.png" alt="Oumma" className="h-[30px] w-[30px] shrink-0 object-contain" />
          <div className="leading-tight">
            <div className="text-(--app-fs-title) font-semibold text-foreground">Oumma</div>
            <div className="font-mono text-(--app-fs-base) text-muted">
              {t('bannerText')}
            </div>
          </div>
        </div>

        {processPill ? (
          <div className="flex min-w-0 flex-1 justify-center">
            <div className="max-w-[600px] rounded-(--app-radius) border border-(--accent)/20 bg-(--accent)/5 px-4 py-1 text-center">
              <div className="truncate text-(--app-fs-small) font-bold tracking-widest text-(--accent)">
                {processPill.name.toUpperCase()}
              </div>
              <div className="truncate text-(--app-fs-small) text-muted">
                {processPill.description}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1" />
        )}

        <NotificationBell />

        <AppTooltip label={isDark ? t('switchToLightTheme') : t('switchToDarkTheme')}>
          <button onClick={toggleTheme} className="button button--ghost button--icon-only" aria-label={t('toggleTheme')}>
            {isDark ? (
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                <path d="M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-12v2m0 16v2m8-10h-2M5 12H3m14.95-6.95-1.41 1.41M7.46 16.54l-1.41 1.41m0-13.9 1.41 1.41m9.08 9.08 1.41 1.41" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
              </svg>
            )}
          </button>
        </AppTooltip>

        {/* Density picker (aria-labelled; no tooltip — RAC MenuTrigger can't sit inside a Tooltip trigger) */}
        <Dropdown.Root>
            <Dropdown.Trigger className="button button--ghost button--icon-only" aria-label={t('uiDensity')}>
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                <path d="M4 5h16v2H4V5Zm0 4h16v2H4V9Zm0 4h10v2H4v-2Zm0 4h16v2H4v-2Z" />
              </svg>
            </Dropdown.Trigger>
            <Dropdown.Popover>
              <Dropdown.Menu onAction={(key) => setDensity(key as Density)}>
                {DENSITY_OPTIONS.map((o) => (
                  <Dropdown.Item key={o.value} id={o.value}>
                    <div className="leading-tight">
                      <div className="text-(--app-fs-base)">{o.label}</div>
                      <div className="text-(--app-fs-small) text-muted">{o.hint}</div>
                    </div>
                    {density === o.value ? (
                      <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-(--accent)">
                        <path d="M7.6 13.2 4.4 10l-1.1 1.1 4.3 4.3 8.1-8.1-1.1-1.1-7 7Z" />
                      </svg>
                    ) : null}
                  </Dropdown.Item>
                ))}
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown.Root>

        {/* Language picker */}
        <Dropdown.Root>
          <Dropdown.Trigger className="button button--ghost button--icon-only" aria-label={t('language')}
            >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
              <circle cx="12" cy="12" r="9" />
              <path d="M3 12h18M12 3c2.5 2.6 3.9 5.7 3.9 9S14.5 18.4 12 21c-2.5-2.6-3.9-5.7-3.9-9S9.5 5.6 12 3Z" />
            </svg>
          </Dropdown.Trigger>
          <Dropdown.Popover>
            <Dropdown.Menu onAction={(key) => setLocale(key as Locale)}>
              {SUPPORTED_LOCALES.map((l) => (
                <Dropdown.Item key={l} id={l}>
                  <span>{LOCALE_LABELS[l]}</span>
                  {i18n.resolvedLanguage === l ? (
                    <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-(--accent)">
                      <path d="M7.6 13.2 4.4 10l-1.1 1.1 4.3 4.3 8.1-8.1-1.1-1.1-7 7Z" />
                    </svg>
                  ) : null}
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown.Root>

        <div
          className="flex items-center gap-1.5 rounded-(--app-radius) border border-separator px-2 py-1 text-(--app-fs-base) text-foreground"
          title={user?.username ?? ''}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5 text-muted">
            <path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-3.3 0-8 1.7-8 5v1h16v-1c0-3.3-4.7-5-8-5Z" />
          </svg>
          <span className="max-w-[120px] truncate">{user?.username ?? ''}</span>
        </div>

        {isDesigner(user) ? (
          <button
            type="button"
            onClick={() => setMode(mode === 'designer' ? 'normal' : 'designer')}
            title={t('modeSwitchHint')}
            className="flex items-center gap-1 rounded-(--app-radius) border border-separator px-2 py-1 text-(--app-fs-small) text-foreground hover:bg-surface-secondary"
          >
            <span aria-hidden>{mode === 'normal' ? '👤' : '🛠️'}</span>
            {mode === 'normal' ? t('modeNormal') : t('modeDesigner')}
          </button>
        ) : null}

        <button onClick={() => void signOut()} className={btnCls('dangerSoft', true)}>
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
            <path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5v-2H5V5h5V3Zm7 6-1.4-1.4L15 10.2V7h-2v4h4V7l-1.8 1.8L17 9Z" />
          </svg>
          {t('logout')}
        </button>
      </header>

      {/* Monthly token quota exhausted (normal users) */}
      <QuotaBanner />

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        {/* Left: process list (resizable) */}
        <div
          className="relative shrink-0 overflow-hidden border-e border-separator bg-surface"
          style={{ width: processListExpanded ? leftCol.width : 48 }}
        >
          {processListExpanded ? (
            <div
              onPointerDown={(e) => leftCol.startResize('left', e)}
              title="Drag to resize"
              className="absolute top-0 z-10 h-full w-1.5 -translate-x-1/2 cursor-col-resize hover:bg-(--accent)/50"
              style={{ left: '100%' }}
            />
          ) : null}
          <div className="flex items-center justify-between border-b border-separator px-2 py-2">
            {processListExpanded ? (
              <span className="px-2 text-(--app-fs-base) font-semibold text-foreground">
                {t('myProcesses')}
              </span>
            ) : null}
            <button
              onClick={onToggleProcessList}
              className="button button--ghost button--icon-only"
              aria-label={t('toggleProcessList')}
            >
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                className={`h-4 w-4 transition-transform ${processListExpanded ? '' : 'rotate-180'}`}
              >
                <path d="M15.4 7.4 14 6l-6 6 6 6 1.4-1.4L10.8 12Z" />
              </svg>
            </button>
          </div>
          {isLoading ? (
            <Spinner />
          ) : isError ? (
            <ErrorBox message={t('failedToLoadProcesses')} onRetry={() => void refetch()} />
          ) : (
            <div className="overflow-y-auto">
              {(processes ?? []).map((p) => {
                const selected = selectedProcessId === p.id;
                const iconCls = selected ? 'text-(--accent)' : 'text-muted';
                return (
                  <button
                    key={p.id}
                    onClick={() => navigate(`/myprocesses/${p.id}/${effectiveDesigner(user) ? 'design' : 'my-tasks'}`)}
                    title={p.name}
                    className={`block w-full border-s-[3px] text-start hover:bg-surface-secondary ${
                      selected
                        ? 'border-(--accent) bg-(--accent)/10'
                        : 'border-transparent'
                    }`}
                  >
                    {/* flex + gap: the icon sits on the inline-start side —
                        left in LTR, right in RTL — automatically */}
                    <div className="flex items-center gap-2.5 px-2 py-1.5">
                      <ProcessIcon iconKey={p.iconKey} className={`h-5 w-5 shrink-0 ${iconCls}`} />
                      <span className={`min-w-0 flex-1 truncate text-(--app-fs-base) ${selected ? 'font-semibold text-(--accent)' : 'text-foreground'}`}>
                        {p.name}
                      </span>
                    </div>
                  </button>
                );
              })}
              {(processes ?? []).length === 0 ? (
                <p className="px-3 py-6 text-center text-(--app-fs-base) text-muted">
                  {t('noAccessibleProcesses')}
                </p>
              ) : null}
            </div>
          )}
        </div>

        {/* Center content */}
        <div className="min-w-0 flex-1 overflow-hidden">{children}</div>

        {/* Right: per-process action sidebar */}
        {rightSidebar}
      </div>

      {/* Bottom: app-wide status bar (background activity / hover tips) */}
      <StatusBar />
    </div>
  );
}
