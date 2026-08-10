/**
 * Workflow Execution Engine
 *
 * Orchestrates sequential step execution for a workflow run.
 * All state (workflow_runs, step_runs, organizations) is persisted
 * to PostgreSQL via the Hasura GraphQL Engine using hasuraAdmin.
 */

import { v4 as uuidv4 } from 'uuid';
import { hasuraAdminQuery } from './hasuraAdmin';
import { executeLlmCallStep } from './stepExecutors/llmCall';
import { executeHttpRequestStep } from './stepExecutors/httpRequest';
import { executeConditionalBranchStep } from './stepExecutors/conditionalBranch';
import { executeDbWriteStep } from './stepExecutors/dbWrite';
import { executeNotifyStep } from './stepExecutors/notify';

// -- GraphQL Fragments --

const WORKFLOW_BY_PK = `
  query GetWorkflow($id: uuid!) {
    workflows_by_pk(id: $id) {
      id
      org_id
      name
      is_active
    }
  }
`;

const WORKFLOW_STEPS = `
  query GetSteps($workflow_id: uuid!) {
    workflow_steps(where: { workflow_id: { _eq: $workflow_id } }, order_by: { step_order: asc }) {
      id
      workflow_id
      step_order
      name
      type
      config
    }
  }
`;

const ORG_MEMBER_CHECK = `
  query CheckMembership($user_id: uuid!, $org_id: uuid!) {
    org_members(where: { user_id: { _eq: $user_id }, org_id: { _eq: $org_id } }) {
      id
      role
    }
  }
`;

const ORG_BY_PK = `
  query GetOrg($id: uuid!) {
    organizations_by_pk(id: $id) {
      id
      name
      calls_used
      max_calls_allowed
    }
  }
`;

const INSERT_WORKFLOW_RUN = `
  mutation InsertRun($object: workflow_runs_insert_input!) {
    insert_workflow_runs_one(object: $object) {
      id
    }
  }
`;

const INSERT_STEP_RUNS = `
  mutation InsertStepRuns($objects: [step_runs_insert_input!]!) {
    insert_step_runs(objects: $objects) {
      returning { id step_order }
    }
  }
`;

const UPDATE_STEP_RUN = `
  mutation UpdateStepRun($id: uuid!, $set: step_runs_set_input!) {
    update_step_runs_by_pk(pk_columns: { id: $id }, _set: $set) {
      id
    }
  }
`;

const UPDATE_WORKFLOW_RUN = `
  mutation UpdateWorkflowRun($id: uuid!, $set: workflow_runs_set_input!) {
    update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: $set) {
      id
    }
  }
`;

const INCREMENT_ORG_CALLS = `
  mutation IncrementCalls($org_id: uuid!) {
    update_organizations_by_pk(pk_columns: { id: $org_id }, _inc: { calls_used: 1 }) {
      id
      calls_used
    }
  }
`;

const GET_STEP_RUN_BY_PK = `
  query GetStepRun($id: uuid!) {
    step_runs_by_pk(id: $id) {
      id
      workflow_run_id
      step_order
      step_name
      step_type
      status
      output
    }
  }
`;

const GET_RUN_BY_PK = `
  query GetRun($id: uuid!) {
    workflow_runs_by_pk(id: $id) {
      id
      workflow_id
      status
      current_step_index
      context_data
    }
  }
`;

const GET_STEP_RUNS_FOR_RUN = `
  query GetStepRunsForRun($run_id: uuid!) {
    step_runs(where: { workflow_run_id: { _eq: $run_id } }, order_by: { step_order: asc }) {
      id
      step_order
      step_name
      step_type
      status
    }
  }
`;


// -- Trigger Workflow Run --

