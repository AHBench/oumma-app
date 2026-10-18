# Security Policy

## Reporting a vulnerability

**Please do not open a public issue for security vulnerabilities.**

- **Email:** `contact@brief-dz.com`
  **Subject prefix:** `[Security]` (e.g. `[Security] Agent quota bypass via crafted token`)
- Include: affected component (auth, process pages, AI Assist, designer,
  notifications), a minimal reproduction, and the commit built.

We aim to acknowledge within **48 hours** and fix within **30 days** where
feasible.

## Scope & by-design notes

- All API calls carry the user's bearer token; the app never stores
  credentials beyond the session it receives from the engine's auth
  endpoints.
- Roles/permissions are enforced **server-side** (engine); the app hides
  surfaces client-side as UX, never as the security boundary.
- The designer can propose changes but **cannot deploy** — deployment is
  a human UI action against a Designer-gated endpoint.
- AI Assist / design chat run under per-user **monthly token quotas**
  enforced server-side.
