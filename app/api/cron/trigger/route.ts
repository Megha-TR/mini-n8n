import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { triggerWorkflowRun } from '@/lib/workflowEngine';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const workflowId = body.workflow_id || db.workflows[0]?.id;

    if (!workflowId) {
      return NextResponse.json({ error: 'No workflow specified for scheduled run' }, { status: 400 });
    }

    const workflow = db.workflows.find((w) => w.id === workflowId);
    if (!workflow) return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });

    const ownerMember = db.members.find((m) => m.org_id === workflow.org_id && m.role === 'owner');

    const result = await triggerWorkflowRun(workflowId, ownerMember?.user_id || workflow.created_by, 'scheduled');

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
