# Anatomy of an Oumma Process — the Designer's Tabs, One by One

*Last time we built the Order Processing process from scratch — half by dragging, half by asking. This time we open the hood: a guided tour of every tab in the Process Design view, because knowing where each knob lives is what turns the Designer from a demo into a daily tool.*

**Series:** [Oumma](https://dev.to/tag/oumma) · previous: [Building a Business Process by Talking to an AI](https://dev.to/benchouia_ahmedabdelhaki/build-a-business-process-by-talking-to-an-ai-oumma-designer-mode-walkthrough-with-the-order-15n8)

Open any process in **Designer mode** and you get a header plus seven tabs:

**Process design** (the BPMN canvas) · **Overview** · **Forms** · **Roles & Permissions** · **Search items** · **Tools** · **Design versions**

Everything you do here lands in **one pending version** — no change is "live" until you deploy it from the versions tab, and running dossiers keep the version they started on. Let's go tab by tab.

## 1. The diagram — an interactive BPMN canvas

The default tab. The canvas renders the **pending design** (so every edit appears immediately; when there is no pending version it falls back to the deployed definition).

![BPMN canvas](img/04-canvas.png)

What the canvas gives you:

- **Node types** — `start`/`end` lifecycle circles, **human steps** (👤, showing their role), **system steps** (⚙, showing their tool or "not configured yet").
- **Gateway rendering** — parallel forks and joins are drawn as diamond marks on the connections (the "exclusive" branches keep their condition labels).
- **Four layout algorithms** — left→right, top→down, circular and force-directed, switchable from the toolbar.
- **Free placement** — drag *any* step anywhere to untangle a complicated design; connections follow. Placements are remembered per process; **Reset layout** returns to the algorithm.
- **Connect / Join** — from the step panel you can connect one step to another (optionally as a parallel **fork**) or make a step **wait for the join** of several predecessors.
- **Add steps** — toolbar buttons for human steps (pick the role) and system steps.
- **Click = configure** — clicking a step opens the right-hand configuration panel:

![Step configuration panel](img/05-step-panel.png)

The panel is where a step becomes real: rename it (durable — engine, forms and roles follow), set its role and description, connect or join it, or delete it. Everything applies instantly to the pending design.

> The chat does all of this too — the canvas and the design chat are two fronts on the same pending document. The canvas is for precise, spatial edits; the chat is for shaping and bulk changes.

## 2. Overview — the process header

The Overview tab edits the process *card*: display **name** (any language — renaming works even on deployed processes, it's a label), **description**, the **menu icon** (a searchable catalog of 284 icons, RTL/LTR-aware), company, launch role and shared processes. It also shows the process's technical id (immutable once deployed) and its launchability.

This is the tab to open when someone says "the menu shows the wrong name/icon for X".

## 3. Forms — the builder behind every step

![Forms tab](img/06-forms-tab.png)

Each step can own a **form** — the structured input the person (or the launch) fills. The tab lists every step that has one and opens the visual builder:

- **Field types** — text, number, date, list/choices, textarea, … (the authorized set — no free-for-all).
- **Required flags** — enforced client- and server-side; a dossier cannot pass a required field.
- **Trilingual labels** — every field label in EN/FR/AR, so the same form reads natively in all three languages of the workspace.
- **Form steps sync** — the engine's form steps can be synced from the design with one action.

Forms are also built conversationally ("give manual_review a form with a decision (required) and notes") — the chat JSON is converted into these same field definitions.

## 4. Roles & Permissions — who can do what

![Roles & Permissions tab](img/07-roles-tab.png)

The governance heart of a process:

- **Roles** — the Keycloak groups that participate (e.g. `Operateur` launch role, `cashier`, `management`).
- **Per-step assignment** — which role works each step.
- **Permission sets** — per role: complete / comment / attach / view. The engine enforces these on *every* action (task completion, comments, attachments) — driven solely by the token's groups, never by client claims.
- **Sync to identity** — one action syncs the designer's roles into Keycloak groups, so the org chart and the process stay consistent without the old manual `add-roles-*.sh` scripts.

Article 4 of the series goes end-to-end here: creating roles, configuring them, and proving the enforcement with two users on the same task.

## 5. Search items — the trilingual label catalog

![Search items tab (EN/FR/AR)](img/08-search-items-tab.png)

A process-level catalog of **labels only**: app menu items, form tab titles, process-data fields and form field labels — each with EN/FR/AR values. The app resolves **every** UI string through this catalog first, falling back to its own defaults. Editing a row re-labels the whole process in that language without touching code; adding a `hint` kind seeds the AI with context for the domain vocabulary.

If you want the process to *sound* French or Arabic in one place, this is it.

## 6. Tools — external systems as steps

![Tools tab](img/09-tools-tab.png)

The tab for the project's **MCP-like tool steps**: Gmail, Telegram, WhatsApp and generic HTTP webhooks, modeled as **system tasks** that execute *deterministically* when the process reaches them — zero LLM tokens.

Per tool you configure:

- **Credentials** (bot token, gateway API key, phone number id…) — secret fields are masked in the UI;
- **Input mapping** — each tool parameter ← a process-context key (`subject ← $subject`), resolved at runtime;
- **Dry-run vs live** — by default the engine builds the exact payload, logs it and simulates success; flip `MCP_TOOLS_DRY_RUN=false` for real delivery.

Article 8 walks a full dry-run→live story with an Order Processing payment call.

## 7. Design versions — the only tab the AI never touches

![Design versions tab](img/10-versions-tab.png)

The versioning model in one tab:

- **Single pending version** — every design write (chat or canvas) accumulates into *one* pending document.
- **Automatic semver** — the pending version is compared against the deployed one: a new task/topology change = *major*, a role or step-id change = *minor*, a label/config tweak = *patch*.
- **Deploy / Discard** — human-only buttons. Deploy registers the definition with the engine; discard throws the pending work away.
- **History** — every deployed version with its document, inspectable at any time.

Two safety rails live here too: a process that was **never deployed** is invisible to the engine (not launchable, not listed), and a project can only be **deleted** if no instance was ever executed.

## Putting it together

The tabs are a division of labor:

| Tab | Question it answers |
|---|---|
| Diagram | *How does the process flow?* |
| Overview | *What is it called, and what does it look like in the menu?* |
| Forms | *What does each step ask for?* |
| Roles & Permissions | *Who may do each step, and what may they see?* |
| Search items | *What does it say, in each language?* |
| Tools | *Which external systems does it talk to?* |
| Design versions | *Is it ready, and what changed?* |

Next in the series: **Roles, Groups and Permissions** — we create the roles from this tab, sync them to Keycloak, and watch the same task succeed for one user and fail for another.

---

*Oumma: Go workflow engine + React agentic workspace. Article 3 of the Oumma series on [Dev.to](https://dev.to/tag/oumma). Source code: the Go engine in [AHBench/oumma](https://github.com/AHBench/oumma) and the React workspace in [AHBench/oumma-app](https://github.com/AHBench/oumma-app) — both Apache-2.0.*
