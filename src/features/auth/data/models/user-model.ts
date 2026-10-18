import type { User } from '../../domain/entities/user';

/**
 * Auth API DTO — mirrors lib/features/auth/data/models/usermodel.dart.
 * Login response shape: { user_info: {...}, createdTimestamp, access_token, refresh_token }
 */
export interface SignInResponseDto {
  user_info: {
    sub: string;
    email: string;
    department: string | string[];
    preferred_username: string;
    family_name?: string;
    email_verified?: boolean;
    groups?: string[];
  };
  createdTimestamp?: number;
  access_token?: string;
  refresh_token?: string;
}

export function userFromJson(json: SignInResponseDto): User {
  const department = Array.isArray(json.user_info.department)
    ? json.user_info.department
    : [json.user_info.department ?? 'General'];

  const createdAt =
    json.createdTimestamp != null
      ? new Date(json.createdTimestamp).toISOString()
      : new Date().toISOString();

  return {
    id: json.user_info.sub,
    email: json.user_info.email,
    username: json.user_info.preferred_username,
    department,
    groups: Array.isArray(json.user_info.groups)
      ? (json.user_info.groups as string[]).map((g) => String(g).replace(/^\//, ''))
      : [],
    // NOTE: faithful to the Dart model, which maps `family_name` → firstName
    firstName: json.user_info.family_name ?? '',
    isEmailVerified: json.user_info.email_verified,
    createdAt,
    accessToken: json.access_token ?? null,
    refreshToken: json.refresh_token ?? null,
  };
}

/** Serialized shape persisted in localStorage (same fields as Dart's _saveUser). */
export function userToStoredJson(user: User): Record<string, unknown> {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    department: user.department,
    groups: user.groups ?? [],
    firstName: user.firstName,
    lastName: user.lastName,
    isPhoneVerified: user.isPhoneVerified ?? false,
    accessToken: user.accessToken,
    refreshToken: user.refreshToken,
    createdAt: user.createdAt,
  };
}

export function userFromStoredJson(json: Record<string, unknown>): User {
  return {
    id: String(json.id ?? ''),
    username: String(json.username ?? ''),
    email: String(json.email ?? ''),
    department: Array.isArray(json.department)
      ? (json.department as string[]).map(String)
      : [],
    groups: Array.isArray(json.groups)
      ? (json.groups as string[]).map((g) => String(g).replace(/^\//, ''))
      : [],
    firstName: String(json.firstName ?? ''),
    lastName: json.lastName ? String(json.lastName) : undefined,
    isPhoneVerified: Boolean(json.isPhoneVerified ?? false),
    accessToken: (json.accessToken as string | null) ?? null,
    refreshToken: (json.refreshToken as string | null) ?? null,
    createdAt:
      typeof json.createdAt === 'string' && json.createdAt !== ''
        ? (json.createdAt as string)
        : new Date().toISOString(),
  };
}
