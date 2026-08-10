'use client';

import React from 'react';
import { User, Organization, OrgMember } from '@/lib/types';
import { DEMO_USERS as SEED_USERS, DEMO_ORGS as SEED_ORGS, DEMO_MEMBERS as SEED_MEMBERS } from '@/lib/demoUsers';
import { Building2, UserCheck, AlertTriangle } from 'lucide-react';

interface NavbarProps {
  currentUser: User;
  currentOrg: Organization;
  currentMember: OrgMember;
  onUserSelect: (userId: string) => void;
}

export function Navbar({ currentUser, currentOrg, currentMember, onUserSelect }: NavbarProps) {
  const quotaPercentage = Math.min(
    100,
    Math.round((currentOrg.calls_used / currentOrg.max_calls_allowed) * 100)
  );

  const isQuotaFull = currentOrg.calls_used >= currentOrg.max_calls_allowed;

  return (
    <header className="glass-panel sticky top-0 z-50 border-b border-[#e2dbd0] px-6 py-3.5 shadow-sm bg-[#faf8f5]/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
        {/* Brand Name */}
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-[#142319] flex items-center gap-2.5">
            Mini-n8n
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#ecfdf5] text-[#047857] border border-[#a7f3d0]">
              ENTERPRISE OS
            </span>
          </h1>
          <p className="text-[11px] text-[#5c6b60] font-medium tracking-wide">Multi-Tenant Workflow Orchestration Engine</p>
        </div>

        {/* User & Tenant Switcher */}
        <div className="flex flex-wrap items-center gap-3.5">
          <div className="flex items-center gap-2 rounded-xl bg-[#f0ebe1] px-3.5 py-1.5 border border-[#e2dbd0]">
            <UserCheck className="h-4 w-4 text-[#047857]" />
            <span className="text-xs text-[#5c6b60] font-medium">Active Context:</span>
            <select
              value={currentUser.id}
              onChange={(e) => onUserSelect(e.target.value)}
              className="bg-transparent text-xs font-bold text-[#142319] focus:outline-none cursor-pointer tracking-wide"
            >
              {SEED_USERS.map((user) => {
                const mem = SEED_MEMBERS.find((m) => m.user_id === user.id);
                const org = SEED_ORGS.find((o) => o.id === mem?.org_id);
                return (
                  <option key={user.id} value={user.id} className="bg-[#faf8f5] text-[#142319]">
                    {user.display_name} [{org?.name.split(' ')[0]}]
                  </option>
                );
              })}
            </select>
          </div>

          {/* Org & Role Badge */}
          <div className="flex items-center gap-2 rounded-xl bg-[#ecfdf5] px-3.5 py-1.5 border border-[#a7f3d0]">
            <Building2 className="h-4 w-4 text-[#047857]" />
            <span className="text-xs font-bold text-[#047857]">{currentOrg.name}</span>
            <span className="text-[10px] font-mono font-extrabold uppercase bg-amber-200 text-amber-900 border border-amber-300 px-2 py-0.5 rounded">
              {currentMember.role}
            </span>
          </div>

          {/* Quota Tracker */}
          <div className="flex items-center gap-3 rounded-xl bg-[#f0ebe1] px-3.5 py-1.5 border border-[#e2dbd0]">
            <div className="text-right">
              <div className="text-[10px] text-[#5c6b60] font-bold uppercase">Org Quota</div>
              <div className="text-xs font-mono font-extrabold text-[#142319] flex items-center gap-1 justify-end">
                {isQuotaFull && <AlertTriangle className="h-3 w-3 text-red-600 animate-pulse" />}
                {currentOrg.calls_used} / {currentOrg.max_calls_allowed}
              </div>
            </div>
            <div className="h-2 w-16 bg-[#e2dbd0] rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  isQuotaFull ? 'bg-red-600' : quotaPercentage > 75 ? 'bg-amber-600' : 'bg-[#047857]'
                }`}
                style={{ width: `${quotaPercentage}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
