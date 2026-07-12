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
  const [subTab, setSubTab] = useState<'users' | 'projects' | 'buckets' | 'billing' | 'vps-storage'>('users');
  const [loading, setLoading] = useState(true);
  
  // Data lists
  const [users, setUsers] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [buckets, setBuckets] = useState<any[]>([]);
  const [storageData, setStorageData] = useState<any>(null);
  
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
      } else if (subTab === 'vps-storage') {
        const data = await apiRequest(`/admin/system/storage?adminUserId=${user.id}`);
        setStorageData(data);
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
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
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
            onClick={() => setSubTab('vps-storage')}
            className={`h-8 px-4 rounded-lg flex items-center gap-1.5 transition-all ${
              subTab === 'vps-storage' ? 'bg-white/5 text-white shadow-sm' : 'hover:text-zinc-300'
            }`}
          >
            <HardDrive size={12} />
            VPS Storage
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
          {subTab !== 'billing' && subTab !== 'vps-storage' && (
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
          {subTab !== 'billing' && subTab !== 'vps-storage' && (
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
                                <div className="flex flex-col gap-0.5 truncate">
                                  <span className="font-bold text-[10px] text-white truncate">{t.name}</span>
                                  <span className="text-[8px] font-mono text-zinc-600 truncate">{t.id}</span>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${
                                    t.planId === 'pro' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                                    t.planId === 'enterprise' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' :
                                    'bg-zinc-800 text-zinc-500'
                                  }`}>
                                    {t.planId}
                                  </span>
                                  <button
                                    onClick={() => {
                                      setOverrideTeamId(t.id);
                                      setOverridePlanId(t.planId);
                                      setOverrideStatus(t.status);
                                      setSubTab('billing');
                                    }}
                                    className="p-1 hover:bg-white/5 rounded text-zinc-500 hover:text-white"
                                    title="Override Plan"
                                  >
                                    <Sliders size={10} />
                                  </button>
                                  <button
                                    onClick={() => handleCopyText(t.id, 'Team ID')}
                                    className="p-1 hover:bg-white/5 rounded text-zinc-500 hover:text-white"
                                    title="Copy ID"
                                  >
                                    <Copy size={10} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                        
                        <div>
                          <button
                            onClick={() => handleToggleRole(u.id, u.role)}
                            disabled={actingId !== null}
                            className={`h-7 px-3 rounded-lg font-bold text-[10px] transition-all uppercase tracking-wider ${
                              u.role === 'ADMIN' 
                                ? 'bg-indigo-500/10 hover:bg-indigo-500 text-indigo-400 hover:text-white border border-indigo-500/20' 
                                : 'bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white border border-white/5'
                            }`}
                          >
                            {actingId === u.id ? <Loader2 size={10} className="animate-spin" /> : u.role}
                          </button>
                        </div>
                        
                        <div className="space-y-1 text-zinc-400 font-medium">
                          <div>💻 {u.projectsCount} App Containers</div>
                          <div>🗄️ {u.databasesCount} databases</div>
                          <div>📦 {u.bucketsCount} Storage Buckets</div>
                        </div>
                        
                        <div className="text-right">
                          <button
                            onClick={() => handleDeleteUser(u.id)}
                            disabled={actingId !== null}
                            className="h-7 px-3 rounded-lg border border-red-500/10 hover:bg-red-500/10 text-red-500 text-[10px] font-bold transition-all uppercase tracking-wider"
                          >
                            Delete User
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
              
              {/* SUB TAB: APP CONTAINERS LIST */}
              {subTab === 'projects' && (
                <div className="divide-y divide-white/5 text-left">
                  <div className="grid grid-cols-4 p-4 text-[10px] font-bold text-zinc-500 uppercase tracking-wider bg-black/40">
                    <span>Container / Owner</span>
                    <span>External URL</span>
                    <span>Status</span>
                    <span className="text-right">Actions</span>
                  </div>
                  
                  {projects
                    .filter(p => (p.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || (p.slug || '').toLowerCase().includes(searchQuery.toLowerCase()))
                    .map(p => (
                      <div key={p.id} className="grid grid-cols-4 p-4 items-center text-xs text-zinc-300 gap-4">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-bold text-white text-sm">{p.name}</span>
                          <span className="text-[10px] text-zinc-500 font-mono">Owner Team: {p.team.name}</span>
                          <span className="text-[9px] text-zinc-600 font-mono">ID: {p.id}</span>
                        </div>
                        
                        <div className="flex items-center gap-1.5 font-mono text-[10px]">
                          <a 
                            href={`https://${p.slug}.khcloud.app`} 
                            target="_blank" 
                            rel="noreferrer"
                            className="text-indigo-400 hover:underline truncate max-w-[150px] flex items-center gap-1 font-bold"
                          >
                            {p.slug}.khcloud.app
                            <ExternalLink size={8} />
                          </a>
                        </div>
                        
                        <div>
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                            p.status === 'READY' 
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                              : p.status === 'SUSPENDED'
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              : 'bg-zinc-500/10 text-zinc-500 border border-zinc-500/20 animate-pulse'
                          }`}>
                            {p.status}
                          </span>
                        </div>
                        
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleToggleProjectStatus(p.id, p.status)}
                            disabled={actingId !== null}
                            className={`h-7 px-3 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                              p.status === 'SUSPENDED'
                                ? 'bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-white border border-emerald-500/20'
                                : 'bg-amber-500/10 hover:bg-amber-500 text-amber-400 hover:text-white border border-amber-500/20'
                            }`}
                          >
                            {actingId === p.id && <Loader2 size={10} className="animate-spin" />}
                            {p.status === 'SUSPENDED' ? 'Resume' : 'Suspend'}
                          </button>
                          
                          <button
                            onClick={() => handleDeleteProject(p.id)}
                            disabled={actingId !== null}
                            className="h-7 px-3 rounded-lg border border-red-500/10 hover:bg-red-500/10 text-red-500 text-[10px] font-bold uppercase tracking-wider"
                          >
                            Force Kill
                          </button>
                        </div>
                      </div>
                    ))}
                    
                  {projects.length === 0 && (
                    <div className="p-8 text-center text-zinc-500 italic text-xs font-semibold">No containers registered.</div>
                  )}
                </div>
              )}
              
              {/* SUB TAB: OBJECT STORAGE LIST */}
              {subTab === 'buckets' && (
                <div className="divide-y divide-white/5 text-left">
                  <div className="grid grid-cols-5 p-4 text-[10px] font-bold text-zinc-500 uppercase tracking-wider bg-black/40">
                    <span>Bucket / Owner</span>
                    <span>Status</span>
                    <span>Size Used</span>
                    <span>Configured Limit</span>
                    <span className="text-right">Actions</span>
                  </div>
                  
                  {buckets
                    .filter(b => (b.name || '').toLowerCase().includes(searchQuery.toLowerCase()))
                    .map(b => (
                      <div key={b.id} className="grid grid-cols-5 p-4 items-center text-xs text-zinc-300 gap-4">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-bold text-white text-sm">{b.name}</span>
                          <span className="text-[10px] text-zinc-500 font-mono">Owner Team: {b.team.name}</span>
                          <span className="text-[9px] text-zinc-600 font-mono">ID: {b.id}</span>
                        </div>
                        
                        <div>
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            {b.status}
                          </span>
                        </div>
                        
                        <div className="font-mono text-zinc-300 font-bold">{formatBytes(b.sizeUsed)}</div>
                        
                        <div>
                          {editingLimitId === b.id ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                placeholder="GB"
                                value={newLimitGB}
                                onChange={(e) => setNewLimitGB(e.target.value)}
                                className="w-14 h-7 rounded bg-black border border-white/10 text-xs px-1.5 font-mono text-white text-center"
                              />
                              <button
                                onClick={() => handleUpdateBucketLimit(b.id)}
                                className="h-7 px-2 rounded bg-indigo-500 text-white font-bold"
                              >
                                Save
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-zinc-400">{formatBytes(b.sizeLimit)}</span>
                              <button 
                                onClick={() => { setEditingLimitId(b.id); setNewLimitGB((Number(b.sizeLimit) / (1024*1024*1024)).toString()); }}
                                className="text-[9px] font-bold text-indigo-400 hover:underline"
                              >
                                Edit
                              </button>
                            </div>
                          )}
                        </div>
                        
                        <div className="text-right">
                          <button
                            onClick={() => handleDeleteBucket(b.id)}
                            disabled={actingId !== null}
                            className="h-7 px-3 rounded-lg border border-red-500/10 hover:bg-red-500/10 text-red-500 text-[10px] font-bold uppercase tracking-wider"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                    
                  {buckets.length === 0 && (
                    <div className="p-8 text-center text-zinc-500 italic text-xs font-semibold">No buckets created.</div>
                  )}
                </div>
              )}

              {/* SUB TAB: VPS STORAGE */}
              {subTab === 'vps-storage' && storageData && (
                <div className="p-6 space-y-6 text-left">
                  <div>
                    <h3 className="text-sm font-bold text-white mb-1">VPS Storage Allocation</h3>
                    <p className="text-[10px] text-zinc-500 font-medium">Real-time disk space usage and resource breakdown on your virtual private server.</p>
                  </div>

                  {/* Metrics grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-black/30 border border-white/5 rounded-2xl p-5">
                      <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block mb-1">Total Disk Capacity</span>
                      <span className="text-xl font-black text-white">{formatBytes(storageData.disk.total)}</span>
                    </div>
                    <div className="bg-black/30 border border-white/5 rounded-2xl p-5">
                      <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block mb-1">Disk Space Used</span>
                      <div className="flex items-baseline gap-2">
                        <span className="text-xl font-black text-indigo-400">{formatBytes(storageData.disk.used)}</span>
                        <span className="text-[10px] text-zinc-500 font-bold">({storageData.disk.percentUsed}% used)</span>
                      </div>
                    </div>
                    <div className="bg-black/30 border border-white/5 rounded-2xl p-5">
                      <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block mb-1">Disk Space Left (Available)</span>
                      <span className="text-xl font-black text-emerald-400">{formatBytes(storageData.disk.free)}</span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="bg-black/40 border border-white/5 rounded-2xl p-5">
                    <div className="flex justify-between text-[10px] font-bold text-zinc-500 uppercase mb-2">
                      <span>Used Space ({storageData.disk.percentUsed}%)</span>
                      <span>Available Space ({(100 - parseFloat(storageData.disk.percentUsed)).toFixed(1)}%)</span>
                    </div>
                    <div className="w-full h-3 bg-white/5 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500"
                        style={{ width: `${storageData.disk.percentUsed}%` }}
                      />
                    </div>
                  </div>

                  {/* Breakdown table */}
                  <div className="space-y-3">
                    <div>
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider">Storage Consumers</h4>
                      <p className="text-[10px] text-zinc-500 font-medium">Breakdown of storage resources sorted by size used.</p>
                    </div>

                    <div className="border border-white/5 rounded-2xl overflow-hidden bg-black/40">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-white/5 bg-black/50 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                            <th className="p-3">Resource Name</th>
                            <th className="p-3">Type</th>
                            <th className="p-3">Organization</th>
                            <th className="p-3">Owner</th>
                            <th className="p-3 text-right">Size Used</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {storageData.breakdown.map((item: any) => (
                            <tr key={item.id} className="hover:bg-white/[0.01] transition-colors">
                              <td className="p-3 font-semibold text-white font-mono">{item.name}</td>
                              <td className="p-3">
                                <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${
                                  item.type.includes('Bucket') 
                                    ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' 
                                    : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                                }`}>
                                  {item.type}
                                </span>
                              </td>
                              <td className="p-3 text-zinc-400">{item.teamName}</td>
                              <td className="p-3">
                                <div className="flex flex-col">
                                  <span className="text-zinc-300 font-bold">{item.ownerName}</span>
                                  <span className="text-[10px] text-zinc-500 font-mono">{item.ownerEmail}</span>
                                </div>
                              </td>
                              <td className="p-3 text-right font-mono text-zinc-300 font-bold">
                                {formatBytes(item.sizeUsed)}
                              </td>
                            </tr>
                          ))}
                          {storageData.breakdown.length === 0 && (
                            <tr>
                              <td colSpan={5} className="p-8 text-center text-zinc-500 italic">
                                No buckets or databases found.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* SUB TAB: BILLING OVERRIDES */}
              {subTab === 'billing' && (
                <div className="p-6 text-left">
                  <div className="grid md:grid-cols-2 gap-8 items-start">
                    
                    {/* Left: Override Form */}
                    <div className="space-y-6">
                      <div>
                        <h4 className="font-bold text-xs text-zinc-400 uppercase tracking-wider mb-1">Set Manual Override</h4>
                        <p className="text-[10px] text-zinc-600">Directly upgrade, downgrade, or suspend any team account.</p>
                      </div>

                      <form onSubmit={handleOverrideSubscription} className="space-y-4">
                        <div>
                          <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block mb-1">Target Team ID</label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                            value={overrideTeamId}
                            onChange={(e) => setOverrideTeamId(e.target.value)}
                            className="w-full h-10 px-3 rounded-xl glass-input text-xs font-mono text-white"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block mb-1">Subscription Plan</label>
                            <select
                              value={overridePlanId}
                              onChange={(e) => setOverridePlanId(e.target.value)}
                              className="w-full h-10 px-3 rounded-xl bg-black border border-white/5 text-xs text-white"
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
                              className="w-full h-10 px-3 rounded-xl bg-black border border-white/5 text-xs text-white"
                            >
                              <option value="active">Active</option>
                              <option value="past_due">Past Due</option>
                              <option value="canceled">Canceled</option>
                              <option value="unpaid">Unpaid</option>
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
