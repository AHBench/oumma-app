# You Know n8n (or Camunda, or Zapier). Here's What's Different About Oumma

> *You've automated the easy stuff. The hard stuff — the stuff with patients, approvals, money and audit trails — still runs on email and "call me when it's ready." If you run n8n, Camunda, or Zapier, this article is the honest comparison: where those platforms stop, and what it takes to cross the line into regulated business processes.*

You already know the category. **n8n** gave you visual automations with 400+ integrations. **Zapier** glued your SaaS stack together in an afternoon. **Camunda** gave you real BPMN in your production systems. All of them are excellent — for what they are: **automation of steps**.

Oumma is a different animal: an **agentic workflow platform for business processes where humans are the primary workers and AI is the orchestrator around them**. Not the other way around. That one sentence explains most of the design. Four subjects actually matter when a workflow touches real people.

---

## 1. Human-in-the-loop: a citizen, not a "wait node"

In n8n the human appears when the workflow runs out of machine: you bolt on a form, an email, an external ticket system, and then a **polling webhook** waits for a human to do something outside the platform. The human's work is *next to* the automation — and the state of that work lives somewhere else.

In Camunda, human tasks are first-class (a `userTask` in BPMN) — that's the closest relative. But the task **assignment model is yours to build**: who can see it, who can act, what they can do on the artifacts — all of it is code you write against the Task API.

In Oumma, the human is the **main loop of the process**:

