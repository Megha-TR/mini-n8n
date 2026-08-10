/**
 * Browser-side Hasura Client
 *
 * Used by frontend components to send GraphQL queries/mutations
 * to our /api/graphql proxy, which forwards them to the Hasura
 * GraphQL Engine with session headers for permission evaluation.
 */

export class HasuraGraphQLClient {
  private endpoint: string;

  constructor(endpoint: string = '/api/graphql') {
    this.endpoint = endpoint;
  }

  public async query(
    queryStr: string,
    variables: Record<string, any> = {},
    headers: Record<string, string> = {}
  ) {
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

  public async mutate(
    mutationStr: string,
    variables: Record<string, any> = {},
    headers: Record<string, string> = {}
  ) {
    return this.query(mutationStr, variables, headers);
  }
}

export const hasuraClient = new HasuraGraphQLClient();
