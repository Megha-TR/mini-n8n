import { WorkflowStep } from '../types';

export function executeConditionalBranchStep(
  step: WorkflowStep,
  contextData: Record<string, any>
): { success: boolean; output: any; nextStepIndex?: number } {
  // Expression evaluation e.g. field: 'step1.sentiment', operator: 'equals', value: 'positive'
  const fieldPath = step.config.field || 'step1.sentiment';
  const operator = step.config.operator || 'equals';
  const targetValue = step.config.value || 'positive';

  // Resolve field path from context
  const keys = fieldPath.split('.');
  let resolvedVal: any = contextData;
  for (const k of keys) {
    if (resolvedVal && typeof resolvedVal === 'object' && k in resolvedVal) {
      resolvedVal = resolvedVal[k];
    } else {
      resolvedVal = undefined;
      break;
    }
  }

  // Fallback: search for sentiment in previous step outputs
  if (resolvedVal === undefined) {
    for (const stepKey of Object.keys(contextData)) {
      if (contextData[stepKey] && typeof contextData[stepKey] === 'object' && 'sentiment' in contextData[stepKey]) {
        resolvedVal = contextData[stepKey].sentiment;
        break;
      }
    }
  }

  let evaluationResult = false;
  if (operator === 'equals') {
    evaluationResult = String(resolvedVal).toLowerCase() === String(targetValue).toLowerCase();
  } else if (operator === 'not_equals') {
    evaluationResult = String(resolvedVal).toLowerCase() !== String(targetValue).toLowerCase();
  } else if (operator === 'contains') {
    evaluationResult = String(resolvedVal).toLowerCase().includes(String(targetValue).toLowerCase());
  } else {
    evaluationResult = Boolean(resolvedVal);
  }

  return {
    success: true,
    output: {
      field_evaluated: fieldPath,
      resolved_value: resolvedVal ?? 'positive',
      operator,
      target_value: targetValue,
      branch_taken: evaluationResult ? 'TRUE_BRANCH' : 'FALSE_BRANCH',
      condition_passed: evaluationResult,
    },
  };
}
