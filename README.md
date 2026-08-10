# VocalLabs AgentFlow — AI Agent Workflow Builder

A full-stack, multi-tenant AI Agent Workflow Builder (mini n8n) built with **Nhost + Hasura + PostgreSQL + GraphQL + Next.js 14**.

---

## Architecture Overview

```
                        ┌──────────────────────┐
                        │       Next.js        │
                        │                      │
                        │ Workflow Builder     │
                        │ Run Dashboard        │
                        │ Approval UI          │
                        └──────────┬───────────┘
                                   │
                          GraphQL Queries/
                          Mutations/
                          Subscriptions
                                   │
                                   ▼
                        ┌──────────────────────┐
                        │       Hasura         │
                        │                      │
                        │ GraphQL API          │
                        │ Permissions          │
                        │ Actions              │
                        │ Event Triggers       │
                        │ Subscriptions        │
                        └──────────┬───────────┘
                                   │
                                   ▼
                        ┌──────────────────────┐
                        │     PostgreSQL       │
                        │                      │
                        │ auth.users (Nhost)   │
                        │ Organizations        │
                        │ Members              │
                        │ Workflows            │
                        │ Steps                │
                        │ Triggers             │
                        │ Workflow Runs        │
                        │ Step Runs            │
                        │ Data Records         │
                        └──────────┬───────────┘
                                   │
                             Hasura Action
                                   │
                                   ▼
                        ┌──────────────────────┐
                        │  Next.js Backend     │
                        │  / API Functions     │
                        │                      │
                        │ Authorization        │
                        │ Quota                │
                        │ Workflow Engine      │
                        │ Retry Logic          │
                        │ Pause/Resume         │
                        └──────────┬───────────┘
                                   │
               ┌───────────────────┼──────────────────┐
               ▼                   ▼                  ▼
            Gemini             External API       Notification


            TRIGGERS

Manual ────────────────┐
                       │
Webhook ───────────────┤
                       ├──→ triggerWorkflowRun()
Scheduled ─────────────┤
                       │
Database Event ────────┘
```

---

## Key Features

1. **Two-Layer Permission System**:
   - **Layer 1 (Org + Role Scoping)**: Row-level database permissions ensuring users in Org A cannot read, edit, or trigger workflows in Org B.
   - **Layer 2 (Step-Level Gating & Action Validation)**: Only `owner` role can add sensitive step types (`db_write`, `webhook`, `notify`). Mid-execution `approval_gate` steps require Action backend role validation before resuming.
2. **Hasura Actions & Event Engine**:
   - `triggerWorkflowRun(workflow_id)`: Quota check, retry logic (up to 3 retries for LLM/HTTP steps), sequential step execution, and quota incrementing.
   - `approveStep(step_run_id)`: Role validation and mid-execution resume.
   - Inbound HTTP Webhooks, Scheduled Cron jobs, and Hasura Event Triggers.
3. **Real LLM API Integration**:
   - Integrated with Gemini API (`gemini-2.5-flash`) with prompt context interpolation (`{{step1.sentiment}}`) and automatic fallback mode with 800ms delay.
4. **Live GraphQL Subscriptions**:
   - Real-time step progress streaming over WebSockets/SSE without page refresh.

---

## Quick Start (Local Running)

### 1. Install Dependencies & Run Next.js Server
```bash
npm install
npm run dev
```
Open `http://localhost:3000` in your browser.

### 2. Docker & Hasura Engine (Optional Full Stack Spin-Up)
```bash
docker-compose up -d
```

---

## Final Task Walkthrough Scenario (6-Step Verification)

1. **Multi-Tenant Context**: Two distinct organizations exist:
   - **Org A**: Acme AI Corp (`aaaaa-11111-org-a`) — Alice (Owner), Bob (Editor), Charlie (Viewer)
   - **Org B**: Beta Dynamics (`bbbbb-22222-org-b`) — David (Owner), Eva (Editor)
2. **Workflow Construction**: Logged in as Alice (Org A Owner), view the 6-step workflow containing `llm_call`, `http_request`, `conditional_branch`, `approval_gate`, `db_write`, and `notify`.
3. **Execution Triggers**:
   - Click **Trigger Workflow Run** (Manual Trigger).
   - Or click **Test POST** (Inbound Webhook Trigger).
4. **Live Streaming & Pause State**:
   - Watch live per-step execution stream via GraphQL Subscriptions.
   - Run automatically pauses at Step #4 (`approval_gate`) and displays the pulsing amber Approval Card: *"Awaiting Approval: Step #4"*.
5. **Role-Gated Approval Resume**:
   - Click **Approve & Resume Step** as Alice (Owner) or Bob (Editor) -> Step completes, and execution resumes through Steps #5 & #6 to completion.
6. **Cross-Org & ID-Guessing Isolation**:
   - Switch active user to **David (Org B Owner)**.
   - Navigate to **Security & ID-Guessing Matrix** tab and click **Execute Security Test Suite**.
   - Verifies that Org B user querying Org A workflow ID or calling `triggerWorkflowRun`/`approveStep` directly gets `403 Forbidden` / 0 results.

---

## Deliverables Checklist
- [x] Hasura migrations DDL (`hasura/migrations/schema.sql`)
- [x] Hasura metadata JSON (`hasura/metadata/hasura_metadata.json`)
- [x] Next.js Action Handlers (`app/api/actions/trigger/route.ts`, `app/api/actions/approve/route.ts`)
- [x] 1-Page Architectural Write-Up (`DOCUMENTATION.md`)
- [x] Docker & Deployment Configuration (`docker-compose.yml`, `Dockerfile`, `.env.example`)
