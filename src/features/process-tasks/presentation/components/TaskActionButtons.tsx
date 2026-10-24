import { useMemo, useState } from 'react';
import { Dropdown } from '@heroui/react';
import { useTranslation } from 'react-i18next';
import type { ProcessApp } from '../../../process-apps/domain/entities/process-app';
import type { User } from '../../../auth/domain/entities/user';
import type { TaskAttachment, TaskComment, TaskGroup, TaskItem } from '../../data/models/task-models';
import type { TaskItemLabel } from '../../../process-page/data/models/task-group-label';
import type { ProcessInstanceData } from '../../../process-audit/data/models/audit-models';
import type { Form } from '../../../process-forms/data/models/form-model';
import { FormRenderer, buildSubmittedFormInput } from '../../../process-forms/presentation/components/FormFieldFactory';
import { ErrorBox, Modal, Spinner, btnCls } from '../../../shared/components/ui';
import { PrintDialog } from '../../../process-print/presentation/components/PrintDialog';
import { useFormStructure, useUpdateForm } from '../../../shared/hooks/use-queries';
import { buildTaskReportHtml } from './task-report';

type Json = Record<string, unknown>;

interface Props {
  process: ProcessApp;
  processInstanceId: string;
  group: TaskGroup;
  task: TaskItem;
  user: User;
  token: string;
  viewItems: TaskItemLabel[] | null;
  comments: TaskComment[] | null;
  attachments: TaskAttachment[] | null;
  processStatus: ProcessInstanceData | null;
  groupedDetails: Record<string, { label: string; value: string }[]> | null;
  onComplete(formData?: Json): Promise<void>;
  isCompleting: boolean;
  setIsCompleting(v: boolean): void;
}

/**
 * Port of lib/features/process_tasks/presentation/pages/widgets/task_actions_buttons.dart.
 * Permissions come from the process role matching the task group: roleTasks
 * entry with taskId === task.description, actions group "action", items
 * Complete / Claim / Release with actionValue === true.
 */
