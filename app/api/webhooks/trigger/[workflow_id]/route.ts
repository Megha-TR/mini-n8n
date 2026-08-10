/**
 * Webhook Trigger Endpoint
 *
 * POST /api/webhooks/trigger/[workflow_id]
 *
 * Accepts inbound webhook payloads and triggers the workflow.
 * Looks up the workflow owner via Hasura to run as that user.
 */

import { NextRequest, NextResponse } from 'next/server';
import { hasuraAdminQuery } from '@/lib/hasuraAdmin';
import { triggerWorkflowRun } from '@/lib/workflowEngine';

export async function POST(req: NextRequest, { params }: { params: { workflow_id: string } }) {
  try {
    const workflowId = params.workflow_id;

    // Look up the workflow and its org's owner via Hasura
    const wfData = await hasuraAdminQuery<any>(
      `query GetWorkflowForWebhook($id: uuid!) {
        workflows_by_pk(id: $id) {
          id
          org_id
          created_by
        }
      }`,
      { id: workflowId }
    );

    const workflow = wfData.workflows_by_pk;
    if (!workflow) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }

    // Find the org owner to run as
    const memberData = await hasuraAdminQuery<any>(
      `query GetOrgOwner($org_id: uuid!) {
        org_members(where: { org_id: { _eq: $org_id }, role: { _eq: "owner" } }, limit: 1) {
          user_id
        }
      }`,
      { org_id: workflow.org_id }
    );

    const ownerUserId = memberData.org_members?.[0]?.user_id || workflow.created_by;
    const payload = await req.json().catch(() => ({}));

    const result = await triggerWorkflowRun(workflowId, ownerUserId, 'webhook');

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: 'Inbound Webhook Triggered Workflow Execution Successfully',
      workflow_id: workflowId,
      run_id: result.runId,
      trigger_payload: payload,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
