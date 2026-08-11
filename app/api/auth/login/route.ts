/**
 * Nhost Auth Login API Endpoint: /api/auth/login
 *
 * Authenticates user credentials/identity against PostgreSQL.
 * On successful authentication, creates an Nhost Auth JWT session containing Hasura claims
 * and sets an HTTP-Only cookie 'minin8n_session'.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createNhostSession, SESSION_COOKIE_NAME } from '@/lib/authSession';
import { hasuraAdminQuery } from '@/lib/hasuraAdmin';

const USER_QUERY = `
  query GetUser($id: uuid!) {
    org_members(where: { user_id: { _eq: $id } }) {
      user_id
      role
      org_id
      organization {
        id
        name
      }
    }
  }
`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const userId = body.userId || body.user_id;
    const email = body.email || 'user@minin8n.com';

    if (!userId) {
      return NextResponse.json(
        { error: '400 Bad Request: Missing userId parameter.' },
        { status: 400 }
      );
    }

    // Verify user exists in PostgreSQL via org_members table lookup
    const res = await hasuraAdminQuery<any>(USER_QUERY, { id: userId });
    const members = res.org_members || [];

    if (members.length === 0) {
      return NextResponse.json(
        { error: `401 Unauthorized: User ID "${userId}" is not registered in database.` },
        { status: 401 }
      );
    }

    const role = members[0].role;
    const orgId = members[0].org_id;
    const orgName = members[0].organization?.name;

    // Create standard Nhost Auth session
    const nhostSession = createNhostSession(userId, email, role, orgId, orgName);
    const token = nhostSession.accessToken;

    const response = NextResponse.json({
      success: true,
      message: 'Nhost Auth authentication successful',
      token,
      session: nhostSession,
      user: {
        id: userId,
        email,
        org_id: orgId,
        role: role,
        organization: members[0].organization,
      },
    });

    // Set HTTP-Only session cookie
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 86400, // 24 hours
    });

    return response;
  } catch (err: any) {
    return NextResponse.json(
      { error: `Authentication failed: ${err.message}` },
      { status: 500 }
    );
  }
}
