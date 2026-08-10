/**
 * DB Write Step Executor
 *
 * Inserts a data_record into PostgreSQL via Hasura mutation.
 */

import { hasuraAdminQuery } from '../hasuraAdmin';
import { v4 as uuidv4 } from 'uuid';

const INSERT_DATA_RECORD = `
  mutation InsertDataRecord($object: data_records_insert_input!) {
    insert_data_records_one(object: $object) {
      id
      org_id
      title
      created_at
    }
  }
`;

export async function executeDbWriteStep(
  step: any,
  orgId: string,
  contextData: Record<string, any>
): Promise<{ success: boolean; output?: any; error?: string }> {
  const recordTitle = step.config.record_title || 'Workflow Execution Outcome';

  try {
    const result = await hasuraAdminQuery<any>(INSERT_DATA_RECORD, {
      object: {
        id: uuidv4(),
        org_id: orgId,
        title: recordTitle,
        payload: contextData,
      },
    });

    const inserted = result.insert_data_records_one;

    return {
      success: true,
      output: {
        record_id: inserted?.id,
        table: 'data_records',
        org_id: orgId,
        title: recordTitle,
        written_at: inserted?.created_at || new Date().toISOString(),
        payload_keys: Object.keys(contextData),
      },
    };
  } catch (err: any) {
    return { success: false, error: `DB Write step failed: ${err.message}` };
  }
}
