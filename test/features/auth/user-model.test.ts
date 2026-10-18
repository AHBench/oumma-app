import { describe, expect, it } from 'vitest';
import { userFromJson } from '../../../src/features/auth/data/models/user-model';

describe('auth/user-model', () => {
  it('maps a Keycloak login response to a User', () => {
    const user = userFromJson({
      user_info: {
        sub: 'sub-1',
        email: 'a@b.c',
        department: ['IT', 'OPS'],
        preferred_username: 'alice',
        family_name: 'Doe',
        email_verified: true,
      },
      createdTimestamp: 1_700_000_000_000,
      access_token: 'acc',
      refresh_token: 'ref',
    });
    expect(user.id).toBe('sub-1');
    expect(user.username).toBe('alice');
    expect(user.department).toEqual(['IT', 'OPS']);
    // Faithful to Dart: family_name → firstName
    expect(user.firstName).toBe('Doe');
    expect(user.accessToken).toBe('acc');
    expect(user.refreshToken).toBe('ref');
  });

  it('wraps a scalar department into a list', () => {
    const user = userFromJson({
      user_info: {
        sub: 's',
        email: 'e',
        department: 'Finance',
        preferred_username: 'bob',
      },
    });
    expect(user.department).toEqual(['Finance']);
  });
});
