'use client';

import React, { useState, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { apiRequest } from '@/lib/api';
import { Plus, Loader2, Mail, Clock, Key, Copy, Check, Eye, EyeOff, User, UserPlus, Shield } from 'lucide-react';

const ROLE_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  OWNER:        { bg: 'rgba(124,58,237,0.12)', color: '#a78bfa', border: 'rgba(124,58,237,0.25)' },
  ADMIN:        { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: 'rgba(245,158,11,0.25)' },
  DEVELOPER:    { bg: 'rgba(59,130,246,0.12)', color: '#60a5fa', border: 'rgba(59,130,246,0.25)' },
  VIEWER:       { bg: 'rgba(107,114,128,0.15)', color: '#9ba3af', border: 'rgba(107,114,128,0.25)' },
  SERVICE_ROLE: { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: 'rgba(245,158,11,0.25)' },
  ANON:         { bg: 'rgba(99,102,241,0.12)', color: '#818cf8', border: 'rgba(99,102,241,0.25)' },
};

function RoleBadge({ role }: { role: string }) {
  const c = ROLE_COLORS[role] || ROLE_COLORS.VIEWER;
  return (
    <span style={{
      padding: '2px 8px', borderRadius: '9999px', fontSize: '10px', fontWeight: 500,
      backgroundColor: c.bg, color: c.color, border: `1px solid ${c.border}`,
      textTransform: 'uppercase', letterSpacing: '0.04em',
    }}>
      {role}
    </span>
  );
}