export async function triggerWorkflowRun(
  workflowId: string,
  callerUserId: string,
  triggerType: string = 'manual'
): Promise<{ success: boolean; runId?: string; status?: string; error?: string }> {

  // 1. Fetch workflow from Postgres via Hasura
  const wfData = await hasuraAdminQuery<any>(WORKFLOW_BY_PK, { id: workflowId });
  const workflow = wfData.workflows_by_pk;
  if (!workflow) {
    return { success: false, error: 'Workflow not found' };
  }

  // 2. Layer 1: Verify caller is a member of the workflow's org
  const memberData = await hasuraAdminQuery<any>(ORG_MEMBER_CHECK, {
    user_id: callerUserId,
    org_id: workflow.org_id,
  });
  const members = memberData.org_members || [];
  if (members.length === 0) {
    return {
      success: false,
      error: '403 Forbidden: Cross-Org Access Denied. User does not belong to workflow organization.',
    };
  }
  const callerRole = members[0].role;

  if (callerRole === 'viewer') {
    return {
      success: false,
      error: '403 Permission Denied: Viewer role cannot trigger workflow runs.',
    };
  }

  // 3. Quota check
  const orgData = await hasuraAdminQuery<any>(ORG_BY_PK, { id: workflow.org_id });
  const org = orgData.organizations_by_pk;
  if (!org) {
    return { success: false, error: 'Organization not found' };
  }
  if (org.calls_used >= org.max_calls_allowed) {
    return {
      success: false,
      error: `429 Quota Exceeded: Organization "${org.name}" has reached its limit of ${org.max_calls_allowed} calls.`,
    };
  }

  // 4. Fetch steps
  const stepsData = await hasuraAdminQuery<any>(WORKFLOW_STEPS, { workflow_id: workflowId });
  const steps = stepsData.workflow_steps || [];
  if (steps.length === 0) {
    return { success: false, error: 'Workflow has no steps configured' };
  }

  // 5. Create workflow_run record in Postgres (initial status: pending)
  const runId = uuidv4();
  await hasuraAdminQuery(INSERT_WORKFLOW_RUN, {
    object: {
      id: runId,
      workflow_id: workflowId,
      triggered_by_user_id: callerUserId,
      trigger_type: triggerType,
      status: 'pending',
      current_step_index: 0,
      context_data: {},
    },
  });

  // 6. Create step_run records in Postgres (initial status: pending)
  const stepRunObjects = steps.map((s: any) => ({
    id: uuidv4(),
    workflow_run_id: runId,
    step_id: s.id,
    step_order: s.step_order,
    step_name: s.name,
    step_type: s.type,
    status: 'pending',
    input: {},
    output: {},
  }));
  await hasuraAdminQuery(INSERT_STEP_RUNS, { objects: stepRunObjects });

  // 7. Start executing steps asynchronously
  executeWorkflowLoop(runId, workflowId, steps, stepRunObjects, 0, {});

  return { success: true, runId, status: 'pending' };
}


// -- Sequential Execution Loop --

