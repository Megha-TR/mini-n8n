/**
 * Cryptographic Session Authentication Service
 *
 * Enforces a strict Authentication Boundary:
 * 1. User login creates a cryptographically signed session token (HMAC-SHA256).
 * 2. Session token is stored in HTTP-Only cookie 'minin8n_session' or passed as 'Authorization: Bearer <token>'.
 * 3. Server API routes verify the cryptographic signature of the token to determine callerUserId.
 * 4. Raw client headers like 'x-hasura-user-id' or 'x-hasura-role' are REJECTED if unauthenticated.
 */

import { NextRequest } from 'next/server';
import crypto from 'crypto';

const AUTH_SECRET = process.env.AUTH_SECRET || process.env.HASURA_GRAPHQL_ADMIN_SECRET || 'super-secret-auth-key-minin8n-2026';
const SESSION_COOKIE_NAME = 'minin8n_session';

export interface SessionPayload {
  userId: string;
  email: string;
  iat: number;
  exp: number;
}

/**
 * Creates a signed JWT-style session token: base64Url(payload).signature
 */
export function createSessionToken(userId: string, email: string): string {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + (24 * 60 * 60); // 24 hours validity

  const payload: SessionPayload = { userId, email, iat, exp };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');

  const signature = crypto
    .createHmac('sha256', AUTH_SECRET)
    .update(payloadB64)
    .digest('base64url');

  return `${payloadB64}.${signature}`;
}

/**
 * Verifies a session token signature & expiration, returning the payload if valid.
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
 * Extracts and verifies the authenticated user payload from incoming HTTP request:
 * Checks 'minin8n_session' cookie OR 'Authorization: Bearer <token>' header.
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

  // 3. Fallback check for session header passed by frontend
  const sessionHeader = req.headers.get('x-session-token');
  if (sessionHeader) {
    const verified = verifySessionToken(sessionHeader);
    if (verified) return verified;
  }

  return null;
}

export { SESSION_COOKIE_NAME };
