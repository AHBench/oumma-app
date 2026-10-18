import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../core/http/client';
import { BaseUrls } from '../../../core/config/base-urls';
import { getDependencies } from '../../../core/di';
import type { User } from '../../auth/domain/entities/user';
import type { ProcessApp } from '../../process-apps/domain/entities/process-app';
import type { Form } from '../../process-forms/data/models/form-model';

type Json = Record<string, unknown>;

/* ---------------------------------- process apps ---------------------------------- */

export function useProcessApps(token: string | null) {
  return useQuery({
    queryKey: ['processes', token],
    queryFn: () => getDependencies().processAppRepository.fetchProcesses(token ?? ''),
    enabled: token != null && token !== '',
  });
}

/* ---------------------------------- process page ---------------------------------- */

export function useTaskGroupLabels(process: ProcessApp | null, token: string | null) {
  return useQuery({
    queryKey: ['task-group-labels', process?.id, token],
    queryFn: () => getDependencies().processPageService.getTaskGroupLabel(process!, token ?? ''),
    enabled: process != null && token != null,
  });
}

/* ---------------------------------- tasks ---------------------------------- */

export function useTaskGroups(args: {
  process: ProcessApp | null;
  user: User | null;
  token: string | null;
  invalidateKey?: string;
}) {
  const { process, user, token } = args;
  return useQuery({
    queryKey: ['task-groups', process?.id, user?.department, token],
    queryFn: () =>
      getDependencies().taskRepository.getTaskGroupList(
        process!,
        user!.department,
        process!.roles.map((r) => r.roleId),
        token ?? '',
      ),
    enabled: process != null && user != null && token != null,
    // Oumma advances instances asynchronously (SYSTEM tasks + LLM routing),
    // so new HUMAN tasks appear while the user waits — poll the list.
    refetchInterval: 10_000,
  });
}

export function useActiveProcesses(args: {
  process: ProcessApp | null;
  user: User | null;
  token: string | null;
}) {
  const { process, user, token } = args;
  return useQuery({
    queryKey: ['active-processes', process?.id, user?.department, token],
    queryFn: () =>
      getDependencies().taskRepository.getActiveProcessItems(
        process!,
        user!.department,
        process!.roles.map((r) => r.roleId),
        token ?? '',
      ),
    enabled: process != null && user != null && token != null,
    refetchInterval: 10_000,
  });
}

export function useTaskComments(args: {
  process: ProcessApp | null;
  instanceId: string | null;
  groupId: string | null;
  token: string | null;
}) {
  const { process, instanceId, groupId, token } = args;
  return useQuery({
    queryKey: ['task-comments', process?.id, instanceId, groupId],
    queryFn: () =>
      getDependencies().taskRepository.getTaskComments(process!, instanceId!, groupId!, token ?? ''),
    enabled: process != null && instanceId != null && groupId != null && token != null,
  });
}

export function useTaskAttachments(args: {
  process: ProcessApp | null;
  instanceId: string | null;
  groupId: string | null;
  token: string | null;
}) {
  const { process, instanceId, groupId, token } = args;
  return useQuery({
    queryKey: ['task-attachments', process?.id, instanceId, groupId],
    queryFn: () =>
      getDependencies().taskRepository.getTaskAttachment(process!, instanceId!, groupId!, token ?? ''),
    enabled: process != null && instanceId != null && groupId != null && token != null,
  });
}

/* ---------------------------------- forms / dossiers ---------------------------------- */

export interface DossierQuery {
  process: ProcessApp | null;
  stepId: string;
  user: User | null;
  token: string | null;
  groups: string[];
  query?: string;
  formIds?: string[];
  forceSearchEndpoint?: boolean;
  enabled?: boolean;
}

export function useDossiers(args: DossierQuery) {
  const { process, stepId, user, token, groups, query = '', formIds = [], forceSearchEndpoint = false, enabled = true } = args;
  return useQuery({
    queryKey: ['dossiers', process?.id, stepId, query, formIds, forceSearchEndpoint],
    queryFn: () =>
      getDependencies().formRepository.searchSavedForms({
        query,
        process: process!,
        stepId,
        token: token ?? '',
        departments: user!.department,
        groups,
        formIds,
        forceSearchEndpoint,
      }),
    enabled: enabled && process != null && user != null && token != null,
  });
}

