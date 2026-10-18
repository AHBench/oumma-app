import type { User } from '../../auth/domain/entities/user';

/**
 * Designer gate (B-4) — mirrors the oumma server guard
 * (processconfig.mgmtRequireAdmin): the token's groups contain `Designer`
 * (a leading `/` is stripped before comparison).
 */
export function isDesigner(user: User | null): boolean {
  if (!user) return false;
  return (user.groups ?? []).some((g) => g.replace(/^\//, '') === 'Designer');
}
