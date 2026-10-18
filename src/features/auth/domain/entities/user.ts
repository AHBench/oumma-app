/** User entity — mirrors lib/features/auth/domain/entities/user_entity.dart. */
export interface User {
  id: string;
  email: string;
  username: string;
  department: string[];
  /** Keycloak groups from the session claims (e.g. ["/Designer"]). */
  groups: string[];
  firstName: string;
  lastName?: string;
  createdAt: string; // ISO-8601
  isEmailVerified?: boolean;
  isPhoneVerified?: boolean;
  isActive?: boolean;
  profile?: string;
  accessToken?: string | null;
  refreshToken?: string | null;
}

export function copyUser(
  user: User,
  patch: Partial<User>,
): User {
  return { ...user, ...patch };
}
