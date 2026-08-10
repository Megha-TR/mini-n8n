import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { triggerWorkflowRun, approveStep } from '@/lib/workflowEngine';
import { verifyStepCreationPermission } from '@/lib/authContext';
import { v4 as uuidv4 } from 'uuid';

const HASURA_ENDPOINT = process.env.HASURA_GRAPHQL_URL || 'http://localhost:8080/v1/graphql';
const HASURA_ADMIN_SECRET = process.env.HASURA_GRAPHQL_ADMIN_SECRET || 'myadminsecretkey';

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch (e) {
    return NextResponse.json({ errors: [{ message: 'Invalid JSON body' }] }, { status: 400 });
  }

  const { query, variables } = body;

  // Extract Session Headers
  const userId = req.headers.get('x-hasura-user-id') || req.headers.get('x-user-id') || '11111111-1111-1111-1111-111111111111';
  const roleHeader = req.headers.get('x-hasura-role') || req.headers.get('x-role');
  const orgHeader = req.headers.get('x-hasura-org-id') || req.headers.get('x-org-id');

  // Attempt live Hasura proxy first if reachable
  try {
    const hasuraHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-hasura-admin-secret': HASURA_ADMIN_SECRET,
      'x-hasura-user-id': userId,
    };
    if (roleHeader) hasuraHeaders['x-hasura-role'] = roleHeader;
    if (orgHeader) hasuraHeaders['x-hasura-org-id'] = orgHeader;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1200);

    const hasuraRes = await fetch(HASURA_ENDPOINT, {
      method: 'POST',
      headers: hasuraHeaders,
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (hasuraRes.ok) {
      const hasuraJson = await hasuraRes.json();
      return NextResponse.json(hasuraJson, { status: hasuraRes.status });
    }
  } catch (err) {
    // Hasura engine offline or unreachable; falling back to local Hasura-compatible handler
  }

  // --- Local Hasura Engine Fallback Handler ---
  const user = db.users.find((u) => u.id === userId);
  let member = db.members.find((m) => m.user_id === userId && (orgHeader ? m.org_id === orgHeader : true));
  if (!member) {
    member = db.members.find((m) => m.user_id === userId) || db.members[0];
  }
  const role = (roleHeader as 'owner' | 'editor' | 'viewer') || member?.role || 'owner';
  const userOrgId = member?.org_id || 'aaaaa-11111-org-a';

  const normalizedQuery = (query || '').replace(/\s+/g, ' ').trim();

  // 1. MUTATION: triggerWorkflowRun
  if (normalizedQuery.includes('triggerWorkflowRun')) {
    if (role === 'viewer') {
      return NextResponse.json(
        { errors: [{ message: '403 Permission Denied: Viewer role cannot trigger workflow runs.' }] },
        { status: 403 }
      );
    }

    const inlineWfMatch = (query || '').match(/workflow_id:\s*"([^"]+)"/);
    const workflowId = variables?.workflow_id || variables?.workflowId || (inlineWfMatch ? inlineWfMatch[1] : null);

    if (!workflowId) {
      return NextResponse.json({ errors: [{ message: 'Missing workflow_id variable' }] }, { status: 400 });
    }

    const res = await triggerWorkflowRun(workflowId, userId, 'manual');
    if (!res.success) {
      return NextResponse.json({ errors: [{ message: res.error }] }, { status: res.error?.includes('403') ? 403 : 400 });
    }
    return NextResponse.json({
      data: {
        triggerWorkflowRun: {
          run_id: res.runId,
          status: res.status,
          message: 'Workflow run triggered successfully',
        },
      },
    });
  }

  // 2. MUTATION: approveStep
  if (normalizedQuery.includes('approveStep')) {
    const inlineStepMatch = (query || '').match(/step_run_id:\s*"([^"]+)"/);
    const stepRunId = variables?.step_run_id || variables?.stepRunId || (inlineStepMatch ? inlineStepMatch[1] : null);

    if (!stepRunId) {
      return NextResponse.json({ errors: [{ message: 'Missing step_run_id variable' }] }, { status: 400 });
    }

    const res = await approveStep(stepRunId, userId);
    if (!res.success) {
      return NextResponse.json({ errors: [{ message: res.error }] }, { status: res.error?.includes('403') ? 403 : 400 });
    }
    return NextResponse.json({
      data: {
        approveStep: {
          success: true,
          message: res.message,
        },
      },
    });
  }

  // 3. MUTATION: insert_workflow_steps
  if (normalizedQuery.includes('insert_workflow_steps') || normalizedQuery.includes('createStep')) {
    const stepType = variables?.type || variables?.input?.type || 'db_write';
    const checkRes = verifyStepCreationPermission(userId, userOrgId, stepType);
    if (!checkRes.allowed) {
      return NextResponse.json({ errors: [{ message: checkRes.error }] }, { status: 403 });
    }

    const newStep = {
      id: uuidv4(),
      workflow_id: variables?.workflow_id || variables?.input?.workflow_id || db.workflows[0].id,
      step_order: (db.steps.filter((s) => s.workflow_id === (variables?.workflow_id || db.workflows[0].id)).length + 1),
      name: variables?.name || variables?.input?.name || `New ${stepType} Step`,
      type: stepType,
      config: variables?.config || variables?.input?.config || {},
      created_at: new Date().toISOString(),
    };
    db.steps.push(newStep);

    return NextResponse.json({
      data: { insert_workflow_steps_one: newStep },
    });
  }

  // 4. QUERY: Workflows with Steps & Triggers (Layer 1 Org Scoped)
  if (normalizedQuery.includes('workflows') || normalizedQuery.includes('GetWorkflows') || normalizedQuery.includes('GetOrgAWorkflow')) {
    let userWorkflows = db.workflows.filter((w) => w.org_id === userOrgId);

    const guessedIdMatch = (query || '').match(/id:\s*{\s*_eq:\s*"([^"]+)"\s*}/);
    if (guessedIdMatch && guessedIdMatch[1]) {
      const targetId = guessedIdMatch[1];
      userWorkflows = userWorkflows.filter((w) => w.id === targetId);
    }

    const formattedWorkflows = userWorkflows.map((w) => {
      const steps = db.steps.filter((s) => s.workflow_id === w.id).sort((a, b) => a.step_order - b.step_order);
      const triggers = db.triggers.filter((t) => t.workflow_id === w.id);
      const runs = db.runs.filter((r) => r.workflow_id === w.id).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const recentRun = runs[0] || null;

      return {
        ...w,
        steps,
        triggers,
        recent_run: recentRun,
        runs_count: runs.length,
      };
    });

    const currentOrg = db.orgs.find((o) => o.id === userOrgId);
    const usageSummary = {
      calls_used: currentOrg?.calls_used || 0,
      max_calls_allowed: currentOrg?.max_calls_allowed || 50,
      quota_percentage_used: Math.round(((currentOrg?.calls_used || 0) / (currentOrg?.max_calls_allowed || 50)) * 100),
      total_workflows: userWorkflows.length,
      total_runs: db.runs.filter((r) => userWorkflows.some((w) => w.id === r.workflow_id)).length,
    };

    return NextResponse.json({
      data: {
        workflows: formattedWorkflows,
        organization: {
          ...currentOrg,
          usage_summary: usageSummary,
        },
      },
    });
  }

  // 5. QUERY: step_runs (Layer 1 Org Scoped)
  if (normalizedQuery.includes('step_runs') || normalizedQuery.includes('GetStepRuns')) {
    const runId = variables?.workflow_run_id || variables?.run_id;
    const targetRun = db.runs.find((r) => r.id === runId);

    if (targetRun) {
      const targetWorkflow = db.workflows.find((w) => w.id === targetRun.workflow_id);
      if (targetWorkflow?.org_id !== userOrgId) {
        return NextResponse.json(
          { errors: [{ message: '403 Forbidden: Cross-Org Access Denied. Step runs belong to another organization.' }] },
          { status: 403 }
        );
      }
    }

    const matchingStepRuns = db.stepRuns
      .filter((sr) => {
        const parentRun = db.runs.find((r) => r.id === sr.workflow_run_id);
        const parentWf = parentRun ? db.workflows.find((w) => w.id === parentRun.workflow_id) : null;
        return parentWf?.org_id === userOrgId && (runId ? sr.workflow_run_id === runId : true);
      })
      .sort((a, b) => a.step_order - b.step_order);

    return NextResponse.json({
      data: {
        step_runs: matchingStepRuns,
        workflow_run: (targetRun && db.workflows.find((w) => w.id === targetRun.workflow_id)?.org_id === userOrgId) ? targetRun : null,
      },
    });
  }

  return NextResponse.json({
    data: {
      workflows: db.workflows.filter((w) => w.org_id === userOrgId),
    },
  });
}