export function useSavedForms(args: {
  process: ProcessApp | null;
  stepId: string;
  token: string | null;
  departments: string[];
}) {
  const { process, stepId, token, departments } = args;
  return useQuery({
    queryKey: ['saved-forms', process?.id, stepId],
    queryFn: () =>
      getDependencies().formRepository.getSavedForms(process!, stepId, token ?? '', departments),
    enabled: process != null && token != null,
  });
}

/** Launched (active) forms — the "dossiers" of oper-data-index. */
export function useActiveForms(args: {
  process: ProcessApp | null;
  stepId: string;
  token: string | null;
  departments: string[];
}) {
  const { process, stepId, token, departments } = args;
  return useQuery({
    queryKey: ['active-forms', process?.id, stepId],
    queryFn: () =>
      getDependencies().formRepository.getActiveForms(process!, stepId, token ?? '', departments),
    enabled: process != null && token != null,
  });
}

export function useFormStructure(args: {
  process: ProcessApp | null;
  stepId: string;
  token: string | null;
  schemaMode?: 'input' | 'output';
}) {
  const { process, stepId, token, schemaMode } = args;
  return useQuery({
    queryKey: ['form-structure', process?.id, stepId, schemaMode],
    queryFn: () =>
      getDependencies().formRepository.getFormDataStructure(
        process!,
        stepId,
        token ?? '',
        schemaMode,
      ),
    enabled: process != null && token != null && stepId !== '',
    retry: false,
  });
}

/**
 * Localized field labels for a process — auth search items keyed by the
 * PROCESS's roles (the backend matches role_id and then authorizes the
 * caller against their own groups; ProcessAdmin/BriefManagement get all).
 * Labels rarely change, so a long staleTime.
 */
export function useFormSearchItems(args: {
  process: ProcessApp | null;
  token: string | null;
}) {
  const { process, token } = args;
  const roleIds = (process?.roles ?? []).map((r) => r.roleId);
  return useQuery({
    queryKey: ['form-search-items', process?.id, roleIds.join(',')],
    queryFn: () =>
      getDependencies().formRepository.getSearchItems(
        process!.id,
        roleIds,
        token ?? '',
      ),
    enabled: process != null && token != null && roleIds.length > 0,
    retry: 3, // transient auth/network flakes must not cache an empty catalog
    staleTime: 30 * 1000, // short: a stale/failed catalog must self-heal fast
    refetchOnWindowFocus: true,
  });
}

export function useFormById(args: {
  process: ProcessApp | null;
  formId: string | null;
  token: string | null;
}) {
  const { process, formId, token } = args;
  return useQuery({
    queryKey: ['form-by-id', process?.id, formId],
    queryFn: () =>
      getDependencies().formRepository.getFormDataStructureById(process!, formId!, token ?? ''),
    enabled: process != null && formId != null && token != null,
    retry: false,
  });
}

export function useFormVersions(args: {
  process: ProcessApp | null;
  formId: string | null;
  token: string | null;
  departments: string[];
}) {
  const { process, formId, token, departments } = args;
  return useQuery({
    queryKey: ['form-versions', process?.id, formId],
    queryFn: () =>
      getDependencies().formRepository.getFormVersions(process!, formId!, token ?? '', departments),
    enabled: process != null && formId != null && token != null,
  });
}

export function useSaveForm(process: ProcessApp | null, token: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (form: Form) =>
      getDependencies().formRepository.saveFormDataStructure(process!, form, token ?? ''),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['form-structure'] });
      void qc.invalidateQueries({ queryKey: ['saved-forms'] });
    },
  });
}