export default function TeamsTab() {
  const { activeTeam, user } = useAppStore();

  const [members, setMembers] = useState<any[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'ADMIN' | 'DEVELOPER' | 'VIEWER'>('DEVELOPER');
  const [inviting, setInviting] = useState(false);

  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const fetchData = async () => {
    if (!activeTeam) return;
    setLoading(true);
    try {
      const [membersData, invitesData, auditData, keysData] = await Promise.all([
        apiRequest(`/teams/${activeTeam.id}/members`),
        apiRequest(`/teams/${activeTeam.id}/invites`),
        apiRequest(`/teams/${activeTeam.id}/audit`),
        apiRequest(`/teams/${activeTeam.id}/keys`),
      ]);
      setMembers(membersData);
      setInvites(invitesData);
      setAuditLogs(auditData);
      setApiKeys(keysData);
    } catch {
      setMembers([{ id: 'm-1', user: { name: user?.name || 'Developer', email: user?.email || 'dev@khcloud.com' }, role: 'OWNER' }]);
      setInvites([]);
      setApiKeys([
        { id: 'k-1', name: 'anon', key: 'kh_anon_mock_1234567890abcdef', role: 'ANON' },
        { id: 'k-2', name: 'service_role', key: 'kh_service_mock_1234567890abcdef', role: 'SERVICE_ROLE' },
      ]);
      setAuditLogs([{ id: 'a-1', action: 'TEAM.CREATE', targetType: 'TEAM', createdAt: new Date().toISOString() }]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [activeTeam]);

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !activeTeam || !user) return;
    setInviting(true);
    try {
      await apiRequest(`/teams/${activeTeam.id}/invites`, {
        method: 'POST',
        body: JSON.stringify({ email: inviteEmail, role: inviteRole, inviterId: user.id }),
      });
      setInviteEmail('');
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Failed to send invite.');
    } finally {
      setInviting(false);
    }
  };

  const handleCancelInvite = async (inviteId: string) => {
    if (!activeTeam || !user) return;
    try {
      await apiRequest(`/teams/${activeTeam.id}/invites/${inviteId}?userId=${user.id}`, { method: 'DELETE' });
      fetchData();
    } catch (err) { console.error(err); }
  };

  return (
    <div className="rw-page">
      {/* Header */}
      <div className="rw-page-header">
        <div>
          <h1 className="rw-page-title">Team Settings</h1>
          <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '2px' }}>
            Manage members, roles, API keys, and audit logs for{' '}
            <strong style={{ color: '#9ba3af' }}>{activeTeam?.name}</strong>.
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="rw-page-content">
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px', gap: '12px', color: '#6b7280' }}>
            <Loader2 size={18} className="animate-spin" style={{ color: '#7c3aed' }} />
            <span style={{ fontSize: '13px' }}>Loading team data...</span>
          </div>
        ) : (
          <div style={{ maxWidth: '960px', display: 'grid', gridTemplateColumns: '1fr 300px', gap: '24px', alignItems: 'start' }}>

            {/* Left column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

              {/* Members */}
              <div>
                <div style={{ fontSize: '11px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#4b5563', marginBottom: '10px' }}>
                  Members ({members.length})
                </div>
                <div style={{ backgroundColor: '#111318', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '12px', overflow: 'hidden' }}>
                  {members.map((member, i) => (
                    <div key={member.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '12px 16px',
                      borderBottom: i < members.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                          width: '32px', height: '32px', borderRadius: '8px',
                          backgroundColor: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.15)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '12px', fontWeight: 600, color: '#c4b5fd',
                        }}>
                          {member.user?.name?.substring(0, 2)?.toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 500, color: '#f1f3f6' }}>{member.user?.name}</div>
                          <div style={{ fontSize: '11px', color: '#4b5563', marginTop: '2px' }}>{member.user?.email}</div>
                        </div>
                      </div>
                      <RoleBadge role={member.role} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Pending invites */}
              {invites.length > 0 && (
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#4b5563', marginBottom: '10px' }}>
                    Pending invitations ({invites.length})
                  </div>
                  <div style={{ backgroundColor: '#111318', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '12px', overflow: 'hidden' }}>
                    {invites.map((invite, i) => (
                      <div key={invite.id} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '12px 16px',
                        borderBottom: i < invites.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{
                            width: '32px', height: '32px', borderRadius: '8px',
                            backgroundColor: '#181b22', border: '1px solid rgba(255,255,255,0.08)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <Mail size={13} style={{ color: '#6b7280' }} />
                          </div>
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: 500, color: '#d1d5db' }}>{invite.email}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#4b5563', marginTop: '1px' }}>
                              <Clock size={10} /> Pending
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <RoleBadge role={invite.role} />
                          <button
                            onClick={() => handleCancelInvite(invite.id)}
                            style={{
                              width: '24px', height: '24px', borderRadius: '6px',
                              backgroundColor: 'transparent', border: 'none',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: '#6b7280', cursor: 'pointer', transition: 'all 0.12s', fontSize: '13px',
                            }}
                            className="hover:bg-red-500/10 hover:text-red-400"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* API Keys */}
              <div>
                <div style={{ fontSize: '11px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#4b5563', marginBottom: '10px' }}>
                  API & Service Keys
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {apiKeys.map((keyObj) => (
                    <div key={keyObj.id} style={{
                      backgroundColor: '#111318', border: '1px solid rgba(255,255,255,0.07)',
                      borderRadius: '12px', padding: '16px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Key size={13} style={{ color: '#a78bfa' }} />
                          <span style={{ fontSize: '13px', fontWeight: 500, color: '#f1f3f6' }}>{keyObj.name}</span>
                        </div>
                        <RoleBadge role={keyObj.role} />
                      </div>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        backgroundColor: '#0e1015', border: '1px solid rgba(255,255,255,0.07)',
                        borderRadius: '8px', padding: '8px 12px',
                      }}>
                        <code style={{ flex: 1, fontSize: '11px', fontFamily: 'monospace', color: '#9ba3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {showKeys[keyObj.id] ? keyObj.key : '•'.repeat(40)}
                        </code>
                        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                          <button
                            onClick={() => setShowKeys(prev => ({ ...prev, [keyObj.id]: !prev[keyObj.id] }))}
                            style={{ width: '24px', height: '24px', borderRadius: '5px', backgroundColor: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280' }}
                          >
                            {showKeys[keyObj.id] ? <EyeOff size={12} /> : <Eye size={12} />}
                          </button>
                          <button
                            onClick={() => handleCopyText(keyObj.key, keyObj.id)}
                            style={{ width: '24px', height: '24px', borderRadius: '5px', backgroundColor: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: copiedId === keyObj.id ? '#22c55e' : '#6b7280' }}
                          >
                            {copiedId === keyObj.id ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Audit logs */}
              <div>
                <div style={{ fontSize: '11px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#4b5563', marginBottom: '10px' }}>
                  Audit log
                </div>
                <div style={{
                  backgroundColor: '#111318', border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: '12px', overflow: 'hidden', maxHeight: '280px', overflowY: 'auto',
                }}>
                  {auditLogs.length === 0 ? (
                    <div style={{ padding: '32px', textAlign: 'center', color: '#4b5563', fontSize: '13px' }}>No actions logged yet.</div>
                  ) : (
                    auditLogs.map((log, i) => (
                      <div key={log.id} style={{
                        padding: '12px 16px',
                        borderBottom: i < auditLogs.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <code style={{ fontSize: '11px', fontFamily: 'monospace', color: '#c4b5fd', fontWeight: 600 }}>{log.action}</code>
                          <span style={{ fontSize: '10px', color: '#4b5563' }}>{new Date(log.createdAt).toLocaleString()}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#6b7280' }}>
                          <User size={10} /> {log.user?.name || 'System'}
                          {log.details && <><span>·</span><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.details}</span></>}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>

            {/* Right sidebar: Invite form */}
            <div style={{
              backgroundColor: '#111318', border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: '12px', padding: '18px',
              position: 'sticky', top: '24px', display: 'flex', flexDirection: 'column', gap: '14px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  width: '28px', height: '28px', borderRadius: '7px',
                  backgroundColor: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <UserPlus size={14} style={{ color: '#a78bfa' }} />
                </div>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#f1f3f6' }}>Invite member</span>
              </div>

              <form onSubmit={handleSendInvite} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#4b5563', display: 'block', marginBottom: '6px' }}>Email Address</label>
                  <input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="dev@company.com"
                    style={{ width: '100%', height: '36px', padding: '0 12px', borderRadius: '7px', backgroundColor: '#0e1015', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#4b5563', display: 'block', marginBottom: '6px' }}>Role</label>
                  <select
                    value={inviteRole}
                    onChange={(e: any) => setInviteRole(e.target.value)}
                    style={{ width: '100%', height: '36px', padding: '0 12px', borderRadius: '7px', backgroundColor: '#0e1015', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', fontSize: '13px', outline: 'none', cursor: 'pointer', boxSizing: 'border-box' }}
                  >
                    <option value="DEVELOPER">Developer</option>
                    <option value="ADMIN">Administrator</option>
                    <option value="VIEWER">Viewer</option>
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={inviting}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
                    height: '34px', borderRadius: '7px',
                    backgroundColor: '#7c3aed', border: 'none',
                    color: '#fff', fontSize: '12px', fontWeight: 600,
                    cursor: inviting ? 'not-allowed' : 'pointer', opacity: inviting ? 0.7 : 1,
                  }}
                >
                  {inviting ? <><Loader2 size={12} className="animate-spin" /> Inviting...</> : <><Plus size={12} /> Send Invitation</>}
                </button>
              </form>

              <div style={{ padding: '12px', backgroundColor: '#0e1015', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '9px', fontWeight: 700, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Role permissions
                </div>
                {[
                  { role: 'Developer', desc: 'Deploy and manage projects' },
                  { role: 'Admin', desc: 'Full workspace access' },
                  { role: 'Viewer', desc: 'Read-only access' },
                ].map(({ role, desc }) => (
                  <div key={role} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                    <Shield size={10} style={{ color: '#6b7280', marginTop: '2px', flexShrink: 0 }} />
                    <span style={{ fontSize: '11px', color: '#6b7280', lineHeight: 1.4 }}><strong style={{ color: '#9ba3af', fontWeight: 600 }}>{role}</strong> — {desc}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
