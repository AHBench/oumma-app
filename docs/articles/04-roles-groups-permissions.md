# Roles, Groups and Permissions in Oumma — Who Can Do What, and How It's Enforced

*Oumma processes are multi-role by nature: a cashier reviews, a manager approves, an operator launches. This article covers the full permission model — creating roles in the designer, configuring per-step access, syncing them to Keycloak, and what happens (by design) when someone tries to do what they may not.*

**Series:** Oumma · previous: [Anatomy of an Oumma Process](https://dev.to/benchouia_ahmedabdelhaki/anatomy-of-an-oumma-process-the-designers-tabs-one-by-one-3dp8)

## The model in one paragraph

Permissions in Oumma are a chain of three facts:

1. **The identity provider says which groups you are in** (Keycloak groups — `Operateur`, `cashier`, `management`, …). The user's **token is the sole source** of roles; the app and the engine never trust client-side claims.
2. **The process design says which role owns each step, and which actions that role may perform** (complete / comment / attach / view). This is the designer's *Roles & Permissions* tab.
3. **The engine enforces the intersection on every action** — task completion, comments, attachments, even reading a dossier — server-side, on every HTTP call.

No role in the design → no access. Role in the design but not in your token → no access. Both → the actions the design granted.

## 1. Creating roles in the designer

Open the **Roles & Permissions** tab of your process:

![Roles & Permissions tab](img/07-roles-tab.png)

Roles are added by **role id** (the Keycloak group name) with a display name and the **launch role** marker (which role may start new dossiers). You can also create a role from the chat — *"add a supervisor role for the quality team"* — and the agent calls `add_role` for you; you confirm, it lands in the pending version.

Every step then references one of these roles — set from the canvas step panel (the role dropdown next to the step name) or from this tab.

## 2. Per-step actions

For each role on a step, the designer configures the **action set**:

| Action | Meaning |
|---|---|
| **complete** | may submit the step's form and move the process forward |
| **comment** | may write/update/delete comments on the task |
| **attach** | may add/remove task attachments (documents) |
| **view** | may open the task/dossier at all |

These are not UI suggestions — the engine's `RoleActionChecker` is consulted on the **complete-task endpoint**, on **every comment CRUD call**, and on **attachment CRUD calls**. A request that fails the check gets a 403 with a clear message, logged like any other denial.

## 3. Syncing the design to identity (Keycloak)

The old way of operating was manual: run `add-roles-to-<process>.sh` scripts after every design change, and pray the groups matched. Oumma replaces that with a **sync action**: the designer's role list is pushed to Keycloak as groups (created if missing, memberships aligned with the configured users). One click in the Roles tab, and the org's identity model and the process model cannot drift.

This matters in practice: a new cashier onboarded into the `cashier` group starts seeing their review tasks **without any process re-deployment** — membership is read from the token at sign-in.

## 4. The proof: the same task, two users

The scenario (all real, all in the demo stack):

- Process **Order Processing**, step `manual_review` assigned to role **cashier** with actions `view + complete + comment`.
- User A (`custrel_1001`) is in the `CustRelations`/cashier group.
- User B is **not** in that group.

**User A** opens My Tasks, sees the step, completes it with their form — the process moves to the next step:

![My Tasks — the role-scoped view](img/14-normal-tasks.png)

**User B** hits the same task URL directly: the engine's `RoleActionChecker` evaluates their token's groups against the step's role+actions and returns **403 — action not allowed for your role**. No UI trickery: the endpoint itself refuses, so the denial holds for any client (mobile app, curl, the AI agent).

The same check guards the **comment** and **attachment** endpoints — User B cannot even leave a note on a task they cannot open.

## 5. The AI is bound by the same rules

The process agent (AI Assist) acts **as you**, with **your** token. If your role lacks `complete` on a step, the agent's `complete_task` tool call gets the same 403 — and the agent tells you so instead of guessing its way around. Role-based access control is not a UI theme; it is the security model, and every actor — human, designer, agent — walks through the same door.

## What this buys you

- **Single source of truth** — token groups × design actions; no duplicated ACLs to keep in sync.
- **Server-side, action-level enforcement** — every CRUD call checked, logged, and consistent across UI and agent.
- **Identity sync from the design** — the designer, not a shell script, is the system of record for roles.
- **Safe onboarding** — new people get exactly the steps their group owns, the day their group membership lands.

Next in the series: **Forms That People Actually Fill** — the builder, required fields, trilingual labels, and how a form drives what "complete" means.

---

*Oumma: Go workflow engine + React agentic workspace. Article 4 of the Oumma series on [Dev.to](https://dev.to/tag/oumma). Source code: the Go engine in [AHBench/oumma](https://github.com/AHBench/oumma) and the React workspace in [AHBench/oumma-app](https://github.com/AHBench/oumma-app) — both Apache-2.0.*