export function useUpdateForm(process: ProcessApp | null, token: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (form: Form) =>
      getDependencies().formRepository.updateFormDataStructure(process!, form, token ?? ''),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['form-structure'] });
      void qc.invalidateQueries({ queryKey: ['dossiers'] });
      void qc.invalidateQueries({ queryKey: ['saved-forms'] });
      void qc.invalidateQueries({ queryKey: ['active-forms'] });
    },
  });
}

export function useDeleteForm(process: ProcessApp | null, token: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { stepId: string; formId: string }) =>
      getDependencies().formRepository.deleteFormDataStructure(
        process!,
        args.stepId,
        args.formId,
        token ?? '',
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['form-structure'] });
      void qc.invalidateQueries({ queryKey: ['saved-forms'] });
    },
  });
}

/* ---------------------------------- process start ---------------------------------- */

export function useStartProcess(process: ProcessApp | null, user: User | null, token: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (form: Form) =>
      startProcess(process!, form, user!, token ?? ''),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['task-groups'] });
      void qc.invalidateQueries({ queryKey: ['active-processes'] });
      void qc.invalidateQueries({ queryKey: ['dossiers'] });
      void qc.invalidateQueries({ queryKey: ['active-forms'] });
    },
  });
}

/** Imperative start (kept out of useStartProcess to carry the user entity). */
export function startProcess(
  process: ProcessApp,
  form: Form,
  user: User,
  token: string,
): Promise<string> {
  return getDependencies().processStartDataSource.startUserProcess(process, form, user, token);
}

/* ---------------------------------- audit ---------------------------------- */

export function useSearchItems(args: {
  process: ProcessApp | null;
  groups: string[];
  token: string | null;
}) {
  const { process, groups, token } = args;
  return useQuery({
    queryKey: ['search-items', process?.id, groups],
    queryFn: () => getDependencies().auditDataSource.getSearchItems(process!.id, groups, token ?? ''),
    enabled: process != null && token != null && groups.length > 0,
  });
}

export function useTaskHistory(args: {
  processId: string | null;
  instanceId: string | null;
  groups: string[];
  languageCode: string;
  token: string | null;
}) {
  const { processId, instanceId, groups, languageCode, token } = args;
  return useQuery({
    queryKey: ['task-history', processId, instanceId, groups],
    queryFn: async () => {
      // Fetch search items first (history rendering resolves labels against them).
      const si = await getDependencies().auditDataSource.getSearchItems(
        processId!,
        groups,
        token ?? '',
      );
      return getDependencies().auditDataSource.getTaskHistoryItems({
        processId: processId!,
        instanceId: instanceId!,
        groups,
        currentItems: si,
        languageCode,
        token: token ?? '',
      });
    },
    enabled: processId != null && instanceId != null && token != null,
  });
}

export function useProcessInstanceData(args: {
  processId: string | null;
  instanceId: string | null;
  token: string | null;
}) {
  const { processId, instanceId, token } = args;
  return useQuery({
    queryKey: ['process-instance-data', processId, instanceId],
    queryFn: () =>
      getDependencies().auditDataSource.getProcessInstanceData(processId!, instanceId!, token ?? ''),
    enabled: processId != null && instanceId != null && token != null,
    retry: false,
  });
}

/** Oumma execution timeline (track × taskshist × llm_logs) for an instance.
 *  Polls every 3s while the instance is still executing — it stops as soon
 *  as the instance reaches a human task (PAUSED) or a terminal state. */
/** Instance states where the engine has responded with a result: paused on
 *  a human task, or a terminal state. Shared by the timeline polling and the
 *  progress panel. */
export const SETTLED_INSTANCE_STATUSES = new Set(['PAUSED', 'COMPLETED', 'ABORTED', 'FAILED']);

export function useProcessTimeline(args: {
  processId: string | null;
  instanceId: string | null;
  token: string | null;
}) {
  const { processId, instanceId, token } = args;
  return useQuery({
    queryKey: ['process-timeline', processId, instanceId],
    queryFn: () =>
      getDependencies().auditDataSource.getProcessTimeline(processId!, instanceId!, token ?? ''),
    enabled: processId != null && instanceId != null && token != null,
    retry: false,
    refetchInterval: (query) => {
      const status = (query.state.data as { instanceStatus?: string | null } | undefined)?.instanceStatus;
      return status && SETTLED_INSTANCE_STATUSES.has(status) ? false : 3000;
    },
  });
}

