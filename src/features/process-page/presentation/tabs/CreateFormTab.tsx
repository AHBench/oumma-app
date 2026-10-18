import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useWorkspaceContext } from '../hooks/use-workspace-context';
import { useFormStructure, useSaveForm, useStartProcess } from '../../../shared/hooks/use-queries';
import { ErrorBox, Spinner, btnCls } from '../../../shared/components/ui';
import { TokenUsageBadge } from '../../../shared/components/TokenUsageBadge';
import { FormRenderer, buildSubmittedFormInput, resolveFieldValues } from '../../../process-forms/presentation/components/FormFieldFactory';
import type { Form } from '../../../process-forms/data/models/form-model';

type Json = Record<string, unknown>;

/**
 * "Create a dossier" tab — React port of
 * process_forms/presentation/pages/create_form.dart. Fills the process'
 * INITIAL task form (the initial task of the launch role) and SAVES it as a
 * draft form in the oper-data-index store. The saved form then appears in
 * the "My Pending Forms" tab, where it can be edited, deleted or launched
 * (launch appends the process instance id to the form, which makes it
 * "active" and moves it to the dossier list).
 */
export function CreateFormTab() {
  const { t } = useTranslation();
  const { process, user, token, stepId, requestAi } = useWorkspaceContext();
  const navigate = useNavigate();

  const { data: structure, isLoading, isError, refetch } = useFormStructure({
    process,
    stepId,
    token,
  });
  const saveForm = useSaveForm(process, token);
  const startProcess = useStartProcess(process, user, token);

  const [values, setValues] = useState<Json>({});
  const [status, setStatus] = useState<{ kind: 'idle' | 'success' | 'error'; message?: string }>({
    kind: 'idle',
  });

  if (!process || !user || !token) return <Spinner label={t('loadingProcess')} />;

  if (isLoading) return <Spinner label={t('loadingFormStructure')} />;
  if (isError || structure == null) {
    return (
      <div className="p-4">
        <ErrorBox
          message={t('noFormStructureForStep')}
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  const submit = async () => {
    setStatus({ kind: 'idle' });
    // Port of create_form._submitForm: user values expanded into the step
    // form's form_input template ($-placeholders → real values) AND written
    // to each field's field_value (the saved form carries its values).
    const resolved = resolveFieldValues(structure, values);
    const formInput = buildSubmittedFormInput(structure, values) as Json;
    formInput.department = { codes: user.department };
    const form: Form = {
      ...structure,
      formInput,
      formFields: structure.formFields.map((f) => ({ ...f, fieldValue: resolved.get(f.fieldName) })),
    };
    try {
      const res = await saveForm.mutateAsync(form);
      if (res.formexists != null) {
        setStatus({ kind: 'error', message: t('formExists') });
        return;
      }
      setStatus({ kind: 'success', message: t('formSaved') });
    } catch (e) {
      setStatus({ kind: 'error', message: t('failedToSaveForm') });
    }
  };

  // Initial step without a form definition: nothing to fill in — the user
  // only has to confirm the launch.
  if (structure.formFields.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div className="w-full max-w-md rounded-(--app-radius) border border-separator bg-surface p-6 text-center">
          <h2 className="text-(--app-fs-title) font-semibold text-foreground">{t('confirmLaunchTitle')}</h2>
          <p className="mt-2 text-(--app-fs-base) text-muted">
            {t('confirmLaunchNoForm')} — {process.name}
          </p>
          {status.kind === 'error' ? (
            <div className="mt-3 rounded border border-(--danger)/40 bg-(--danger)/10 p-2 text-(--app-fs-base) text-(--danger)">
              {status.message}
            </div>
          ) : null}
          <div className="mt-5 flex justify-center gap-2">
            <button
              className={btnCls('primary')}
              disabled={startProcess.isPending}
              onClick={() => {
                setStatus({ kind: 'idle' });
                startProcess
                  .mutateAsync({
                    ...structure,
                    formInput: { department: { codes: user.department } },
                    formFields: [],
                  })
                  .then(() => navigate(`/myprocesses/${process.id}/my-tasks`))
                  .catch(() => setStatus({ kind: 'error', message: t('failedToLaunchProcess') }));
              }}
            >
              {startProcess.isPending ? t('launchingProcess') : t('launchProcess')}
            </button>
            <button
              className={btnCls('outline')}
              onClick={() => navigate(`/myprocesses/${process.id}/my-tasks`)}
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (status.kind === 'success') {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div className="w-full max-w-md rounded-(--app-radius) border border-separator bg-surface p-8 text-center">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto h-12 w-12 text-(--success)">
            <circle cx="12" cy="12" r="10" />
            <path d="m9 12 2 2 4-4" />
          </svg>
          <h2 className="mt-4 text-(--app-fs-heading) font-bold text-foreground">{t('formSaved')}</h2>
          <p className="mt-2 text-(--app-fs-base) text-muted">{t('formSavedHint')}</p>
          <button
            className={`${btnCls('primary')} mt-6`}
            onClick={() => navigate(`/myprocesses/${process.id}/my-tasks`)}
          >
            {t('goToMyTasks')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-3">
      {/* Horizontal toolbar: title on the left; AI Assist (same design as
          the right-menu items) + token consumption in the right corner. */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-(--app-fs-title) font-semibold text-foreground">
            {t('createForm')} — {process.name}
          </h2>
          <div className="text-(--app-fs-small) text-muted">
            {t('step')}: {stepId || '—'} · {t('version')}: {structure.formVersion || '—'}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* One search-bar-style field (same metrics, background and
              border as the dossier search input in the audit view)
              holding the token consumption + the AI Assist action. */}
          <div
            data-status-hint="hint.token_usage"
            className="input flex shrink-0 items-center gap-2 bg-surface px-2.5 shadow-[0_2px_4px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.06),0_0_1px_rgba(0,0,0,0.06)]"
          >
            <TokenUsageBadge processId={process.id} token={token} bare />
            <button
              type="button"
              onClick={() => requestAi('')}
              data-status-hint="hint.ai_assist"
              title={t('agentFormHint')}
              className="flex items-center gap-2 rounded-(--app-radius) px-1.5 py-0.5 text-(--app-fs-base) text-foreground hover:bg-surface-secondary"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 shrink-0 text-(--accent)">
                <path d="M12 2 9.9 9.9 2 12l7.9 2.1L12 22l2.1-7.9L22 12l-7.9-2.1L12 2Z" />
              </svg>
              <span>{t('aiAssist')}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl rounded-(--app-radius) border border-separator bg-surface p-4">
        {status.kind === 'error' ? (
          <div className="mb-3 rounded border border-(--danger)/40 bg-(--danger)/10 p-2 text-(--app-fs-base) text-(--danger)">
            {status.message}
          </div>
        ) : null}

        <FormRenderer
          form={structure}
          values={values}
          onChange={(name, value) => setValues((v) => ({ ...v, [name]: value }))}
          token={token}
          process={process}
        />

        <div className="mt-4 flex gap-2">
          <button
            onClick={() => void submit()}
            disabled={saveForm.isPending}
            className={btnCls('primary')}
          >
            {saveForm.isPending ? t('savingForm') : t('saveForm')}
          </button>
          <button
            onClick={() => navigate(`/myprocesses/${process.id}/my-tasks`)}
            className={btnCls('outline')}
          >
            {t('cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
