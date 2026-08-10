import { WorkflowStep } from '../db';

export function executeNotifyStep(
  step: WorkflowStep,
  contextData: Record<string, any>
): { success: boolean; output: any } {
  const channel = step.config.channel || '#executive-alerts';
  const rawMsg = step.config.message || 'Workflow executed successfully!';

  return {
    success: true,
    output: {
      channel,
      notification_sent: true,
      message_body: rawMsg,
      delivered_at: new Date().toISOString(),
      recipient_type: 'Event Trigger Alert Hook',
    },
  };
}
