---
title: "Oumma from Zero: Installing the Engine, the Web App and Keycloak (A Guide for Absolute Beginners)"
series: "Building Oumma — an agentic workflow platform you can deploy yourself"
part: 12
tags: [tutorial, self-hosting, keycloak, docker, workflow, agentic, oumma]
reading_time: 15 min
---

# Oumma from Zero: Installing the Engine, the Web App and Keycloak

*This is the "make it run on my machine" episode of the Oumma series. If you've read the previous articles you know what Oumma does: a platform where business processes are designed in a browser, executed by an engine that mixes **human steps** (a person approves, reviews, fills a form) with **AI and system steps** (an LLM routes, a tool sends a WhatsApp message, an HTTP call validates data) — with real permissions, real audit logs, and a real database.*

*Today: you install all of it yourself. I'll assume you can open a terminal and paste a command — nothing more. If you've ever installed WordPress or Nextcloud, you can follow this. If you've never done anything like that, read the "What is each piece" section first and paste carefully.*

You'll end up with a working test environment, exactly like mine:

| Piece | URL | What it is |
|---|---|---|
| Web app | `http://localhost:5173` | What humans use (login, My Tasks, My Dossiers, Designer) |
| Engine API | `http://localhost:8095` | The Go engine that executes processes |
| Keycloak | `http://localhost:8080` | Login / identity (who you are, which groups, which department) |
| Postgres | `http://127.0.0.1:5433` (local only) | Where everything is stored |

## What is each piece (before we touch the keyboard)

Think of it like a restaurant:

- **Keycloak** is the **bouncer at the door**. It checks who you are, gives you a ticket (a *token*) that says "this is Hassan, he's an *Operateur*, he works in departments `100,10`". Nobody enters the restaurant without this ticket.
- **The engine (Oumma)** is the **kitchen**. It receives orders (a new process instance), works through the recipe (the process definition), pauses when a human must act, and resumes when the human answers.
- **The web app** is the **dining room + waiter**. It's what you see: login page, task lists, forms, the process designer.
- **Postgres** is the **ledger**. Every step, every form value, every audit entry.
- **An LLM** (any OpenAI-compatible API — local or cloud) is the **head chef's judgment**: it routes steps, answers questions, reads documents.

Two things to know before we start:

1. **Docker does the heavy lifting.** The engine, its database, and the mail server all run as containers — one command each. You do *not* install Go or Postgres on your machine.
2. **Nothing here touches real customers.** The WhatsApp/Telegram/email tools run in *dry-run* mode by default (they build the message, log it, pretend it was sent). This is a safe test environment.

---

## Part 0 — Prerequisites

You need, in order of importance:

