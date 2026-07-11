'use client';

import React from 'react';
import { useAppStore } from '@/lib/store';
import { Layers, Database, HardDrive, Shield, CreditCard, Settings } from 'lucide-react';

export default function Sidebar() {
  const { activeTab, setActiveTab, user } = useAppStore();

  const navigation = [
    { id: 'projects', label: 'Projects', icon: Layers },
    { id: 'databases', label: 'Databases', icon: Database },
    { id: 'storage', label: 'Object Storage', icon: HardDrive },
    { id: 'teams', label: 'Team settings', icon: Shield },
    { id: 'billing', label: 'Billing & usage', icon: CreditCard },
  ];

  if (user?.role === 'ADMIN') {
    navigation.push({ id: 'admin', label: 'Admin Console', icon: Settings });
  }

  return (
    <aside className="w-64 border-r border-white/5 bg-[#070708] hidden md:flex flex-col justify-between py-6 px-4 shrink-0">
      <div className="space-y-6">
        {/* Navigation Section */}
        <div className="space-y-1">
          <div className="px-3 text-[10px] font-bold text-zinc-600 uppercase tracking-wider mb-2">
            Infrastructure
          </div>
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full h-9 px-3 rounded-lg text-xs font-semibold flex items-center gap-2.5 transition-all ${
                  isActive
                    ? 'bg-white/5 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.02]'
                }`}
              >
                <Icon size={16} className={isActive ? 'text-indigo-400' : 'text-zinc-500'} />
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Version badge */}
      <div className="px-3">
        <div className="p-3 rounded-xl border border-white/5 bg-white/[0.01] text-[10px] text-zinc-500 flex flex-col gap-1 select-none">
          <div className="font-bold text-zinc-400">KH CLOUD CLI</div>
          <div>v1.0.4 — Running Local</div>
          <a href="#" className="text-indigo-400 hover:underline font-medium mt-1 inline-block">Download CLI</a>
        </div>
      </div>
    </aside>
  );
}
