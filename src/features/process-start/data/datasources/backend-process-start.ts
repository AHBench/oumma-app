import { apiClient } from '../../../../core/http/client';
import type { ProcessApp } from '../../../process-apps/domain/entities/process-app';
import type { Form } from '../../../process-forms/data/models/form-model';
import { formFromJson } from '../../../process-forms/data/models/form-model';

type Json = Record<string, unknown>;

/**
 * Backend "existing forms" datasource (oper data index) — mirrors
 * lib/features/process_start/data/datasource/backend_process_start.dart
 */
export class BackendProcessStartService {
  constructor(private readonly baseUrl: string) {}

  /** GET {oper}/user/forms?process_id&step_id&departments&activeform=false */
  async getProcessFormDataStructure(
    process: ProcessApp,
    stepId: string,
    token: string,
    departments: string[],
  ): Promise<Form[]> {
    const response = await apiClient.get(
      `${this.baseUrl}/user/forms?process_id=${process.id}&step_id=${stepId}&departments=${departments.join(',')}&activeform=false`,
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      },
    );
    if (response.status !== 200) {
      throw new Error(`Failed to load process forms from API: ${response.status}`);
    }
    const dataList = (response.data ?? []) as Json[];
    if (dataList.length === 0) return [];
    const formModels: Form[] = [];
    for (const item of dataList) {
      const steps = item.steps as Json[] | undefined;
      if (steps && steps.length > 0) {
        for (const step of steps) {
          if (step.step_id === stepId) {
            formModels.push(formFromJson(step));
          }
        }
      }
    }
    return formModels;
  }

  /**
   * GET {oper}/user/forms?process_id&department&activeform=true —
   * active (in-instance) forms, with shared-process fallback when empty.
   * NOTE: faithful to the Dart code, the query param is `department`
   * (singular) on this path.
   */
  async getProcessExistingFormsDataStructure(
    process: ProcessApp,
    stepId: string,
    token: string,
    departments: string[],
  ): Promise<Form[]> {
    const dataList = (
      await apiClient.get(
        `${this.baseUrl}/user/forms?process_id=${process.id}&department=${departments.join(',')}&activeform=true`,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        },
      )
    ).data as Json[];

    const formModels: Form[] = [];
    if (!Array.isArray(dataList) || dataList.length === 0) {
      for (const processId of process.sharedProcessIds ?? []) {
        await this.getSharedProcessExistingFormsDataStructure(
          processId,
          token,
          departments,
          formModels,
        );
      }
      return formModels;
    }
    for (const item of dataList) {
      const steps = item.steps as Json[] | undefined;
      if (steps && steps.length > 0) {
        for (const step of steps) {
          if (step.step_id === stepId) {
            formModels.push(formFromJson(step));
          }
        }
      }
    }
    for (const processId of process.sharedProcessIds ?? []) {
      await this.getSharedProcessExistingFormsDataStructure(
        processId,
        token,
        departments,
        formModels,
      );
    }
    return formModels;
  }

  async getSharedProcessExistingFormsDataStructure(
    processId: string,
    token: string,
    departments: string[],
    regularForms: Form[],
  ): Promise<Form[]> {
    const response = await apiClient.get(
      `${this.baseUrl}/user/forms?process_id=${processId}&department=${departments.join(',')}&activeform=true`,
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      },
    );
    if (response.status !== 200) {
      throw new Error(`Failed to load shared process forms from API: ${response.status}`);
    }
    const dataList = (response.data ?? []) as Json[];
    if (dataList.length === 0) return regularForms;
    for (const item of dataList) {
      const steps = item.steps as Json[] | undefined;
      if (steps && steps.length > 0) {
        for (const step of steps) {
          regularForms.push(formFromJson(step));
        }
      }
    }
    return regularForms;
  }
}
