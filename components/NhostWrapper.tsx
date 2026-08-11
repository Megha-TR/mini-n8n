'use client';

/**
 * Nhost React Provider Wrapper
 * Enables useNhostClient, useAuthenticated, useUserData hooks across the application.
 */

import React from 'react';
import { NhostProvider } from '@nhost/react';
import { nhost } from '@/lib/nhost';

export default function NhostWrapper({ children }: { children: React.ReactNode }) {
  return <NhostProvider nhost={nhost}>{children}</NhostProvider>;
}