/* ---------------------------------- documents ---------------------------------- */

export function useDocuments(args: {
  processId: string | null;
  docRoles?: { id: string }[];
  groups?: string[];
  tags?: string[];
  keyword?: string;
  token: string | null;
  processInstanceId?: string | null;
}) {
  const { processId, docRoles, groups, tags, keyword, token, processInstanceId } = args;
  return useQuery({
    queryKey: ['documents', processId, groups, tags, keyword, processInstanceId],
    queryFn: () =>
      processInstanceId != null
        ? getDependencies().documentService.fetchDocumentsByProcessInstance({
            processId: processId ?? undefined,
            processInstanceId,
            docRoles,
            groups,
            tags,
            keyword,
            token: token ?? '',
          })
        : getDependencies().documentService.fetchAllDocumentsByProcess({
            processId: processId ?? undefined,
            docRoles,
            groups,
            tags,
            keyword,
            token: token ?? '',
          }),
    enabled: processId != null && token != null,
  });
}

export function useAddDocument(token: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (doc: import('../../process-document/data/models/document-model').Document) =>
      getDependencies().documentService.addDocument(doc, token ?? ''),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['documents'] }),
  });
}

export function useDeleteDocument(token: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => getDependencies().documentService.deleteDocument(id, token ?? ''),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['documents'] }),
  });
}

export function useDownloadDocument(token: string | null) {
  return useMutation({
    mutationFn: (doc: import('../../process-document/data/models/document-model').Document) =>
      getDependencies().documentService.downloadDocument(doc, token ?? ''),
  });
}

export function useDocumentTags(processId: string | null, token: string | null) {
  return useQuery({
    queryKey: ['document-tags', processId],
    queryFn: () => getDependencies().documentService.getDocumentTags(processId!, token ?? ''),
    enabled: processId != null && token != null,
  });
}

/* ---------------------------------- LLM ---------------------------------- */

export function useAgentParams(processId: string | null, token: string | null) {
  return useQuery({
    queryKey: ['agent-params', processId],
    queryFn: () => getDependencies().aiBackend.getAgentParams(processId!, token ?? ''),
    enabled: processId != null && token != null,
    retry: false,
  });
}

/* ---------------------------------- print ---------------------------------- */

export function usePrintPayload(args: {
  processId: string | null;
  token: string | null;
  allowedGroups?: string[];
  allowedSteps?: Json[];
  inputData?: Json;
}) {
  const { processId, token, allowedGroups, allowedSteps, inputData } = args;
  return useQuery({
    queryKey: ['print-payload', processId, allowedGroups, allowedSteps],
    queryFn: () =>
      getDependencies().printDataSource.getProcessPrintData(processId!, {
        allowedGroups,
        allowedSteps,
        inputData,
        token: token ?? undefined,
      }),
    enabled: processId != null && token != null,
    retry: false,
  });
}

/* ---------------------------------- task actions ---------------------------------- */

