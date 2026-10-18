/**
 * Composition root — mirrors lib/injection_container.dart (get_it wiring).
 * Singletons for datasources/repositories; use cases are plain factories.
 */
import { BaseUrls } from './config/base-urls';
import { KeyClockDataSource } from '../features/auth/data/datasources/keyclock-datasource';
import { AuthRepositoryImpl } from '../features/auth/data/repositories/auth-repository-impl';
import type { AuthRepository } from '../features/auth/domain/repositories/auth-repository';
import { OummaProcessDatasource } from '../features/process-apps/data/datasources/oumma-process-datasource';
import { ProcessAppRepositoryImpl } from '../features/process-apps/data/repositories/process-app-repository-impl';
import type { ProcessAppRepository } from '../features/process-apps/domain/repositories/process-app-repository';
import { OummaTaskDataSource } from '../features/process-tasks/data/datasources/oumma-task-datasource';
import { TaskRepositoryImpl } from '../features/process-tasks/data/repositories/task-repository-impl';
import type { TaskRepository } from '../features/process-tasks/data/repositories/task-repository-impl';
import { OummaFormsDataService } from '../features/process-forms/data/datasources/oumma-forms-datasource';
import { FormRepositoryImpl } from '../features/process-forms/data/repositories/form-repository-impl';
import type { FormRepository } from '../features/process-forms/domain/repositories/form-repository';
import { InternalApiFieldSource } from '../features/process-forms/data/datasources/internal-api-field-source';
import { DocumentService } from '../features/process-document/data/datasources/document-service';
import { OummaAuditDataSource } from '../features/process-audit/data/datasources/oumma-audit-datasource';
import { OummaProcessStartDataSource } from '../features/process-start/data/datasources/oumma-process-start';
import { BackendProcessStartService } from '../features/process-start/data/datasources/backend-process-start';
import { OummaProcessPageService } from '../features/process-page/data/datasources/oumma-process-page';
import { OummaAskDataSource } from '../features/process-llm/data/datasources/oumma-ask-datasource';
import { OummaAgentDataSource } from '../features/process-llm/data/datasources/oumma-agent-datasource';
import { AIBackend } from '../features/process-llm/data/datasources/ai-backend';
import { ProcessPrintRemoteDataSource } from '../features/process-print/data/datasources/print-datasource';
import { ProcessNotificationDataSource } from '../features/shared/notifications/data/datasources/process-notification-datasource';
import { OummaDesignDataSource } from '../features/process-design/data/datasources/oumma-design-datasource';

let _instance: AppDependencies | null = null;

export interface AppDependencies {
  authRepository: AuthRepository;
  processAppRepository: ProcessAppRepository;
  taskRepository: TaskRepository;
  formRepository: FormRepository;
  internalApiFieldSource: InternalApiFieldSource;
  documentService: DocumentService;
  auditDataSource: OummaAuditDataSource;
  processStartDataSource: OummaProcessStartDataSource;
  processStartService: BackendProcessStartService;
  processPageService: OummaProcessPageService;
  oummaAskDataSource: OummaAskDataSource;
  oummaAgentDataSource: OummaAgentDataSource;
  aiBackend: AIBackend;
  printDataSource: ProcessPrintRemoteDataSource;
  notificationDataSource: ProcessNotificationDataSource;
  designDataSource: OummaDesignDataSource;
}

export function initializeDependencies(): AppDependencies {
  if (_instance) return _instance;

  const keyClockDataSource = new KeyClockDataSource(
    BaseUrls.loginUrl,
    BaseUrls.checkTokenUrl,
    BaseUrls.logoutUrl,
    BaseUrls.refreshUrl,
  );

  _instance = {
    authRepository: new AuthRepositoryImpl(keyClockDataSource),
    processAppRepository: new ProcessAppRepositoryImpl(
      new OummaProcessDatasource(BaseUrls.oummaUrl),
    ),
    taskRepository: new TaskRepositoryImpl(
      new OummaTaskDataSource(BaseUrls.oummaUrl),
    ),
    formRepository: new FormRepositoryImpl(
      new OummaFormsDataService(BaseUrls.oummaUrl, BaseUrls.processServiceBaseUrl),
    ),
    internalApiFieldSource: new InternalApiFieldSource(BaseUrls.oummaUrl),
    documentService: new DocumentService(BaseUrls.documentServiceBaseUrl),
    auditDataSource: new OummaAuditDataSource(BaseUrls.oummaUrl, BaseUrls.processServiceBaseUrl),
    processStartDataSource: new OummaProcessStartDataSource(
      BaseUrls.oummaUrl,
    ),
    processStartService: new BackendProcessStartService(BaseUrls.dataOperIndexUrl),
    processPageService: new OummaProcessPageService(
      BaseUrls.oummaUrl,
    ),
    oummaAskDataSource: new OummaAskDataSource(BaseUrls.oummaUrl),
    oummaAgentDataSource: new OummaAgentDataSource(BaseUrls.oummaUrl),
    aiBackend: new AIBackend(BaseUrls.briefAiBaseUrl),
    printDataSource: new ProcessPrintRemoteDataSource(),
    notificationDataSource: new ProcessNotificationDataSource(BaseUrls.oummaUrl),
    designDataSource: new OummaDesignDataSource(BaseUrls.oummaUrl),
  };
  return _instance;
}

export function getDependencies(): AppDependencies {
  if (!_instance) return initializeDependencies();
  return _instance;
}
