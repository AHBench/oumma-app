import type { OummaFormsDataService } from '../datasources/oumma-forms-datasource';
import type { Form } from '../models/form-model';
import type { SearchItem } from '../models/form-model';
import type { ProcessApp } from '../../../process-apps/domain/entities/process-app';
import type { FormRepository } from '../../domain/repositories/form-repository';

type Json = Record<string, unknown>;

export class FormRepositoryImpl implements FormRepository {
  constructor(private readonly service: OummaFormsDataService) {}

  getFormDataStructure(process: ProcessApp, stepId: string, token: string, schemaMode?: 'input' | 'output') {
    return this.service.getFormDataStructure(process, stepId, token, schemaMode);
  }

  saveFormDataStructure(process: ProcessApp, form: Form, token: string): Promise<Json> {
    return this.service.saveFormDataStructure(process, form, token);
  }

  deleteFormDataStructure(process: ProcessApp, stepId: string, formId: string, token: string) {
    return this.service.deleteFormDataStructure(process, stepId, formId, token);
  }

  updateFormDataStructure(process: ProcessApp, form: Form, token: string): Promise<Json> {
    return this.service.updateFormDataStructure(process, form, token);
  }

  getSavedForms(process: ProcessApp, stepId: string, token: string, departments: string[]) {
    return this.service.getSavedForms(process, stepId, token, departments);
  }

  getActiveForms(process: ProcessApp, stepId: string, token: string, departments: string[]) {
    return this.service.getActiveForms(process, stepId, token, departments);
  }

  getFormDataStructureById(process: ProcessApp, formId: string, token: string): Promise<Form> {
    return this.service.getFormDataStructureById(process, formId, token);
  }

  getFormVersions(process: ProcessApp, formId: string, token: string, departments: string[]) {
    return this.service.getFormVersions(process, formId, token, departments);
  }

  searchSavedForms(params: {
    query: string;
    process: ProcessApp;
    stepId: string;
    token: string;
    departments: string[];
    groups: string[];
    formIds?: string[];
    forceSearchEndpoint?: boolean;
  }): Promise<Form[]> {
    return this.service.searchSavedForms(params);
  }

  getSearchItems(processId: string, roleIds: string[], token: string): Promise<SearchItem[]> {
    return this.service.getSearchItems(processId, roleIds, token);
  }
}
