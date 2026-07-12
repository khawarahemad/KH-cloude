'use client';

import React, { useState, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { apiRequest } from '@/lib/api';
import { Shield, Plus, Loader2, Trash, Mail, Clock, ShieldCheck, User, Key, Copy, Check, Eye, EyeOff } from 'lucide-react';

export default function TeamsTab() {
  const { activeTeam, user } = useAppStore();
  
  // Members & Invites
  const [members, setMembers] = useState<any[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Invite Form
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
    } catch (err) {
      // Mock Fallbacks
      setMembers([
        { id: 'm-1', user: { name: user?.name || 'Developer', email: user?.email || 'dev@khcloud.com' }, role: 'OWNER' }
      ]);
      setInvites([]);
      setApiKeys([
        { id: 'k-1', name: 'anon', key: 'kh_anon_mock_1234567890abcdef', role: 'ANON' },
        { id: 'k-2', name: 'service_role', key: 'kh_service_mock_1234567890abcdef', role: 'SERVICE_ROLE' }
      ]);
      setAuditLogs([
        { id: 'a-1', action: 'TEAM.CREATE', targetType: 'TEAM', createdAt: new Date().toISOString() }
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeTeam]);

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !activeTeam || !user) return;
    setInviting(true);

    try {
      await apiRequest(`/teams/${activeTeam.id}/invites`, {
        method: 'POST',
        body: JSON.stringify({
          email: inviteEmail,
          role: inviteRole,
          inviterId: user.id,
        }),
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
      await apiRequest(`/teams/${activeTeam.id}/invites/${inviteId}?userId=${user.id}`, {
        method: 'DELETE',
      });
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#030303]">
      {/* Header */}
      <div className="h-16 border-b border-white/5 px-6 flex items-center shrink-0">
        <h2 className="text-sm font-bold tracking-tight">Workspace settings</h2>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-500 gap-3">
            <Loader2 className="animate-spin text-indigo-400" size={32} />
            <span className="text-xs">Fetching workspace details...</span>
          </div>
        ) : (
          <div className="max-w-5xl mx-auto grid md:grid-cols-3 gap-8">
            
            {/* MEMBERS & ROLES PANEL (2 Cols) */}
            <div className="md:col-span-2 space-y-8">
              
              {/* Active Members list */}
              <div>
                <h3 className="text-xs font-bold text-zinc-400 mb-4 uppercase tracking-wider">Workspace Members</h3>
                <div className="border border-white/5 rounded-2xl overflow-hidden glass-card divide-y divide-white/5">
                  {members.map((member) => (
                    <div key={member.id} className="p-4 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400 font-bold uppercase">
                          {member.user?.name?.substring(0, 2)}
                        </div>
                        <div>
                          <span className="font-bold text-zinc-300 block">{member.user?.name}</span>
                          <span className="text-[10px] text-zinc-500 mt-0.5 block">{member.user?.email}</span>
                        </div>
                      </div>
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 uppercase tracking-wide">
                        {member.role}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Pending Invites */}
              {invites.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-zinc-400 mb-4 uppercase tracking-wider">Pending Invitations</h3>
                  <div className="border border-white/5 rounded-2xl overflow-hidden glass-card divide-y divide-white/5">
                    {invites.map((invite) => (
                      <div key={invite.id} className="p-4 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 text-zinc-300">
                          <Mail size={14} className="text-zinc-500" />
                          <span>{invite.email}</span>
                          <span className="text-[9px] text-zinc-500 uppercase">({invite.role})</span>
                        </div>

                        <div className="flex items-center gap-4">
                          <span className="text-[9px] text-zinc-500 flex items-center gap-1">
                            <Clock size={10} />
                            PENDING
                          </span>
                          <button
                            onClick={() => handleCancelInvite(invite.id)}
                            className="text-zinc-500 hover:text-red-400"
                            title="Cancel Invite"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Workspace API & Service Keys */}
              <div>
                <h3 className="text-xs font-bold text-zinc-400 mb-4 uppercase tracking-wider">Workspace API & Service Keys</h3>
                <div className="space-y-4 mb-8">
                  {apiKeys.map((keyObj) => (
                    <div key={keyObj.id} className="border border-white/5 rounded-2xl p-5 bg-white/[0.01] relative flex flex-col justify-between">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Key size={14} className="text-indigo-400" />
                          <span className="text-xs font-bold text-white uppercase tracking-wider">{keyObj.name} key</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${
                          keyObj.role === 'SERVICE_ROLE' 
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' 
                            : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                        }`}>
                          {keyObj.role === 'SERVICE_ROLE' ? 'Bypasses Row Security / Full Admin Access' : 'Client Safe / Restricted Access'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 bg-[#050507] border border-white/5 rounded-lg px-3 py-2 text-[10px] font-mono text-zinc-300">
                        <span className="truncate flex-1 select-all">
                          {showKeys[keyObj.id] ? keyObj.key : '••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••'}
                        </span>
                        
                        <div className="flex items-center gap-2 shrink-0">
                          <button 
                            type="button"
                            onClick={() => setShowKeys(prev => ({ ...prev, [keyObj.id]: !prev[keyObj.id] }))}
                            className="text-zinc-500 hover:text-white"
                          >
                            {showKeys[keyObj.id] ? <EyeOff size={13} /> : <Eye size={13} />}
                          </button>
                          
                          <button 
                            type="button"
                            onClick={() => handleCopyText(keyObj.key, keyObj.id)} 
                            className="text-zinc-500 hover:text-white"
                          >
                            {copiedId === keyObj.id ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Audit Logs */}
              <div>
                <h3 className="text-xs font-bold text-zinc-400 mb-4 uppercase tracking-wider">Workspace Audit Logs</h3>
                <div className="border border-white/5 rounded-2xl overflow-hidden glass-card divide-y divide-white/5 max-h-80 overflow-y-auto">
                  {auditLogs.length === 0 ? (
                    <div className="p-8 text-center text-zinc-500 text-xs font-medium">No actions logged yet.</div>
                  ) : (
                    auditLogs.map((log) => (
                      <div key={log.id} className="p-4 text-xs hover:bg-white/[0.005] transition-colors">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-zinc-300 font-mono text-[10px]">{log.action}</span>
                          <span className="text-[9px] text-zinc-500 font-medium">
                            {new Date(log.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <div className="text-[10px] text-zinc-500 mt-1 flex items-center gap-1.5 font-medium">
                          <User size={10} />
                          <span>{log.user?.name || 'System Operator'}</span>
                          {log.details && (
                            <>
                              <span>•</span>
                              <span className="truncate max-w-sm">{log.details}</span>
                            </>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>

            {/* INVITE NEW MEMBER FORM (1 Col) */}
            <div className="space-y-6">
              <div className="glass-card p-6 rounded-2xl border border-white/5 space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold text-white">
                  <ShieldCheck size={16} className="text-indigo-400" />
                  Invite Workspace Member
                </div>

                <form onSubmit={handleSendInvite} className="space-y-4">
                  <div>
                    <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block mb-1">Email Address</label>
                    <input
                      type="email"
                      required
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="dev@company.com"
                      className="w-full h-10 px-3 rounded-xl glass-input text-xs text-white"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block mb-1">Workspace Role</label>
                    <select
                      value={inviteRole}
                      onChange={(e: any) => setInviteRole(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl glass-input text-xs text-zinc-300 font-semibold focus:ring-0 focus:outline-none"
                    >
                      <option value="DEVELOPER" className="bg-[#0c0c0e] text-white">Developer</option>
                      <option value="ADMIN" className="bg-[#0c0c0e] text-white">Administrator</option>
                      <option value="VIEWER" className="bg-[#0c0c0e] text-white">Viewer</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={inviting}
                    className="w-full h-10 rounded-xl bg-white text-black font-semibold text-xs hover:bg-zinc-200 transition-colors flex items-center justify-center gap-1.5 active:scale-95 duration-100"
                  >
                    {inviting ? (
                      <>
                        <Loader2 size={12} className="animate-spin" />
                        Inviting...
                      </>
                    ) : (
                      <>
                        <Plus size={12} />
                        Send invitation
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
