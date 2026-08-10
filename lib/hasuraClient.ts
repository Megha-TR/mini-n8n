export interface HasuraClientConfig {
  endpoint?: string;
  adminSecret?: string;
}

export class HasuraGraphQLClient {
  private endpoint: string;
  private adminSecret?: string;

  constructor(config?: HasuraClientConfig) {
    this.endpoint = config?.endpoint || process.env.NEXT_PUBLIC_HASURA_GRAPHQL_URL || '/api/graphql';
    this.adminSecret = config?.adminSecret || process.env.HASURA_GRAPHQL_ADMIN_SECRET;
  }

  public async query(
    queryStr: string,
    variables: Record<string, any> = {},
    headers: Record<string, string> = {}
  ) {
    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers,
    };

    if (this.adminSecret && !requestHeaders['x-hasura-admin-secret']) {
      requestHeaders['x-hasura-admin-secret'] = this.adminSecret;
    }

    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: requestHeaders,
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
