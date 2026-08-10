/**
 * Authenticated GraphQL Proxy Route: /api/graphql
 *
 * Strict Authentication Boundary:
 * 1. Extracts & cryptographically verifies session token / cookie using getAuthenticatedUser(req).
 * 2. REJECTS any request lacking a valid signed session token (401 Unauthorized).
 * 3. Takes callerUserId strictly from the verified session payload (NOT from raw client headers).
 * 4. Resolves user's REAL organization membership and role directly from PostgreSQL (org_members).
 * 5. Passes verified session variables (x-hasura-user-id, x-hasura-role, x-hasura-org-id) to Hasura.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/authSession';

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

  // 1. Enforce Authentication Boundary: Extract & verify session token / cookie
  const session = getAuthenticatedUser(req);
  if (!session) {
    return NextResponse.json(
      { errors: [{ message: '401 Unauthorized: Valid authentication session token or cookie required. Please authenticate via /api/auth/login.' }] },
      { status: 401 }
    );
  }

  // callerUserId is derived STRICTLY from cryptographically verified session token!
  const callerUserId = session.userId;
  const requestedOrgId = req.headers.get('x-hasura-org-id') || req.headers.get('x-org-id');

  // 2. Query PostgreSQL via Hasura Admin Secret to resolve user's org membership & real role
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
        variables: { user_id: callerUserId },
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
      { errors: [{ message: `401 Unauthorized: Authenticated user "${callerUserId}" has no valid organization membership in database.` }] },
      { status: 401 }
    );
  }

  // 3. Resolve active organization & verified role from PostgreSQL
  let activeMember = memberships[0];
  if (requestedOrgId) {
    const match = memberships.find((m) => m.org_id === requestedOrgId);
    if (!match) {
      return NextResponse.json(
        { errors: [{ message: `403 Forbidden: Cross-Tenant Access Denied. Authenticated user does not belong to organization "${requestedOrgId}".` }] },
        { status: 403 }
      );
    }
    activeMember = match;
  }

  const verifiedRole = activeMember.role;
  const verifiedOrgId = activeMember.org_id;

  // 4. Build trusted Hasura session headers with verified user, role, and org_id
  const hasuraHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-hasura-admin-secret': HASURA_ADMIN_SECRET,
    'x-hasura-user-id': callerUserId, // Verified from session token
    'x-hasura-role': verifiedRole,     // Verified from PostgreSQL
    'x-hasura-org-id': verifiedOrgId,   // Verified from PostgreSQL
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
