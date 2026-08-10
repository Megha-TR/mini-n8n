# Mini-n8n: Multi-Tenant AI Agent Workflow Builder

A production-ready, purpose-built AI Agent Workflow Builder built with **Next.js 14**, **Hasura GraphQL Engine**, **PostgreSQL 15**, **Docker**, and **Google Gemini API**.

---

## 🌟 Key Architecture & Highlights

1. **Layer 1 Security (Hasura DB-Level Scoping)**:
   - Every GraphQL query, mutation, and subscription is evaluated against PostgreSQL permissions defined in Hasura metadata (`hasura/metadata/hasura_metadata.json`).
   - Enforces multi-tenant isolation via `x-hasura-org-id`, `x-hasura-user-id`, and `x-hasura-role` session headers over the `org_members` table.
   - Cross-org ID-guessing attacks automatically return zero records or HTTP 403 Forbidden.

2. **Layer 2 Security (Action Gatekeepers)**:
   - Backend Hasura Actions (`/api/actions/trigger` and `/api/actions/approve`) enforce fine-grained role permissions.
   - Sensitive step types (`db_write`, `notify`) can only be added by Organization Owners.
   - Non-members and Viewer roles are blocked from triggering workflows or clearing Approval Gates.

3. **Multi-Step Execution Engine (`lib/workflowEngine.ts`)**:
   - Executes 6 distinct step types sequentially:
     - `llm_call`: Real Gemini AI generation with fallback latency stub.
     - `http_request`: External API HTTP webhook invocation.
     - `conditional_branch`: Expression & sentiment branch evaluation.
     - `approval_gate`: Pauses workflow execution, requiring human role authorization.
     - `db_write`: Restricted database mutation to `data_records`.
     - `notify`: Notification dispatcher.
   - Real-time step state progression streamed via GraphQL Subscriptions / Polling.

---

## 🚀 Quick Start (Local Docker Setup)

Run the full stack (PostgreSQL + Hasura GraphQL Engine + Next.js) with a single command:

```bash
# 1. Clone the repository
git clone https://github.com/Megha-TR/mini-n8n.git
cd mini-n8n

# 2. Configure Environment Variables
cp .env.example .env.local
# (Optional) Set your GEMINI_API_KEY in .env.local

# 3. Spin up PostgreSQL + Hasura + Next.js App
docker compose up --build
```

- **Web Application UI**: [http://localhost:3000](http://localhost:3000)
- **Hasura Console**: [http://localhost:8080/console](http://localhost:8080/console) (Admin Secret: `myadminsecretkey`)
- **Hasura GraphQL Endpoint**: `http://localhost:8080/v1/graphql`

---

## 🌐 Deployed Cloud Setup (Vercel + Hasura Cloud / Nhost)

To deploy to production:

1. **Provision PostgreSQL Database & Hasura GraphQL Engine**:
   - Deploy Hasura on [Hasura Cloud](https://cloud.hasura.io) or [Nhost](https://nhost.io).
   - Apply schema migration from `hasura/migrations/schema.sql`.
   - Apply Hasura metadata from `hasura/metadata/hasura_metadata.json`.

2. **Deploy Frontend & Action Handlers to Vercel**:
   - Connect your GitHub repository (`https://github.com/Megha-TR/mini-n8n`) to [Vercel](https://vercel.com).
   - Configure Environment Variables on Vercel:
     - `NEXT_PUBLIC_HASURA_GRAPHQL_URL`: `https://<YOUR-HASURA-INSTANCE>.hasura.app/v1/graphql`
     - `HASURA_GRAPHQL_ADMIN_SECRET`: `<YOUR_HASURA_ADMIN_SECRET>`
     - `GEMINI_API_KEY`: `<YOUR_GEMINI_API_KEY>`

---

## 🔐 Multi-Tenant Test Users & Contexts

The application pre-seeds 2 organizations and 5 users for testing permissions out-of-the-box:

| Organization | User | Role | Access Scope |
| :--- | :--- | :--- | :--- |
| **Acme AI Corp (Org A)** | Alice | Owner | Full access (Trigger, Create `db_write`, Approve Gates) |
| **Acme AI Corp (Org A)** | Bob | Editor | Trigger, Approve Gates (Restricted from adding `db_write`) |
| **Acme AI Corp (Org A)** | Charlie | Viewer | Read-Only (Blocked from triggering or approving) |
| **Beta Dynamics (Org B)** | David | Owner | Full access to Org B (Isolated from Org A) |
| **Beta Dynamics (Org B)** | Eva | Editor | Editor access to Org B (Isolated from Org A) |

---

## 🧪 Security & Verification Test Matrix

Open the **Security & ID-Guessing Matrix** tab in the UI to run the 5 automated attack vector tests:
1. **Cross-Org GraphQL ID-Guessing Isolation**: Org B user queries Org A Workflow ID directly via GraphQL.
2. **Direct Action Trigger Attack Resistance**: Org B user posts to `/api/actions/trigger` with Org A Workflow ID.
3. **Direct Action Approval Gate Attack Resistance**: Org B user posts to `/api/actions/approve` with Org A Step Run ID.
4. **Viewer Role Trigger Enforcement**: Org A Viewer role attempts to trigger workflow run.
5. **Layer 2 Step Gating Enforcement**: Org A Editor attempts to insert `db_write` step.
