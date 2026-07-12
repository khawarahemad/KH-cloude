'use client';

import React, { useState } from 'react';
import { useAppStore } from '@/lib/store';
import { LogOut, ChevronDown, Plus, Check, Loader2, Shield, Layers } from 'lucide-react';
import { apiRequest } from '@/lib/api';

export default function Header() {
  const { user, teams, activeTeam, setActiveTeam, activeTab, setActiveTab, logout } = useAppStore();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [newTeamOpen, setNewTeamOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [creating, setCreating] = useState(false);

  const isAdminWorkspace = activeTab === 'admin' || (typeof window !== 'undefined' && window.location.hostname.startsWith('admin.'));

  const handleSwitchWorkspace = () => {
    if (typeof window !== 'undefined') {
      const isLocalhost = window.location.hostname.includes('localhost');
      if (isLocalhost) {
        setActiveTab(isAdminWorkspace ? 'projects' : 'admin');
      } else {
        if (isAdminWorkspace) {
          window.location.href = 'https://cloud.khawarahemad.com';
        } else {
          window.location.href = 'https://admin.khawarahemad.com';
        }
      }
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('kh-cloud-session');
    logout();
    if (typeof window !== 'undefined' && !window.location.hostname.includes('localhost')) {
      window.location.href = 'https://auth.khawarahemad.com?logout=true';
    }
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim() || !user) return;
    setCreating(true);
    try {
      const team = await apiRequest('/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTeamName, ownerUserId: user.id }),
      });
      const updatedTeams = [...teams, team];
      useAppStore.setState({ teams: updatedTeams, activeTeam: team });
      setNewTeamName('');
      setNewTeamOpen(false);
    } catch (err) {
      console.error('Failed to create team:', err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <header
        style={{
          height: '52px',
          backgroundColor: '#0e1015',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          flexShrink: 0,
          position: 'sticky',
          top: 0,
          zIndex: 40,
        }}
      >
        {/* Left: Logo + workspace switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Logo mark */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <img
              src="/logo.png"
              alt="KH Cloud"
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '8px',
                flexShrink: 0,
              }}
            />
            <span
              style={{ fontSize: '13px', fontWeight: 600, color: '#f1f3f6', letterSpacing: '-0.01em' }}
              className="hidden sm:block"
            >
              KH Cloud
            </span>
          </div>

          {/* Separator */}
          <div style={{ width: '1px', height: '18px', backgroundColor: 'rgba(255,255,255,0.08)' }} className="hidden md:block" />

          {/* Workspace switcher */}
          <div style={{ position: 'relative' }} className="hidden md:block">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                height: '30px',
                padding: '0 10px',
                borderRadius: '6px',
                backgroundColor: '#181b22',
                border: '1px solid rgba(255,255,255,0.09)',
                color: '#d1d5db',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'border-color 0.12s, background-color 0.12s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.18)';
                (e.currentTarget as HTMLElement).style.backgroundColor = '#1e222c';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.09)';
                (e.currentTarget as HTMLElement).style.backgroundColor = '#181b22';
              }}
            >
              {/* Status dot */}
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#22c55e', boxShadow: '0 0 6px rgba(34,197,94,0.5)', flexShrink: 0 }} />
              <span style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {activeTeam?.name || 'Select workspace'}
              </span>
              <ChevronDown size={12} style={{ color: '#6b7280', flexShrink: 0 }} />
            </button>

            {dropdownOpen && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 10 }} onClick={() => setDropdownOpen(false)} />
                <div
                  style={{
                    position: 'absolute',
                    top: '36px',
                    left: 0,
                    zIndex: 20,
                    width: '220px',
                    backgroundColor: '#111318',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '10px',
                    padding: '4px',
                    boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
                  }}
                >
                  <div style={{ padding: '6px 10px 4px', fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#4b5563' }}>
                    Workspaces
                  </div>
                  {teams.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => { setActiveTeam(t); setDropdownOpen(false); }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '6px',
                        fontSize: '13px',
                        fontWeight: 500,
                        color: activeTeam?.id === t.id ? '#c4b5fd' : '#d1d5db',
                        backgroundColor: activeTeam?.id === t.id ? 'rgba(124,58,237,0.12)' : 'transparent',
                        cursor: 'pointer',
                        border: 'none',
                        textAlign: 'left',
                        transition: 'background-color 0.1s',
                      }}
                      onMouseEnter={e => {
                        if (activeTeam?.id !== t.id)
                          (e.currentTarget as HTMLElement).style.backgroundColor = '#181b22';
                      }}
                      onMouseLeave={e => {
                        if (activeTeam?.id !== t.id)
                          (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                      {activeTeam?.id === t.id && <Check size={12} style={{ color: '#7c3aed', flexShrink: 0 }} />}
                    </button>
                  ))}
                  <div style={{ height: '1px', backgroundColor: 'rgba(255,255,255,0.06)', margin: '4px 0' }} />
                  <button
                    onClick={() => { setNewTeamOpen(true); setDropdownOpen(false); }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      fontSize: '13px',
                      fontWeight: 500,
                      color: '#9ba3af',
                      backgroundColor: 'transparent',
                      cursor: 'pointer',
                      border: 'none',
                      textAlign: 'left',
                      transition: 'background-color 0.1s, color 0.1s',
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.backgroundColor = '#181b22';
                      (e.currentTarget as HTMLElement).style.color = '#f1f3f6';
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                      (e.currentTarget as HTMLElement).style.color = '#9ba3af';
                    }}
                  >
                    <Plus size={13} />
                    New workspace
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right: User info + logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {user?.role === 'ADMIN' && (
            <button
              onClick={handleSwitchWorkspace}
              title={isAdminWorkspace ? "Switch to Cloud Dashboard" : "Switch to System Admin"}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                height: '32px',
                padding: '0 12px',
                borderRadius: '8px',
                backgroundColor: 'rgba(124,58,237,0.12)',
                border: '1px solid rgba(124,58,237,0.3)',
                color: '#c4b5fd',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLElement;
                el.style.backgroundColor = 'rgba(124,58,237,0.2)';
                el.style.borderColor = 'rgba(124,58,237,0.45)';
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLElement;
                el.style.backgroundColor = 'rgba(124,58,237,0.12)';
                el.style.borderColor = 'rgba(124,58,237,0.3)';
              }}
            >
              {isAdminWorkspace ? <Layers size={13} /> : <Shield size={13} />}
              <span className="hidden md:inline">{isAdminWorkspace ? 'Console' : 'Admin Panel'}</span>
            </button>
          )}

          {user && (
            <div className="hidden sm:flex" style={{ flexDirection: 'column', alignItems: 'flex-end' }}>
              <span style={{ fontSize: '13px', fontWeight: 500, color: '#f1f3f6' }}>{user.name}</span>
              <span style={{ fontSize: '11px', color: '#6b7280' }}>{user.email}</span>
            </div>
          )}

          <button
            onClick={handleLogout}
            title="Sign out"
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              backgroundColor: '#181b22',
              border: '1px solid rgba(255,255,255,0.09)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#6b7280',
              cursor: 'pointer',
              transition: 'all 0.12s',
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.backgroundColor = 'rgba(239,68,68,0.1)';
              el.style.borderColor = 'rgba(239,68,68,0.25)';
              el.style.color = '#ef4444';
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.backgroundColor = '#181b22';
              el.style.borderColor = 'rgba(255,255,255,0.09)';
              el.style.color = '#6b7280';
            }}
          >
            <LogOut size={14} />
          </button>
        </div>
      </header>

      {/* New Team Modal */}
      {newTeamOpen && (
        <div className="rw-modal-backdrop">
          <div className="rw-modal animate-scale-in">
            <div style={{ marginBottom: '20px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#f1f3f6', letterSpacing: '-0.02em', marginBottom: '6px' }}>
                Create workspace
              </h3>
              <p style={{ fontSize: '13px', color: '#6b7280' }}>
                Workspaces group your projects, databases, and storage.
              </p>
            </div>

            <form onSubmit={handleCreateTeam}>
              <div style={{ marginBottom: '16px' }}>
                <label className="rw-label">Workspace name</label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  placeholder="e.g. Acme Corp"
                  className="rw-input"
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setNewTeamOpen(false)}
                  className="rw-btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="rw-btn-primary"
                >
                  {creating ? <Loader2 size={13} className="animate-spin" /> : null}
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
