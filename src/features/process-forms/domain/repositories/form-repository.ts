import type { Form } from '../../data/models/form-model.ts';
import type { SearchItem } from '../../data/models/form-model.ts';
import type { ProcessApp } from '../../../process-apps/domain/entities/process-app';

type Json = Record<string, unknown>;

/** Form repository contract — mirrors lib/features/process_forms/domain/repository/form_repository.dart */
export interface FormRepository {
  getFormDataStructure(
    process: ProcessApp,
    stepId: string,
    token: string,
    schemaMode?: 'input' | 'output',
  ): Promise<Form | null>;
  saveFormDataStructure(
    process: ProcessApp,
    form: Form,
    token: string,
  ): Promise<Json>;
  deleteFormDataStructure(
    process: ProcessApp,
    stepId: string,
    formId: string,
    token: string,
  ): Promise<Json>;
  updateFormDataStructure(
    process: ProcessApp,
    form: Form,
    token: string,
  ): Promise<Json>;
  getSavedForms(
    process: ProcessApp,
    stepId: string,
    token: string,
    departments: string[],
  ): Promise<Form[]>;
  getActiveForms(
    process: ProcessApp,
    stepId: string,
    token: string,
    departments: string[],
  ): Promise<Form[]>;
  getFormDataStructureById(
    process: ProcessApp,
    formId: string,
    token: string,
  ): Promise<Form>;
  getFormVersions(
    process: ProcessApp,
    formId: string,
    token: string,
    departments: string[],
  ): Promise<Form[]>;
  searchSavedForms(params: {
    query: string;
    process: ProcessApp;
    stepId: string;
    token: string;
    departments: string[];
    groups: string[];
    formIds?: string[];
    forceSearchEndpoint?: boolean;
  }): Promise<Form[]>;
  /** Localized field labels for a process (auth search items, keyed by the process's role ids). */
  getSearchItems(
    processId: string,
    roleIds: string[],
    token: string,
  ): Promise<SearchItem[]>;
}