async function executeWorkflowLoop(
  runId: string,
  workflowId: string,
  steps: any[],
  stepRunRecords: any[],
  startIndex: number,
  contextData: Record<string, any>
) {
  // Update workflow run status: pending -> running in PostgreSQL via Hasura
  await hasuraAdminQuery(UPDATE_WORKFLOW_RUN, {
    id: runId,
    set: { status: 'running', updated_at: new Date().toISOString() },
  });
  for (let i = startIndex; i < steps.length; i++) {
    const step = steps[i];
    const stepRun = stepRunRecords[i];
    if (!step || !stepRun) continue;

    // Mark step as running
    const input = { ...contextData, config: step.config };
    await hasuraAdminQuery(UPDATE_STEP_RUN, {
      id: stepRun.id,
      set: { status: 'running', input, started_at: new Date().toISOString() },
    });
    await hasuraAdminQuery(UPDATE_WORKFLOW_RUN, {
      id: runId,
      set: { current_step_index: i, updated_at: new Date().toISOString() },
    });

    // Dispatch to step executor
    let result: { success: boolean; output?: any; error?: string } = { success: false };

    if (step.type === 'llm_call') {
      result = await executeLlmCallStep(step, contextData);
    } else if (step.type === 'http_request') {
      result = await executeHttpRequestStep(step, contextData);
    } else if (step.type === 'conditional_branch') {
      const condRes = executeConditionalBranchStep(step, contextData);
      result = { success: condRes.success, output: condRes.output };
    } else if (step.type === 'db_write') {
      // Get the workflow's org_id for scoped db_write
      const wfData = await hasuraAdminQuery<any>(WORKFLOW_BY_PK, { id: workflowId });
      const orgId = wfData.workflows_by_pk?.org_id || '';
      result = await executeDbWriteStep(step, orgId, contextData);
    } else if (step.type === 'notify') {
      result = executeNotifyStep(step, contextData);
    } else if (step.type === 'approval_gate') {
      // Pause the run
      await hasuraAdminQuery(UPDATE_STEP_RUN, {
        id: stepRun.id,
        set: {
          status: 'paused',
          output: {
            message: step.config.message || 'Awaiting approval.',
            required_role: step.config.required_role || 'editor',
            paused_at: new Date().toISOString(),
          },
        },
      });
      await hasuraAdminQuery(UPDATE_WORKFLOW_RUN, {
        id: runId,
        set: { status: 'paused', updated_at: new Date().toISOString() },
      });
      return; // Stop until approveStep is called
    }

    if (result.success) {
      await hasuraAdminQuery(UPDATE_STEP_RUN, {
        id: stepRun.id,
        set: {
          status: 'completed',
          output: result.output || {},
          completed_at: new Date().toISOString(),
        },
      });

      // Accumulate context
      contextData[`step${step.step_order}`] = result.output;
      contextData[step.name.toLowerCase().replace(/[^a-z0-9]/g, '_')] = result.output;

      // Persist context to the run record
      await hasuraAdminQuery(UPDATE_WORKFLOW_RUN, {
        id: runId,
        set: { context_data: contextData, updated_at: new Date().toISOString() },
      });
    } else {
      await hasuraAdminQuery(UPDATE_STEP_RUN, {
        id: stepRun.id,
        set: {
          status: 'failed',
          error: result.error || 'Step execution failed',
          completed_at: new Date().toISOString(),
        },
      });
      await hasuraAdminQuery(UPDATE_WORKFLOW_RUN, {
        id: runId,
        set: {
          status: 'failed',
          error_message: result.error || 'Step execution failed',
          updated_at: new Date().toISOString(),
        },
      });
      return;
    }
  }

  // All steps completed — mark run as completed and increment org quota
  await hasuraAdminQuery(UPDATE_WORKFLOW_RUN, {
    id: runId,
    set: {
      status: 'completed',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  });

  // Increment org calls_used
  const wfData = await hasuraAdminQuery<any>(WORKFLOW_BY_PK, { id: workflowId });
  if (wfData.workflows_by_pk) {
    await hasuraAdminQuery(INCREMENT_ORG_CALLS, { org_id: wfData.workflows_by_pk.org_id });
  }
}


// -- Approve Step --

export async function approveStep(
  stepRunId: string,
  approverUserId: string
): Promise<{ success: boolean; message?: string; error?: string }> {

  // 1. Fetch step run from DB
  const srData = await hasuraAdminQuery<any>(GET_STEP_RUN_BY_PK, { id: stepRunId });
  const stepRun = srData.step_runs_by_pk;
  if (!stepRun) {
    return { success: false, error: 'Step run not found' };
  }
  if (stepRun.status !== 'paused' || stepRun.step_type !== 'approval_gate') {
    return {
      success: false,
      error: `Invalid Action: Step is "${stepRun.status}" (must be "paused" approval_gate).`,
    };
  }

  // 2. Fetch the parent workflow run
  const runData = await hasuraAdminQuery<any>(GET_RUN_BY_PK, { id: stepRun.workflow_run_id });
  const run = runData.workflow_runs_by_pk;
  if (!run) {
    return { success: false, error: 'Workflow run not found' };
  }

  // 3. Fetch the workflow to get org_id
  const wfData = await hasuraAdminQuery<any>(WORKFLOW_BY_PK, { id: run.workflow_id });
  const workflow = wfData.workflows_by_pk;
  if (!workflow) {
    return { success: false, error: 'Workflow not found' };
  }

  // 4. Verify approver is a member of the workflow's org (Layer 1)
  const memberData = await hasuraAdminQuery<any>(ORG_MEMBER_CHECK, {
    user_id: approverUserId,
    org_id: workflow.org_id,
  });
  const members = memberData.org_members || [];
  if (members.length === 0) {
    return {
      success: false,
      error: '403 Forbidden: Cross-Org Approval Blocked. Approver does not belong to the workflow organization.',
    };
  }
  const approverRole = members[0].role;

  if (approverRole === 'viewer') {
    return {
      success: false,
      error: '403 Permission Denied: Viewer role cannot clear approval gates.',
    };
  }

  // 5. Mark step as approved in DB
  await hasuraAdminQuery(UPDATE_STEP_RUN, {
    id: stepRunId,
    set: {
      status: 'completed',
      approved_by: approverUserId,
      approved_at: new Date().toISOString(),
      output: {
        ...(typeof stepRun.output === 'object' ? stepRun.output : {}),
        approval_status: 'APPROVED',
        approved_by_role: approverRole,
        resumed_at: new Date().toISOString(),
      },
      completed_at: new Date().toISOString(),
    },
  });

  // 6. Resume the workflow run from the next step
  await hasuraAdminQuery(UPDATE_WORKFLOW_RUN, {
    id: run.id,
    set: { status: 'running', updated_at: new Date().toISOString() },
  });

  // Re-fetch steps and step runs to resume execution
  const stepsData = await hasuraAdminQuery<any>(WORKFLOW_STEPS, { workflow_id: run.workflow_id });
  const steps = stepsData.workflow_steps || [];

  const stepRunsData = await hasuraAdminQuery<any>(GET_STEP_RUNS_FOR_RUN, { run_id: run.id });
  const stepRuns = stepRunsData.step_runs || [];

  const nextIndex = run.current_step_index + 1;
  const contextData = (typeof run.context_data === 'object' && run.context_data) ? run.context_data : {};

  // Resume loop
  executeWorkflowLoop(run.id, run.workflow_id, steps, stepRuns, nextIndex, contextData);

  return {
    success: true,
    message: `Step "${stepRun.step_name}" approved. Workflow resumed from step ${nextIndex + 1}.`,
  };
}