export function TaskActionButtons(props: Props) {
  const {
    process,
    group,
    task,
    user,
    token,
    viewItems,
    comments,
    attachments,
    processStatus,
    groupedDetails,
    onComplete,
    isCompleting,
    setIsCompleting,
  } = props;
  const { t } = useTranslation();

  const [showDecisionForm, setShowDecisionForm] = useState(false);
  const [showConfirmProceed, setShowConfirmProceed] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showPrint, setShowPrint] = useState(false);

  const roleEntity = useMemo(
    () => process.roles.find((r) => r.roleId === group.name) ?? null,
    [process.roles, group.name],
  );
  // Task name is the single identifier (task_id removed). Tolerate the
  // legacy underscore form for old role configurations.
  const normTask = (v: unknown) => String(v ?? '').replace(/_/g, ' ').trim();

  const roleTask = useMemo(
    () =>
      roleEntity?.roleTasks.find(
        (t) => t.taskName === task.description || normTask(t.taskName) === normTask(task.description),
      ) ?? null,
    [roleEntity, task.description],
  );

  const hasPermission = (actionName: string): boolean =>
    process.roles.some(
      (role) =>
        role.roleId === group.name &&
        role.roleTasks.some(
          (rt) =>
            (rt.taskName === task.description || normTask(rt.taskName) === normTask(task.description)) &&
            rt.actions.some(
              (g) =>
                g.actionGroup === 'action' &&
                g.actionItems.some((i) => i.actionName === actionName && i.actionValue === true),
            ),
        ),
    );

  const canComplete = hasPermission('Complete');

  // The initial (launchable) step: its form was already submitted at launch.
  // Completing it is just a proceed confirmation — never the task's decision
  // form (its output_schema may hold a resubmission question that is
  // unrelated to the initial submission).
  const isInitialTask = useMemo(
    () =>
      (process.initialSteps ?? []).some(
        (s) => normTask(s) === normTask(task.description),
      ),
    [process.initialSteps, task.description],
  );

  // Design-driven initial-step decision: when the step's FORM CONFIGURATION
  // (the process design) defines a two-option dropdown (e.g. $decision
  // approve/reject), the proceed confirmation becomes a Yes/No decision and
  // the chosen option is submitted with the completion. No core hardcoding —
  // field name and option values come from the design; when the design has
  // no such field it stays a plain proceed.
  const initialStepId = isInitialTask
    ? String(task.description ?? '').trim().replace(/\s+/g, '_')
    : '';
  const { data: initialStepForm } = useFormStructure({ process, stepId: initialStepId, token });
  const initialDecision = useMemo(() => {
    const f = initialStepForm?.formFields?.find(
      (ff) => ff.fieldType === 'dropdown' && (ff.fieldOptions?.length ?? 0) === 2,
    );
    if (!f || !f.fieldOptions) return null;
    return { field: '$' + f.fieldName, yes: f.fieldOptions[0], no: f.fieldOptions[1] };
  }, [initialStepForm]);

  const complete = () => {
    if (isCompleting || !canComplete) return;
    if (isInitialTask) {
      setShowConfirmProceed(true);
      return;
    }
    // Non-initial task: the decision form is the step's FORM CONFIGURATION
    // (the saved step form for this task). The dialog fetches it and shows
    // it when it has fields; when no form is configured it degrades to a
    // plain proceed. On submit the form is saved with the instance (the
    // engine's completion trace) and the task moves to the next step.
    setShowDecisionForm(true);
  };

  /** Port of TaskActionButtons._openProcessPrint — builds the print inputData. */
  const openPrint = () => {
    const inputData: Json = {
      ...(task.parameters ?? {}),
      userName: user.username,
      userEmail: user.email,
    };
    const viewItemsMetadata: Json[] = [];
    if (viewItems) {
      for (const v of viewItems) {
        const fieldName = v.itemColumnName;
        const pattern = v.formatString ?? v.format ?? null;
        viewItemsMetadata.push({
          id: v.id,
          description: v.description,
          detailed: v.detailed,
          atomic: v.atomic,
          url_active: v.urlActive,
          item_column_name: v.itemColumnName,
          field_name: fieldName,
          field_type: v.format ?? '',
          field_format: pattern,
          field_pattern: pattern,
          format_string: v.formatString,
          format: v.format,
        });
        if (fieldName && fieldName.length > 0 && pattern && pattern.length > 0) {
          if (inputData[fieldName] === undefined) inputData[fieldName] = '';
        }
      }
      if (viewItemsMetadata.length > 0) inputData['view_items'] = viewItemsMetadata;
    }
    // Reverse map: translated description -> itemColumnName
    const labelToFieldNameMap: Record<string, string> = {};
    for (const v of viewItems ?? []) {
      if (v.itemColumnName && v.itemColumnName.length > 0) {
        labelToFieldNameMap[v.description] = v.itemColumnName;
        labelToFieldNameMap[v.description.toLowerCase()] = v.itemColumnName;
      }
    }
    for (const section of Object.values(groupedDetails ?? {})) {
      for (const item of section) {
        const labelName = item.label;
        const valStr = item.value;
        const name =
          labelToFieldNameMap[labelName] ?? labelToFieldNameMap[labelName.toLowerCase()] ?? labelName;
        inputData[name] = valStr;
      }
    }
    setShowPrint(true);
  };

  const openReport = () => {
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(buildTaskReportHtml({
        taskName: String(task.description),
        processDescription: process.description,
        groupedDetails,
        comments,
        attachments,
        processStatus,
      }));
      win.document.close();
    }
  };

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
      {/* Complete */}
      <HeaderButton
        variant="primary"
        label={t('completeTask')}
        enabled={canComplete && !isCompleting}
        busy={isCompleting}
        onClick={complete}
        icon={<SendIcon className="h-3.5 w-3.5" />}
      />
      {/* Initial step: the confirmation is shown as a dialogue, same way as
          the decision form. When the step's form configuration (process
          design) defines a two-option dropdown, the dialogue is a Yes/No
          decision — the option values are submitted with the completion. */}
      {showConfirmProceed ? (
        <ConfirmProceedDialog
          onClose={() => setShowConfirmProceed(false)}
          decision={initialDecision}
          onProceed={async (payload) => {
            setShowConfirmProceed(false);
            setIsCompleting(true);
            try {
              await onComplete(payload);
            } catch {
              setIsCompleting(false);
            }
          }}
          isCompleting={isCompleting}
        />
      ) : null}
      {/* Edit initial form (canEditInitialFormInTask) */}
      {roleTask?.canEditInitialFormInTask === true ? (
        <HeaderButton label={t('editInitialForm')} enabled onClick={() => setShowEditForm(true)} icon={<PencilIcon className="h-3.5 w-3.5" />} />
      ) : null}
      {/* Print */}
      <HeaderButton label={t('print')} enabled={!isCompleting} onClick={openPrint} icon={<PrinterIcon className="h-3.5 w-3.5" />} />

      {/* Overflow menu: Download as PDF / Print templates */}
      <Dropdown.Root>
        <Dropdown.Trigger className={btnCls('outline', true)} aria-label={t('moreActions')}>
          <DotsIcon className="h-3.5 w-3.5" />
        </Dropdown.Trigger>
        <Dropdown.Popover>
          <Dropdown.Menu onAction={(key) => {
            if (key === 'report') openReport();
            else if (key === 'print') openPrint();
          }}>
            <Dropdown.Item id="report">
              <FileIcon className="h-3.5 w-3.5 text-muted" /> {t('downloadAsPdf')}
            </Dropdown.Item>
            <Dropdown.Item id="print">
              <PrinterIcon className="h-3.5 w-3.5 text-muted" /> {t('printTemplates')}
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown.Root>

      {/* Decision form — shown when completing a non-initial task that requires one */}
      {showDecisionForm ? (
        <DecisionFormDialog
          process={process}
          stepId={String(task.description)}
          token={token}
          onClose={() => setShowDecisionForm(false)}
          onSubmit={async (formData) => {
            setShowDecisionForm(false);
            setIsCompleting(true);
            try {
              await onComplete(formData);
            } catch {
              setIsCompleting(false);
            }
          }}
        />
      ) : null}

      {/* Edit initial form dialog (initial data = task.parameters) */}
      {showEditForm ? (
        <EditInitialFormDialog
          task={task}
          process={process}
          token={token}
          onClose={() => setShowEditForm(false)}
        />
      ) : null}


      {showPrint ? (
        <PrintDialog
          process={process}
          token={token}
          groups={[group.name]}
          inputData={{
            ...((task.parameters ?? {}) as Json),
            userName: user.username,
            userEmail: user.email,
          }}
          allowedSteps={[{ step_id: String(task.description) }]}
          onClose={() => setShowPrint(false)}
        />
      ) : null}
    </div>
  );
}

