import type { RegisterResult } from '../../data/datasources/keyclock-datasource';
import type { User } from '../entities/user';

/** Auth repository contract — mirrors lib/features/auth/domain/repository/authrepository.dart. */
export interface AuthRepository {
  signIn(username: string, password: string): Promise<User>;
  register(payload: {
    username: string;
    password: string;
    email?: string;
    firstName: string;
    lastName: string;
    designer: boolean;
  }): Promise<RegisterResult>;
  signOut(refreshToken: string): Promise<boolean>;
  isUserActive(token: string): Promise<boolean>;
  refreshToken(refreshToken: string): Promise<Record<string, unknown>>;
}
