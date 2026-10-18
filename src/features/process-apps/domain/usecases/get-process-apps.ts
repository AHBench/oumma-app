import type { ProcessAppRepository } from '../repositories/process-app-repository';

/** Mirrors lib/features/process_apps/domain/usecase/get_process_usecase.dart */
export function createGetProcessAppsUseCase(repository: ProcessAppRepository) {
  return {
    call: (token: string) => repository.fetchProcesses(token),
  };
}
