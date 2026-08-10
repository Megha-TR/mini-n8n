import { NextRequest, NextResponse } from 'next/server';
import { triggerWorkflowRun } from '@/lib/workflowEngine';
import { getAuthContextFromHeaders } from '@/lib/authContext';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Hasura Action payload structure: { action: { name: "triggerWorkflowRun" }, input: { workflow_id: "..." }, session_variables: { "x-hasura-user-id": "..." } }
    const input = body.input || body;
    const workflowId = input.workflow_id || input.workflowId;

    // Resolve User Authentication & Headers
    const sessionVars = body.session_variables || {};
    const userId = sessionVars['x-hasura-user-id'] || req.headers.get('x-hasura-user-id') || req.headers.get('x-user-id');
    const orgId = sessionVars['x-hasura-org-id'] || req.headers.get('x-hasura-org-id') || req.headers.get('x-org-id');

    if (!workflowId) {
      return NextResponse.json({ error: 'Missing workflow_id' }, { status: 400 });
    }

    if (!userId) {
      return NextResponse.json({ error: '401 Unauthorized: Missing user identity' }, { status: 401 });
    }

    const result = await triggerWorkflowRun(workflowId, userId, 'manual');

    if (!result.success) {
      const statusCode = result.error?.includes('429') ? 429 : result.error?.includes('403') ? 403 : 400;
      return NextResponse.json({ message: result.error, error: result.error }, { status: statusCode });
    }

    return NextResponse.json({
      run_id: result.runId,
      status: result.status,
      message: 'Workflow run initiated successfully',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Action handler error' }, { status: 500 });
  }
}
