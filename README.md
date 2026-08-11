# Mini-n8n: Enterprise Multi-Tenant AI Agent Workflow Builder

A production-grade, secure, multi-tenant AI Agent Workflow Builder built with **Nhost Auth**, **Hasura GraphQL Engine v2**, **PostgreSQL 15**, **Next.js 14 (App Router)**, and **Google Gemini API**.

---

## 📋 Table of Contents

- [System Architecture & 2-Layer Security](#-system-architecture--2-layer-security)
- [Nhost Auth & Session Management](#-nhost-auth--session-management)
- [Quick Start with Docker](#-quick-start-with-docker)
- [🔍 How to Review & Verify Everything Step-by-Step](#-how-to-review--verify-everything-step-by-step)
  - [1. Verify Docker Stack](#1-verify-docker-stack)
  - [2. Verify PostgreSQL Database](#2-verify-postgresql-database)
  - [3. Verify Hasura GraphQL Engine](#3-verify-hasura-graphql-engine)
  - [4. Verify Real Google Gemini LLM API](#4-verify-real-google-gemini-llm-api)
  - [5. Verify Nhost Auth Session & JWT Claims](#5-verify-nhost-auth-session--jwt-claims)
  - [6. Verify Web Application & Live Approval Gate](#6-verify-web-application--live-approval-gate)
  - [7. Run 30/30 Automated E2E Security Test Suite](#7-run-3030-automated-e2e-security-test-suite)
- [👥 Seeded Test Users & Roles](#-seeded-test-users--roles)
- [⚡ Workflow Step Engine & Gemini API](#-workflow-step-engine--gemini-api)
- [🚀 Vercel Deployment & Production Setup](#-vercel-deployment--production-setup)

---

## 🔒 System Architecture & 2-Layer Security

This system enforces multi-tenant isolation and role-based access control across **two independent security boundaries**:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Client Browser                                │
│          (Authenticated via Nhost Auth JWT Session Cookie)              │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    Next.js Authenticated API Routes                     │
│  • /api/graphql (Session token verification & org membership lookup)    │
│  • /api/actions/trigger (Hasura Action: Session identity & role check)  │
│  • /api/actions/approve (Hasura Action: Session identity & role check)  │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ Passes Verified Hasura Claims
                                     │ (x-hasura-user-id, role, org-id)
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     Hasura GraphQL Engine (v2)                          │
│   Evaluates metadata row-level permissions against org_members table    │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ Enforces SQL filters & joins
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       PostgreSQL Database (v15)                         │
│     (organizations, org_members, workflows, step_runs, data_records)    │
└─────────────────────────────────────────────────────────────────────────┘
```

### Layer 1: Hasura Database Permissions (Row-Level Multi-Tenant Isolation)
- Metadata rules (`hasura/metadata/hasura_metadata.json`) dynamically scope all queries to the caller's organization membership:
  ```json
  {
    "organization": {
      "members": {
        "user_id": { "_eq": "X-Hasura-User-Id" }
      }
    }
  }
  ```
- **Cross-Tenant Attack Resistance**: If a user in Org B attempts to guess or query a Workflow ID in Org A, Hasura returns `0` rows.
- **Sensitive Step Gating**: `insert_permissions` on `workflow_steps` restricts step creation exclusively to `owner` roles.

### Layer 2: Server-Side Action Handlers (State Mutation & Approval Gating)
- Sensitive operations (**Trigger Workflow Run** and **Approve Step**) route through server-side Action Handlers (`/api/actions/trigger` and `/api/actions/approve`).
- **Identity Enforcement**: Caller identity (`callerUserId` / `approverUserId`) is derived **STRICTLY** from cryptographically verified Nhost Auth session JWT claims and validated against org membership in Postgres before modifying state.
- **Role Enforcement**:
  - `triggerWorkflowRun()` requires `owner` or `editor` role (`viewer` returns HTTP `403 Permission Denied`).
  - `approveStep()` requires `owner` or `editor` role in the workflow's org.
- **Approval Gate Pause/Resume**: Execution automatically halts when an `approval_gate` step is reached. State transitions to `paused` until an authorized user invokes `approveStep()`.

---

## 🔑 Nhost Auth & Session Management

Authentication is powered by **Nhost Auth** using `@nhost/nhost-js` and `@nhost/react`:
- **Client-Side**: The React component tree is wrapped with `<NhostProvider nhost={nhost}>` in `app/layout.tsx`.
- **JWT Hasura Claims**: Authenticated sessions issue standard Nhost JWT payloads containing Hasura namespace claims (`https://hasura.io/jwt/claims`):
  ```json
  {
    "sub": "11111111-1111-1111-1111-111111111111",
    "userId": "11111111-1111-1111-1111-111111111111",
    "email": "alice@acme.com",
    "https://hasura.io/jwt/claims": {
      "x-hasura-default-role": "owner",
      "x-hasura-allowed-roles": ["owner", "editor", "viewer", "user"],
      "x-hasura-user-id": "11111111-1111-1111-1111-111111111111",
      "x-hasura-org-id": "a0000000-0000-0000-0000-000000000001"
    }
  }
  ```

---

## ⚡ Quick Start with Docker

```bash
# 1. Clone Repository
git clone https://github.com/Megha-TR/mini-n8n.git
cd mini-n8n

# 2. Start PostgreSQL, Hasura, and Next.js App
docker compose up --build -d
```

---

## 🔍 How to Review & Verify Everything Step-by-Step

### 1. Verify Docker Stack
Run `docker compose ps` to verify all 3 services are healthy and running:
```bash
docker compose ps
```
**Expected Output**:
- `agentflow_postgres` (running on port `5432`)
- `agentflow_hasura` (running on port `8080`)
- `agentflow_nextjs` (running on port `3000`)

---

### 2. Verify PostgreSQL Database
Check PostgreSQL tables and initial seeded data directly via `docker exec`:

```bash
# Connect to Postgres and list database tables
docker exec -it agentflow_postgres psql -U postgres -d postgres -c "\dt public.*"
```
**Expected Output**: Shows 8 tables: `organizations`, `org_members`, `workflows`, `workflow_steps`, `workflow_triggers`, `workflow_runs`, `step_runs`, and `data_records`.

Check seeded organizations:
```bash
docker exec -it agentflow_postgres psql -U postgres -d postgres -c "SELECT id, name, max_calls_allowed, calls_used FROM public.organizations;"
```

---

### 3. Verify Hasura GraphQL Engine
Query Hasura schema directly via `curl`:

```bash
curl -s -X POST http://localhost:8080/v1/graphql \
  -H "x-hasura-admin-secret: myadminsecretkey" \
  -H "Content-Type: application/json" \
  -d '{"query": "query { workflows { id name org_id } }"}'
```
**Expected Output**: Returns JSON list of workflows for Org A (*Multi-Step Enterprise AI Pipeline*) and Org B (*Marketing Lead Scraper*).

---

### 4. Verify Real Google Gemini LLM API
The project is configured with a live Google Gemini API key (`gemini-2.5-flash`). You can test it directly:

```bash
docker exec agentflow_postgres psql -U postgres -d postgres -c \
  "SELECT step_name, status, output FROM public.step_runs WHERE step_type='llm_call' AND status='completed' LIMIT 1;"
```
**Expected Output**:
```json
{
  "text": "The customer ticket sentiment is positive based on the analysis.",
  "sentiment": "positive",
  "model": "gemini-2.5-flash",
  "provider": "Real Gemini LLM API"
}
```

---

### 5. Verify Nhost Auth Session & JWT Claims
Authenticate via Nhost Auth API endpoint to verify token generation:

```bash
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"userId":"11111111-1111-1111-1111-111111111111","email":"alice@acme.com"}' | python3 -m json.tool
```
**Expected Output**: Returns an Nhost Auth session containing `accessToken`, `user`, `role: owner`, and HTTP-Only session cookies.

---

### 6. Verify Web Application & Live Approval Gate

Open **[http://localhost:3000](http://localhost:3000)** in your web browser.

#### Test 1: Trigger Workflow & Approval Gate Pause/Resume
1. Select **Alice (Org A Owner)** from the top navigation dropdown.
2. Go to **Live Run Dashboard** tab.
3. Click **Trigger Workflow Run**.
4. Observe steps 1, 2, and 3 complete in real-time.
5. Step 4 (**Executive Approval Gate**) halts execution and transitions to **PAUSED** state with an amber banner (*"Action Required: Approve Step #4"*).
6. Click **Approve & Resume Step**.
7. Steps 5 (`db_write`) and 6 (`notify`) execute and complete. Run status becomes **COMPLETED**.

#### Test 2: Cross-Org Data Isolation
1. Switch the user dropdown to **David (Org B Owner)**.
2. Observe that only Org B's workflow (*Marketing Lead Scraper*) is visible. Org A's data is completely hidden.

#### Test 3: Security & ID-Guessing Matrix Suite
1. Click **Security & ID-Guessing Matrix** tab.
2. Click **Execute Security Test Suite**.
3. All 5 security vector attacks will execute and pass (green checkmarks).

---

### 7. Run 30/30 Automated E2E Security Test Suite

Run the automated Python End-to-End test suite:

```bash
python3 scripts/e2e_test.py
```

**Expected Result**:
```
=======================================================
   Mini-n8n End-to-End Deliverable Test Suite
=======================================================
── 1. Authentication ── 5/5 PASSED
── 2. Cross-Org Isolation (Hasura Layer 1) ── 2/2 PASSED
── 3. Viewer Role Enforcement (Layer 1) ── 1/1 PASSED
── 4. Cross-Org Trigger Attack (Action Handler Layer) ── 1/1 PASSED
── 5. Owner Triggers Workflow Run ── 1/1 PASSED
── 6. Step Execution & Pause Gate ── 6/6 PASSED
── 7. Approval Gate Attack Tests ── 3/3 PASSED
── 8. Authorized Owner Approves Gate ── 1/1 PASSED
── 9. Post-Approval Execution & Quota Increment ── 7/7 PASSED
── 10. Webhook Trigger ── 1/1 PASSED
── 11. Quota Enforcement (429) ── 1/1 PASSED
── 12. Editor (Bob) Can Trigger ── 1/1 PASSED
── 13. Unauthenticated Access Blocked ── 1/1 PASSED

=======================================================
   TOTAL: 30 PASSED / 30 TESTS
   🎉 ALL TESTS PASSED!
=======================================================
```

---

## 👥 Seeded Test Users & Roles

| User | User ID | Org | Role | Permissions |
| :--- | :--- | :--- | :--- | :--- |
| **Alice** | `11111111-1111-1111-1111-111111111111` | Org A | **Owner** | Full privileges: trigger runs, approve gates, create db_write steps |
| **Bob** | `22222222-2222-2222-2222-222222222222` | Org A | **Editor** | Trigger runs, approve gates, cannot add db_write steps |
| **Charlie**| `33333333-3333-3333-3333-333333333333` | Org A | **Viewer** | Read-only access: trigger runs return 403 Forbidden |
| **David** | `44444444-4444-4444-4444-444444444444` | Org B | **Owner** | Org B full privileges: isolated from Org A |
| **Eva** | `55555555-5555-5555-5555-555555555555` | Org B | **Editor** | Org B editor privileges: isolated from Org A |

---

## ⚡ Workflow Step Engine & Gemini API

`lib/workflowEngine.ts` coordinates execution across 6 step types:

1. **`llm_call`**: Calls Google Gemini API (`gemini-2.5-flash`) to generate text and sentiment analysis.
2. **`http_request`**: Dispatches external HTTP POST/GET requests.
3. **`conditional_branch`**: Evaluates upstream outputs (e.g. `{{step1.sentiment}} == 'positive'`).
4. **`approval_gate`**: **Pauses execution**, waiting for human approval.
5. **`db_write`**: Inserts record into Postgres `data_records` table.
6. **`notify`**: Emits notification logs.

---

## 🚀 Vercel Deployment & Production Setup

To deploy the Next.js application to Vercel:

1. Import the repository `Megha-TR/mini-n8n` in your Vercel Dashboard.
2. Set Environment Variables in Vercel settings:
   - `GEMINI_API_KEY` = `<YOUR_GEMINI_API_KEY>`
   - `NEXT_PUBLIC_HASURA_GRAPHQL_URL` = `https://<YOUR-HASURA-HOST>/v1/graphql`
   - `HASURA_GRAPHQL_ADMIN_SECRET` = `<YOUR_HASURA_ADMIN_SECRET>`
3. Click **Deploy**.
