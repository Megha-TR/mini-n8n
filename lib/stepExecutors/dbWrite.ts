import { db, WorkflowStep } from '../db';
import { v4 as uuidv4 } from 'uuid';

export function executeDbWriteStep(
  step: WorkflowStep,
  orgId: string,
  contextData: Record<string, any>
): { success: boolean; output: any; error?: string } {
  try {
    const recordTitle = step.config.record_title || 'Workflow Execution Outcome';
    const newRecord = {
      id: uuidv4(),
      org_id: orgId,
      title: recordTitle,
      payload: contextData,
      created_at: new Date().toISOString(),
    };

    db.dataRecords.push(newRecord);

    return {
      success: true,
      output: {
        record_id: newRecord.id,
        table: 'data_records',
        org_id: orgId,
        title: recordTitle,
        written_at: newRecord.created_at,
        payload_summary: `${Object.keys(contextData).length} step outputs saved to Postgres database`,
      },
    };
  } catch (err: any) {
    return { success: false, error: `DB Write step failed: ${err.message}` };
  }
}
