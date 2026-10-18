import type { ProcessApp } from '../entities/process-app';

export interface ProcessAppRepository {
  fetchProcesses(token: string): Promise<ProcessApp[]>;
}
