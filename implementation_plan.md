# AI Agent Workflow Builder — Full-Stack Implementation Plan

## Goal Description
Build a production-ready, full-stack AI Agent Workflow Builder inspired by n8n. The system enables users within organizations to construct, configure, and execute multi-step AI agent workflows with real-time tracking, double-layered permissions (Org/Role scoping + Step-level gating), Action-backed execution with retries and quota limits, GraphQL subscriptions for live step progress, and pause/resume approval gates.

---

## User Review Required

> [!IMPORTANT]
> **Permission Layering Architecture**
> - **Layer 1 (Org/Role Scoping)**: Row-level & column-level database permissions ensuring users in Org A cannot read, edit, or trigger workflows in Org B.
> - **Layer 2 (Step-Level & Mid-Execution Control)**: Sensitive step types (`db_write`, `webhook`, `notify`) require `owner` role to create/edit. Approving a paused `approval_gate` step executes via a backend Action that inspects the caller's role in the organization before permitting execution to resume.

> [!NOTE]
> **LLM API & Retry Strategy**
> The `llm_call` step integrates with Gemini API / OpenRouter / Groq API with configurable fallback to an artificial-delay stub if an external key is omitted. Retries are implemented with exponential backoff (up to 3 attempts) for transient external failures.

---

## Open Questions

None at present. All requirements, step types, trigger mechanisms, permission layers, and final task validation scenario are fully specified.

---

## Proposed Changes

### Database & Hasura Layer (`/hasura`)

#### [NEW] [schema.sql](file:///home/megha-tr/Desktop/vocallabsassignment/hasura/migrations/schema.sql)
- Full PostgreSQL DDL defining `organizations`, `users`, `org_members`, `workflows`, `workflow_steps`, `workflow_triggers`, `workflow_runs`, `step_runs`, and `data_records`.
- Triggers for `updated_at` timestamps and quota management functions.
- View `org_usage_summary` for computed field aggregations (calls used, calls allowed, percentage, average run duration).

#### [NEW] [hasura_metadata.json](file:///home/megha-tr/Desktop/vocallabsassignment/hasura/metadata/hasura_metadata.json)
- Full Hasura metadata export including tracked tables, foreign key relationships, computed fields (`usage_summary`), permissions matrix for roles (`owner`, `editor`, `viewer`), Actions definitions (`triggerWorkflowRun`, `approveStep`), and Event Trigger specs.

---

### Backend & Action Handlers (`/app/api`)

#### [NEW] [triggerWorkflowRun.ts](file:///home/megha-tr/Desktop/vocallabsassignment/app/api/actions/trigger/route.ts)
- Next.js API Route / Action handler for `triggerWorkflowRun(workflow_id)`.
- Validates caller authentication, org membership, and role (`owner` or `editor`).
- Checks organization quota (`calls_used < max_calls_allowed`).
- Initializes `workflow_run` and starts sequential execution of `workflow_steps`.
- Executes `llm_call`, `http_request` (with retries), `db_write`, `notify`, and `conditional_branch`.
- On encountering `approval_gate`, sets run status to `paused` and step status to `paused`, saving context state.
- Increments org quota on run completion.

#### [NEW] [approveStep.ts](file:///home/megha-tr/Desktop/vocallabsassignment/app/api/actions/approve/route.ts)
- Next.js API Route / Action handler for `approveStep(step_run_id)`.
- Verifies approver's role in the workflow's org (`owner` or `editor`). Rejects `viewer` or cross-org users.
- Marks step as `completed` with `approved_by` and `approved_at`.
- Resumes execution of subsequent steps in the workflow.

#### [NEW] [webhookTrigger.ts](file:///home/megha-tr/Desktop/vocallabsassignment/app/api/webhooks/trigger/[workflow_id]/route.ts)
- Inbound HTTP Webhook endpoint to trigger workflows from external systems.

---

### Frontend Application (`/app`, `/components`, `/lib`)

#### [NEW] [page.tsx](file:///home/megha-tr/Desktop/vocallabsassignment/app/page.tsx)
- Main application shell featuring Organization & Role Switcher, Quota Usage Widget, Workflow Builder, Live Execution Dashboard, and Multi-Tenant Security Matrix.

#### [NEW] [WorkflowBuilder.tsx](file:///home/megha-tr/Desktop/vocallabsassignment/components/WorkflowBuilder.tsx)
- Visual workflow builder component allowing users to create/reorder steps (`llm_call`, `http_request`, `db_write`, `notify`, `conditional_branch`, `approval_gate`), configure parameters, and attach triggers (Manual, Webhook, Event).
- Enforces Layer 2 UI step gating (disabling sensitive steps for non-owners).

#### [NEW] [ExecutionDashboard.tsx](file:///home/megha-tr/Desktop/vocallabsassignment/components/ExecutionDashboard.tsx)
- Real-time execution viewer powered by GraphQL Subscriptions / SSE.
- Shows live step status progression (pending -> running -> paused -> completed/failed).
- Displays pulsing Approval Gate prompt with "Approve & Resume" action button.
- Detailed step JSON input/output inspector.

#### [NEW] [SecurityMatrix.tsx](file:///home/megha-tr/Desktop/vocallabsassignment/components/SecurityMatrix.tsx)
- Automated verification panel demonstrating cross-org isolation tests (Org A vs Org B) and role-permission enforcement.

#### [NEW] [hasuraClient.ts](file:///home/megha-tr/Desktop/vocallabsassignment/lib/hasuraClient.ts)
- GraphQL client configuration supporting Queries, Mutations, and Live Subscriptions.

---

### Documentation & Deliverables

#### [NEW] [DOCUMENTATION.md](file:///home/megha-tr/Desktop/vocallabsassignment/DOCUMENTATION.md)
- 1-page architectural write-up explaining Schema Design, 2-Layer Permission System implementation, and Approval-Gate Pause/Resume mechanism.

#### [NEW] [README.md](file:///home/megha-tr/Desktop/vocallabsassignment/README.md)
- Comprehensive setup, deployment, local running instructions, environment variables, and Final Task walkthrough guide.

---

## Verification Plan

### Automated Tests & API Validation
- **Org Isolation**: Verify via GraphQL queries that an Org B user receiving an Org A `workflow_id` gets a `403 Forbidden` / null response.
- **Role Permission**: Verify that `viewer` role cannot trigger `triggerWorkflowRun` or call `approveStep`.
- **Step Gating**: Verify that `editor` attempting to add a `db_write` step gets rejected.
- **Quota Limit**: Run workflows up to max limit and verify 429 quota exhaustion behavior.
- **Approval Gate**: Trigger workflow with `approval_gate`, verify run enters `paused` state, approve via `approveStep`, and confirm run resumes to `completed`.

### Manual Verification & Final Task Walkthrough
1. Switch to Org A Owner user.
2. Build 3+ step workflow with `llm_call`, `http_request`, `conditional_branch`, and `approval_gate`.
3. Trigger run manually or via Webhook URL.
4. Watch live streaming step execution pause at `approval_gate`.
5. Approve as Org A Owner -> confirm workflow completes live.
6. Switch to Org B user -> verify Org A workflow, runs, and approval actions are completely invisible and un-actionable.
