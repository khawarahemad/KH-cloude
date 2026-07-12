'use client';

import React, { useState } from 'react';
import { useAppStore } from '@/lib/store';
import { LogOut, ChevronDown, Plus, Globe, Settings, Shield } from 'lucide-react';
import { apiRequest } from '@/lib/api';

export default function Header() {
  const { user, teams, activeTeam, setActiveTeam, logout } = useAppStore();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [newTeamOpen, setNewTeamOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim() || !user) return;

    try {
      const team = await apiRequest('/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTeamName, ownerUserId: user.id }),
      });
      
      // Update store: add new team and select it
      const updatedTeams = [...teams, team];
      useAppStore.setState({ teams: updatedTeams, activeTeam: team });
      setNewTeamName('');
      setNewTeamOpen(false);
    } catch (err) {
      console.error('Failed to create team:', err);
    }
  };

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/70 px-4 backdrop-blur-2xl md:px-6">
      <div className="flex h-18 items-center justify-between gap-4 py-4">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex items-center gap-3 select-none">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-300 to-emerald-300 text-slate-950 shadow-lg shadow-cyan-400/20">
              <span className="text-[11px] font-black tracking-[0.22em]">KH</span>
            </div>
            <div className="hidden sm:block">
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Cloud control plane</div>
              <div className="text-sm font-semibold text-white">KH Cloud</div>
            </div>
          </div>

          <div className="hidden h-10 w-px bg-white/10 md:block" />

          <div className="relative">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex h-10 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 text-sm font-medium text-slate-200 transition-all hover:border-cyan-400/40 hover:bg-white/10"
            >
              <span className="max-w-40 truncate">{activeTeam?.name || 'Loading team...'}</span>
              <ChevronDown size={14} className="text-slate-400" />
            </button>

            {dropdownOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setDropdownOpen(false)} />
                <div className="absolute left-0 top-12 z-20 w-64 rounded-2xl border border-white/10 bg-slate-950/95 p-2 shadow-2xl shadow-black/40">
                  <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                    Select workspace
                  </div>
                  <div className="space-y-1">
                    {teams.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => {
                          setActiveTeam(t);
                          setDropdownOpen(false);
                        }}
                        className={`flex h-10 w-full items-center justify-between rounded-xl px-3 text-left text-sm transition-all ${
                          activeTeam?.id === t.id
                            ? 'bg-cyan-400/10 text-cyan-200 ring-1 ring-cyan-400/20'
                            : 'text-slate-300 hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        <span className="truncate">{t.name}</span>
                      </button>
                    ))}
                  </div>

                  <div className="my-2 h-px bg-white/8" />

                  <button
                    onClick={() => {
                      setNewTeamOpen(true);
                      setDropdownOpen(false);
                    }}
                    className="flex h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-semibold text-cyan-200 transition-all hover:bg-cyan-400/10"
                  >
                    <Plus size={14} />
                    New team
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 rounded-full border border-emerald-400/15 bg-emerald-400/8 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300 sm:flex">
            <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.7)]" />
            Systems healthy
          </div>

          <div className="hidden text-right md:block">
            <div className="text-sm font-semibold text-white">{user?.name}</div>
            <div className="text-xs text-slate-400">{user?.email}</div>
          </div>

          <button
            onClick={logout}
            title="Log out"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition-all hover:border-red-400/30 hover:bg-red-400/10 hover:text-red-300 active:scale-[0.98]"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>

      {/* New Team Modal */}
      {newTeamOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-6 backdrop-blur-xl">
          <div className="glass-card w-full max-w-md rounded-[1.75rem] p-6 md:p-7">
            <div className="mb-5 space-y-2">
              <div className="app-muted-label">Workspace setup</div>
              <h3 className="text-2xl font-semibold tracking-tight text-white">Create new workspace</h3>
              <p className="text-sm leading-6 text-slate-300">Teams keep projects, databases, and storage grouped in one place.</p>
            </div>
            <form onSubmit={handleCreateTeam} className="space-y-4">
              <div>
                <label className="app-muted-label block mb-2">Team name</label>
                <input
                  type="text"
                  required
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  placeholder="e.g. Acme Corp"
                  className="glass-input h-12"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setNewTeamOpen(false)}
                  className="app-button-secondary h-11 px-5 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="app-button-primary h-11 px-5 text-xs"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </header>
  );
}
