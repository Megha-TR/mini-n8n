import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { triggerWorkflowRun } from '@/lib/workflowEngine';

export async function POST(req: NextRequest, { params }: { params: { workflow_id: string } }) {
  try {
    const workflowId = params.workflow_id;
    const workflow = db.workflows.find((w) => w.id === workflowId);

    if (!workflow) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }

    const payload = await req.json().catch(() => ({}));

    // Find workflow owner or system user
    const ownerMember = db.members.find((m) => m.org_id === workflow.org_id && m.role === 'owner');
    const runnerUserId = ownerMember?.user_id || workflow.created_by;

    const result = await triggerWorkflowRun(workflowId, runnerUserId, 'webhook');

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
