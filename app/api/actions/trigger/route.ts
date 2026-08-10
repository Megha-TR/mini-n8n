/**
 * Hasura Action Handler: triggerWorkflowRun
 *
 * Strict Authentication Boundary:
 * Extracts & verifies session token / cookie from request via getAuthenticatedUser(req).
 * Passes verified callerUserId to workflow engine.
 */

import { NextRequest, NextResponse } from 'next/server';
import { triggerWorkflowRun } from '@/lib/workflowEngine';
import { getAuthenticatedUser } from '@/lib/authSession';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const input = body.input || body;
    const workflowId = input.workflow_id || input.workflowId;

    // 1. Authenticate user from session token / cookie
    const session = getAuthenticatedUser(req);
    
    // Fallback for Hasura Action event triggers passing session_variables
    const sessionVars = body.session_variables || {};
    const callerUserId = session?.userId || sessionVars['x-hasura-user-id'] || req.headers.get('x-hasura-user-id');

    if (!workflowId) {
      return NextResponse.json({ error: 'Missing workflow_id' }, { status: 400 });
    }

    if (!callerUserId) {
      return NextResponse.json(
        { error: '401 Unauthorized: Missing or invalid authentication session' },
        { status: 401 }
      );
    }

    const result = await triggerWorkflowRun(workflowId, callerUserId, 'manual');

    if (!result.success) {
      const statusCode = result.error?.includes('429') ? 429
        : result.error?.includes('403') ? 403
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
