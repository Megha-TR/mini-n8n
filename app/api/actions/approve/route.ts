/**
 * Hasura Action Handler: approveStep
 *
 * Authentication & Authorization Boundary:
 * Extracts approver identity from Hasura request headers / session_variables or session cookie.
 * Verifies approver membership in target workflow organization BEFORE modifying step state.
 */

import { NextRequest, NextResponse } from 'next/server';
import { approveStep } from '@/lib/workflowEngine';
import { getAuthenticatedUser } from '@/lib/authSession';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const input = body.input || body;
    const stepRunId = input.step_run_id || input.stepRunId;

    if (!stepRunId) {
      return NextResponse.json({ error: 'Missing step_run_id' }, { status: 400 });
    }

    const sessionVars = body.session_variables || {};
    const headerUserId = req.headers.get('x-hasura-user-id');
    const session = getAuthenticatedUser(req);

    const approverUserId = headerUserId || sessionVars['x-hasura-user-id'] || session?.userId;

    if (!approverUserId) {
      return NextResponse.json(
        { error: '401 Unauthorized: Missing or invalid authentication session' },
        { status: 401 }
      );
    }

    const result = await approveStep(stepRunId, approverUserId);

    if (!result.success) {
      const statusCode = result.error?.includes('403') || result.error?.includes('Forbidden') ? 403 : 400;
      return NextResponse.json(
        { message: result.error, error: result.error },
        { status: statusCode }
      );
    }

    return NextResponse.json({
      success: true,
      message: result.message,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Action handler error' },
      { status: 500 }
    );
  }
}
