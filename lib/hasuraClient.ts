import { subscribeToStepRuns, db } from './workflowEngine';

export interface HasuraClientConfig {
  endpoint?: string;
  headers?: Record<string, string>;
}

export class HasuraGraphQLClient {
  private endpoint: string;

  constructor(endpoint: string = '/api/graphql') {
    this.endpoint = endpoint;
  }

  public async query(queryStr: string, variables: Record<string, any> = {}, headers: Record<string, string> = {}) {
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify({ query: queryStr, variables }),
    });

    const json = await res.json();
    if (json.errors && json.errors.length > 0) {
      throw new Error(json.errors[0].message || 'GraphQL Query Error');
    }
    return json.data;
  }

  public async mutate(mutationStr: string, variables: Record<string, any> = {}, headers: Record<string, string> = {}) {
    return this.query(mutationStr, variables, headers);
  }

  // Live GraphQL Subscription for step_runs
  public subscribeToStepRuns(
    workflowRunId: string,
    onData: (data: { run: any; stepRuns: any[] }) => void
  ): () => void {
    // Initial fetch of step runs
    this.query(
      `
      query GetStepRuns($workflow_run_id: String!) {
        step_runs(where: { workflow_run_id: { _eq: $workflow_run_id } }) {
          id
          step_order
          step_name
          step_type
          status
          input
          output
          error
          approved_by
          approved_at
        }
      }
    `,
      { workflow_run_id: workflowRunId }
    ).then((data) => {
      if (data?.step_runs) {
        onData({ run: data.workflow_run, stepRuns: data.step_runs });
      }
    }).catch(() => {});

    // Listen to real-time execution engine updates
    return subscribeToStepRuns(({ run, stepRuns }) => {
      if (run.id === workflowRunId) {
        onData({ run, stepRuns });
      }
    });
  }
}

export const hasuraClient = new HasuraGraphQLClient();