1. **A machine with Docker + Docker Compose.**
   - *Mac/Windows:* install [Docker Desktop](https://www.docker.com/products/docker-desktop/). That's it.
   - *Linux VPS (5€–10€/month is enough):* install the [Docker Engine + Compose plugin](https://docs.docker.com/engine/install/).
   - **4 GB RAM minimum, 8 GB comfortable** (Keycloak is the heaviest piece, it likes ~1 GB).
2. **Git** — to download the two repositories. (`brew install git` / `sudo apt install git`)
3. **Node.js 20+** — only for the web app, if you run it in "development" mode (I recommend this for a test environment). `node -v` should print v20 or higher.
4. **An LLM endpoint** that speaks the OpenAI API format. Three easy options:
   - an **OpenAI / Groq / Mistral** account + API key (fastest to try, a few cents of usage),
   - a **local Ollama** (free, `http://localhost:11434/v1`),
   - a **local vLLM** server (free, what I use in production).

   For this guide I'll use a generic key — swap in whatever you have.

5. Patience. The first build downloads ~1 GB of images.

**Check your setup:**

```bash
docker version        # prints client + server versions → OK
docker compose version
git --version
node -v               # v20 or newer
```

If `docker version` complains about permissions (Linux), add your user to the `docker` group and log out/in.

---

## Part 1 — Keycloak: the bouncer

We'll run the official Keycloak image with a persistent database. Create a folder and put everything in it:

```bash
mkdir -p ~/oumma && cd ~/oumma
```

### 1.1 Start Keycloak

Save this as `keycloak/docker-compose.yml`:

```yaml
services:
  keycloak:
    image: quay.io/keycloak/keycloak:latest
    command: ["start-dev", "--http-port=8080"]
    environment:
      KEYCLOAK_ADMIN: admin
      KEYCLOAK_ADMIN_PASSWORD: ChangeMe_Admin_102030
      KC_DB: postgres
      KC_DB_URL: "jdbc:postgresql://postgres:5432/keycloak_db"
      KC_DB_USERNAME: keycloak
      KC_DB_PASSWORD: ChangeMe_KC_102030
    ports:
      - "8080:8080"
    depends_on:
      postgres:
        condition: service_healthy

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: keycloak_db
      POSTGRES_USER: keycloak
      POSTGRES_PASSWORD: ChangeMe_KC_102030
    volumes:
      - kc-pg-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U keycloak"]
      interval: 5s
      retries: 10

volumes:
  kc-pg-data:
```

> `start-dev` mode is for **test environments only** — it prints everything and skips TLS. Never put this on the internet as-is.

```bash
cd keycloak
docker compose up -d
docker compose logs -f keycloak   # wait for "started in Xs" (≈30s first time)
```

Open **http://localhost:8080** → *Administration Console* → log in with `admin` / `ChangeMe_Admin_102030`.

If you see the console: **congratulations, the hardest infra piece is done.**

### 1.2 Create the realm (a "tenant" inside Keycloak)

In the admin console:

1. Crown icon (top-left) → **Create realm** → name: `brief-test-realm` → Create.
2. Click into it.

A *realm* is a self-contained identity world: its own users, groups, clients. Oumma lives in one realm.

### 1.3 Create the clients (the "apps" that are allowed to ask for tickets)

**Client A — the web app** (this is what your browser logs in with):

1. *Clients* → **Create client**
   - Client ID: `briefuserapp`
   - Client type: **Confidential** (or *Public* — both work; the engine only *validates* tokens, it doesn't log people in)
   - Client authentication: off if Public
2. *Client* tab → **Valid redirect URIs**: `http://localhost:5173/*`
   (and `http://127.0.0.1:5173/*` for good measure)
3. *Authentication* tab → leave defaults. The web app logs in via the **resource owner password** flow through a small proxy — see below.

**Client B — the engine** (a "service account" the backend uses for admin operations):

1. *Clients* → **Create client**
   - Client ID: `oumma-admin`
   - Client authentication: **on**
2. Copy the **Client secret** from the *Credentials* tab — you'll need it in the engine's `.env`.
3. *Service account roles* tab → add: `realm-admin` (for a test environment; a production setup would scope this down).

> **Why two clients?** The browser and the backend have different relationships with Keycloak: the browser needs to log in *people*, the backend needs to be *trusted on its own* (service account). Mixing them is a classic beginner security mistake.

### 1.4 Create the groups (who can do what)

*Groups* → **Create group**. Make these four (the names are what Oumma's processes will reference):

```
Operateur
cashier
management
Designer
```

That's it — no roles needed for a first test. Oumma maps *groups* to *process access*: "the `Operateur` group can act on the *confirm order* step". (If you want to read the theory: episode 3 of the series.)

### 1.5 Create your first user (and the `department` attribute)

*Users* → **Create user**:

- Username: `operateur10`, email: anything, **Enabled: on**
- *Credentials* tab → set password: `password` (test environment!)
- *Groups* tab → join group: `Operateur`
- *Attributes* tab → add one attribute:
  - Name: `department`
  - Value: `100,10`

> **This `department` attribute is the one people miss.** Oumma can gate tasks per department ("only branch 10 sees these dossiers"). It travels inside the user's token. If the attribute is missing, the token says `department: null` and department-gated lists will look empty. Comma-separated codes are supported (`100,10` = the user belongs to two).

Repeat with two more users so you can test the full chain (this is what I use):

| User | Group | `department` attr |
|---|---|---|
| `operateur10` | `Operateur` (+ `cashier`) | `100,10` |
| `branchmanager_1001` | `management` | `10` |
| `fake_admin` | `Designer` | *(none)* |

Save the admin password of your Keycloak console somewhere safe. You'll use it to add users later.

---

## Part 2 — The engine (the kitchen)

### 2.1 Clone it

```bash
cd ~/oumma
git clone https://github.com/AHBench/oumma.git
cd oumma
```

### 2.2 Configure it

```bash
cp .env.example .env
nano .env
```

You only *really* need to touch four blocks:

```ini
# --- 1. The LLM (head chef) ---
OPENAI_BASE_URL=https://api.groq.com/openai/v1     # or your Ollama: http://host.docker.internal:11434/v1
OPENAI_MODEL=llama-3.3-70b-versatile               # any model that endpoint serves
OPENAI_API_KEY=sk-your-key-here

# --- 2. Keycloak (the bouncer) ---
KEYCLOAK_URL=http://host.docker.internal:8080      # host.docker.internal = "the machine running docker"
KEYCLOAK_REALM=brief-test-realm
KEYCLOAK_CLIENT_ID=briefuserapp
KEYCLOAK_ADMIN_CLIENT_ID=oumma-admin
KEYCLOAK_ADMIN_CLIENT_SECRET=paste-the-secret-from-1.3

# --- 3. Tools: keep dry-run ON for a test environment ---
MCP_TOOLS_DRY_RUN=true
```

Everything else in `.env.example` has working defaults — the file is commented, read it once.

> **`host.docker.internal`** — containers can't say "localhost" to mean *your* machine (they'd mean *the container*). On Docker Desktop (Mac/Windows) `host.docker.internal` works out of the box. On Linux you need `extra_hosts: ["host.docker.internal:host-gateway"]` — the shipped compose files already include it.

### 2.3 Start it

```bash
docker compose -f docker-compose.yaml -f docker-compose.local.yml up -d --build
```

First build takes a few minutes (it compiles Go). Then:

```bash
curl http://localhost:8095/health
# → {"status":"ok"}
```

That's the whole engine. Postgres started with it (on `127.0.0.1:5433`, loopback only), and all tables are **created automatically** — there is no manual migration step. A reference snapshot of the full schema lives in the repo at `migrations/schema-reference-latest.sql` if you're curious what it looks like.

---

## Part 3 — The web app (the dining room)

### 3.1 Clone + install

```bash
cd ~
git clone https://github.com/AHBench/oumma-app.git
cd oumma-app
npm install
```

### 3.2 Tell it where things are

Create a `.env.local` in the same folder (the defaults already point at `localhost` — this file only matters if your layout differs):

```ini
VITE_PROCESS_URL=http://localhost:8095
VITE_AUTH_BACKEND_URL=http://localhost:8095/api/auth
VITE_USER_PROCESSES_URL=http://localhost:8095/api/user-processes
```

> **Beginner warning #1:** if you change a `VITE_` variable, restart `npm run dev` — Vite reads these at startup, not live.

### 3.3 Start it

```bash
npm run dev
# → Local: http://localhost:5173/
```

Open **http://localhost:5173** — you should see the login page. Log in with `operateur10` / `password`.

If you land on the process apps list: **the full stack is working.** 🎉

---

## Part 4 — First smoke test (2 minutes)

1. As `operateur10`: open the **order-processing** sample process (it ships in the repo's `workflows/` folder — the engine loads it at startup).
2. You'll see a **My Tasks** view. To get a task there, launch an instance (create a form in the *My Dossiers* tab, or via the Request tab).
3. Complete the first task with **Yes — approve**.
4. Log out, log in as `operateur10` again (same user is also the cashier) → a **manual review** task appears. Approve → the instance finishes.

You've just executed a 4-step agentic process with 2 human steps, an HTTP validation step, and (dry-run) WhatsApp notifications. That's the whole product in 2 minutes.

---

## Troubleshooting — the 10 things that go wrong (and their fixes)

| # | Symptom | Almost always the cause → fix |
|---|---|---|
| 1 | `curl :8095/health` → connection refused | Engine not up yet → `docker compose logs oumma`. First build is slow; also check `docker compose ps` for crashed containers |
| 2 | Login fails with `invalid_credentials` | Wrong user/password, **or** you created the user in the *master* realm instead of `brief-test-realm` → check the realm selector (crown) |
| 3 | Login OK but **no processes visible** | The user's Keycloak **groups** don't match the process's role requirements → join the user to `Operateur` (Groups tab of the user) |
| 4 | Processes visible but **My Dossiers / department lists empty** | Missing `department` **user attribute** (not a group!) → Attributes tab → `department` = `10`, then re-login (the value lives in the token) |
| 5 | Tasks complete but **nothing advances** | LLM not reachable from the engine → `docker compose logs oumma \| grep -i llm`. Remember: from inside the container, "your machine" is `host.docker.internal`, not `localhost` |
| 6 | Port already in use (`:8080` taken) | Something else uses 8080 → change the *host* side: `"8081:8080"` in the Keycloak compose, and update `KEYCLOAK_URL` in the engine's `.env` |
| 7 | Web app loads but **login page errors in the browser console** | CORS or wrong auth URL → check `VITE_AUTH_BACKEND_URL` points at `:8095/api/auth` and the redirect URIs include `http://localhost:5173/*` |
| 8 | Designer chat doesn't answer | The *designer* LLM variables (`DESIGNER_OPENAI_*`) are empty or broken → it falls back to the main LLM; check those vars too |
| 9 | `npm run dev` says `EADDRINUSE` | Another dev server on 5173 → `npm run dev -- --port 5174` (then use 5174 everywhere in that session) |
| 10 | Everything worked, then broke after you **changed a process in the designer** | The browser caches process config aggressively → **hard reload (Cmd/Ctrl+Shift+R) and re-login** |

**The universal debug trio**, when in doubt:

```bash
docker compose ps                     # what's actually running?
docker compose logs --tail 50 oumma   # what did the engine just say?
docker compose logs --tail 20 keycloak
```

---

## Security checklist before you share the environment

Even a *test* environment should be tidy:

- [ ] Keycloak admin password ≠ `admin`/`admin` (yours: `ChangeMe_Admin_102030` — change it)
- [ ] Keycloak **not exposed publicly** — bind to `127.0.0.1:8080` if on a VPS, or put it behind a VPN/Tailscale
- [ ] Engine Postgres stays on `127.0.0.1:5433` (loopback only) — it's there so *you* can peek with a DB tool
- [ ] `MCP_TOOLS_DRY_RUN=true` until the day you deliberately wire real WhatsApp/Telegram credentials
- [ ] Rotate any LLM API key that was ever pasted into a chat, a screenshot, or a repo

---

## What's next

You now own a full agentic workflow platform on your machine. The natural next episodes:

- **Episode 2** — design your first process in the designer (no code)
- **Episode 3** — how roles, groups and permissions actually gate tasks
- **Episode 5** — a full day in the life of a normal user
- **Episode 7** — wiring real external systems (MCP-like tools)

The whole series is cross-linked on Dev.to — and the engine's README has the production-oriented notes (TLS, real Postgres sizing, monitoring).

*Found a step that fails on your machine? That's a bug report waiting to happen — the issues tab is open, beginners especially welcome. This guide is only as good as the installs it survives.*
