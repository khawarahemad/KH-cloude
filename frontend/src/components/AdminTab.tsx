'use client';

import React, { useState, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { apiRequest } from '@/lib/api';
import { 
  Users, Layers, HardDrive, CreditCard, Shield, Trash2, 
  RefreshCw, Power, Check, Loader2, Search, Sliders, Copy, ExternalLink
} from 'lucide-react';

export default function AdminTab() {
  const { user } = useAppStore();
  const [subTab, setSubTab] = useState<'users' | 'projects' | 'buckets' | 'billing'>('users');
  const [loading, setLoading] = useState(true);
  
  // Data lists
  const [users, setUsers] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [buckets, setBuckets] = useState<any[]>([]);
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  // Action pending states
  const [actingId, setActingId] = useState<string | null>(null);

  // Billing override local state
  const [overrideTeamId, setOverrideTeamId] = useState('');
  const [overridePlanId, setOverridePlanId] = useState('hobby');
  const [overrideStatus, setOverrideStatus] = useState('active');

  // Custom limits editor state
  const [editingLimitId, setEditingLimitId] = useState<string | null>(null);
  const [newLimitGB, setNewLimitGB] = useState('');

  const fetchAdminData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Always fetch users to populate system teams list in UI
      const usersData = await apiRequest(`/admin/users?adminUserId=${user.id}`);
      setUsers(usersData);

      if (subTab === 'projects') {
        const data = await apiRequest(`/admin/projects?adminUserId=${user.id}`);
        setProjects(data);
      } else if (subTab === 'buckets') {
        const data = await apiRequest(`/admin/buckets?adminUserId=${user.id}`);
        setBuckets(data);
      }
    } catch (err) {
      console.error('Failed to load admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, [subTab, user]);

  // Extract all unique organizations/teams across all registered users
  const allSystemTeams = React.useMemo(() => {
    const teamsMap = new Map<string, any>();
    users.forEach(u => {
      if (u.teams) {
        u.teams.forEach((t: any) => {
          teamsMap.set(t.id, { ...t, owner: u.name, email: u.email });
        });
      }
    });
    return Array.from(teamsMap.values());
  }, [users]);

  // Copy to clipboard helper
  const handleCopyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    alert(`Copied ${label} to clipboard!`);
  };

  // Action Handlers
  const handleToggleRole = async (targetUserId: string, currentRole: string) => {
    if (!user) return;
    const newRole = currentRole === 'ADMIN' ? 'USER' : 'ADMIN';
    setActingId(targetUserId);
    try {
      await apiRequest(`/admin/users/${targetUserId}/role?adminUserId=${user.id}`, {
        method: 'POST',
        body: JSON.stringify({ role: newRole }),
      });
      fetchAdminData();
    } catch (err: any) {
      alert(err.message || 'Failed to update role.');
    } finally {
      setActingId(null);
    }
  };

  const handleDeleteUser = async (targetUserId: string) => {
    if (!user) return;
    if (!confirm('Are you sure you want to permanently delete this user? All their projects, teams, databases, and buckets will be destroyed!')) return;
    setActingId(targetUserId);
    try {
      await apiRequest(`/admin/users/${targetUserId}?adminUserId=${user.id}`, {
        method: 'DELETE',
      });
      fetchAdminData();
    } catch (err: any) {
      alert(err.message || 'Failed to delete user.');
    } finally {
      setActingId(null);
    }
  };

  const handleToggleProjectStatus = async (projectId: string, currentStatus: string) => {
    if (!user) return;
    const newStatus = currentStatus === 'SUSPENDED' ? 'READY' : 'SUSPENDED';
    setActingId(projectId);
    try {
      await apiRequest(`/admin/projects/${projectId}/status?adminUserId=${user.id}`, {
        method: 'POST',
        body: JSON.stringify({ status: newStatus }),
      });
      fetchAdminData();
    } catch (err: any) {
      alert(err.message || 'Failed to update container state.');
    } finally {
      setActingId(null);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    if (!user) return;
    if (!confirm('Are you sure you want to force-delete this project and stop its container?')) return;
    setActingId(projectId);
    try {
      await apiRequest(`/admin/projects/${projectId}?adminUserId=${user.id}`, {
        method: 'DELETE',
      });
      fetchAdminData();
    } catch (err: any) {
      alert(err.message || 'Failed to delete project.');
    } finally {
      setActingId(null);
    }
  };

  const handleUpdateBucketLimit = async (bucketId: string) => {
    if (!user || !newLimitGB) return;
    const sizeBytes = parseFloat(newLimitGB) * 1024 * 1024 * 1024;
    if (isNaN(sizeBytes) || sizeBytes <= 0) {
      alert('Please enter a valid positive number for storage limit.');
      return;
    }
    setActingId(bucketId);
    try {
      await apiRequest(`/admin/buckets/${bucketId}/limit?adminUserId=${user.id}`, {
        method: 'POST',
        body: JSON.stringify({ sizeLimit: sizeBytes.toString() }),
      });
      setEditingLimitId(null);
      setNewLimitGB('');
      fetchAdminData();
    } catch (err: any) {
      alert(err.message || 'Failed to update bucket limit.');
    } finally {
      setActingId(null);
    }
  };

  const handleDeleteBucket = async (bucketId: string) => {
    if (!user) return;
    if (!confirm('Are you sure you want to force delete this bucket? ALL stored objects will be permanently lost.')) return;
    setActingId(bucketId);
    try {
      await apiRequest(`/admin/buckets/${bucketId}?adminUserId=${user.id}`, {
        method: 'DELETE',
      });
      fetchAdminData();
    } catch (err: any) {
      alert(err.message || 'Failed to force delete bucket.');
    } finally {
      setActingId(null);
    }
  };

  const handleOverrideSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !overrideTeamId.trim()) return;
    setLoading(true);
    try {
      await apiRequest(`/admin/subscriptions/override?adminUserId=${user.id}`, {
        method: 'POST',
        body: JSON.stringify({
          teamId: overrideTeamId,
          planId: overridePlanId,
          status: overrideStatus,
        }),
      });
      alert('Subscription manually updated successfully!');
      setOverrideTeamId('');
      fetchAdminData();
    } catch (err: any) {
      alert(err.message || 'Failed to override subscription.');
    } finally {
      setLoading(false);
    }
  };

  // Helper
  const formatBytes = (bytesStr: string) => {
    const num = parseInt(bytesStr);
    if (isNaN(num) || num === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(num) / Math.log(k));
    return parseFloat((num / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#030303]">
      {/* Header */}
      <div className="h-16 border-b border-white/5 px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
            <Shield size={16} />
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-tight text-white">System Admin Console</h2>
            <p className="text-[10px] text-zinc-500 font-medium">Full infrastructure control & plan overrides</p>
          </div>
        </div>

        {/* Sub-tabs selectors */}
        <div className="flex gap-1.5 bg-[#0a0a0c] border border-white/5 rounded-xl p-1 text-[11px] font-bold text-zinc-400">
          <button
            onClick={() => setSubTab('users')}
            className={`h-8 px-4 rounded-lg flex items-center gap-1.5 transition-all ${
              subTab === 'users' ? 'bg-white/5 text-white shadow-sm' : 'hover:text-zinc-300'
            }`}
          >
            <Users size={12} />
            Users
          </button>
          <button
            onClick={() => setSubTab('projects')}
            className={`h-8 px-4 rounded-lg flex items-center gap-1.5 transition-all ${
              subTab === 'projects' ? 'bg-white/5 text-white shadow-sm' : 'hover:text-zinc-300'
            }`}
          >
            <Layers size={12} />
            App Containers
          </button>
          <button
            onClick={() => setSubTab('buckets')}
            className={`h-8 px-4 rounded-lg flex items-center gap-1.5 transition-all ${
              subTab === 'buckets' ? 'bg-white/5 text-white shadow-sm' : 'hover:text-zinc-300'
            }`}
          >
            <HardDrive size={12} />
            Object Storage
          </button>
          <button
            onClick={() => setSubTab('billing')}
            className={`h-8 px-4 rounded-lg flex items-center gap-1.5 transition-all ${
              subTab === 'billing' ? 'bg-white/5 text-white shadow-sm' : 'hover:text-zinc-300'
            }`}
          >
            <CreditCard size={12} />
            Plans Override
          </button>
        </div>
      </div>

      {/* Main viewport */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto space-y-6">

          {/* Quick Metrics */}
          {subTab !== 'billing' && (
            <div className="grid grid-cols-3 gap-6 shrink-0">
              <div className="glass-card p-5 rounded-2xl border border-white/5 bg-white/[0.01]">
                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block mb-1">Total System Users</span>
                <span className="text-2xl font-black text-white">{users.length}</span>
              </div>
              <div className="glass-card p-5 rounded-2xl border border-white/5 bg-white/[0.01]">
                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block mb-1">Monitored Web Containers</span>
                <span className="text-2xl font-black text-indigo-400">{subTab === 'projects' ? projects.length : projects.reduce((acc, u) => acc + (u.projectsCount || 0), 0)}</span>
              </div>
              <div className="glass-card p-5 rounded-2xl border border-white/5 bg-white/[0.01]">
                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block mb-1">Global Storage Buckets</span>
                <span className="text-2xl font-black text-purple-400">{subTab === 'buckets' ? buckets.length : buckets.reduce((acc, u) => acc + (u.bucketsCount || 0), 0)}</span>
              </div>
            </div>
          )}

          {/* Search bar & Refresh */}
          {subTab !== 'billing' && (
            <div className="flex gap-4 items-center">
              <div className="flex-1 relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" size={14} />
                <input
                  type="text"
                  placeholder={`Search ${subTab}...`}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-10 pl-10 pr-4 rounded-xl glass-input text-xs text-white"
                />
              </div>
              <button
                onClick={fetchAdminData}
                className="h-10 w-10 flex items-center justify-center rounded-xl bg-white/5 border border-white/5 text-zinc-400 hover:text-white transition-colors hover:bg-white/10 active:scale-95"
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          )}

          {/* Tab Views */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 text-zinc-500 gap-3">
              <Loader2 className="animate-spin text-indigo-400" size={32} />
              <span className="text-xs">Gathering platform details...</span>
            </div>
          ) : (
            <div className="glass-card border border-white/5 rounded-2xl overflow-hidden bg-white/[0.01]">
              
              {/* SUB TAB: USERS LIST */}
              {subTab === 'users' && (
                <div className="divide-y divide-white/5 text-left">
                  <div className="grid grid-cols-4 p-4 text-[10px] font-bold text-zinc-500 uppercase tracking-wider bg-black/40">
                    <span>User / Organizations</span>
                    <span>System Role</span>
                    <span>Resources</span>
                    <span className="text-right">Actions</span>
                  </div>
                  
                  {users
                    .filter(u => (u.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || (u.email || '').toLowerCase().includes(searchQuery.toLowerCase()))
                    .map(u => (
                      <div key={u.id} className="grid grid-cols-4 p-4 items-start text-xs text-zinc-300 gap-4">
                        <div className="flex flex-col gap-1">
                          <span className="font-bold text-white text-sm">{u.name}</span>
                          <span className="text-[10px] text-zinc-500 font-mono mb-2">{u.email}</span>
                          
                          {/* User Teams/Orgs */}
                          <div className="space-y-1">
                            <span className="text-[8px] uppercase tracking-wider text-zinc-600 block font-black">Teams Owned/Joined:</span>
                            {u.teams && u.teams.map((t: any) => (
                              <div key={t.id} className="flex items-center justify-between gap-2 bg-white/[0.02] border border-white/5 rounded-lg p-2">
                                <div className="flex flex-col gap-0.5 truncate min-w-0">
                                  <span className="font-bold text-zinc-300 truncate text-[11px]">{t.name}</span>
                                  <span className="text-[8px] font-mono text-zinc-600 truncate">{t.id}</span>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${
                                    t.planId === 'pro' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                                    t.planId === 'enterprise' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' :
                                    'bg-zinc-800 text-zinc-500'
                                  }`}>
                                    {t.planId}
                                  </span>
                                  <button
                                    onClick={() => handleCopyText(t.id, 'Team ID')}
                                    className="p-1 hover:text-white hover:bg-white/5 rounded transition-colors text-zinc-500"
                                    title="Copy Team ID"
                                  >
                                    <Copy size={10} />
                                  </button>
                                  <button
                                    onClick={() => {
                                      setOverrideTeamId(t.id);
                                      setOverridePlanId(t.planId);
                                      setOverrideStatus(t.status);
                                      setSubTab('billing');
                                    }}
                                    className="p-1 hover:text-indigo-400 hover:bg-indigo-500/10 rounded transition-colors text-zinc-500"
                                    title="Manage Subscription Plan"
                                  >
                                    <Sliders size={10} />
                                  </button>
                                </div>
                              </div>
                            ))}
                            {(!u.teams || u.teams.length === 0) && (
                              <span className="text-[10px] text-zinc-600 italic">No associated teams</span>
                            )}
                          </div>
                        </div>

                        <div className="pt-2">
                          <span className={`px-2.5 py-1 rounded-md text-[9px] font-black tracking-wide ${
                            u.role === 'ADMIN' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' : 'bg-zinc-800 text-zinc-400'
                          }`}>
                            {u.role}
                          </span>
                        </div>

                        <div className="flex flex-col gap-1.5 pt-2 text-[10px] font-bold text-zinc-400">
                          <span>{u.projectsCount} Apps Monitored</span>
                          <span>{u.databasesCount} Databases</span>
                          <span>{u.bucketsCount} Storage Buckets</span>
                        </div>

                        <div className="flex justify-end gap-3 pt-2">
                          <button
                            onClick={() => handleToggleRole(u.id, u.role)}
                            disabled={actingId === u.id}
                            className="h-8 px-3 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white transition-colors text-[10px] font-bold flex items-center gap-1 disabled:opacity-50"
                          >
                            <Shield size={10} />
                            Toggle Admin
                          </button>
                          <button
                            onClick={() => handleDeleteUser(u.id)}
                            disabled={actingId === u.id}
                            className="h-8 w-8 rounded-lg bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white transition-colors flex items-center justify-center disabled:opacity-50"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  {users.length === 0 && (
                    <div className="p-8 text-center text-zinc-500 text-xs">No registered users found.</div>
                  )}
                </div>
              )}

              {/* SUB TAB: APP CONTAINERS */}
              {subTab === 'projects' && (
                <div className="divide-y divide-white/5 text-left">
                  <div className="grid grid-cols-4 p-4 text-[10px] font-bold text-zinc-500 uppercase tracking-wider bg-black/40">
                    <span>Application (Slug)</span>
                    <span>Default Domain</span>
                    <span>Container Status</span>
                    <span className="text-right">Actions</span>
                  </div>

                  {projects
                    .filter(p => (p.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || (p.slug || '').toLowerCase().includes(searchQuery.toLowerCase()))
                    .map(p => (
                      <div key={p.id} className="grid grid-cols-4 p-4 items-center text-xs text-zinc-300">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-bold text-white text-sm">{p.name}</span>
                          <span className="text-[10px] text-zinc-500 font-mono mb-1">({p.slug})</span>
                          
                          {p.team && (
                            <div className="flex items-center gap-1.5 text-[9px] text-zinc-500">
                              <span className="font-semibold">Org: {p.team.name}</span>
                              <button
                                onClick={() => handleCopyText(p.team.id, 'Team ID')}
                                className="hover:text-white"
                                title="Copy Team ID"
                              >
                                <Copy size={8} />
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="font-mono text-[10px] text-zinc-400 truncate pr-4">
                          <a href={`https://${p.slug}.khawarahemad.com`} target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline inline-flex items-center gap-1">
                            {p.slug}.khawarahemad.com
                            <ExternalLink size={10} />
                          </a>
                        </div>
                        <div>
                          <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold ${
                            p.status === 'READY' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                            p.status === 'SUSPENDED' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                            'bg-red-500/10 text-red-400 border border-red-500/20'
                          }`}>
                            {p.status}
                          </span>
                        </div>
                        <div className="flex justify-end gap-3">
                          <button
                            onClick={() => handleToggleProjectStatus(p.id, p.status)}
                            disabled={actingId === p.id}
                            className={`h-8 px-3 rounded-lg text-[10px] font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50 ${
                              p.status === 'SUSPENDED' 
                                ? 'bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-white' 
                                : 'bg-amber-500/10 hover:bg-amber-500 text-amber-400 hover:text-white'
                            }`}
                          >
                            <Power size={10} />
                            {p.status === 'SUSPENDED' ? 'Resume Container' : 'Suspend / Stop'}
                          </button>
                          <button
                            onClick={() => handleDeleteProject(p.id)}
                            disabled={actingId === p.id}
                            className="h-8 w-8 rounded-lg bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white transition-colors flex items-center justify-center disabled:opacity-50"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  {projects.length === 0 && (
                    <div className="p-8 text-center text-zinc-500 text-xs">No user projects found.</div>
                  )}
                </div>
              )}

              {/* SUB TAB: OBJECT STORAGE */}
              {subTab === 'buckets' && (
                <div className="divide-y divide-white/5 text-left">
                  <div className="grid grid-cols-4 p-4 text-[10px] font-bold text-zinc-500 uppercase tracking-wider bg-black/40">
                    <span>Bucket (MinIO Key)</span>
                    <span>Storage Quota</span>
                    <span>Capacity Used</span>
                    <span className="text-right">Actions</span>
                  </div>

                  {buckets
                    .filter(b => (b.name || '').toLowerCase().includes(searchQuery.toLowerCase()))
                    .map(b => (
                      <div key={b.id} className="grid grid-cols-4 p-4 items-center text-xs text-zinc-300">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-bold text-white text-sm">{b.name}</span>
                          <span className="text-[10px] text-zinc-500 uppercase font-semibold mb-1">
                            {b.isPublic ? '🌐 PUBLIC' : '🔒 PRIVATE'}
                          </span>
                          
                          {b.team && (
                            <div className="flex items-center gap-1.5 text-[9px] text-zinc-500">
                              <span className="font-semibold">Org: {b.team.name}</span>
                              <button
                                onClick={() => handleCopyText(b.team.id, 'Team ID')}
                                className="hover:text-white"
                                title="Copy Team ID"
                              >
                                <Copy size={8} />
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {editingLimitId === b.id ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                placeholder="GB"
                                value={newLimitGB}
                                onChange={(e) => setNewLimitGB(e.target.value)}
                                className="w-16 h-8 px-2 rounded-lg bg-black text-xs text-white border border-white/10"
                              />
                              <button
                                onClick={() => handleUpdateBucketLimit(b.id)}
                                className="p-1 rounded bg-emerald-500 text-white"
                              >
                                <Check size={12} />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span>{(Number(b.sizeLimit) / (1024 * 1024 * 1024)).toFixed(1)} GB</span>
                              <button
                                onClick={() => {
                                  setEditingLimitId(b.id);
                                  setNewLimitGB((Number(b.sizeLimit) / (1024 * 1024 * 1024)).toString());
                                }}
                                className="text-[10px] text-indigo-400 hover:underline"
                              >
                                (Edit Quota)
                              </button>
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="flex flex-col gap-1 w-2/3">
                            <span className="font-mono text-[10px]">{formatBytes(b.sizeUsed)}</span>
                            <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-indigo-500" 
                                style={{ width: `${Math.min(100, (Number(b.sizeUsed) / Number(b.sizeLimit)) * 100)}%` }}
                              />
                            </div>
                          </div>
                        </div>
                        <div className="flex justify-end gap-3">
                          <button
                            onClick={() => handleDeleteBucket(b.id)}
                            disabled={actingId === b.id}
                            className="h-8 px-3 rounded-lg bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white transition-colors text-[10px] font-bold flex items-center gap-1 disabled:opacity-50"
                          >
                            <Trash2 size={12} />
                            Force Delete Bucket
                          </button>
                        </div>
                      </div>
                    ))}
                  {buckets.length === 0 && (
                    <div className="p-8 text-center text-zinc-500 text-xs">No storage buckets provisioned.</div>
                  )}
                </div>
              )}

              {/* SUB TAB: PLANS OVERRIDE */}
              {subTab === 'billing' && (
                <div className="p-8">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    
                    {/* Left: Override Form */}
                    <div className="md:col-span-2 space-y-6">
                      <div>
                        <h3 className="font-bold text-sm text-white">Manual Subscription Quota Override</h3>
                        <p className="text-xs text-zinc-400">Instantly upgrade or modify a team's resource access tier without Stripe gateway hooks.</p>
                      </div>

                      <form onSubmit={handleOverrideSubscription} className="space-y-4 text-left">
                        <div>
                          <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block mb-1">Target Team ID</label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. b8f498c1-849c-..."
                            value={overrideTeamId}
                            onChange={(e) => setOverrideTeamId(e.target.value)}
                            className="w-full h-10 px-3 rounded-xl glass-input text-xs text-white"
                          />
                          <span className="text-[9px] text-zinc-600 block mt-1">Select an organization from the panel on the right or enter a Team ID manually.</span>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block mb-1">Subscription Plan</label>
                            <select
                              value={overridePlanId}
                              onChange={(e) => setOverridePlanId(e.target.value)}
                              className="w-full h-10 px-3 rounded-xl bg-black border border-white/10 text-xs text-white"
                            >
                              <option value="hobby">Hobby (Free)</option>
                              <option value="pro">Pro ($29/mo)</option>
                              <option value="enterprise">Enterprise ($250/mo)</option>
                            </select>
                          </div>

                          <div>
                            <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block mb-1">Billing Status</label>
                            <select
                              value={overrideStatus}
                              onChange={(e) => setOverrideStatus(e.target.value)}
                              className="w-full h-10 px-3 rounded-xl bg-black border border-white/10 text-xs text-white"
                            >
                              <option value="active">Active</option>
                              <option value="canceled">Canceled</option>
                              <option value="past_due">Past Due</option>
                            </select>
                          </div>
                        </div>

                        <button
                          type="submit"
                          className="w-full h-10 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-xs transition-colors active:scale-95 duration-100 flex items-center justify-center gap-1.5"
                        >
                          <Sliders size={12} />
                          Apply Manual Plan Override
                        </button>
                      </form>
                    </div>

                    {/* Right: Quick Select Organizations Sidebar */}
                    <div className="border-l border-white/5 pl-6 space-y-4">
                      <div>
                        <h4 className="font-bold text-xs text-zinc-400 uppercase tracking-wider">Quick Select Organization</h4>
                        <p className="text-[10px] text-zinc-600">Select any system team to pre-fill the form.</p>
                      </div>

                      <div className="space-y-2 overflow-y-auto max-h-[300px] pr-2">
                        {allSystemTeams.map((t: any) => (
                          <button
                            key={t.id}
                            onClick={() => {
                              setOverrideTeamId(t.id);
                              setOverridePlanId(t.planId);
                              setOverrideStatus(t.status);
                            }}
                            className={`w-full text-left p-2.5 rounded-xl border transition-all flex flex-col gap-1 ${
                              overrideTeamId === t.id 
                                ? 'bg-indigo-500/10 border-indigo-500/40 text-white' 
                                : 'bg-white/[0.01] border-white/5 text-zinc-400 hover:bg-white/[0.03] hover:border-white/10'
                            }`}
                          >
                            <div className="flex justify-between items-center w-full">
                              <span className="font-bold text-xs truncate max-w-[120px] text-white">{t.name}</span>
                              <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase shrink-0 ${
                                t.planId === 'pro' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                                t.planId === 'enterprise' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' :
                                'bg-zinc-800 text-zinc-500'
                              }`}>
                                {t.planId}
                              </span>
                            </div>
                            <span className="text-[8px] font-mono text-zinc-600 truncate w-full">{t.id}</span>
                            <span className="text-[9px] text-zinc-500 truncate w-full mt-0.5">Owner: {t.owner}</span>
                          </button>
                        ))}
                        {allSystemTeams.length === 0 && (
                          <div className="text-[11px] text-zinc-600 italic py-4">No organizations found.</div>
                        )}
                      </div>
                    </div>

                  </div>
                </div>
              )}

            </div>
          )}

        </div>
      </div>
    </div>
  );
}
