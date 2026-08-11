/**
 * Nhost Client Configuration & Auth Integration
 *
 * Configures the official Nhost JS SDK client for Hasura Authentication,
 * GraphQL Queries/Mutations, and WebSocket Subscriptions.
 */

import { NhostClient } from '@nhost/nhost-js';

const HASURA_GRAPHQL_URL = process.env.NEXT_PUBLIC_HASURA_GRAPHQL_URL || 'http://localhost:8080/v1/graphql';
const subdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN || 'local';
const region = process.env.NEXT_PUBLIC_NHOST_REGION || 'local';

export const nhost = new NhostClient({
  subdomain,
  region,
  graphqlUrl: HASURA_GRAPHQL_URL,
});

export async function getNhostSession() {
  const session = nhost.auth.getSession();
  return session;
}

export async function setNhostSession(session: any) {
  if (nhost.auth && typeof (nhost.auth as any).setSession === 'function') {
    (nhost.auth as any).setSession(session);
  }
}
