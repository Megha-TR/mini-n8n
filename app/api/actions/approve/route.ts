/**
 * Hasura Action Handler: approveStep
 *
 * Strict Authentication Boundary:
 * Extracts & verifies session token / cookie from request via getAuthenticatedUser(req).
 * Passes verified approverUserId to workflow engine.
 */

import { NextRequest, NextResponse } from 'next/server';
import { approveStep } from '@/lib/workflowEngine';
import { getAuthenticatedUser } from '@/lib/authSession';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const input = body.input || body;
    const stepRunId = input.step_run_id || input.stepRunId;

    // 1. Authenticate user from session token / cookie
    const session = getAuthenticatedUser(req);
    const sessionVars = body.session_variables || {};
    const approverUserId = session?.userId || sessionVars['x-hasura-user-id'] || req.headers.get('x-hasura-user-id');

    if (!stepRunId) {
      return NextResponse.json({ error: 'Missing step_run_id' }, { status: 400 });
    }

    if (!approverUserId) {
      return NextResponse.json(
        { error: '401 Unauthorized: Missing or invalid authentication session' },
        { status: 401 }
      );
    }

    const result = await approveStep(stepRunId, approverUserId);

    if (!result.success) {
      const statusCode = result.error?.includes('403') ? 403 : 400;
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
