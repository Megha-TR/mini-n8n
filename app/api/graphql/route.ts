/**
 * GraphQL Proxy Route: /api/graphql
 *
 * This route is a pure pass-through proxy to the Hasura GraphQL Engine.
 * It forwards the incoming GraphQL query/mutation along with session
 * headers (x-hasura-user-id, x-hasura-role) so that Hasura's permission
 * engine evaluates row-level access against the org_members table.
 *
 * There is NO in-memory fallback here. If Hasura is unreachable, the
 * request fails with a clear error.
 */

import { NextRequest, NextResponse } from 'next/server';

const HASURA_ENDPOINT = process.env.HASURA_GRAPHQL_URL
  || process.env.NEXT_PUBLIC_HASURA_GRAPHQL_URL
  || 'http://localhost:8080/v1/graphql';

const HASURA_ADMIN_SECRET = process.env.HASURA_GRAPHQL_ADMIN_SECRET || 'myadminsecretkey';

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { errors: [{ message: 'Invalid JSON body' }] },
      { status: 400 }
    );
  }

  // Extract session headers from the incoming request
  const userId = req.headers.get('x-hasura-user-id') || req.headers.get('x-user-id');
  const role = req.headers.get('x-hasura-role') || req.headers.get('x-role');
  const orgId = req.headers.get('x-hasura-org-id') || req.headers.get('x-org-id');

  // Build headers for the Hasura request.
  // We use the admin secret to authenticate, but also pass session variables
  // so Hasura evaluates its permission rules as the given user/role.
  const hasuraHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-hasura-admin-secret': HASURA_ADMIN_SECRET,
  };

  if (userId) hasuraHeaders['x-hasura-user-id'] = userId;
  if (role) hasuraHeaders['x-hasura-role'] = role;
  if (orgId) hasuraHeaders['x-hasura-org-id'] = orgId;

  try {
    const hasuraRes = await fetch(HASURA_ENDPOINT, {
      method: 'POST',
      headers: hasuraHeaders,
      body: JSON.stringify({
        query: body.query,
        variables: body.variables || {},
        operationName: body.operationName,
      }),
    });

    const hasuraJson = await hasuraRes.json();
    return NextResponse.json(hasuraJson, { status: hasuraRes.status });
  } catch (err: any) {
    return NextResponse.json(
      {
        errors: [{
          message: `Hasura GraphQL Engine unreachable at ${HASURA_ENDPOINT}. `
            + `Ensure Docker Compose is running (docker compose up). Error: ${err.message}`,
        }],
      },
      { status: 502 }
    );
  }
}