![A normal user's My Tasks view: every open task, its process, and the actions allowed for their role](img/g3-human-task.png)

- A "dossier" is a **process instance**, and the user's home screen is their **task queue** — the same queue the engine maintains in Postgres, not a view over some external ticket system.
- **Permission is per step and per action**: each step declares which role can `complete` it, which can `comment`, which can `attach`. The engine re-checks all of it **server-side** on every completion — the UI hiding a button is cosmetics, not security.
- **Forms are pinned to the step** (version-pinned, even — an instance keeps the form structure it was launched with), so the person sees exactly what the process needs at that moment, in three languages (EN/FR/AR in the shipped i18n).
- **Notifications follow the user's own tasks**: new task, task moved, process advanced — the bell is driven by the engine's state, not by a cron email.

The practical difference: with n8n you *built a workflow that occasionally asks a human for input*; with Oumma you have a **process the humans work, with the machine doing everything else** — documents, routing, integrations, reminders.

---

## 2. Controlled automation: BPM discipline instead of free-form wiring

n8n and Zapier optimize for **developer velocity**: drag nodes, connect, run. The freedom is the point — and it's exactly why, at scale, nobody can tell you what a workflow actually *does*, who approved it, or what changed when. Your "processes" are node graphs with the semantics of a shell script: no gateways, no roles, no version, no audit of the design itself.

Camunda has the formalism (BPMN 2.0) but you pay for it in modeling tools, a separate runtime, and a Java/Zeebe operational footprint.

Oumma takes the **BPMN core of what regulated processes actually need** — tasks, exclusive gateways, parallel fork/join, start/end — and ships it as a product, with the controls an enterprise needs around it:

![The interactive BPMN canvas: exclusive gateway routing high-value orders to a manager review](img/g1-order-canvas.png)

- **The design *is* the source of truth** — one YAML document per process, versioned in Postgres, rendered on the interactive canvas. No drift between a modeling tool and a runtime: there is only one artifact.
- **Single pending version + semantic versioning**: every change lands in one pending document; the engine computes major/minor/patch from *what* changed (topology = major, roles/step ids = minor, labels = patch). **Deploying is a human act** in the Versions tab — the AI can propose, never deploy.
- **Instance pinning**: instances running on v4.0.5 keep their v4.0.5 semantics even after you deploy v5. No surprise behavior changes mid-flight — the thing that makes BPM platforms trustworthy in production.
- **Deterministic first, AI second**: single-successor hops and unconditional fork/join merges route **with zero LLM tokens** — no model in the money path, no latency, no cost. The LLM appears only where a decision is genuinely undecidable (and even then its output is a structured choice against your defined branches, written into the process data).
- **Tool steps are zero-token system tasks**: a Telegram notification, a Gmail send, a WhatsApp alert, a generic HTTP call — configured in the designer, executed deterministically from process data. In n8n these are nodes; in Oumma they're *engine steps with an audit trail*, dry-run by default so nobody accidentally fires production messages during a redesign.

The practical difference: an n8n workspace is a collection of clever automations; an Oumma deployment is a **set of governed, versioned, auditable business processes** — the difference between "it automates" and "the audit can trace it."

---

## 3. Roles: enterprise identity *is* the permission model

This is where the no-code tools fall off the map. In n8n, "who can run/edit this workflow" is a **workspace seat** — there are no per-step roles, no claim that only a `manager` may complete the *manager_review* step of *your* process. In Zapier, it's an account. Your real org chart (the one in your IdP) simply doesn't exist inside the platform.

Camunda has user/role groups, but wiring them into a real enterprise IdP — SSO, group sync, claims — is integration work you build and maintain.

Oumma's answer: **the platform has no user database of its own.** Identity is Keycloak; the platform validates the bearer token, reads the groups and department from the claims, and that's it:

![The Roles & Permissions tab: each step's allowed role and its permitted actions, defined in the design](img/g2-order-roles.png)

- **One login, every system.** The same token authenticates the workspace, the designer, the agent, and the engine APIs.
- **Roles are defined *in the process design*** (the Roles tab: which role per step, which actions), and synced to the IdP as groups. When you change a role's scope in the design, the sync follows — no separate identity administration.
- **Enforcement is server-side and claim-based**: the engine re-validates the token on every task completion, comment and attachment. A user's *token* is the sole source of who they are; there is no app-side "trust me" path.
- **Self-service onboarding with governance**: users register from the login page, activate via an emailed one-time token (Mailpit in the dev stack), and get a **role-based monthly token quota** — normal users 20k, designers 50k — enforced on every AI call, with a claim-a-top-up flow that emails the administrator. The platform meters its own AI usage per user, per department, per process.

The practical difference: in n8n you explain your org chart to the platform (or don't, and ship it); in Oumma the **org chart already exists** — the platform just reads it and enforces it on every single action.

---

## 4. The other differences that compound

The three above are the headline; these are the ones people discover in week two:

**The AI designs the process — and you still hold the pen.**
Ask the designer chat *"add a manager review for orders above 1000 euros"* and it edits the actual design document: new task, gateway, condition, role, form — all in the one pending version, visible on the canvas instantly, draggable if you disagree, and only live when **you** deploy. In n8n the AI (where it exists) edits node graphs; here it edits a governed BPMN artifact with versions, semver and a deploy gate.

**Every AI call is metered and attributable.**
Tokens are captured per call, per user, per department, per process, with a monthly cost rollup. The badge in the UI shows what *this process* has consumed this month. No LLM invoice mystery — the ledger is a Postgres table.

**One port, one binary, one Postgres.**
The whole platform — engine, auth proxy, forms, documents, agent, designer APIs, even the Mailpit inbox (proxied at `/mailpit/`) — is **one Go binary on one port** with a Postgres database. No node cluster, no worker fleet, no separate identity service, no separate task service. You can read the whole backend in an afternoon; the entire source is Apache-2.0.

**The app knows its place.**
The React workspace has **zero LLM configuration** — no model names, no endpoints, no keys. Every AI capability (designer chat, AI Assist, document analysis) flows through the engine, where it's quota-gated and logged. That's why you can swap your LLM backend by editing one env var in docker compose and nothing in the app changes.

---

## So, who should care?

| You're running… | You'll hit this wall… | Oumma is for you when… |
|---|---|---|
| **n8n / Zapier** | The workflow needs a real human step, a real approval chain, or an auditor will ask "prove who did what" | your automation is a *business process* (onboarding, claims, orders with thresholds) rather than an integration glue |
| **Camunda** | You'd rather not operate a Java/Zeebe platform + build the identity and UI layers yourself | you want the same BPMN discipline with a working UI, IdP integration, metered AI and one-port deploy |
| **Spreadsheet + email + "call me"** | Nothing above, and your process still works — at the price of every handoff | you want the process to exist *somewhere* — designed, versioned, audited, and mostly self-driving |

The honest caveat: if you're gluing two SaaS tools together with no humans, no approvals and no compliance questions, **stay on n8n or Zapier** — that's their job and they do it well. Oumma earns its keep when the workflow *is* the business: regulated, multi-role, long-lived, and full of people.

---

## Try it

Everything in this article is reproducible from the repos:

- **Engine & backend** (Go): [github.com/AHBench/oumma](https://github.com/AHBench/oumma)
- **Agentic workspace** (React): [github.com/AHBench/oumma-app](https://github.com/AHBench/oumma-app)

Both Apache-2.0. `docker compose up` — one port, one Postgres — and you can watch a human task get created, permission-checked, completed, and routed, with the AI handling everything around it.

This is the first article of the **Oumma series** on [Dev.to](https://dev.to/tag/oumma) — the follow-ups take you inside the platform: the designer's tabs, roles & permissions, forms, the normal user's day, AI Assist, external integrations, versioning, the engine under the hood, and identity & quotas. New articles land on the series page as they publish — follow the tag so you don't miss them.
