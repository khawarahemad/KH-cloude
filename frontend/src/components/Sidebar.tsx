'use client';

import React from 'react';
import { useAppStore } from '@/lib/store';
import {
  Layers,
  Database,
  HardDrive,
  Users,
  CreditCard,
  Shield,
  Zap,
  ChevronRight,
  Settings,
} from 'lucide-react';

const NAV_ITEMS = [
  { id: 'projects',       label: 'Projects',       icon: Layers },
  { id: 'databases',      label: 'Databases',       icon: Database },
  { id: 'edge-functions', label: 'Edge Functions',  icon: Zap },
  { id: 'storage',        label: 'Storage',         icon: HardDrive },
  { id: 'teams',          label: 'Team',            icon: Users },
  { id: 'billing',        label: 'Billing',         icon: CreditCard },
  { id: 'settings',       label: 'Settings',        icon: Settings },
];

export default function Sidebar() {
  const { activeTab, setActiveTab, user } = useAppStore();

  const items = [...NAV_ITEMS];
  if (user?.role === 'ADMIN') {
    items.push({ id: 'admin', label: 'Admin', icon: Shield });
  }

  return (
    <aside
      className="hidden md:flex flex-col w-[220px] shrink-0"
      style={{
        backgroundColor: '#0e1015',
        borderRight: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Nav section */}
      <div className="flex-1 overflow-y-auto px-3 py-4">
        {/* Section label */}
        <div
          className="px-2 mb-2"
          style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#4b5563' }}
        >
          Navigation
        </div>

        <nav className="space-y-0.5">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className="rw-nav-item w-full"
                style={
                  isActive
                    ? {
                        backgroundColor: 'rgba(124,58,237,0.12)',
                        color: '#c4b5fd',
                        border: '1px solid rgba(124,58,237,0.3)',
                      }
                    : {}
                }
              >
                <Icon
                  size={15}
                  style={{ color: isActive ? '#a78bfa' : '#6b7280', flexShrink: 0 }}
                />
                <span style={{ flex: 1 }}>{item.label}</span>
                {isActive && (
                  <ChevronRight size={12} style={{ color: '#7c3aed', opacity: 0.7 }} />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer */}
      <div
        className="px-3 py-4"
        style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div
          className="px-2 py-2 rounded-lg"
          style={{ backgroundColor: '#181b22', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div style={{ fontSize: '10px', fontWeight: 500, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>
            CLI
          </div>
          <div style={{ fontSize: '12px', fontWeight: 500, color: '#9ba3af' }}>KH Cloud CLI</div>
          <div style={{ fontSize: '11px', color: '#4b5563', marginTop: '2px' }}>v1.0.4</div>
        </div>
      </div>
    </aside>
  );
}
