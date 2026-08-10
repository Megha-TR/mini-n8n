/**
 * Server-side Hasura Admin Client
 *
 * This module provides a direct GraphQL client that talks to the Hasura
 * GraphQL Engine using the admin secret. It is used by the workflow engine
 * and action handlers to read/write data in PostgreSQL through Hasura.
 *
 * This is NOT the same as lib/hasuraClient.ts, which is used by the
 * browser-side code to talk to our /api/graphql proxy.
 */

const HASURA_ENDPOINT = process.env.HASURA_GRAPHQL_URL
  || process.env.NEXT_PUBLIC_HASURA_GRAPHQL_URL
  || 'http://localhost:8080/v1/graphql';

const HASURA_ADMIN_SECRET = process.env.HASURA_GRAPHQL_ADMIN_SECRET || 'myadminsecretkey';

export async function hasuraAdminQuery<T = any>(
  query: string,
  variables: Record<string, any> = {},
  sessionHeaders?: Record<string, string>
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-hasura-admin-secret': HASURA_ADMIN_SECRET,
  };

  // When session headers are provided, Hasura evaluates permissions
  // as that user/role instead of as admin
  if (sessionHeaders) {
    if (sessionHeaders['x-hasura-role']) headers['x-hasura-role'] = sessionHeaders['x-hasura-role'];
    if (sessionHeaders['x-hasura-user-id']) headers['x-hasura-user-id'] = sessionHeaders['x-hasura-user-id'];
    if (sessionHeaders['x-hasura-org-id']) headers['x-hasura-org-id'] = sessionHeaders['x-hasura-org-id'];
  }

  const res = await fetch(HASURA_ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Hasura request failed (${res.status}): ${text}`);
  }

  const json = await res.json();

  if (json.errors && json.errors.length > 0) {
    throw new Error(json.errors[0].message || 'Hasura GraphQL error');
  }

  return json.data as T;
}

/**
 * Check if Hasura is reachable. Returns true if we get a valid response.
 */
export async function isHasuraAvailable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);

    const res = await fetch(HASURA_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hasura-admin-secret': HASURA_ADMIN_SECRET,
      },
      body: JSON.stringify({ query: '{ __typename }' }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    return res.ok;
  } catch {
    return false;
  }
}
