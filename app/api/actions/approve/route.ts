/**
 * Hasura Action Handler: approveStep
 *
 * Authentication & Authorization Boundary:
 * Strictly derives approver identity ONLY from cryptographically verified session (getAuthenticatedUser).
 * Client-supplied x-hasura-user-id headers and body.session_variables are ignored for identity resolution.
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

    // Identity is derived ONLY from cryptographically signed session token / cookie!
    const approverUserId = getAuthenticatedUser(req)?.userId;

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
