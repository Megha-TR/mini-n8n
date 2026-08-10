import { v4 as uuidv4 } from 'uuid';
import { db, WorkflowRun, StepRun, WorkflowStep, Organization } from './db';
import { executeLlmCallStep } from './stepExecutors/llmCall';
import { executeHttpRequestStep } from './stepExecutors/httpRequest';
import { executeConditionalBranchStep } from './stepExecutors/conditionalBranch';
import { executeDbWriteStep } from './stepExecutors/dbWrite';
import { executeNotifyStep } from './stepExecutors/notify';

// Live Subscription Broadcaster Event Listeners
type SubscriptionCallback = (update: { run: WorkflowRun; stepRuns: StepRun[] }) => void;
const subscriptionListeners = new Set<SubscriptionCallback>();

export function subscribeToStepRuns(callback: SubscriptionCallback): () => void {
  subscriptionListeners.add(callback);
  return () => {
    subscriptionListeners.delete(callback);
  };
}

function broadcastUpdate(run: WorkflowRun, stepRuns: StepRun[]) {
  for (const listener of subscriptionListeners) {
    try {
      listener({ run, stepRuns });
    } catch (e) {
      console.error('Subscription broadcast error:', e);
    }
  }
}

export async function triggerWorkflowRun(
  workflowId: string,
  callerUserId: string,
  triggerType: string = 'manual'
): Promise<{ success: boolean; runId?: string; status?: string; error?: string }> {
  // 1. Fetch Workflow
  const workflow = db.workflows.find((w) => w.id === workflowId);
  if (!workflow) {
    return { success: false, error: 'Workflow not found' };
  }

  // 2. Layer 1 Org Scoping Check
  const member = db.getOrgMember(callerUserId, workflow.org_id);
  if (!member) {
    return {
      success: false,
      error: '403 Forbidden: Cross-Org Access Denied. User does not belong to workflow organization.',
    };
  }

  if (member.role === 'viewer') {
    return {
      success: false,
      error: '403 Permission Denied: Viewer role cannot trigger workflow runs.',
    };
  }

  // 3. Quota Enforcement
  const org = db.orgs.find((o) => o.id === workflow.org_id);
  if (!org) {
    return { success: false, error: 'Organization not found' };
  }

  if (org.calls_used >= org.max_calls_allowed) {
    return {
      success: false,
      error: `429 Quota Exceeded: Organization "${org.name}" has reached its execution limit of ${org.max_calls_allowed} calls for this billing period.`,
    };
  }

  // 4. Initialize Workflow Run & Step Runs
  const steps = db.steps.filter((s) => s.workflow_id === workflowId).sort((a, b) => a.step_order - b.step_order);
  if (steps.length === 0) {
    return { success: false, error: 'Workflow has no steps configured' };
  }

  const runId = uuidv4();
  const runRecord: WorkflowRun = {
    id: runId,
    workflow_id: workflowId,
    triggered_by_user_id: callerUserId,
    trigger_type: triggerType,
    status: 'running',
    current_step_index: 0,
    context_data: {},
    started_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const initialStepRuns: StepRun[] = steps.map((s) => ({
    id: uuidv4(),
    workflow_run_id: runId,
    step_id: s.id,
    step_order: s.step_order,
    step_name: s.name,
    step_type: s.type,
    status: 'pending',
    input: {},
    output: {},
    attempt_count: 1,
    started_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  db.runs.push(runRecord);
  db.stepRuns.push(...initialStepRuns);

  broadcastUpdate(runRecord, initialStepRuns);

  // 5. Execute Steps Sequentially
  executeWorkflowLoop(runId, 0);

  return {
    success: true,
    runId,
    status: 'running',
  };
}

// Sequential Execution Loop
async function executeWorkflowLoop(runId: string, startIndex: number) {
  const runRecord = db.runs.find((r) => r.id === runId);
  if (!runRecord) return;

  const steps = db.steps.filter((s) => s.workflow_id === runRecord.workflow_id).sort((a, b) => a.step_order - b.step_order);
  const runStepRuns = db.stepRuns.filter((sr) => sr.workflow_run_id === runId).sort((a, b) => a.step_order - b.step_order);
  const workflow = db.workflows.find((w) => w.id === runRecord.workflow_id);

  for (let i = startIndex; i < steps.length; i++) {
    const step = steps[i];
    const stepRun = runStepRuns[i];
    if (!step || !stepRun) continue;

    runRecord.current_step_index = i;
    stepRun.status = 'running';
    stepRun.started_at = new Date().toISOString();
    stepRun.input = { ...runRecord.context_data, config: step.config };
    runRecord.updated_at = new Date().toISOString();

    broadcastUpdate(runRecord, runStepRuns);

    // Step Execution Handler Dispatcher
    let result: { success: boolean; output?: any; error?: string } = { success: false };

    if (step.type === 'llm_call') {
      result = await executeLlmCallStep(step, runRecord.context_data);
    } else if (step.type === 'http_request') {
      result = await executeHttpRequestStep(step, runRecord.context_data);
    } else if (step.type === 'conditional_branch') {
      const condRes = executeConditionalBranchStep(step, runRecord.context_data);
      result = { success: condRes.success, output: condRes.output };
    } else if (step.type === 'db_write') {
      result = executeDbWriteStep(step, workflow?.org_id || '', runRecord.context_data);
    } else if (step.type === 'notify') {
      result = executeNotifyStep(step, runRecord.context_data);
    } else if (step.type === 'approval_gate') {
      // Pause Run at Approval Gate
      stepRun.status = 'paused';
      stepRun.output = {
        message: step.config.message || 'Workflow paused. Awaiting explicit executive approval to resume.',
        required_role: step.config.required_role || 'editor',
        paused_at: new Date().toISOString(),
      };
      runRecord.status = 'paused';
      runRecord.updated_at = new Date().toISOString();

      broadcastUpdate(runRecord, runStepRuns);
      return; // Stop loop until approveStep is called
    }

    if (result.success) {
      stepRun.status = 'completed';
      stepRun.output = result.output || {};
      stepRun.completed_at = new Date().toISOString();

      // Store in context with step reference key e.g. step1, step2
      runRecord.context_data[`step${step.step_order}`] = result.output;
      runRecord.context_data[step.name.toLowerCase().replace(/[^a-z0-9]/g, '_')] = result.output;

      broadcastUpdate(runRecord, runStepRuns);
    } else {
      stepRun.status = 'failed';
      stepRun.error = result.error || 'Step execution failed';
      stepRun.completed_at = new Date().toISOString();

      runRecord.status = 'failed';
      runRecord.error_message = result.error || 'Step execution failed';
      runRecord.updated_at = new Date().toISOString();

      broadcastUpdate(runRecord, runStepRuns);
      return;
    }
  }

  // Workflow Run Completed
  runRecord.status = 'completed';
  runRecord.completed_at = new Date().toISOString();
  runRecord.updated_at = new Date().toISOString();

  // Increment Organization Quota Usage on Completion
  if (workflow) {
    const org = db.orgs.find((o) => o.id === workflow.org_id);
    if (org) {
      org.calls_used += 1;
      org.updated_at = new Date().toISOString();
    }
  }

  broadcastUpdate(runRecord, runStepRuns);
}

// Action Handler for approveStep(step_run_id)
export async function approveStep(
  stepRunId: string,
  approverUserId: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  // 1. Locate Step Run & Workflow Run
  const stepRun = db.stepRuns.find((sr) => sr.id === stepRunId);
  if (!stepRun) {
    return { success: false, error: 'Step run not found' };
  }

  if (stepRun.status !== 'paused' || stepRun.step_type !== 'approval_gate') {
    return { success: false, error: `Invalid Action: Step run is in "${stepRun.status}" status (must be "paused" on an approval_gate step).` };
  }

  const runRecord = db.runs.find((r) => r.id === stepRun.workflow_run_id);
  if (!runRecord) {
    return { success: false, error: 'Associated workflow run not found' };
  }

  const workflow = db.workflows.find((w) => w.id === runRecord.workflow_id);
  if (!workflow) {
    return { success: false, error: 'Workflow not found' };
  }

  // 2. Strict Role & Org Authorization Check
  const member = db.getOrgMember(approverUserId, workflow.org_id);
  if (!member) {
    return {
      success: false,
      error: '403 Forbidden: Cross-Org Approval Blocked. Approver does not belong to the workflow organization.',
    };
  }

  if (member.role === 'viewer') {
    return {
      success: false,
      error: '403 Permission Denied: Viewer role cannot clear approval gates. Requires Owner or Editor role.',
    };
  }

  // 3. Mark Step Approved & Resume Execution
  const approver = db.users.find((u) => u.id === approverUserId);
  stepRun.status = 'completed';
  stepRun.approved_by = approverUserId;
  stepRun.approved_at = new Date().toISOString();
  stepRun.output = {
    ...stepRun.output,
    approval_status: 'APPROVED',
    approved_by_user: approver?.display_name || approverUserId,
    approved_by_role: member.role,
    resumed_at: new Date().toISOString(),
  };

  runRecord.status = 'running';
  runRecord.updated_at = new Date().toISOString();

  const runStepRuns = db.stepRuns.filter((sr) => sr.workflow_run_id === runRecord.id);
  broadcastUpdate(runRecord, runStepRuns);

  // Resume Execution Loop from next step index
  executeWorkflowLoop(runRecord.id, runRecord.current_step_index + 1);

  return {
    success: true,
    message: `Step "${stepRun.step_name}" successfully approved by ${approver?.display_name || 'User'}. Workflow resumed.`,
  };
}
