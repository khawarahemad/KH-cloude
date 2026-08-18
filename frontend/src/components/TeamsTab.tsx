'use client';

import React, { useState, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { apiRequest } from '@/lib/api';
import {
  Plus, Loader2, Mail, Clock, Key, Copy, Check, Eye, EyeOff, User, UserPlus, Shield,
  UserCheck, UserX, AlertCircle, ChevronDown, Trash2, ArrowRight, Sparkles, Building
} from 'lucide-react';
import { useDialog } from './CustomDialogProvider';

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
      padding: '2px 8px', borderRadius: '9999px', fontSize: '10px', fontWeight: 600,
      backgroundColor: c.bg, color: c.color, border: `1px solid ${c.border}`,
      textTransform: 'uppercase', letterSpacing: '0.04em',
    }}>
      {role}
    </span>
  );
}

export default function TeamsTab() {
  const { activeTeam, setActiveTeam, teams, setTeams, user } = useAppStore();
  const { confirm, alert } = useDialog();

  const [members, setMembers] = useState<any[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  const [incomingInvites, setIncomingInvites] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Invite Form State
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'ADMIN' | 'DEVELOPER' | 'VIEWER'>('DEVELOPER');
  const [inviting, setInviting] = useState(false);

  // New Team Modal
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [creatingTeam, setCreatingTeam] = useState(false);

  // Current user's role in active team
  const currentMember = members.find(m => m.userId === user?.id || m.user?.email === user?.email);
  const isOwnerOrAdmin = currentMember?.role === 'OWNER' || currentMember?.role === 'ADMIN';

  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const fetchIncomingInvites = async () => {
    if (!user?.email) return;
    try {
      const data = await apiRequest(`/user/invites?email=${encodeURIComponent(user.email)}`);
      setIncomingInvites(Array.isArray(data) ? data : []);
    } catch {
      setIncomingInvites([]);
    }
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
      setMembers(Array.isArray(membersData) ? membersData : []);
      setInvites(Array.isArray(invitesData) ? invitesData : []);
      setAuditLogs(Array.isArray(auditData) ? auditData : []);
      setApiKeys(Array.isArray(keysData) ? keysData : []);
    } catch (err) {
      console.error('Failed to fetch team data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    fetchIncomingInvites();
  }, [activeTeam, user]);

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !activeTeam || !user) return;
    setInviting(true);
    try {
      await apiRequest(`/teams/${activeTeam.id}/invites`, {
        method: 'POST',
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole, inviterId: user.id }),
      });
      setInviteEmail('');
      alert({
        title: 'Invitation Sent',
        message: `Successfully invited ${inviteEmail} as ${inviteRole}.`,
        type: 'success',
      });
      fetchData();
    } catch (err: any) {
      alert({ title: 'Invite Failed', message: err.message || 'Failed to send invite.', type: 'error' });
    } finally {
      setInviting(false);
    }
  };

  const handleCancelInvite = async (inviteId: string) => {
    if (!activeTeam || !user) return;
    const ok = await confirm({
      title: 'Revoke Invitation',
      message: 'Are you sure you want to revoke this pending invitation?',
      confirmText: 'Revoke',
      isDanger: true,
    });
    if (!ok) return;

    try {
      await apiRequest(`/teams/${activeTeam.id}/invites/${inviteId}?userId=${user.id}`, { method: 'DELETE' });
      fetchData();
    } catch (err: any) {
      alert({ title: 'Error', message: err.message || 'Failed to revoke invite.', type: 'error' });
    }
  };

  const handleAcceptInvite = async (invite: any) => {
    if (!user) return;
    try {
      const res = await apiRequest(`/teams/invites/${invite.id}/accept`, {
        method: 'POST',
        body: JSON.stringify({ userId: user.id }),
      });

      if (res.teams) {
        useAppStore.setState({ teams: res.teams, activeTeam: res.team || res.teams[0] });
      }

      alert({
        title: 'Invitation Accepted',
        message: `Welcome to ${invite.team?.name || 'the team'}!`,
        type: 'success',
      });

      fetchIncomingInvites();
      fetchData();
    } catch (err: any) {
      alert({ title: 'Accept Failed', message: err.message || 'Failed to accept invitation.', type: 'error' });
    }
  };

  const handleRejectInvite = async (invite: any) => {
    if (!user) return;
    try {
      await apiRequest(`/teams/invites/${invite.id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ userId: user.id }),
      });
      setIncomingInvites(prev => prev.filter(i => i.id !== invite.id));
    } catch (err: any) {
      alert({ title: 'Error', message: err.message || 'Failed to decline invitation.', type: 'error' });
    }
  };

  const handleUpdateRole = async (targetUserId: string, newRole: string) => {
    if (!activeTeam || !user) return;
    try {
      await apiRequest(`/teams/${activeTeam.id}/members/${targetUserId}/role`, {
        method: 'PUT',
        body: JSON.stringify({ role: newRole, actorUserId: user.id }),
      });
      fetchData();
    } catch (err: any) {
      alert({ title: 'Role Update Failed', message: err.message || 'Could not update role.', type: 'error' });
    }
  };

  const handleRemoveMember = async (member: any) => {
    if (!activeTeam || !user) return;
    const isSelf = member.userId === user.id;
    const ok = await confirm({
      title: isSelf ? 'Leave Team' : 'Remove Member',
      message: isSelf
        ? `Are you sure you want to leave ${activeTeam.name}?`
        : `Are you sure you want to remove ${member.user?.name || member.user?.email} from ${activeTeam.name}?`,
      confirmText: isSelf ? 'Leave Team' : 'Remove Member',
      isDanger: true,
    });
    if (!ok) return;

    try {
      await apiRequest(`/teams/${activeTeam.id}/members/${member.userId}?actorUserId=${user.id}`, {
        method: 'DELETE',
      });

      if (isSelf) {
        // Refresh team list and switch
        const updatedTeams = teams.filter(t => t.id !== activeTeam.id);
        setTeams(updatedTeams);
        setActiveTeam(updatedTeams.length > 0 ? updatedTeams[0] : null);
      } else {
        fetchData();
      }
    } catch (err: any) {
      alert({ title: 'Action Failed', message: err.message || 'Failed to remove member.', type: 'error' });
    }
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim() || !user) return;
    setCreatingTeam(true);
    try {
      const team = await apiRequest('/teams', {
        method: 'POST',
        body: JSON.stringify({ name: newTeamName.trim(), ownerUserId: user.id }),
      });
      const updated = [...teams, team];
      useAppStore.setState({ teams: updated, activeTeam: team });
      setNewTeamName('');
      setCreateTeamOpen(false);
      alert({ title: 'Team Created', message: `Team "${team.name}" has been created!`, type: 'success' });
    } catch (err: any) {
      alert({ title: 'Error', message: err.message || 'Failed to create team.', type: 'error' });
    } finally {
      setCreatingTeam(false);
    }
  };

  return (
    <div className="rw-page">
      {/* Header */}
      <div className="rw-page-header">
        <div>
          <h1 className="rw-page-title">Team Settings</h1>
          <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '2px' }}>
            Manage members, roles, permissions, and invitations for{' '}
            <strong style={{ color: '#9ba3af' }}>{activeTeam?.name}</strong>.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setCreateTeamOpen(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              height: '32px', padding: '0 12px', borderRadius: '7px',
              backgroundColor: '#181b22', border: '1px solid rgba(255,255,255,0.09)',
              color: '#d1d5db', fontSize: '12px', fontWeight: 500, cursor: 'pointer',
            }}
          >
            <Building size={13} style={{ color: '#a78bfa' }} /> Create Team
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="rw-page-content">

        {/* ─── INCOMING INVITATIONS BANNER (For current user) ─── */}
        {incomingInvites.length > 0 && (
          <div style={{
            marginBottom: '24px', width: '100%',
            backgroundColor: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.25)',
            borderRadius: '12px', padding: '16px 20px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <Sparkles size={16} style={{ color: '#a78bfa' }} />
              <span style={{ fontSize: '14px', fontWeight: 600, color: '#f1f3f6' }}>
                Pending Invitations ({incomingInvites.length})
              </span>
              <span style={{ fontSize: '12px', color: '#a78bfa', marginLeft: 'auto' }}>
                You were invited to collaborate
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {incomingInvites.map((inv) => (
                <div key={inv.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  backgroundColor: '#0e1015', border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: '8px', padding: '10px 14px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '32px', height: '32px', borderRadius: '8px',
                      backgroundColor: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.25)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#c4b5fd', fontWeight: 600, fontSize: '12px',
                    }}>
                      {inv.team?.name?.substring(0, 2)?.toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#f1f3f6' }}>
                        {inv.team?.name}
                      </div>
                      <div style={{ fontSize: '11px', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        Invited as <RoleBadge role={inv.role} />
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      onClick={() => handleAcceptInvite(inv)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '5px',
                        height: '28px', padding: '0 12px', borderRadius: '6px',
                        backgroundColor: '#22c55e', border: 'none',
                        color: '#fff', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      <UserCheck size={12} /> Accept
                    </button>
                    <button
                      onClick={() => handleRejectInvite(inv)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '5px',
                        height: '28px', padding: '0 10px', borderRadius: '6px',
                        backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
                        color: '#ef4444', fontSize: '11px', fontWeight: 500, cursor: 'pointer',
                      }}
                    >
                      <UserX size={12} /> Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px', gap: '12px', color: '#6b7280' }}>
            <Loader2 size={18} className="animate-spin" style={{ color: '#7c3aed' }} />
            <span style={{ fontSize: '13px' }}>Loading team data...</span>
          </div>
        ) : (
          <div className="w-full grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

            {/* Left column */}
            <div className="lg:col-span-2 flex flex-col gap-6 w-full">

              {/* Members List */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#4b5563' }}>
                    Team Members ({members.length})
                  </div>
                  <span style={{ fontSize: '11px', color: '#6b7280' }}>
                    Your role: <RoleBadge role={currentMember?.role || 'DEVELOPER'} />
                  </span>
                </div>

                <div style={{ backgroundColor: '#111318', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '12px', overflow: 'hidden' }}>
                  {members.map((member, i) => {
                    const isSelf = member.userId === user?.id || member.user?.email === user?.email;
                    return (
                      <div key={member.id} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '14px 16px',
                        borderBottom: i < members.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{
                            width: '34px', height: '34px', borderRadius: '8px',
                            backgroundColor: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.2)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '12px', fontWeight: 600, color: '#c4b5fd',
                          }}>
                            {member.user?.name?.substring(0, 2)?.toUpperCase() || 'KH'}
                          </div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontSize: '13px', fontWeight: 600, color: '#f1f3f6' }}>{member.user?.name}</span>
                              {isSelf && <span style={{ fontSize: '10px', color: '#7c3aed', fontWeight: 600 }}>(You)</span>}
                            </div>
                            <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '1px' }}>{member.user?.email}</div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          {/* Role selector for Owner / Admin (can't demote self from owner) */}
                          {isOwnerOrAdmin && !isSelf && member.role !== 'OWNER' ? (
                            <select
                              value={member.role}
                              onChange={(e) => handleUpdateRole(member.userId, e.target.value)}
                              style={{
                                height: '26px', padding: '0 8px', borderRadius: '6px',
                                backgroundColor: '#0e1015', border: '1px solid rgba(255,255,255,0.1)',
                                color: '#c4b5fd', fontSize: '11px', fontWeight: 600, cursor: 'pointer', outline: 'none',
                              }}
                            >
                              <option value="ADMIN">ADMIN</option>
                              <option value="DEVELOPER">DEVELOPER</option>
                              <option value="VIEWER">VIEWER</option>
                            </select>
                          ) : (
                            <RoleBadge role={member.role} />
                          )}

                          {/* Remove button / Leave team button */}
                          {(isOwnerOrAdmin && !isSelf && member.role !== 'OWNER') && (
                            <button
                              onClick={() => handleRemoveMember(member)}
                              title="Remove member"
                              style={{
                                width: '26px', height: '26px', borderRadius: '6px',
                                backgroundColor: 'transparent', border: '1px solid transparent',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: '#4b5563', cursor: 'pointer',
                              }}
                              className="hover:text-red-400 hover:bg-red-500/10 hover:border-red-500/20"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}

                          {isSelf && member.role !== 'OWNER' && (
                            <button
                              onClick={() => handleRemoveMember(member)}
                              style={{
                                height: '24px', padding: '0 8px', borderRadius: '5px',
                                backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
                                color: '#ef4444', fontSize: '10px', fontWeight: 600, cursor: 'pointer',
                              }}
                            >
                              Leave Team
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Pending Outgoing Invites */}
              {invites.length > 0 && (
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#4b5563', marginBottom: '10px' }}>
                    Outgoing Invitations ({invites.length})
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
                              <Clock size={10} /> Pending acceptance
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <RoleBadge role={invite.role} />
                          {isOwnerOrAdmin && (
                            <button
                              onClick={() => handleCancelInvite(invite.id)}
                              style={{
                                height: '24px', padding: '0 8px', borderRadius: '5px',
                                backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
                                color: '#ef4444', fontSize: '11px', cursor: 'pointer',
                              }}
                            >
                              Revoke
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* API & Service Keys */}
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#4b5563', marginBottom: '10px' }}>
                  Team API & Service Keys
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
                          <span style={{ fontSize: '13px', fontWeight: 600, color: '#f1f3f6' }}>{keyObj.name}</span>
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

              {/* Audit Logs */}
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#4b5563', marginBottom: '10px' }}>
                  Team Audit Activity
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

            {/* Right sidebar: Invite Form */}
            <div className="lg:col-span-1" style={{
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
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#f1f3f6' }}>Invite New Member</span>
              </div>

              <form onSubmit={handleSendInvite} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#4b5563', display: 'block', marginBottom: '6px' }}>Email Address</label>
                  <input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="teammate@company.com"
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
                    <option value="DEVELOPER">Developer (Deploy & Manage Projects)</option>
                    <option value="ADMIN">Administrator (Full Team Access)</option>
                    <option value="VIEWER">Viewer (Read Only)</option>
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={inviting || !isOwnerOrAdmin}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
                    height: '34px', borderRadius: '7px',
                    backgroundColor: '#7c3aed', border: 'none',
                    color: '#fff', fontSize: '12px', fontWeight: 600,
                    cursor: (inviting || !isOwnerOrAdmin) ? 'not-allowed' : 'pointer',
                    opacity: (inviting || !isOwnerOrAdmin) ? 0.6 : 1,
                  }}
                >
                  {inviting ? <><Loader2 size={12} className="animate-spin" /> Sending...</> : <><Plus size={12} /> Send Invitation</>}
                </button>
                {!isOwnerOrAdmin && (
                  <p style={{ fontSize: '11px', color: '#ef4444', margin: 0, textAlign: 'center' }}>
                    Only team Owners and Admins can send invitations.
                  </p>
                )}
              </form>

              <div style={{ padding: '12px', backgroundColor: '#0e1015', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '9px', fontWeight: 700, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Role permissions
                </div>
                {[
                  { role: 'Owner', desc: 'Full ownership and billing' },
                  { role: 'Admin', desc: 'Manage projects, databases, and members' },
                  { role: 'Developer', desc: 'Deploy code, query DB, and upload assets' },
                  { role: 'Viewer', desc: 'Read-only dashboard access' },
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

      {/* Create Team Modal */}
      {createTeamOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-6">
          <div style={{ backgroundColor: '#111318', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', padding: '24px', maxWidth: '380px', width: '100%', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#f1f3f6', marginBottom: '4px' }}>Create New Team</h3>
            <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '20px' }}>Create a separate workspace with dedicated members and resources.</p>
            <form onSubmit={handleCreateTeam} className="space-y-4">
              <div>
                <label style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#4b5563', display: 'block', marginBottom: '6px' }}>Team Name</label>
                <input
                  type="text"
                  required
                  value={newTeamName}
                  onChange={e => setNewTeamName(e.target.value)}
                  placeholder="Acme Engineering"
                  style={{ width: '100%', height: '36px', padding: '0 12px', borderRadius: '7px', backgroundColor: '#0e1015', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '4px' }}>
                <button
                  type="button"
                  onClick={() => setCreateTeamOpen(false)}
                  style={{ height: '32px', padding: '0 14px', borderRadius: '7px', backgroundColor: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#9ba3af', fontSize: '12px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingTeam}
                  style={{ height: '32px', padding: '0 16px', borderRadius: '7px', backgroundColor: '#7c3aed', border: 'none', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: creatingTeam ? 'not-allowed' : 'pointer' }}
                >
                  {creatingTeam ? 'Creating...' : 'Create Team'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
