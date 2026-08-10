/**
 * Nhost Client Configuration & Auth Integration
 *
 * Configures the official Nhost JS SDK client for Hasura Authentication,
 * GraphQL Queries/Mutations, and WebSocket Subscriptions.
 */

import { NhostClient } from '@nhost/nhost-js';

const HASURA_GRAPHQL_URL = process.env.NEXT_PUBLIC_HASURA_GRAPHQL_URL || 'http://localhost:8080/v1/graphql';

// Derive Nhost backend URL or fallback to local Hasura GraphQL host
const subdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN || 'local';
const region = process.env.NEXT_PUBLIC_NHOST_REGION || 'local';

export const nhost = new NhostClient({
  subdomain: subdomain !== 'local' ? subdomain : undefined,
  region: region !== 'local' ? region : undefined,
  graphqlUrl: HASURA_GRAPHQL_URL,
});

export async function getNhostSession() {
  const session = nhost.auth.getSession();
  return session;
}
