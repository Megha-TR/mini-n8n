import { WorkflowStep } from '../db';

export async function executeHttpRequestStep(
  step: WorkflowStep,
  contextData: Record<string, any>
): Promise<{ success: boolean; output?: any; error?: string }> {
  const url = step.config.url || step.config.endpoint || 'https://httpbin.org/post';
  const method = (step.config.method || 'GET').toUpperCase();
  const headers = step.config.headers || { 'User-Agent': 'VocalLabs-AgentFlow' };

  let maxRetries = 2;
  let currentAttempt = 0;
  let lastError = '';

  while (currentAttempt < maxRetries) {
    currentAttempt++;
    try {
      const res = await fetch(url, {
        method,
        headers,
        signal: AbortSignal.timeout(5000),
      });

      const contentType = res.headers.get('content-type') || '';
      let bodyData: any;
      if (contentType.includes('application/json')) {
        bodyData = await res.json();
      } else {
        bodyData = await res.text();
      }

      if (!res.ok) {
        throw new Error(`HTTP Error ${res.status}: ${typeof bodyData === 'string' ? bodyData.slice(0, 100) : JSON.stringify(bodyData)}`);
      }

      return {
        success: true,
        output: {
          status: res.status,
          statusText: res.statusText,
          data: bodyData,
          url,
          method,
          attempts: currentAttempt,
        },
      };
    } catch (err: any) {
      lastError = err.message || String(err);
      if (currentAttempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 400 * currentAttempt));
      }
    }
  }

  return { success: false, error: `HTTP Request failed after ${maxRetries} attempts: ${lastError}` };
}
