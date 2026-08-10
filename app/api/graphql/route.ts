/**
 * Authenticated GraphQL Proxy Route: /api/graphql
 *
 * Security Architecture:
 * 1. Extract user identity (x-hasura-user-id / x-user-id) from client request headers.
 * 2. Authenticate user against PostgreSQL by checking org_members table via Hasura admin query.
 * 3. Resolve user's REAL organization membership and role directly from PostgreSQL.
 * 4. NEVER trust arbitrary x-hasura-role client headers. Role is strictly DB-verified.
 * 5. Forward request to Hasura Engine with verified x-hasura-user-id, x-hasura-role, and x-hasura-org-id.
 */

import { NextRequest, NextResponse } from 'next/server';

const HASURA_ENDPOINT = process.env.HASURA_GRAPHQL_URL
  || process.env.NEXT_PUBLIC_HASURA_GRAPHQL_URL
  || 'http://localhost:8080/v1/graphql';

const HASURA_ADMIN_SECRET = process.env.HASURA_GRAPHQL_ADMIN_SECRET || 'myadminsecretkey';

const AUTH_LOOKUP_QUERY = `
  query AuthenticateAndResolveRole($user_id: uuid!) {
    org_members(where: { user_id: { _eq: $user_id } }) {
      id
      user_id
      org_id
      role
    }
  }
`;

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

  // 1. Extract identity header from client
  const userId = req.headers.get('x-hasura-user-id') || req.headers.get('x-user-id');
  const requestedOrgId = req.headers.get('x-hasura-org-id') || req.headers.get('x-org-id');

  if (!userId) {
    return NextResponse.json(
      { errors: [{ message: '401 Unauthorized: Missing user identity header (x-hasura-user-id).' }] },
      { status: 401 }
    );
  }

  // 2. Query PostgreSQL via Hasura Admin Secret to authenticate user & resolve real role
  let authRes: Response;
  try {
    authRes = await fetch(HASURA_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hasura-admin-secret': HASURA_ADMIN_SECRET,
      },
      body: JSON.stringify({
        query: AUTH_LOOKUP_QUERY,
        variables: { user_id: userId },
      }),
    });
  } catch (err: any) {
    return NextResponse.json(
      { errors: [{ message: `Authentication server error: ${err.message}` }] },
      { status: 502 }
    );
  }

  const authJson = await authRes.json();
  const memberships: Array<{ org_id: string; role: string }> = authJson.data?.org_members || [];

  if (memberships.length === 0) {
    return NextResponse.json(
      { errors: [{ message: `401 Unauthorized: User identity "${userId}" has no valid organization membership in database.` }] },
      { status: 401 }
    );
  }

  // 3. Resolve active organization & verified role from PostgreSQL
  let activeMember = memberships[0];
  if (requestedOrgId) {
    const match = memberships.find((m) => m.org_id === requestedOrgId);
    if (!match) {
      return NextResponse.json(
        { errors: [{ message: `403 Forbidden: Cross-Tenant Access Denied. User does not belong to organization "${requestedOrgId}".` }] },
        { status: 403 }
      );
    }
    activeMember = match;
  }

  const verifiedRole = activeMember.role;
  const verifiedOrgId = activeMember.org_id;

  // 4. Build trusted Hasura session headers with DB-verified role and org_id
  const hasuraHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-hasura-admin-secret': HASURA_ADMIN_SECRET,
    'x-hasura-user-id': userId,
    'x-hasura-role': verifiedRole, // Enforced REAL role from PostgreSQL
    'x-hasura-org-id': verifiedOrgId, // Enforced REAL org from PostgreSQL
  };

  // 5. Proxy request to Hasura Engine
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
          message: `Hasura GraphQL Engine unreachable at ${HASURA_ENDPOINT}. Error: ${err.message}`,
        }],
      },
      { status: 502 }
    );
  }
}
