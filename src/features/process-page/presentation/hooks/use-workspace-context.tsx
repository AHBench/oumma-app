import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../../../auth/presentation/AuthProvider';
import { useProcessApps, useTaskGroupLabels } from '../../../shared/hooks/use-queries';
import type { ProcessApp } from '../../../process-apps/domain/entities/process-app';
import {
  findInitialTaskId,
  findRoleByName,
} from '../../../process-apps/domain/entities/process-app';
import type { User } from '../../../auth/domain/entities/user';
import type { TaskGroupLabel } from '../../data/models/task-group-label';
import type { Form } from '../../../process-forms/data/models/form-model';
import type { TaskGroup, TaskItem } from '../../../process-tasks/data/models/task-models';

/**
 * Shared workspace state for the per-process tabs + the AI Assist sidebar —
 * mirrors the state the MainBloc/MainContentWidget carried, plus the new
 * cross-cutting state (selected dossier, active task, AI panel).
 */
interface ActiveTask {
  group: TaskGroup;
  task: TaskItem;
}

interface WorkspaceContextValue {
  process: ProcessApp | null;
  user: User | null;
  token: string | null;
  groups: string[];
  stepId: string;
  taskLabels: TaskGroupLabel[];

  /** Selected dossier (Mes Dossiers tab) — shared so the AI sidebar can use it. */
  selectedDossier: Form | null;
  setSelectedDossier: Dispatch<SetStateAction<Form | null>>;

  /** Last task the user opened (task dialog) — the "active task" for AI context. */
  activeTask: ActiveTask | null;
  setActiveTask(t: ActiveTask | null): void;

  /** AI Assist sidebar — open state + one-shot prefill request. */
  aiOpen: boolean;
  setAiOpen(open: boolean): void;
  /** When set, the sidebar opens, prefills the input and auto-sends once. */
  aiRequest: string | null;
  requestAi(prompt: string): void;
  clearAiRequest(): void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { processId } = useParams<{ processId: string }>();
  const { user } = useAuth();
  const token = user?.accessToken ?? null;

  const { data: processes } = useProcessApps(token);
  const process = useMemo(
    () => (processes ?? []).find((p) => p.id === processId) ?? null,
    [processes, processId],
  );

  const { data: taskLabels } = useTaskGroupLabels(process, token);

  const groups = process ? process.roles.map((r) => r.roleId).filter(Boolean) : [];
  // The create-dossier form is the process' INITIAL form step (launchable in
  // the designer's Forms tab) — the backend computes that as initial_steps.
  // The role-task heuristic is only a fallback for legacy configs.
  const stepId = process
    ? process.initialSteps[0] || findInitialTaskId(findRoleByName(process, process.canLaunchRoleId ?? ''))
    : '';

  const [selectedDossier, setSelectedDossier] = useState<Form | null>(null);
  const [activeTask, setActiveTask] = useState<ActiveTask | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiRequest, setAiRequest] = useState<string | null>(null);

  const requestAi = useCallback((prompt: string) => {
    setAiRequest(prompt);
    setAiOpen(true);
  }, []);
  const clearAiRequest = useCallback(() => setAiRequest(null), []);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      process,
      user: (user as User | null) ?? null,
      token,
      groups,
      stepId,
      taskLabels: (taskLabels as TaskGroupLabel[] | undefined) ?? [],
      selectedDossier,
      setSelectedDossier,
      activeTask,
      setActiveTask,
      aiOpen,
      setAiOpen,
      aiRequest,
      requestAi,
      clearAiRequest,
    }),
    [
      process,
      user,
      token,
      groups,
      stepId,
      taskLabels,
      selectedDossier,
      activeTask,
      aiOpen,
      aiRequest,
      requestAi,
      clearAiRequest,
    ],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspaceContext(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspaceContext must be used within WorkspaceProvider');
  return ctx;
}
