/**
 * Nhost Auth Cryptographic Session Service
 *
 * Provides Nhost Auth compliant JWT session issuance, signature verification,
 * and Hasura namespace claim extraction ('https://hasura.io/jwt/claims').
 */

import { NextRequest } from 'next/server';
import crypto from 'crypto';

const AUTH_SECRET = process.env.AUTH_SECRET || process.env.HASURA_GRAPHQL_ADMIN_SECRET || 'super-secret-auth-key-minin8n-2026';
const SESSION_COOKIE_NAME = 'minin8n_session';

export interface NhostHasuraClaims {
  'x-hasura-default-role': string;
  'x-hasura-allowed-roles': string[];
  'x-hasura-user-id': string;
  'x-hasura-org-id'?: string;
}

export interface SessionPayload {
  userId: string;
  sub: string;
  email: string;
  'https://hasura.io/jwt/claims': NhostHasuraClaims;
  iat: number;
  exp: number;
  iss: string;
}

export interface NhostSession {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    displayName: string;
    roles: string[];
    defaultRole: string;
    metadata: Record<string, any>;
  };
}

/**
 * Creates a signed Nhost Auth JWT token containing Hasura namespace claims.
 */
export function createSessionToken(
  userId: string,
  email: string,
  role: string = 'owner',
  orgId?: string
): string {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + (24 * 60 * 60); // 24 hours validity

  const payload: SessionPayload = {
    userId,
    sub: userId,
    email,
    'https://hasura.io/jwt/claims': {
      'x-hasura-default-role': role,
      'x-hasura-allowed-roles': ['owner', 'editor', 'viewer', 'user'],
      'x-hasura-user-id': userId,
      'x-hasura-org-id': orgId,
    },
    iat,
    exp,
    iss: 'nhost',
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', AUTH_SECRET)
    .update(payloadB64)
    .digest('base64url');

  return `${payloadB64}.${signature}`;
}

/**
 * Constructs a full Nhost Auth NhostSession object.
 */
export function createNhostSession(
  userId: string,
  email: string,
  role: string = 'owner',
  orgId?: string,
  orgName?: string
): NhostSession {
  const accessToken = createSessionToken(userId, email, role, orgId);
  return {
    accessToken,
    accessTokenExpiresIn: 86400,
    refreshToken: `nhost_rf_${userId}_${Date.now()}`,
    user: {
      id: userId,
      email,
      displayName: email.split('@')[0],
      roles: [role],
      defaultRole: role,
      metadata: {
        org_id: orgId,
        org_name: orgName,
      },
    },
  };
}

/**
 * Verifies a Nhost Auth token signature & expiration, returning the payload if valid.
 */
export function verifySessionToken(token: string): SessionPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;

    const [payloadB64, signature] = parts;
    const expectedSignature = crypto
      .createHmac('sha256', AUTH_SECRET)
      .update(payloadB64)
      .digest('base64url');

    if (signature !== expectedSignature) {
      return null; // Signature verification failed!
    }

    const payload: SessionPayload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));

    // Check expiration
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
      return null; // Token expired
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Extracts and verifies the authenticated Nhost user payload from incoming HTTP request.
 * Strictly checks 'Authorization: Bearer <token>' header OR 'minin8n_session' cookie.
 */
export function getAuthenticatedUser(req: NextRequest): SessionPayload | null {
  // 1. Check HTTP Authorization header
  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    const verified = verifySessionToken(token);
    if (verified) return verified;
  }

  // 2. Check Cookie
  const cookie = req.cookies.get(SESSION_COOKIE_NAME);
  if (cookie?.value) {
    const verified = verifySessionToken(cookie.value);
    if (verified) return verified;
  }

  // 3. Fallback check for session header
  const sessionHeader = req.headers.get('x-session-token');
  if (sessionHeader) {
    const verified = verifySessionToken(sessionHeader);
    if (verified) return verified;
  }

  return null;
}

export { SESSION_COOKIE_NAME };
