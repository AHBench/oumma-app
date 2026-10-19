import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { RolesTab } from './RolesTab';
import { SearchItemsTab } from './SearchItemsTab';
import { ToolsTab } from './ToolsTab';
import { BpmnDesigner } from './BpmnDesigner';
import { TokenUsageBadge } from '../../../shared/components/TokenUsageBadge';
import { VersionView } from './VersionView';
import { ALL_PROCESS_ICONS, ProcessIcon, iconSearchLabel, DEFAULT_PROCESS_ICON } from '../../../../core/process-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../auth/presentation/AuthProvider';
import { getDependencies } from '../../../../core/di';
import { getErrorMessage } from '../../../../core/http/client';
import { useProcessApps } from '../../../shared/hooks/use-queries';
import { Spinner, ErrorBox } from '../../../shared/components/ui';
import { isDesigner } from '../../domain/designer-gate';
import { FormBuilder } from './FormBuilder';
import type { FormStep } from './FormBuilder';

type Json = Record<string, unknown>;

/**
 * "Process Design" tab (right menu of the process page, req 2.5).
 * Designer-group users get the config summary + the designer chat (B-1/B-2);
 * everyone else sees the read-only config summary (req 2.2 view).
 */
export function ProcessDesignPage() {
  const { processId } = useParams<{ processId: string }>();
  const { user } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const token = user?.accessToken ?? null;
  const ds = getDependencies().designDataSource;
  const designer = isDesigner(user);

  const { data: processes } = useProcessApps(token);
  const process = (processes ?? []).find((p) => p.id === processId);

  const { data: config, isLoading, isError, refetch } = useQuery({
    queryKey: ['design-config', processId, token],
    queryFn: () => ds.getProcessConfig(processId ?? '', token ?? ''),
    enabled: processId != null && token != null,
    refetchInterval: 15_000, // management writes hot-reload on the server (≤5s)
  });

  const [tab, setTab] = useState<'diagram' | 'overview' | 'forms' | 'roles' | 'search-items' | 'tools' | 'versions'>(designer ? 'diagram' : 'overview');
  const [syncingForms, setSyncingForms] = useState(false);
  const [formsSyncMsg, setFormsSyncMsg] = useState<string | null>(null);
  const [iconQuery, setIconQuery] = useState('');
  const [iconSavedAt, setIconSavedAt] = useState<number | null>(null);
  const [iconError, setIconError] = useState<string | null>(null);
  const [viewVersion, setViewVersion] = useState<number | null>(null);
  const [viewDesign, setViewDesign] = useState<Json | null>(null);
  const queryClient = useQueryClient();
  const iconFiltered = ALL_PROCESS_ICONS.filter(
    (k) => k === iconQuery.trim().toLowerCase() || iconSearchLabel(k).includes(iconQuery.trim().toLowerCase())
  );
  const [togglingStep, setTogglingStep] = useState<string | null>(null);
  const [initialToggleErr, setInitialToggleErr] = useState<string | null>(null);
  // "View version" mode: when a version is selected, EVERY tab renders that
  // version's data read-only (VersionView sections); the live document is
  // untouched and no edit controls are rendered.
  const viewing = viewVersion != null && viewDesign != null;

  // Engine definition (tasks + topology) from /definitions — extract-by-id
  // only returns the app section, so the diagram must use this source.
  const { data: definition, refetch: refetchDefinition } = useQuery({
    queryKey: ['design-definition', processId, token],
    queryFn: () => ds.getDefinition(processId ?? '', token ?? ''),
    enabled: processId != null && token != null,
    refetchInterval: 15_000,
  });

  const defTasks = ((): Json[] => {
    const t = (definition as Json | null)?.tasks;
    if (Array.isArray(t)) return t as Json[];
    if (t && typeof t === 'object') return Object.values(t as Record<string, Json>);
    return [];
  })();

  const { data: formSteps, refetch: refetchForms } = useQuery({
    queryKey: ['design-forms', processId, token],
    queryFn: async (): Promise<FormStep[]> => {
      const raw = await ds.getFormSteps(processId ?? '', token ?? '');
      return raw.map((s) => ({
        step_id: String(s.step_id ?? ''),
        launchable: s.launchable === true,
        form_input: (s.form_input as Record<string, unknown> | null) ?? null,
        form_fields: ((s.form_fields ?? []) as Json[]).map((f) => f as unknown as FormStep['form_fields'][number]),
      }));
    },
    enabled: designer && processId != null && token != null,
    refetchInterval: 15_000,
  });

  const { data: versions, refetch: refetchVersions } = useQuery({
    queryKey: ['design-versions', processId, token],
    queryFn: () => ds.listDesignVersions(processId ?? '', token ?? ''),
    enabled: designer && processId != null && token != null,
    refetchInterval: 30_000,
  });

  if (isLoading) return <div className="p-6"><Spinner /></div>;
  if (isError) return <div className="p-6"><ErrorBox message="Error" onRetry={() => refetch()} /></div>;

  const cfg = config ?? {};
  const app = (cfg.app ?? cfg) as Json;
  const roles = (app.roles ?? []) as Json[];
  const forms = ((app.forms ?? {}) as Json).steps ?? [];
  const ai = (app.ai ?? {}) as Json;

  return (
    <div className="flex h-full min-h-0 gap-4 p-4">
      {/* Content: the process design view (full width — the designer chat
          lives in the right sidebar, under the Process Design menu item) */}
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto">
        <div className="relative shrink-0 rounded-(--app-radius) border border-separator p-3">
          <div className="flex items-center justify-between gap-2 pr-2">
            <div className="text-(--app-fs-title) font-semibold">{process?.name ?? processId}</div>
            {/* Token display: inside the header row (flex items-center) so
                it is vertically centered with the process title — the
                generic top-right overlay is suppressed on this route. */}
            <div className="pb-0.5">
              <TokenUsageBadge processId={processId ?? null} token={token} />
            </div>
          </div>
          <div className="text-(--app-fs-small) text-muted">{String(app.process_description ?? process?.description ?? '')}</div>
          <div className="mt-2 flex flex-wrap gap-2 text-(--app-fs-small)">
            <Badge label={t('designMetaLaunchable')} on={app.can_be_launched === true} />
            {app.process_launch_role_id ? <Badge label={`${t('designMetaLaunchRole')}: ${String(app.process_launch_role_id)}`} on /> : null}
            {ai.model ? <Badge label={`AI: ${String(ai.model)}`} on /> : null}
          </div>
        </div>

        {designer && (
          <div className="flex shrink-0 gap-1 text-(--app-fs-small)">
            {(['diagram', 'overview', 'forms', 'roles', 'search-items', 'tools', 'versions'] as const).map((tb) => (
              <button key={tb} type="button" onClick={() => setTab(tb)}
                className={`rounded-(--app-radius) px-3 py-1 ${tab === tb ? 'bg-(--accent)/15 font-medium text-(--accent)' : 'text-muted hover:bg-surface'}`}>
                {tb === 'diagram' ? t('designTabDiagram') : tb === 'overview' ? t('designTabOverview') : tb === 'forms' ? t('designTabForms') : tb === 'roles' ? t('rolesTab') : tb === 'search-items' ? t('searchItemsTab') : tb === 'tools' ? t('toolsTab') : t('designTabVersions')}
              </button>
            ))}
          </div>
        )}

        {/* Version-view banner: the whole workspace is showing this version */}
        {viewVersion != null ? (
          <div className="flex shrink-0 items-center gap-2 rounded-(--app-radius) border border-(--accent)/50 bg-(--accent)/5 px-3 py-2 text-(--app-fs-small)">
            <span className="font-semibold">{t('versionsViewing')}: <span className="font-mono">v{String(viewVersion)}</span></span>
            <Badge label={t('versionsReadOnly')} on />
            <span className="text-muted">{t('versionsViewHint')}</span>
            <button type="button" onClick={() => { setViewVersion(null); setViewDesign(null); }}
              className="ml-auto rounded-(--app-radius) border border-separator px-2 py-0.5 hover:bg-surface">
              {t('versionsClose')}
            </button>
          </div>
        ) : null}

        {designer && tab === 'diagram' && (
          <div className="flex min-h-0 flex-1 flex-col rounded-(--app-radius) border border-separator p-3">
            <div className="mb-2 shrink-0 text-(--app-fs-small) font-semibold">{t('designDiagram')}</div>
            {viewing ? (
              <VersionView design={viewDesign} section="design" />
            ) : viewVersion != null ? (
              <p className="text-(--app-fs-small) text-muted">{t('versionsLoading')}</p>
            ) : (
              <BpmnDesigner
                processId={processId ?? ''}
                definition={definition ?? null}
                token={token}
                roles={roles.map((r) => String(r.role_id ?? r.role ?? ''))}
                onSaved={() => void refetchDefinition()}
              />
            )}
          </div>
        )}

        {(tab === 'overview' || !designer) && viewing ? (
          <Section title={t('designTabOverview')}>
            <VersionView design={viewDesign} section="overview" />
          </Section>
        ) : (tab === 'overview' || !designer) && <>

        {designer ? (
          <Section title={t('processIconTitle')}>
            <p className="mb-2 text-(--app-fs-small) text-muted">{t('processIconHint')}</p>
            <div className="mb-2 flex items-center gap-2">
              <input
                value={iconQuery}
                onChange={(e) => setIconQuery(e.target.value)}
                placeholder={t('processIconSearch')}
                className="w-full max-w-xs rounded-(--app-radius) border border-separator bg-surface px-3 py-1.5 text-(--app-fs-small) outline-none focus:border-(--accent)"
              />
              <span className="text-(--app-fs-small) text-muted">
                {iconFiltered.length} / {ALL_PROCESS_ICONS.length}
              </span>
              {iconError != null ? (
                <span className="text-(--app-fs-small) text-red-500">{iconError}</span>
              ) : iconSavedAt != null && Date.now() - iconSavedAt < 4000 ? (
                <span className="text-(--app-fs-small) text-(--accent)">{t('processIconSaved')}</span>
              ) : null}
            </div>
            <div className="max-h-80 overflow-y-auto rounded-(--app-radius) border border-separator p-2">
              <div className="grid grid-cols-6 gap-2 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12">
                {iconFiltered.map((key) => {
                  const current = ((process?.iconKey ?? '') || DEFAULT_PROCESS_ICON) === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      title={`${key} — ${iconSearchLabel(key)}`}
                      onClick={async () => {
                        setIconError(null);
                        try {
                          await ds.setProcessIcon(processId ?? '', key, token ?? '');
                          // refresh the left process menu + this page's config,
                          // then VERIFY the backend actually stored the icon
                          await queryClient.invalidateQueries({ queryKey: ['processes', token] });
                          void refetch();
                          const fresh = (queryClient.getQueryData<{ id: string; iconKey: string }[]>(['processes', token]) ?? []).find((p) => p.id === processId);
                          if (fresh && fresh.iconKey !== key) {
                            setIconError(t('processIconNotSaved'));
                            return;
                          }
                          setIconSavedAt(Date.now());
                        } catch (e) {
                          setIconError(e instanceof Error ? e.message : String(e));
                        }
                      }}
                      className={`flex h-11 items-center justify-center rounded-(--app-radius) border ${
                        current
                          ? 'border-(--accent) bg-(--accent)/15 text-(--accent)'
                          : 'border-separator text-muted hover:bg-surface-secondary'
                      }`}
                    >
                      <ProcessIcon iconKey={key} className="h-6 w-6" />
                    </button>
                  );
                })}
              </div>
              {iconFiltered.length === 0 ? (
                <p className="py-6 text-center text-(--app-fs-small) text-muted">{t('processIconNoMatch')}</p>
              ) : null}
            </div>
          </Section>
        ) : null}

        <Section title={`${t('designMetaRoles')} (${roles.length})`}>
          {roles.length > 0 ? (
            <ul className="space-y-1">
              {roles.map((r, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2 text-(--app-fs-small)">
                  <span className="font-medium">{String(r.role_id ?? '')}</span>
                  {r.role_can_launch === true && <Badge label={t('designMetaCanLaunch')} on />}
                  {((r.search_items ?? []) as unknown[]).length > 0 && (
                    <span className="text-muted">{t('designMetaSearchItems')}: {((r.search_items ?? []) as unknown[]).length}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyHint />
          )}
        </Section>

        <Section title={`${t('designMetaForms')} (${Array.isArray(forms) ? forms.length : 0})`}>
          {Array.isArray(forms) && forms.length > 0 ? (
            <ul className="space-y-1">
              {(forms as Json[]).map((s, i) => (
                <li key={i} className="flex items-center gap-2 text-(--app-fs-small)">
                  <span className="font-medium">{String(s.step_id ?? '')}</span>
                  {s.launchable === true && <Badge label={t('designMetaLaunchable')} on />}
                  <span className="text-muted">{t('designMetaFields')}: {((s.form_fields ?? []) as unknown[]).length}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyHint />
          )}
        </Section>
        </>}

        {designer && tab === 'forms' && (
          <Section title={t('designTabForms')}>
            {viewing ? (
              <VersionView design={viewDesign} section="forms" />
            ) : (<>
            <div className="mb-3 rounded-(--app-radius) border border-separator p-2">
              <div className="mb-1 text-(--app-fs-small) font-semibold">{t('formsInitialStep')}</div>
              {(formSteps ?? []).length === 0 ? (
                <div className="text-(--app-fs-small) text-muted">{t('formsNoSteps')}</div>
              ) : (
                <ul className="space-y-1">
                  {(formSteps ?? []).map((st) => (
                    <li key={st.step_id} className="flex items-center gap-2 text-(--app-fs-small)">
                      <input
                        type="checkbox"
                        checked={st.launchable}
                        disabled={togglingStep === st.step_id}
                        onChange={async (e) => {
                          setTogglingStep(st.step_id);
                          setInitialToggleErr(null);
                          try {
                            await ds.addForm(
                              processId ?? '',
                              st.step_id,
                              {
                                launchable: e.target.checked,
                                formInput: st.form_input ?? '',
                                fields: (st.form_fields ?? []) as unknown as Json[],
                              },
                              token ?? '',
                            );
                            void refetchForms();
                          } catch (err) {
                            setInitialToggleErr(getErrorMessage(err));
                          } finally {
                            setTogglingStep(null);
                          }
                        }}
                      />
                      <span className="font-medium">{st.step_id}</span>
                      <span className="text-muted">{t('designMetaFields')}: {st.form_fields?.length ?? 0}</span>
                    </li>
                  ))}
                </ul>
              )}
              {initialToggleErr ? <div className="mt-1 text-(--app-fs-small) text-(--danger)">{initialToggleErr}</div> : null}
            </div>
            <div className="mb-2 flex items-center gap-3">
              <button type="button" disabled={syncingForms}
                onClick={async () => {
                  setSyncingForms(true);
                  try {
                    const res = await ds.syncForms(processId ?? '', token ?? '');
                    const n = Array.isArray(res.created) ? (res.created as string[]).length : 0;
                    setFormsSyncMsg(n > 0 ? `${t('formsSynced')}: ${n}` : t('formsAllInSync'));
                    void refetchForms();
                  } catch { /* surfaced on next poll */ } finally {
                    setSyncingForms(false);
                  }
                }}
                className="rounded-(--app-radius) bg-(--accent) px-3 py-1.5 text-(--app-fs-small) font-semibold text-white disabled:opacity-50">
                {syncingForms ? t('formsSyncing') : t('formsSyncFromTasks')}
              </button>
              {formsSyncMsg ? <span className="text-(--app-fs-small) text-muted">{formsSyncMsg}</span> : null}
            </div>
            <FormBuilder
              processId={processId ?? ''}
              steps={formSteps ?? []}
              onSaved={() => { void refetchForms(); }}
            />
            </>)}
          </Section>
        )}

        {designer && tab === 'roles' && (
          <Section title={t('rolesTab')}>
            {viewing ? (
              <VersionView design={viewDesign} section="roles" />
            ) : (
            <RolesTab
              processId={processId ?? ''}
              token={token ?? ''}
              ds={ds}
              roles={roles}
              onSaved={() => void refetch()}
            />
            )}
          </Section>
        )}

        {designer && tab === 'search-items' && (
          <Section title={t('searchItemsTab')}>
            {viewing ? (
              <VersionView design={viewDesign} section="search" />
            ) : (
            <SearchItemsTab processId={processId ?? ''} onSaved={() => void refetch()} />
            )}
          </Section>
        )}
        {designer && tab === 'tools' && (
          <Section title={t('toolsTab')}>
            {viewing ? (
              <VersionView design={viewDesign} section="tools" />
            ) : (
            <ToolsTab processId={processId ?? ''} tasks={defTasks} onSaved={() => void refetch()} />
            )}
          </Section>
        )}
        {designer && tab === 'versions' && (
          <Section title={`${t('designTabVersions')}`}>
            {(() => {
              const allV = (versions ?? []) as Json[];
              const pending = allV.find((v) => String(v.status) === 'pending');
              const deployed = allV.filter((v) => String(v.status) !== 'pending');
              return (
                <div className="space-y-3">
                  {pending ? (
                    <div className="rounded-(--app-radius) border border-(--accent)/50 bg-(--accent)/5 p-3">
                      <div className="flex items-center gap-2 text-(--app-fs-small)">
                        <Badge label={t('versionsPending')} on />
                        <span className="text-muted">{String(pending.created_by ?? '')} · {String(pending.created_at ?? '').slice(0, 16).replace('T', ' ')}</span>
                        <span className="ml-auto text-muted">{t('versionsPendingHint')}</span>
                      </div>
                      <div className="mt-2 flex gap-2">
                        <button type="button" onClick={async () => {
                          if (!confirm(t('designDeployConfirm'))) return;
                          try {
                            await ds.deployDesign(processId ?? '', 0, token ?? '');
                            void refetchVersions();
                          } catch { /* surfaced by next poll */ }
                        }}
                          className="rounded-(--app-radius) bg-(--accent) px-3 py-1 text-(--app-fs-small) font-semibold text-white">
                          {t('designDeploy')}
                        </button>
                        <button type="button" onClick={async () => {
                          if (!confirm(t('versionsDiscardConfirm'))) return;
                          try {
                            await ds.discardDesign(processId ?? '', token ?? '');
                            void refetchVersions();
                          } catch { /* surfaced by next poll */ }
                        }}
                          className="rounded-(--app-radius) border border-separator px-3 py-1 text-(--app-fs-small) hover:bg-surface">
                          {t('versionsDiscard')}
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {deployed.length > 0 ? (
                    <ul className="space-y-1">
                      {deployed.map((v) => (
                        <li key={Number(v.version)} className="flex items-center gap-2 text-(--app-fs-small)">
                          <span className="font-mono font-medium">{String(v.semver || `v${v.version}`)}</span>
                          <Badge label={String(v.status)} on={String(v.status) === 'active'} />
                          <span className="text-muted">{String(v.created_by ?? '')} · {String(v.created_at ?? '').slice(0, 16).replace('T', ' ')}</span>
                          <span className="text-muted">{t('designMetaTasks')}: {String(v.tasks ?? '?')}</span>
                          <button type="button" onClick={async () => {
                            setViewVersion(Number(v.version));
                            setViewDesign(null);
                            try {
                              const doc = await ds.getDesign(processId ?? '', Number(v.version), token ?? '');
                              setViewDesign((doc.design ?? doc) as Json);
                            } catch { /* shown on retry */ }
                          }}
                            className="rounded-(--app-radius) border border-separator px-2 py-0.5 hover:bg-surface">
                            {t('versionsView')}
                          </button>
                          {String(v.status) !== 'active' && (
                            <button type="button" onClick={async () => {
                              if (!confirm(t('designDeployConfirm'))) return;
                              try {
                                await ds.deployDesign(processId ?? '', Number(v.version), token ?? '');
                                void refetchVersions();
                              } catch { /* surfaced by next poll */ }
                            }}
                              className="ml-auto rounded-(--app-radius) border border-separator px-2 py-0.5 hover:bg-surface">
                              {t('designDeploy')}
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : <EmptyHint />}
                  {/* Delete the whole process — allowed only when no
                      instance was ever executed in it (server guard). */}
                  <div className="flex justify-end border-t border-separator pt-2">
                    <button type="button" onClick={async () => {
                      if (!confirm(t('designDeleteProcessConfirm'))) return;
                      try {
                        await ds.deleteProcess(processId ?? '', token ?? '');
                        navigate('/myprocesses');
                      } catch (e) {
                        alert(e instanceof Error ? e.message : String(e));
                      }
                    }}
                      className="rounded-(--app-radius) border border-red-400 px-3 py-1 text-(--app-fs-small) text-red-600 hover:bg-red-50">
                      {t('designDeleteProcess')}
                    </button>
                  </div>
                </div>
              );
            })()}
          </Section>
        )}
      </div>
    </div>
  );
}

function Section(args: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-(--app-radius) border border-separator p-3">
      <div className="mb-2 text-(--app-fs-small) font-semibold">{args.title}</div>
      {args.children}
    </div>
  );
}

function Badge({ label, on }: { label: string; on: boolean }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-(--app-fs-base) ${
        on ? 'bg-(--accent)/15 text-(--accent)' : 'bg-surface text-muted'
      }`}
    >
      {label}
    </span>
  );
}

function EmptyHint() {
  const { t } = useTranslation();
  return <div className="text-(--app-fs-small) text-muted">{t('designMetaEmpty')}</div>;
}
