import { apiClient, getErrorMessage } from '../../../../core/http/client';
import { appLogger } from '../../../../core/logging/app-logger';
import { throwIfLicenseInvalidStrict } from '../../../../core/errors';
import {
  definitionFor,
  fetchDefinitions,
  humanize,
} from '../../../process-apps/data/oumma-mapping';
import type {
  ProcessInstanceData,
  ProcessTimeline,
  SearchItem,
  TaskHistoryItem,
  TimelineDecision,
  TimelineStep,
} from '../models/audit-models';

type Json = Record<string, unknown>;

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : value != null ? String(value) : fallback;
}

function parseDate(value: unknown): string | null {
  if (value == null) return null;
  const parsed = Date.parse(str(value));
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function checkLicense(error: unknown): void {
  const e = error as { response?: { status?: number; data?: unknown } };
  if (e?.response?.status === 403) {
    throwIfLicenseInvalidStrict(403, e?.response?.data);
  }
}

function base(oummaUrl: string): string {
  return oummaUrl.replace(/\/+$/, '');
}

/**
 * Oumma audit datasource — same public surface as the data-index
 * AuditDataSource, backed by the Oumma engine:
 *
 *  - task history    GET /processes/{pid}/{iid}/taskshist (view items are
 *                    labeled — and filtered — via the process search items)
 *  - search items    GET {process-service}/search-items/{pid}/{roles}
 *  - timeline        GET /processes/{pid}/{iid}/track  → node instances
 */
export class OummaAuditDataSource {
  constructor(
    private readonly oummaUrl: string,
    private readonly processServiceUrl: string = '',
  ) {}

  async getTaskHistoryItems(params: {
    processId: string;
    instanceId: string;
    groups: string[];
    currentItems: SearchItem[];
    languageCode: string;
    token: string;
  }): Promise<TaskHistoryItem[]> {
    try {
      const response = await apiClient.get(
        `${base(this.oummaUrl)}/processes/${params.processId}/${params.instanceId}/taskshist`,
        { headers: { Authorization: `Bearer ${params.token}` } },
      );
      if (response.status !== 200) {
        throw new Error(`Failed to load task history: ${response.status}`);
      }
      const list = (Array.isArray(response.data) ? response.data : []) as Json[];
      const allowed = new Set(params.groups.map((g) => g.trim().toLowerCase()));
      return list
        .filter((item) => {
          const g = item.group;
          if (g == null) return true;
          const codes = Array.isArray(g) ? (g as unknown[]) : [g];
          return codes.some((c) => allowed.has(str(c).trim().toLowerCase()));
        })
        .map((item, i) => {
          const taskId = str(item.task_id);
          const outputs = (item.task_output ?? {}) as Json;
          // Flutter StepDetailPanel: when search items are loaded, only the
          // fields that carry a (localized) search-item label are shown;
          // without search items the raw output keys are kept.
          // Output keys carry no "$" prefix while catalog names do —
          // normalize both sides (same rule as searchItemLabel).
          const norm = (s: string) => s.trim().toLowerCase().replace(/^\$/, '');
          const labelFor = (key: string): string | null => {
            if (params.currentItems.length === 0) return null;
            const k = norm(key);
            const s = params.currentItems.find((it) => norm(it.fieldName) === k);
            if (!s) return null;
            if (params.languageCode === 'fr') return s.fieldLabelFr || s.fieldName;
            if (params.languageCode === 'ar') return s.fieldLabelAr || s.fieldName;
            return s.fieldLabelEn || s.fieldName;
          };
          const entries = Object.entries(outputs);
          const shown =
            params.currentItems.length > 0 ? entries.filter(([k]) => labelFor(k) != null) : entries;
          return {
            id: str(item.task_instance_id) || `${taskId}-${i}`,
            taskName: humanize(taskId),
            taskDescription: taskId,
            referenceName: taskId,
            startDate:
              item.created_at != null
                ? parseDate(item.created_at) ?? new Date(0).toISOString()
                : new Date(0).toISOString(),
            completeDate: parseDate(item.completed_at),
            state: str(item.state, 'Completed'),
            actualOwner: item.owner_id != null ? str(item.owner_id) : null,
            inputsString: null,
            outputsString: outputs,
            processInstanceId: params.instanceId,
            processId: params.processId,
            taskPhase: str(item.state),
            taskPhaseStatus: '',
            detailed: false,
            comments: [],
            attachments: [],
            viewItems: shown.map(([k, v]) => ({
              key: labelFor(k) ?? humanize(k),
              value: v,
            })),
          };
        });
    } catch (e) {
      checkLicense(e);
      appLogger.error('Failed to load task history', {
        error: e,
        name: 'OummaAuditDataSource',
      });
      throw e;
    }
  }

  /**
   * Localized field labels — GET {process-service}/search-items/{pid}/{roles}
   * (same endpoint as the forms datasource; the backend authorizes the
   * caller against their own groups). Any failure degrades to [] — the task
   * history then renders the raw output keys.
   */
  async getSearchItems(
    processId: string,
    roleIds: string[],
    token: string,
  ): Promise<SearchItem[]> {
    if (!this.processServiceUrl || roleIds.length === 0 || !token) return [];
    try {
      const res = await apiClient.get(
        `${this.processServiceUrl.replace(/\/+$/, '')}/search-items/${processId}/${encodeURIComponent(roleIds.join(','))}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.status !== 200 || !Array.isArray(res.data)) return [];
      return (res.data as Json[])
        .filter((s) => s && typeof s === 'object')
        .map((s) => {
          const name = typeof s.fieldName === 'string' ? s.fieldName : typeof s.field_name === 'string' ? (s.field_name as string) : '';
          const fr = typeof s.fieldLabel_fr === 'string' ? s.fieldLabel_fr : typeof s.field_label_fr === 'string' ? (s.field_label_fr as string) : undefined;
          const ar = typeof s.fieldLabel_ar === 'string' ? s.fieldLabel_ar : typeof s.field_label_ar === 'string' ? (s.field_label_ar as string) : undefined;
          const en = typeof s.fieldLabel_en === 'string' ? s.fieldLabel_en : typeof s.field_label_en === 'string' ? (s.field_label_en as string) : undefined;
          return {
            fieldName: name,
            fieldType: typeof s.fieldType === 'string' ? s.fieldType : typeof s.field_type === 'string' ? (s.field_type as string) : '',
            fieldLabelEn: en ?? '',
            fieldLabelFr: fr ?? '',
            fieldLabelAr: ar ?? '',
          };
        })
        .filter((s) => s.fieldName !== '');
    } catch (e) {
      checkLicense(e);
      appLogger.fine(`Search items unavailable for ${processId} — using raw output keys`);
      return [];
    }
  }

  /**
   * Execution timeline — merge of the three Oumma per-instance endpoints:
   *   GET /track      — ordered events (ROUTED / WAITING_HUMAN) + LLM reasoning
   *   GET /taskshist  — per-task state, owner, created/completed, output
   *   GET /llm_logs   — LLM calls (route / prepare_input): model, duration, error
   * Steps are the tasks visited so far; each step carries the LLM decision
   * that routed into it (tooltip) and, for system steps, the prepare_input
   * call that fed it ("called correctly" = completed without error).
   */
  async getProcessTimeline(
    processId: string,
    instanceId: string,
    token: string,
  ): Promise<ProcessTimeline> {
    const url = (path: string) => `${base(this.oummaUrl)}/processes/${processId}/${instanceId}${path}`;
    const headers = { Authorization: `Bearer ${token}` };
    const [trackRes, histRes, llmRes, stateRes] = await Promise.allSettled([
      apiClient.get(url('/track'), { headers }),
      apiClient.get(url('/taskshist'), { headers }),
      apiClient.get(url('/llm_logs'), { headers }),
      apiClient.get(url(''), { headers }),
    ]);
    if (trackRes.status === 'rejected') {
      checkLicense(trackRes.reason);
      appLogger.error('Failed to load process timeline', { error: trackRes.reason, name: 'OummaAuditDataSource' });
      throw new Error(getErrorMessage(trackRes.reason));
    }
    const track = (trackRes.value.status === 200 && Array.isArray(trackRes.value.data) ? trackRes.value.data : []) as Json[];
    const hist = (histRes.status === 'fulfilled' && histRes.value.status === 200 && Array.isArray(histRes.value.data) ? histRes.value.data : []) as Json[];
    const logs = (llmRes.status === 'fulfilled' && llmRes.value.status === 200 && Array.isArray(llmRes.value.data) ? llmRes.value.data : []) as Json[];
    const instanceStatus = stateRes.status === 'fulfilled' && stateRes.value.status === 200 ? str((stateRes.value.data as Json).status) : null;

    // Task types from the definition (best effort — cached by fetchDefinitions).
    let kindOf = (_: string): TimelineStep['kind'] => 'unknown';
    try {
      const defs = await fetchDefinitions(base(this.oummaUrl), token);
      const def = definitionFor(defs, processId);
      if (def) {
        const tasks = def.tasks;
        kindOf = (name: string) => {
          const t = tasks[name];
          if (!t) return 'unknown';
          switch (t.type) {
            case 'START': return 'start';
            case 'HUMAN': return 'human';
            case 'SYSTEM': return 'system';
            case 'END': return 'end';
            default: return 'unknown';
          }
        };
      }
    } catch {
      /* best effort */
    }

    // 1) Track events → ordered steps + routing decisions.
    const steps: TimelineStep[] = [];
    const byName = new Map<string, TimelineStep>();
    const pushStep = (name: string, order: number): TimelineStep => {
      const existing = byName.get(name);
      if (existing) return existing;
      const step: TimelineStep = {
        id: `${name}-${order}-${steps.length}`,
        taskName: name,
        order,
        kind: kindOf(name),
        state: 'pending',
      };
      steps.push(step);
      byName.set(name, step);
      return step;
    };
    track.sort((a, b) => Number(a.step_order ?? 0) - Number(b.step_order ?? 0));
    for (const e of track) {
      const from = str(e.from_task_id);
      const to = str(e.to_task_id);
      const status = str(e.status);
      const at = parseDate(e.created_at);
      const isForkJoin = str(e.task_type) === 'FORK_JOIN' || from.startsWith('fork-join');
      let step: TimelineStep | undefined;
      if (!isForkJoin) {
        step = byName.get(from);
        if (!step) {
          step = pushStep(from, Number(e.step_order ?? steps.length));
        }
        if (status === 'ROUTED') step.state = 'completed';
        else if (status === 'WAITING_HUMAN') step.state = 'waiting';
        if (at && !step.startedAt) step.startedAt = at;
      }
      // Routing decisions — only when there is a real target. Fork-join
      // pseudo-tasks ("fork-join[a,b]") are not nodes; the decision is
      // attached to the step the join routed into. Fork-branch completion
      // events (empty target) update state only.
      if (status === 'ROUTED' && to.length > 0) {
        const target = pushStep(to, Number(e.step_order ?? steps.length) + 0.5);
        const decision: TimelineDecision = {
          fromTask: isForkJoin ? 'fork-join' : from,
          toTask: to,
          reasoning: str(e.reasoning),
          at,
        };
        if (step) step.decision = decision;
        target.decision = decision;
        if (target.state === 'pending') target.state = 'running';
      }
    }

    // 2) Task history → state, owner, dates, output (last entry per task wins).
    const sortedHist = [...hist].sort((a, b) => Number(a.chronological_order ?? 0) - Number(b.chronological_order ?? 0));
    for (const h of sortedHist) {
      const name = str(h.task_id);
      const step = byName.get(name) ?? pushStep(name, Number(h.chronological_order ?? steps.length));
      step.startedAt = parseDate(h.created_at) ?? step.startedAt;
      step.endedAt = parseDate(h.completed_at) ?? step.endedAt;
      if (h.owner_id != null) step.owner = str(h.owner_id);
      if (Array.isArray(h.group)) step.group = (h.group as unknown[]).map(String);
      if (h.task_output != null && typeof h.task_output === 'object') step.output = h.task_output as Json;
      const st = str(h.state).toLowerCase();
      if (st === 'failed') step.state = 'failed';
      else if (st === 'completed') step.state = 'completed';
      else if (st === 'running' && (step.state === 'pending' || step.state === 'running')) step.state = 'running';
    }

    // 3) LLM logs → decision details + per-step prepare_input calls.
    for (const l of logs) {
      const op = str(l.operation);
      const name = str(l.task_id);
      const at = parseDate(l.created_at);
      const step = byName.get(name);
      if (op === 'route') {
        let nextTask = '';
        let reasoning = '';
        let overrideApplied = false;
        try {
          const parsed = JSON.parse(str(l.response)) as Json;
          nextTask = str(parsed.next_task_id);
          reasoning = str(parsed.reasoning);
          overrideApplied = parsed.override_applied === true;
        } catch {
          /* raw response kept as-is below */
        }
        const isJoinLog = name.startsWith('fork-join');
        const decision =
          step?.decision ??
          steps
            .map((s) => s.decision)
            .find(
              (d) =>
                d &&
                (d.fromTask === name ||
                  (isJoinLog && d.fromTask === 'fork-join' && (!nextTask || d.toTask === nextTask))),
            ) ??
          null;
        if (decision) {
          if (nextTask.length > 0) decision.toTask = nextTask;
          if (reasoning.length > 0) decision.reasoning = reasoning;
          decision.overrideApplied = overrideApplied || decision.overrideApplied === true;
          decision.model = str(l.model) || decision.model;
          decision.durationMs = typeof l.duration_ms === 'number' ? l.duration_ms : decision.durationMs;
          decision.at = at ?? decision.at;
          decision.error = str(l.error) || decision.error || null;
        } else if (reasoning.length > 0 || str(l.error).length > 0) {
          // routing call whose step is unknown (e.g. aborted) — attach anyway
          if (step) {
            step.decision = {
              fromTask: name,
              toTask: nextTask,
              reasoning: reasoning || str(l.response),
              model: str(l.model),
              durationMs: typeof l.duration_ms === 'number' ? l.duration_ms : null,
              at,
              error: str(l.error) || null,
              overrideApplied,
            };
          }
        }
      } else if (op === 'prepare_input' && step) {
        step.inputCall = {
          model: str(l.model),
          durationMs: typeof l.duration_ms === 'number' ? l.duration_ms : null,
          at,
          error: str(l.error) || null,
        };
      }
    }

    // System step "called correctly": completed, or failed when the prepare
    // call or the task itself errored.
    for (const s of steps) {
      if (s.kind === 'system' && s.state === 'completed' && s.inputCall?.error) {
        s.state = 'failed';
      }
    }

    return {
      instanceId,
      processId,
      instanceStatus: instanceStatus || null,
      startedAt: steps.length > 0 ? (steps[0].startedAt ?? null) : null,
      steps,
    };
  }

  /** Execution track → node instances for the WorkflowLine stepper. */
  async getProcessInstanceData(
    processId: string,
    instanceId: string,
    token: string,
  ): Promise<ProcessInstanceData | null> {
    try {
      const response = await apiClient.get(
        `${base(this.oummaUrl)}/processes/${processId}/${instanceId}/track`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (response.status === 404) return null;
      if (response.status !== 200) {
        throw new Error(
          `Failed to load process track: ${response.status} - ${JSON.stringify(response.data)}`,
        );
      }
      const track = (Array.isArray(response.data) ? response.data : []) as Json[];

      // Node types come from the definition (HUMAN → HumanTaskNode, etc.).
      let typeOf = (_: string) => 'HumanTaskNode';
      try {
        const defs = await fetchDefinitions(base(this.oummaUrl), token);
        const def = definitionFor(defs, processId);
        if (def) {
          const tasks = def.tasks;
          typeOf = (name: string) => {
            const t = tasks[name];
            if (!t) return name.startsWith('end') ? 'EndNode' : 'HumanTaskNode';
            switch (t.type) {
              case 'START':
                return 'StartNode';
              case 'HUMAN':
                return 'HumanTaskNode';
              case 'SYSTEM':
                return 'ServiceTaskNode';
              case 'END':
                return 'EndNode';
              default:
                return 'HumanTaskNode';
            }
          };
        }
      } catch {
        /* best effort */
      }

      return {
        id: instanceId,
        processId,
        processName: humanize(processId),
        startDate:
          track.length > 0 ? parseDate(track[0].created_at) : null,
        endDate: null,
        state: null,
        businessKey: null,
        nodeInstances: track.map((e, i) => {
          const to = str(e.to_task_id);
          return {
            id: `${to}-${e.step_order ?? i}-${i}`,
            nodeId: to,
            nodeDefinitionId: to,
            nodeName: humanize(to),
            nodeType: typeOf(to),
            triggerTime: parseDate(e.created_at),
            leaveTime:
              i < track.length - 1 ? parseDate(track[i + 1].created_at) : null,
            orderIndex: Number(e.step_order ?? i) || i,
          };
        }),
      };
    } catch (e) {
      checkLicense(e);
      appLogger.error('Failed to load process instance data', {
        error: e,
        name: 'OummaAuditDataSource',
      });
      throw new Error(getErrorMessage(e));
    }
  }
}
