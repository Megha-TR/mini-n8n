# Mini-n8n: Multi-Tenant AI Agent Workflow Builder

A purpose-built AI Agent Workflow Builder using **Next.js 14**, **Hasura GraphQL Engine**, **PostgreSQL 15**, and **Google Gemini API**.

---

## Architecture

### How Data Flows at Runtime

```
Browser (React)
  ↓ GraphQL query + x-hasura-user-id / x-hasura-role headers
/api/graphql (Next.js route)
  ↓ Proxies to Hasura with admin secret + session headers
Hasura GraphQL Engine (port 8080)
  ↓ Evaluates permission rules against org_members table
PostgreSQL (port 5432)
```

**Every GraphQL query from the frontend is proxied through `/api/graphql` directly to the Hasura GraphQL Engine.** Hasura evaluates its metadata permission rules (defined in `hasura/metadata/hasura_metadata.json`) against the PostgreSQL `org_members` table to enforce row-level access control. There is no in-memory data store — all runtime state lives in PostgreSQL.

### Layer 1: Hasura DB-Level Permissions

Hasura metadata defines `select_permissions` on every table with filters like:

```json
{
  "filter": {
    "organization": {
      "members": {
        "user_id": { "_eq": "X-Hasura-User-Id" }
      }
    }
  }
}
```

This means a user can only see workflows, runs, and step_runs belonging to organizations they are a member of. This is enforced by Hasura at the database query level, not by application code.

### Layer 2: Action Handler Gatekeepers

Sensitive operations (triggering runs, approving gates) go through Hasura Action handlers (`/api/actions/trigger`, `/api/actions/approve`) which verify org membership and role via Hasura admin queries before executing.

### Workflow Engine

`lib/workflowEngine.ts` orchestrates step execution. Every state change (creating workflow_runs, updating step_runs, incrementing org quota) is performed via GraphQL mutations to Hasura using `lib/hasuraAdmin.ts` — a server-side client that authenticates with the Hasura admin secret.

---

## Quick Start (Local Docker Setup)

**Prerequisites**: Docker and Docker Compose installed.

```bash
# 1. Clone
git clone https://github.com/Megha-TR/mini-n8n.git
cd mini-n8n

# 2. Configure
cp .env.example .env.local
# Optionally set GEMINI_API_KEY for real LLM responses

# 3. Start everything
docker compose up --build
```

This starts:
- **PostgreSQL 15** on port 5432 (auto-runs `hasura/migrations/schema.sql` which creates tables and seeds test data)
- **Hasura GraphQL Engine** on port 8080 (console at `http://localhost:8080/console`, admin secret: `myadminsecretkey`)
- **Next.js App** on port 3000

### Without Docker (frontend only, requires external Hasura)

```bash
npm install
# Set HASURA_GRAPHQL_URL and HASURA_GRAPHQL_ADMIN_SECRET in .env.local
npm run dev
```

---

## Test Users (Seeded in PostgreSQL)

| Organization | User | Role | Can Trigger | Can Approve | Can Add db_write |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Acme AI Corp (Org A) | Alice | Owner | Yes | Yes | Yes |
| Acme AI Corp (Org A) | Bob | Editor | Yes | Yes | No |
| Acme AI Corp (Org A) | Charlie | Viewer | No | No | No |
| Beta Dynamics (Org B) | David | Owner | Yes | Yes | Yes |
| Beta Dynamics (Org B) | Eva | Editor | Yes | Yes | No |

Cross-org isolation: David (Org B) cannot see or interact with Org A's workflows. This is enforced by Hasura's permission rules at the database level.

---

## Key Files

| File | Purpose |
| :--- | :--- |
| `lib/hasuraAdmin.ts` | Server-side Hasura GraphQL client (admin secret auth) |
| `lib/hasuraClient.ts` | Browser-side GraphQL client (calls `/api/graphql` proxy) |
| `app/api/graphql/route.ts` | Pure proxy to Hasura Engine — no in-memory fallback |
| `lib/workflowEngine.ts` | Step execution engine — all DB ops via Hasura mutations |
| `lib/authContext.ts` | Org membership verification via Hasura queries |
| `lib/stepExecutors/dbWrite.ts` | Inserts `data_records` via Hasura mutation |
| `lib/db.ts` | Type definitions and seed constants only (no runtime store) |
| `hasura/migrations/schema.sql` | PostgreSQL schema + seed data |
| `hasura/metadata/hasura_metadata.json` | Hasura permission rules, relationships, actions |
| `docker-compose.yml` | PostgreSQL + Hasura + Next.js orchestration |

---

## Step Types

1. **llm_call** — Calls Gemini API (or runs with disclosed 800ms stub if no API key)
2. **http_request** — Makes external HTTP requests with retry logic
3. **conditional_branch** — Evaluates expressions against prior step outputs
4. **approval_gate** — Pauses execution until an Owner/Editor approves
5. **db_write** — Inserts a `data_records` row via Hasura mutation (Owner-only creation)
6. **notify** — Dispatches notification events
