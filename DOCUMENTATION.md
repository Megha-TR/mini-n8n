# VocalLabs AgentFlow — System Architecture & Design Write-Up

## 1. Schema Reasoning & Data Model Design
The data model is engineered to support multi-tenant isolation, step order reproducibility, stateful execution tracking, and live GraphQL subscriptions.

- **`organizations` & `org_members`**: Establishes tenant boundary. `organizations` stores quota metrics (`calls_used`, `max_calls_allowed`). `org_members` links Nhost auth users (`auth.users.id`) to organizations with explicit roles (`owner`, `editor`, `viewer`).
- **`workflows` & `workflow_steps`**: `workflows` belong strictly to an `org_id`. `workflow_steps` contains ordered steps (`step_order`) storing step-specific JSONB parameters (`config`).
- **`workflow_triggers`**: Declares trigger bindings (`manual`, `webhook`, `scheduled`, `db_event`).
- **`workflow_runs` & `step_runs`**: `workflow_runs` tracks macro execution state (`pending`, `running`, `paused`, `completed`, `failed`), accumulated JSONB context (`context_data`), and current step pointer. `step_runs` records per-step execution status, inputs, outputs, errors, attempt retries, and approval timestamps (`approved_by`, `approved_at`).
- **`org_usage_summary`**: Computed PostgreSQL view calculating real-time call counts, quota percentages, and average execution latency per organization.

---

## 2. Two-Layer Permission System Implementation

### Layer 1: Org + Role Scoping (Row-Level Database & Hasura Permissions)
Layer 1 guarantees absolute multi-tenant data isolation. Role alone is insufficient; every query and mutation is filtered against the caller's organization membership via `org_members`.

- **`owner`**: Full CRUD across workflows, steps, triggers, and org membership WHERE `org_id IN (SELECT org_id FROM org_members WHERE user_id = X AND role = 'owner')`.
- **`editor`**: Create/edit workflows and steps, trigger runs WHERE `org_id IN (SELECT org_id FROM org_members WHERE user_id = X AND role IN ('owner', 'editor'))`. Cannot manage org membership.
- **`viewer`**: Read-only access WHERE `org_id IN (SELECT org_id FROM org_members WHERE user_id = X)`. Cannot mutate workflows or trigger runs.
- **Direct ID-Guessing Defense**: Even if an Org B user passes Org A's UUID directly in a GraphQL query or mutation, Hasura's permission engine evaluates the join condition against `org_members` and returns an empty dataset or `403 Forbidden`.

### Layer 2: Step-Level Gating & Mid-Execution Control (Hasura Actions & Backend Enforcement)
Layer 2 secures sensitive step types (`db_write`, `webhook`, `notify`) and mid-execution resume gates:

- **Step Creation Gating**: Editor role attempting to add `db_write` or `notify` steps is blocked by Hasura permission presets (`type NOT IN ('db_write', 'webhook', 'notify')`) and backend validation with `403 Permission Denied`.
- **Mid-Execution Approval Validation**: Clearing an `approval_gate` step cannot rely on static database permissions because it is a mid-execution transition. The frontend calls the Hasura Action `approveStep(step_run_id)`. The Action backend handler inspects the target `step_run_id`, resolves the parent workflow's `org_id`, and queries `org_members` to verify the approver is an `owner` or `editor` in **that specific organization**. If a `viewer` or cross-org user attempts approval, it is rejected with a `403 Forbidden` error before resuming state.

---

## 3. Approval Gate Pause & Resume Mechanism

```
    Step Execution Loop
            │
            ▼
   [Is approval_gate?] ──YES──► Set step_runs.status = 'paused'
            │                   Set workflow_runs.status = 'paused'
            NO                  Emit GraphQL Subscription Update ("paused, awaiting approval")
            │                   Halt Execution Loop
            ▼
    [Execute Step]              ┌─────────────────────────────────────────┐
                                │ Action: approveStep(step_run_id)        │
                                └────────────────────┬────────────────────┘
                                                     │
                                            Verify Approver Role in Org
                                                     │
                                            Mark step_runs = 'completed'
                                            Record approved_by & approved_at
                                                     │
                                                     ▼
                                           Resume Execution Loop (Index + 1)
```

1. **Pause Phase**: When the sequential workflow loop reaches an `approval_gate` step:
   - Sets `step_runs.status = 'paused'` and records approval instructions in output JSON.
   - Sets `workflow_runs.status = 'paused'` and halts the loop.
   - Emits a GraphQL subscription broadcast to update the UI live without page refresh.
2. **Resume Phase**:
   - An authorized user invokes `approveStep(step_run_id)`.
   - The Action handler verifies the approver's role (`owner` or `editor` in the workflow's org).
   - Stamps `approved_by`, `approved_at`, updates step status to `'completed'`, and sets `workflow_runs.status = 'running'`.
   - Resumes the sequential step execution loop from index `current_step_index + 1` until all remaining steps complete.
