'use client';

import React from 'react';
import { useAppStore } from '@/lib/store';
import { Layers, Database, HardDrive, Shield, CreditCard, Settings, Zap } from 'lucide-react';

export default function Sidebar() {
  const { activeTab, setActiveTab, user } = useAppStore();

  const navigation = [
    { id: 'projects', label: 'Projects', icon: Layers },
    { id: 'databases', label: 'Databases', icon: Database },
    { id: 'edge-functions', label: 'Edge Functions', icon: Zap },
    { id: 'storage', label: 'Object Storage', icon: HardDrive },
    { id: 'teams', label: 'Team settings', icon: Shield },
    { id: 'billing', label: 'Billing & usage', icon: CreditCard },
  ];

  if (user?.role === 'ADMIN') {
    navigation.push({ id: 'admin', label: 'Admin Console', icon: Settings });
  }

  return (
    <aside className="hidden w-72 shrink-0 flex-col justify-between border-r border-white/10 bg-slate-950/55 px-4 py-5 backdrop-blur-2xl md:flex">
      <div className="space-y-5">
        <div className="glass-card rounded-[1.5rem] p-4">
          <div className="app-muted-label mb-2">Workspace navigation</div>
          <div className="text-lg font-semibold tracking-tight text-white">Infrastructure</div>
          <p className="mt-2 text-sm leading-6 text-slate-400">Everything you manage from the control plane lives here.</p>
        </div>

        <div className="space-y-2">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`group flex h-12 w-full items-center gap-3 rounded-2xl px-4 text-left text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-cyan-400/10 text-white ring-1 ring-cyan-400/20'
                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <span className={`flex h-8 w-8 items-center justify-center rounded-xl transition-all ${isActive ? 'bg-cyan-400/15 text-cyan-200' : 'bg-white/5 text-slate-500 group-hover:text-slate-200'}`}>
                  <Icon size={16} />
                </span>
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="glass-card rounded-[1.5rem] p-4 text-sm text-slate-400">
        <div className="app-muted-label mb-2">Release channel</div>
        <div className="text-white">KH Cloud CLI</div>
        <div className="mt-1 text-xs text-slate-500">v1.0.4 running locally</div>
        <a href="#" className="mt-3 inline-flex text-xs font-semibold text-cyan-200 transition-colors hover:text-cyan-100">
          Download CLI
        </a>
      </div>
    </aside>
  );
}
