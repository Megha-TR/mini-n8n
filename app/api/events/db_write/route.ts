/**
 * Hasura Event Trigger Handler: db_write
 *
 * Receives Hasura event trigger payloads when rows are inserted/updated
 * in watched tables. Looks up matching db_event workflows via Hasura.
 */

import { NextRequest, NextResponse } from 'next/server';
import { hasuraAdminQuery } from '@/lib/hasuraAdmin';
import { triggerWorkflowRun } from '@/lib/workflowEngine';

export async function POST(req: NextRequest) {
  try {
    const eventBody = await req.json().catch(() => ({}));
    const eventData = eventBody.event?.data?.new || eventBody;
    const orgId = eventData.org_id;

    if (!orgId) {
      return NextResponse.json({ error: 'No org_id in event payload' }, { status: 400 });
    }

    // Find workflows with db_event triggers in this org
    const data = await hasuraAdminQuery<any>(
      `query GetDbEventWorkflows($org_id: uuid!) {
        workflows(where: { org_id: { _eq: $org_id }, triggers: { trigger_type: { _eq: "db_event" } } }) {
          id
          org_id
          created_by
        }
      }`,
      { org_id: orgId }
    );

    const matchedWorkflows = data.workflows || [];
    const triggeredRuns = [];

    for (const wf of matchedWorkflows) {
      // Find org owner
      const memberData = await hasuraAdminQuery<any>(
        `query GetOrgOwner($org_id: uuid!) {
          org_members(where: { org_id: { _eq: $org_id }, role: { _eq: "owner" } }, limit: 1) {
            user_id
          }
        }`,
        { org_id: wf.org_id }
      );
      const ownerUserId = memberData.org_members?.[0]?.user_id || wf.created_by;
      const res = await triggerWorkflowRun(wf.id, ownerUserId, 'db_event');
      triggeredRuns.push({ workflow_id: wf.id, run_id: res.runId, status: res.status });
    }

    return NextResponse.json({
      success: true,
      event_type: 'Hasura DB Event Trigger',
      triggered_workflows: triggeredRuns,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
