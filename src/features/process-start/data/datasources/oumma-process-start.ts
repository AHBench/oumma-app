import { apiClient } from '../../../../core/http/client';
import { appLogger } from '../../../../core/logging/app-logger';
import i18n from '../../../../core/i18n';
import type { ProcessApp } from '../../../process-apps/domain/entities/process-app';
import type { User } from '../../../auth/domain/entities/user';
import type { Form } from '../../../process-forms/data/models/form-model';

/**
 * Oumma process start — POST /processes/{process_id}. The whole body is the
 * initial global_context. The caller's department codes are injected so the
 * engine's department-scoped access control matches the user's token claims,
 * and `lang` makes the engine's LLM produce reasoning in the UI language.
 */
export class OummaProcessStartDataSource {
  constructor(private readonly oummaUrl: string) {}

  async startUserProcess(
    process: ProcessApp,
    form: Form,
    user: User,
    token: string,
  ): Promise<string> {
    const body: Record<string, unknown> = { ...form.formInput };
    body.department = { codes: user.department };
    body.lang = i18n.language;
    // The engine refuses launches without a form_id (the oper-data id of the
    // saved form the user filled in). It comes from the step DTO (form_id).
    if (form.formId) {
      body.form_id = form.formId;
    }
    appLogger.info(`Starting oumma process ${process.id}: ${JSON.stringify(body)}`, {
      name: 'OummaProcessStartDataSource',
    });
    const response = await apiClient.post(
      `${this.oummaUrl.replace(/\/+$/, '')}/processes/${process.id}`,
      body,
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      },
    );
    if (response.status === 200 || response.status === 201 || response.status === 202) {
      const decoded = response.data as { id?: string; process_id?: string };
      return decoded?.process_id ?? decoded?.id ?? '';
    }
    appLogger.error(`Failed to start user process. Status: ${response.status}`, {
      name: 'OummaProcessStartDataSource',
    });
    throw new Error(`Failed to start user process: ${JSON.stringify(response.data)}`);
  }
}
