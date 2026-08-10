/**
 * Cron / Scheduled Trigger Endpoint
 *
 * POST /api/cron/trigger
 *
 * Looks up workflow and org owner via Hasura before triggering.
 */

import { NextRequest, NextResponse } from 'next/server';
import { hasuraAdminQuery } from '@/lib/hasuraAdmin';
import { triggerWorkflowRun } from '@/lib/workflowEngine';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const workflowId = body.workflow_id;

    if (!workflowId) {
      return NextResponse.json({ error: 'No workflow_id specified for scheduled run' }, { status: 400 });
    }

    // Look up the workflow via Hasura
    const wfData = await hasuraAdminQuery<any>(
      `query GetWorkflow($id: uuid!) {
        workflows_by_pk(id: $id) { id org_id created_by }
      }`,
      { id: workflowId }
    );
    const workflow = wfData.workflows_by_pk;
    if (!workflow) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }

    // Find org owner
    const memberData = await hasuraAdminQuery<any>(
      `query GetOrgOwner($org_id: uuid!) {
        org_members(where: { org_id: { _eq: $org_id }, role: { _eq: "owner" } }, limit: 1) {
          user_id
        }
      }`,
      { org_id: workflow.org_id }
    );
    const ownerUserId = memberData.org_members?.[0]?.user_id || workflow.created_by;

    const result = await triggerWorkflowRun(workflowId, ownerUserId, 'scheduled');

    return NextResponse.json({
      success: result.success,
      trigger_type: 'scheduled',
      run_id: result.runId,
      error: result.error,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
