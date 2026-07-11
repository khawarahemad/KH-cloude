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
    <header className="h-16 border-b border-white/5 bg-[#0a0a0c]/80 backdrop-blur-md sticky top-0 z-40 px-6 flex items-center justify-between">
      {/* Brand & Workspace Switcher */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2 font-bold text-base tracking-tight select-none">
          <div className="w-6 h-6 rounded-md bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center">
            <span className="text-white text-[10px] font-black">KH</span>
          </div>
          <span className="hidden md:inline">KH Cloud</span>
        </div>

        {/* Vertical Divider */}
        <div className="h-4 w-[1px] bg-white/10 hidden md:block" />

        {/* Team Dropdown */}
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 h-9 px-3 rounded-lg hover:bg-white/5 text-sm font-medium transition-colors text-zinc-300 hover:text-white"
          >
            <span>{activeTeam?.name || 'Loading Team...'}</span>
            <ChevronDown size={14} className="text-zinc-500" />
          </button>

          {dropdownOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setDropdownOpen(false)} />
              <div className="absolute top-10 left-0 w-56 rounded-xl border border-white/10 bg-[#0c0c0e] p-1.5 shadow-2xl z-20">
                <div className="px-2.5 py-1.5 text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
                  Select Workspace
                </div>
                {teams.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setActiveTeam(t);
                      setDropdownOpen(false);
                    }}
                    className={`w-full text-left h-8 px-2.5 rounded-lg text-xs font-medium flex items-center justify-between transition-colors ${
                      activeTeam?.id === t.id ? 'bg-indigo-500/10 text-indigo-400' : 'hover:bg-white/5 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {t.name}
                  </button>
                ))}
                
                <div className="h-[1px] bg-white/5 my-1.5" />
                
                <button
                  onClick={() => {
                    setNewTeamOpen(true);
                    setDropdownOpen(false);
                  }}
                  className="w-full text-left h-8 px-2.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 text-indigo-400 hover:bg-indigo-500/5 transition-colors"
                >
                  <Plus size={14} />
                  New Team
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Status indicator & Profile */}
      <div className="flex items-center gap-4">
        {/* Status Indicator */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full border border-emerald-500/10 bg-emerald-500/5 text-[10px] text-emerald-400 font-semibold tracking-wide">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          SYSTEMS OPERATIONAL
        </div>

        {/* Profile Dropdown */}
        <div className="flex items-center gap-3">
          <div className="text-right hidden md:block">
            <div className="text-xs font-bold">{user?.name}</div>
            <div className="text-[10px] text-zinc-500">{user?.email}</div>
          </div>
          
          <button
            onClick={logout}
            title="Log Out"
            className="w-9 h-9 rounded-xl hover:bg-red-500/10 border border-white/5 text-zinc-400 hover:text-red-400 flex items-center justify-center transition-all active:scale-95 duration-100"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>

      {/* New Team Modal */}
      {newTeamOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="glass p-6 rounded-2xl max-w-sm w-full border border-white/10 shadow-2xl">
            <h3 className="text-base font-bold mb-1">Create New Workspace</h3>
            <p className="text-xs text-zinc-400 mb-4">Teams allow you to collaborate on projects, databases and storage buckets.</p>
            <form onSubmit={handleCreateTeam} className="space-y-4">
              <div>
                <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block mb-1">Team Name</label>
                <input
                  type="text"
                  required
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  placeholder="e.g. Acme Corp"
                  className="w-full h-10 px-3 rounded-xl glass-input text-sm text-white"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setNewTeamOpen(false)}
                  className="h-9 px-4 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-xs font-semibold text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="h-9 px-4 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-xs font-semibold text-white"
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
