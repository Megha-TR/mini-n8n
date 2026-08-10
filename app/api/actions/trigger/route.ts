/**
 * Hasura Action Handler: triggerWorkflowRun
 *
 * Authentication & Authorization Boundary:
 * Extracts user identity from Hasura session_variables / headers / session cookie.
 * Verifies caller membership and role in target workflow organization BEFORE creating run.
 */

import { NextRequest, NextResponse } from 'next/server';
import { triggerWorkflowRun } from '@/lib/workflowEngine';
import { getAuthenticatedUser } from '@/lib/authSession';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const input = body.input || body;
    const workflowId = input.workflow_id || input.workflowId;

    // Extract user ID: prioritize explicit Hasura session_variables or x-hasura-user-id header
    const sessionVars = body.session_variables || {};
    const headerUserId = req.headers.get('x-hasura-user-id');
    const session = getAuthenticatedUser(req);
    
    const callerUserId = sessionVars['x-hasura-user-id'] || headerUserId || session?.userId;

    if (!workflowId) {
      return NextResponse.json({ error: 'Missing workflow_id' }, { status: 400 });
    }

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
