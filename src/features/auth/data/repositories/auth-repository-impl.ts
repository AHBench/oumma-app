import type { RegisterResult } from '../datasources/keyclock-datasource';
import type { KeyClockDataSource } from '../datasources/keyclock-datasource';
import type { User } from '../../domain/entities/user.ts';
import type { AuthRepository } from '../../domain/repositories/auth-repository.ts';

export class AuthRepositoryImpl implements AuthRepository {
  constructor(private readonly keyclock: KeyClockDataSource) {}

  signIn(username: string, password: string): Promise<User> {
    return this.keyclock.signIn(username, password);
  }

  register(payload: {
    username: string;
    password: string;
    email?: string;
    firstName: string;
    lastName: string;
    designer: boolean;
  }): Promise<RegisterResult> {
    return this.keyclock.register(payload);
  }

  signOut(refreshToken: string): Promise<boolean> {
    return this.keyclock.signOut(refreshToken);
  }

  isUserActive(token: string): Promise<boolean> {
    return this.keyclock.isSessionActive(token);
  }

  refreshToken(refreshToken: string): Promise<Record<string, unknown>> {
    return this.keyclock.refreshToken(refreshToken);
  }
}