/* ---------------------------------- proceed confirmation (initial step) ---------------------------------- */

function ConfirmProceedDialog({
  onClose,
  onProceed,
  isCompleting,
  decision,
}: {
  onClose(): void;
  onProceed(payload?: Record<string, unknown>): Promise<void>;
  isCompleting: boolean;
  /** Design-driven Yes/No decision (two-option dropdown in the step's form
   *  configuration) — null = plain proceed. */
  decision?: { field: string; yes: string; no: string } | null;
}) {
  const { t } = useTranslation();
  return (
    <Modal title={t('proceed')} onClose={onClose} wide>
      <div className="space-y-3">
        <p className="text-(--app-fs-body) text-muted">
          {decision ? t('confirmProceedDecision') : t('confirmProceed')}
        </p>
        <div className="flex justify-end gap-2 border-t border-separator pt-3">
          {decision ? (
            <button
              onClick={() => void onProceed({ [decision.field]: decision.no })}
              disabled={isCompleting}
              className={btnCls('outline')}
            >
              {t('initialDecisionNo', { option: decision.no })}
            </button>
          ) : (
            <button onClick={onClose} className={btnCls('outline')} disabled={isCompleting}>
              {t('cancel')}
            </button>
          )}
          <button
            onClick={() => void onProceed(decision ? { [decision.field]: decision.yes } : undefined)}
            disabled={isCompleting}
            className={btnCls('primary')}
          >
            {isCompleting
              ? t('completing')
              : decision
                ? t('initialDecisionYes', { option: decision.yes })
                : t('proceed')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------------------------- decision form dialog ---------------------------------- */

function DecisionFormDialog({
  process,
  stepId,
  token,
  onClose,
  onSubmit,
}: {
  process: ProcessApp;
  stepId: string;
  token: string;
  onClose(): void;
  onSubmit(formData: Json): Promise<void>;
}) {
  const { t } = useTranslation();
  // The decision form IS the step's form configuration (the saved step form
  // for this task; schema fallback when none is saved). No output-mode
  // override: the configuration decides what the user sees.
  const { data: form, isLoading, isError, error, refetch } = useFormStructure({
    process,
    stepId,
    token,
  });
  const [values, setValues] = useState<Json>({});
  const [submitting, setSubmitting] = useState(false);
  const hasFields = (form?.formFields.length ?? 0) > 0;

  const submit = async () => {
    if (!form || submitting) return;
    setSubmitting(true);
    try {
      if (hasFields) {
        // Port of DecisionForm._submitForm: per-type defaults + user values,
        // expanded into the step form's form_input template ($-placeholders).
        const merged = buildSubmittedFormInput(form, values);
        await onSubmit(merged);
      } else {
        // No form configured for this step: plain proceed.
        await onSubmit({});
      }
    } catch (e) {
      window.alert(`${t('failedToComplete')}: ${e instanceof Error ? e.message : String(e)}`);
      setSubmitting(false);
    }
  };

  return (
    <Modal title={t('decisionForm')} onClose={onClose} wide>
      {isLoading ? (
        <Spinner label={t('loadingForm')} />
      ) : isError ? (
        <ErrorBox message={String(error ?? t('failedToLoadForm'))} onRetry={() => void refetch()} />
      ) : form && hasFields ? (
        <div className="space-y-3">
          <FormRenderer
            form={form}
            values={values}
            onChange={(name, value) => setValues((v) => ({ ...v, [name]: value }))}
            token={token}
            process={process}
          />
          <div className="flex justify-end gap-2 border-t border-separator pt-3">
            <button onClick={onClose} className={btnCls('outline')}>{t('cancel')}</button>
            <button onClick={() => void submit()} disabled={submitting} className={btnCls('primary')}>
              {submitting ? t('completing') : t('submitAndComplete')}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-(--app-fs-body) text-muted">{t('noFormForStep')}</p>
          <div className="flex justify-end gap-2 border-t border-separator pt-3">
            <button onClick={onClose} className={btnCls('outline')}>{t('cancel')}</button>
            <button onClick={() => void submit()} disabled={submitting} className={btnCls('primary')}>
              {submitting ? t('completing') : t('proceed')}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ---------------------------------- edit initial form dialog ---------------------------------- */

function EditInitialFormDialog({
  task,
  process,
  token,
  onClose,
}: {
  task: TaskItem;
  process: ProcessApp;
  token: string;
  onClose(): void;
}) {
  const formId = typeof task.parameters?.['form_id'] === 'string' ? (task.parameters['form_id'] as string) : null;
  const { t } = useTranslation();
  const { data: form, isLoading } = useFormByIdLazy(process, formId, token, String(task.description));

  return (
    <Modal title={t('editInitialForm')} onClose={onClose} wide>
      {isLoading ? (
        <Spinner label={t('loadingForm')} />
      ) : form ? (
        <FormEditBody form={form} process={process} initialValues={task.parameters} token={token} />
      ) : (
        <p className="text-(--app-fs-base) text-muted">{t('noFormStructure')}</p>
      )}
    </Modal>
  );
}

function FormEditBody({
  form,
  process,
  initialValues,
  token,
}: {
  form: Form;
  process: ProcessApp;
  initialValues: Json | undefined;
  token: string;
}) {
  const [values, setValues] = useState<Json>(() => {
    const v: Json = {};
    for (const f of form.formFields) v[f.fieldName] = (initialValues?.[f.fieldName] as unknown) ?? f.fieldValue ?? null;
    return v;
  });
  const { t } = useTranslation();
  const saved = useUpdateFormLazy(process, token);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const updated: Form = {
        ...form,
        formFields: form.formFields.map((f) => ({
          ...f,
          fieldValue: f.fieldName in values ? (values[f.fieldName] as unknown) : f.fieldValue,
        })),
      };
      await saved.mutateAsync(updated);
      window.alert(t('formSaved'));
    } catch (e) {
      window.alert(`${t('failedToSaveForm')}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <FormRenderer form={form} values={values} onChange={(n, v) => setValues((cur) => ({ ...cur, [n]: v }))} token={token} process={process} />
      <div className="flex justify-end border-t border-separator pt-3">
        <button onClick={() => void save()} disabled={saving} className={btnCls('primary')}>
          {saving ? t('saving') : t('saveForm')}
        </button>
      </div>
    </div>
  );
}

import { useFormById } from '../../../shared/hooks/use-queries';
function useFormByIdLazy(process: ProcessApp, formId: string | null, token: string, stepId: string) {
  // Prefer the form id from task parameters; fall back to the step structure.
  const byId = useFormById({ process, formId, token: token || null });
  const byStep = useFormStructure({ process, stepId, token });
  if (formId && byId.data) return { data: byId.data as Form, isLoading: false };
  return {
    data: (byId.data ?? byStep.data) as Form | undefined,
    isLoading: (byId.data ? false : byId.isLoading) || (byStep.data ? false : byStep.isLoading),
  };
}
function useUpdateFormLazy(process: ProcessApp, token: string) {
  return useUpdateForm(process, token || null);
}

/* ---------------------------------- button ---------------------------------- */

function HeaderButton({
  label,
  icon,
  variant = 'outline',
  enabled,
  busy,
  disabledExtra,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  variant?: 'primary' | 'outline';
  enabled: boolean;
  busy?: boolean;
  disabledExtra?: boolean;
  onClick(): void;
}) {
  const disabled = !enabled || disabledExtra || busy;
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={btnCls(variant)}
    >
      {label}
      {busy ? (
        <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
      ) : (
        <span className="opacity-75">{icon}</span>
      )}
    </button>
  );
}

/* ---------------------------------- icons ---------------------------------- */

function SendIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M2 21 23 12 2 3v7l15 2-15 2v7Z" />
    </svg>
  );
}
function PencilIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25ZM20.7 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z" />
    </svg>
  );
}
function PrinterIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M7 8V2h10v6h4a1 1 0 0 1 1 1v9h-3v-6H5v6H2V9a1 1 0 0 1 1-1h4Zm2-4v4h6V4H9Zm-2 14h10a1 1 0 0 1 0 2H7a1 1 0 0 1 0-2Z" />
    </svg>
  );
}
function FileIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm7 1.5V9h5.5L13 3.5Z" />
    </svg>
  );
}
function DotsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
    </svg>
  );
}
