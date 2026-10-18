import type { OummaProcessDatasource } from '../datasources/oumma-process-datasource';
import type { ProcessApp } from '../../domain/entities/process-app.ts';
import type { ProcessAppRepository } from '../../domain/repositories/process-app-repository.ts';

export class ProcessAppRepositoryImpl implements ProcessAppRepository {
  constructor(private readonly datasource: OummaProcessDatasource) {}

  fetchProcesses(token: string): Promise<ProcessApp[]> {
    return this.datasource.fetchProcesses(token);
  }
}
