/**
 * Hasura Action Handler: triggerWorkflowRun
 *
 * Authentication & Authorization Boundary:
 * Strictly derives caller identity ONLY from cryptographically verified session (getAuthenticatedUser).
 * Client-supplied x-hasura-user-id headers and body.session_variables are ignored for identity resolution.
 */

import { NextRequest, NextResponse } from 'next/server';
import { triggerWorkflowRun } from '@/lib/workflowEngine';
import { getAuthenticatedUser } from '@/lib/authSession';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const input = body.input || body;
    const workflowId = input.workflow_id || input.workflowId;

    if (!workflowId) {
      return NextResponse.json({ error: 'Missing workflow_id' }, { status: 400 });
    }

    // Identity is derived ONLY from cryptographically signed session token / cookie!
    const callerUserId = getAuthenticatedUser(req)?.userId;

    if (!callerUserId) {
      return NextResponse.json(
        { error: '401 Unauthorized: Missing or invalid authentication session' },
        { status: 401 }
      );
    }

    // Call workflow engine (performs org membership & role authorization before DB write)
    const result = await triggerWorkflowRun(workflowId, callerUserId, 'manual');

    if (!result.success) {
      const statusCode = result.error?.includes('429') ? 429
        : result.error?.includes('403') || result.error?.includes('Forbidden') || result.error?.includes('Permission Denied') ? 403
        : 400;
      return NextResponse.json(
        { message: result.error, error: result.error },
        { status: statusCode }
      );
    }

    return NextResponse.json({
      run_id: result.runId,
      status: result.status,
      message: 'Workflow run initiated successfully',
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Action handler error' },
      { status: 500 }
    );
  }
}
