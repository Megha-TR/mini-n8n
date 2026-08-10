import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { triggerWorkflowRun } from '@/lib/workflowEngine';

// Hasura Event Trigger handler on table inserts/updates (e.g. data_records)
export async function POST(req: NextRequest) {
  try {
    const eventBody = await req.json().catch(() => ({}));
    const eventData = eventBody.event?.data?.new || eventBody;
    const orgId = eventData.org_id || db.orgs[0]?.id;

    // Find workflows listening for db_event trigger in this organization
    const dbEventTriggers = db.triggers.filter((t) => t.trigger_type === 'db_event');
    const matchedWorkflows = db.workflows.filter(
      (w) => w.org_id === orgId && dbEventTriggers.some((t) => t.workflow_id === w.id)
    );

    const triggeredRuns = [];
    for (const wf of matchedWorkflows) {
      const owner = db.members.find((m) => m.org_id === wf.org_id && m.role === 'owner');
      const res = await triggerWorkflowRun(wf.id, owner?.user_id || wf.created_by, 'db_event');
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