export function useTaskActions(process: ProcessApp | null, token: string | null) {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['task-groups'] });
    void qc.invalidateQueries({ queryKey: ['active-processes'] });
    void qc.invalidateQueries({ queryKey: ['task-comments'] });
    void qc.invalidateQueries({ queryKey: ['task-attachments'] });
  };
  const complete = useMutation({
    mutationFn: (p: {
      processInstanceId: string;
      taskId: string;
      taskInstanceId: string;
      userId: string;
      groupId: string;
      formData?: unknown;
    }) =>
      getDependencies().taskRepository.completeTask({
        process: process!,
        token: token ?? '',
        ...p,
      }),
    onSuccess: invalidate,
  });
  const claim = useMutation({
    mutationFn: (p: {
      processInstanceId: string;
      taskId: string;
      taskInstanceId: string;
      userId: string;
      groupId: string;
    }) =>
      getDependencies().taskRepository.claimTask({
        process: process!,
        token: token ?? '',
        ...p,
      }),
    onSuccess: invalidate,
  });
  const release = useMutation({
    mutationFn: (p: {
      processInstanceId: string;
      taskId: string;
      taskInstanceId: string;
      userId: string;
      groupId: string;
    }) =>
      getDependencies().taskRepository.releaseTask({
        process: process!,
        token: token ?? '',
        ...p,
      }),
    onSuccess: invalidate,
  });
  const addComment = useMutation({
    mutationFn: (p: {
      processInstanceId: string;
      taskDescription: string;
      taskInstanceId: string;
      userId: string;
      group: string;
      content: string;
    }) =>
      getDependencies().taskRepository.addTaskComment({
        process: process!,
        token: token ?? '',
        ...p,
      }),
    onSuccess: invalidate,
  });
  const updateComment = useMutation({
    mutationFn: (p: {
      processInstanceId: string;
      taskDescription: string;
      taskInstanceId: string;
      userId: string;
      group: string;
      comment: import('../../process-tasks/data/models/task-models').TaskComment;
    }) =>
      getDependencies().taskRepository.updateTaskComment({
        process: process!,
        token: token ?? '',
        ...p,
      }),
    onSuccess: invalidate,
  });
  const deleteComment = useMutation({
    mutationFn: (p: {
      processInstanceId: string;
      taskDescription: string;
      taskInstanceId: string;
      userId: string;
      group: string;
      commentId: string;
    }) =>
      getDependencies().taskRepository.deleteTaskComment({
        process: process!,
        token: token ?? '',
        ...p,
      }),
    onSuccess: invalidate,
  });
  const addAttachment = useMutation({
    mutationFn: (p: {
      processInstanceId: string;
      taskDescription: string;
      taskInstanceId: string;
      userId: string;
      group: string;
      attachment: import('../../process-tasks/data/models/task-models').TaskAttachment;
    }) =>
      getDependencies().taskRepository.addTaskAttachment({
        process: process!,
        token: token ?? '',
        ...p,
      }),
    onSuccess: invalidate,
  });
  const deleteAttachment = useMutation({
    mutationFn: (p: {
      processInstanceId: string;
      taskDescription: string;
      taskInstanceId: string;
      userId: string;
      group: string;
      attachment: import('../../process-tasks/data/models/task-models').TaskAttachment;
    }) =>
      getDependencies().taskRepository.deleteTaskAttachment({
        process: process!,
        token: token ?? '',
        ...p,
      }),
    onSuccess: invalidate,
  });
  const getTaskStatus = useMutation({
    mutationFn: (p: { processInstanceId: string; groupId: string }) =>
      getDependencies().taskRepository.getTaskStatus({
        process: process!,
        token: token ?? '',
        ...p,
      }),
  });
  return { complete, claim, release, addComment, updateComment, deleteComment, addAttachment, deleteAttachment, getTaskStatus };
}

/* ---------------------------------- token usage ---------------------------------- */

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  calls: number;
  cost_usd?: number;
}

/**
 * LLM tokens consumed so far. With instanceId: one instance (workspace
 * views); without: every instance of the process definition (designer view).
 */
export function useTokenUsage(args: {
  processId: string | null;
  instanceId?: string | null;
  token: string | null;
}) {
  const { processId, instanceId, token } = args;
  const enabled = processId != null && token != null && (instanceId ? true : true);
  return useQuery({
    queryKey: ['token-usage', processId, instanceId ?? null],
    queryFn: async (): Promise<TokenUsage> => {
      const base = BaseUrls.oummaUrl.replace(/\/+$/, '');
      const path = instanceId
        ? `/processes/${processId}/${instanceId}/token-usage`
        : `/processes/${processId}/token-usage`;
      const response = await apiClient.get(`${base}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return response.data as TokenUsage;
    },
    enabled: processId != null && token != null && enabled,
    refetchInterval: 15_000,
    retry: false,
  });
}
