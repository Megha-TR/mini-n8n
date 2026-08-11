import './globals.css';
import type { Metadata } from 'next';
import NhostWrapper from '@/components/NhostWrapper';

export const metadata: Metadata = {
  title: 'Mini-n8n | Multi-Tenant AI Agent Workflow Builder',
  description: 'Full-stack AI Agent Workflow Builder powered by Nhost, Hasura, PostgreSQL, and GraphQL.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#07090e] text-gray-100 min-h-screen antialiased">
        <NhostWrapper>{children}</NhostWrapper>
      </body>
    </html>
  );
}
