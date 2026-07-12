'use client';

import React, { useState, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { apiRequest } from '@/lib/api';
import { 
  Users, Layers, HardDrive, CreditCard, Shield, Trash2, 
  RefreshCw, Power, Check, Loader2, Search, Sliders, Copy, ExternalLink, Pencil, Database
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

  // Storage Analyzer states
  const [analyzerLoading, setAnalyzerLoading] = useState(false);
  const [analyzerResult, setAnalyzerResult] = useState<any>(null);

  const handleRunAnalyzer = async () => {
    if (!user) return;
    setAnalyzerLoading(true);
    setAnalyzerResult(null);
    try {
      const data = await apiRequest(`/admin/system/storage-analyzer?adminUserId=${user.id}`);
      setAnalyzerResult(data);
    } catch (err: any) {
      alert(err.message || 'Failed to run disk scan.');
    } finally {
      setAnalyzerLoading(false);
    }
  };

  // Pruning states
  const [pruning, setPruning] = useState(false);
  const [pruningMode, setPruningMode] = useState<'standard' | 'deep' | null>(null);
  const [pruningResult, setPruningResult] = useState<string | null>(null);
  const [pruningResults, setPruningResults] = useState<{ label: string; reclaimed: string; success: boolean }[]>([]);

  const handlePruneStorage = async (mode: 'standard' | 'deep') => {
    if (!user) return;
    const msg = mode === 'deep'
      ? '⚠️ DEEP CLEAN will remove ALL unused Docker images (including those not used in 72h). Running containers are safe, but you may need to re-pull base images on next deploy. Continue?'
      : 'Standard clean will remove dangling images, stopped containers, and build cache. Running containers are not affected. Continue?';
    if (!confirm(msg)) return;

    setPruning(true);
    setPruningMode(mode);
    setPruningResult(null);
    setPruningResults([]);
    try {
      const data = await apiRequest(`/admin/system/prune?adminUserId=${user.id}&mode=${mode}`, {
        method: 'POST',
      });
      setPruningResult(data.output);
      setPruningResults(data.results || []);
      // Re-fetch storage data
      fetchAdminData();
    } catch (err: any) {
      alert(err.message || 'Pruning failed.');
    } finally {
      setPruning(false);
      setPruningMode(null);
    }
  };

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
    <div className="rw-page">
      {/* Header */}
      <div style={{ backgroundColor: '#111318', borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '15px', fontWeight: 600, color: '#f1f3f6', margin: 0 }}>System Admin</h1>
          <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>Infrastructure Control &amp; Overrides</div>
        </div>

        {/* Sub-tabs line design */}
        <div style={{ display: 'flex', gap: '16px' }}>
          {([['users', 'Users', Users], ['projects', 'Containers', Layers], ['buckets', 'Storage', HardDrive], ['vps-storage', 'VPS', HardDrive], ['billing', 'Plans', CreditCard]] as const).map(([id, label, Icon]) => {
            const isActive = subTab === id;
            return (
              <button
                key={id}
                onClick={() => setSubTab(id as any)}
                style={{
                  position: 'relative', display: 'flex', alignItems: 'center', gap: '6px', height: '32px', fontSize: '12px', fontWeight: isActive ? 600 : 500,
                  color: isActive ? '#c4b5fd' : '#6b7280', backgroundColor: 'transparent', border: 'none',
                  borderBottom: isActive ? '2px solid #7c3aed' : '2px solid transparent',
                  cursor: 'pointer', transition: 'all 0.12s', outline: 'none', padding: '0 4px'
                }}
              >
                <Icon size={12} />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rw-page-content" style={{ padding: '24px' }}>
        <div style={{ maxWidth: '1200px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

          {/* Quick Metrics */}
          {subTab !== 'billing' && subTab !== 'vps-storage' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
              {[
                { label: 'Total Users', value: users.length, color: '#f1f3f6' },
                { label: 'Web Containers', value: subTab === 'projects' ? projects.length : users.reduce((acc: number, u: any) => acc + (u.projectsCount || 0), 0), color: '#818cf8' },
                { label: 'Storage Buckets', value: subTab === 'buckets' ? buckets.length : users.reduce((acc: number, u: any) => acc + (u.bucketsCount || 0), 0), color: '#a78bfa' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ backgroundColor: '#111318', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '10px', padding: '14px 16px' }}>
                  <div style={{ fontSize: '10px', color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: '6px' }}>{label}</div>
                  <div style={{ fontSize: '22px', fontWeight: 700, color }}>{value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Search bar & Refresh */}
          {subTab !== 'billing' && subTab !== 'vps-storage' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={13} />
                <input
                  type="text"
                  placeholder={`Search ${subTab}...`}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ width: '100%', height: '36px', padding: '0 12px 0 32px', borderRadius: '8px', backgroundColor: '#111318', border: '1px solid rgba(255,255,255,0.07)', color: '#fff', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <button
                onClick={fetchAdminData}
                style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ba3af', cursor: 'pointer', transition: 'all 0.12s' }}
                className="hover:bg-white/5 hover:text-white"
              >
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          )}

          {/* Tab Views */}
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px', gap: '12px', color: '#6b7280' }}>
              <Loader2 className="animate-spin text-violet-400" size={24} />
              <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Loading system logs...</span>
            </div>
          ) : (
            <div style={{ backgroundColor: '#111318', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '12px', overflow: 'hidden' }}>
                          {/* SUB TAB: USERS LIST */}
              {subTab === 'users' && (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', backgroundColor: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '10px 16px', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#4b5563' }}>
                    <span>User / Email</span>
                    <span>System Role</span>
                    <span>Resources</span>
                    <span style={{ textAlign: 'right' }}>Actions</span>
                  </div>
                  
                  {users
                    .filter(u => (u.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || (u.email || '').toLowerCase().includes(searchQuery.toLowerCase()))
                    .map((u, uIdx) => (
                      <div key={u.id} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', alignItems: 'start', fontSize: '12px' }} className="hover:bg-white/[0.01]">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <span style={{ fontWeight: 600, color: '#f1f3f6' }}>{u.name}</span>
                          <span style={{ fontFamily: 'monospace', fontSize: '10px', color: '#6b7280' }}>{u.email}</span>
                          
                          {/* User Teams/Orgs */}
                          {u.teams && u.teams.length > 0 && (
                            <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              {u.teams.map((t: any) => (
                                <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#0e1015', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '6px', padding: '4px 8px' }}>
                                  <span style={{ fontSize: '10px', color: '#8a929e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100px' }}>{t.name}</span>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span style={{ fontSize: '8px', fontWeight: 600, color: '#c4b5fd', textTransform: 'uppercase' }}>{t.planId}</span>
                                    <button onClick={() => { setOverrideTeamId(t.id); setOverridePlanId(t.planId); setOverrideStatus(t.status); setSubTab('billing'); }} style={{ background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer', padding: '0' }} className="hover:text-white" title="Override Plan"><Sliders size={9} /></button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        
                        <div>
                          <button
                            onClick={() => handleToggleRole(u.id, u.role)}
                            disabled={actingId !== null}
                            style={{
                              height: '24px', padding: '0 8px', borderRadius: '4px', border: 'none', fontSize: '10px', fontWeight: 600, cursor: 'pointer',
                              backgroundColor: u.role === 'ADMIN' ? 'rgba(124,58,237,0.15)' : 'rgba(255,255,255,0.05)',
                              color: u.role === 'ADMIN' ? '#c4b5fd' : '#8a929e'
                            }}
                          >
                            {actingId === u.id ? <Loader2 size={10} className="animate-spin" /> : u.role}
                          </button>
                        </div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', justifyContent: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#8a929e', fontSize: '11px' }}>
                            <Layers size={11} style={{ color: '#818cf8', flexShrink: 0 }} />
                            <span>{u.projectsCount} <span style={{ color: '#4b5563' }}>containers</span></span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#8a929e', fontSize: '11px' }}>
                            <Database size={11} style={{ color: '#3b82f6', flexShrink: 0 }} />
                            <span>{u.databasesCount} <span style={{ color: '#4b5563' }}>databases</span></span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#8a929e', fontSize: '11px' }}>
                            <HardDrive size={11} style={{ color: '#22c55e', flexShrink: 0 }} />
                            <span>{u.bucketsCount} <span style={{ color: '#4b5563' }}>buckets</span></span>
                          </div>
                        </div>
                        
                        <div style={{ textAlign: 'right' }}>
                          <button
                            onClick={() => handleDeleteUser(u.id)}
                            disabled={actingId !== null}
                            style={{ height: '24px', padding: '0 10px', borderRadius: '4px', backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontSize: '10px', fontWeight: 600, cursor: 'pointer' }}
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
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', backgroundColor: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '10px 16px', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#4b5563' }}>
                    <span>Container / Owner</span>
                    <span>Domain URL</span>
                    <span>Status</span>
                    <span style={{ textAlign: 'right' }}>Actions</span>
                  </div>
                  
                  {projects
                    .filter(p => (p.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || (p.slug || '').toLowerCase().includes(searchQuery.toLowerCase()))
                    .map(p => (
                      <div key={p.id} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', alignItems: 'center', fontSize: '12px' }} className="hover:bg-white/[0.01]">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ fontWeight: 600, color: '#f1f3f6' }}>{p.name}</span>
                          <span style={{ fontSize: '10px', color: '#6b7280' }}>Team: {p.team.name}</span>
                        </div>
                        
                        <div style={{ fontFamily: 'monospace', fontSize: '10px' }}>
                          <a href={`https://${p.slug}.khcloud.app`} target="_blank" rel="noreferrer" style={{ color: '#c4b5fd', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }} className="hover:underline">
                            {p.slug}.khcloud.app <ExternalLink size={9} />
                          </a>
                        </div>
                        
                        <div>
                          <span style={{
                            padding: '2px 7px', borderRadius: '9999px', fontSize: '9px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em',
                            backgroundColor: p.status === 'READY' ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)',
                            color: p.status === 'READY' ? '#22c55e' : '#f59e0b',
                            border: `1px solid ${p.status === 'READY' ? 'rgba(34,197,94,0.2)' : 'rgba(245,158,11,0.2)'}`
                          }}>{p.status}</span>
                        </div>
                        
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => handleToggleProjectStatus(p.id, p.status)}
                            disabled={actingId !== null}
                            style={{ height: '24px', padding: '0 8px', borderRadius: '4px', backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#8a929e', fontSize: '10px', fontWeight: 600, cursor: 'pointer' }}
                            className="hover:text-white"
                          >
                            {p.status === 'SUSPENDED' ? 'Resume' : 'Suspend'}
                          </button>
                          <button
                            onClick={() => handleDeleteProject(p.id)}
                            disabled={actingId !== null}
                            style={{ height: '24px', padding: '0 8px', borderRadius: '4px', backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontSize: '10px', fontWeight: 600, cursor: 'pointer' }}
                          >
                            Force Stop
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
              
              {/* SUB TAB: STORAGE BUCKETS LIST */}
              {subTab === 'buckets' && (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', backgroundColor: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '10px 16px', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#4b5563' }}>
                    <span>Bucket / Owner</span>
                    <span>Properties</span>
                    <span>Size limit</span>
                    <span style={{ textAlign: 'right' }}>Actions</span>
                  </div>
                  
                  {buckets
                    .filter(b => (b.name || '').toLowerCase().includes(searchQuery.toLowerCase()))
                    .map(b => (
                      <div key={b.id} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', alignItems: 'center', fontSize: '12px' }} className="hover:bg-white/[0.01]">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ fontWeight: 600, color: '#f1f3f6' }}>{b.name}</span>
                          <span style={{ fontSize: '10px', color: '#6b7280' }}>Team: {b.team.name}</span>
                        </div>
                        
                        <div style={{ display: 'flex', gap: '6px', fontSize: '11px', color: '#8a929e' }}>
                          <span>{b.fileCount} files</span>
                          <span>·</span>
                          <span>{formatBytes(b.sizeUsed)} used</span>
                        </div>
                        
                        <div>
                          {editingLimitId === b.id ? (
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <input
                                type="number"
                                placeholder="GB"
                                value={newLimitGB}
                                onChange={e => setNewLimitGB(e.target.value)}
                                style={{ width: '50px', height: '24px', padding: '0 4px', borderRadius: '4px', backgroundColor: '#0e1015', border: '1px solid rgba(124,58,237,0.3)', color: '#fff', fontSize: '11px', outline: 'none' }}
                              />
                              <button onClick={() => handleUpdateBucketLimit(b.id)} style={{ height: '24px', padding: '0 6px', borderRadius: '4px', backgroundColor: '#7c3aed', border: 'none', color: '#fff', fontSize: '10px', cursor: 'pointer' }}>Set</button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontFamily: 'monospace' }}>{formatBytes(b.sizeLimit)}</span>
                              <button onClick={() => { setEditingLimitId(b.id); setNewLimitGB(String(parseInt(b.sizeLimit) / 1024 / 1024 / 1024)); }} style={{ background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer', padding: '0' }} className="hover:text-white"><Pencil size={10} /></button>
                            </div>
                          )}
                        </div>
                        
                        <div style={{ textAlign: 'right' }}>
                          <button
                            onClick={() => handleDeleteBucket(b.id)}
                            disabled={actingId !== null}
                            style={{ height: '24px', padding: '0 10px', borderRadius: '4px', backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontSize: '10px', fontWeight: 600, cursor: 'pointer' }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
              
              {/* SUB TAB: VPS STORAGE METRICS */}
              {subTab === 'vps-storage' && storageData && (
                <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  
                  {/* Metrics grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                    <div style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', padding: '16px' }}>
                      <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#4b5563', display: 'block', marginBottom: '4px' }}>Total VPS Disk</span>
                      <span style={{ fontSize: '18px', fontWeight: 700, color: '#f1f3f6' }}>{formatBytes(storageData.disk.total)}</span>
                    </div>
                    <div style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', padding: '16px' }}>
                      <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#4b5563', display: 'block', marginBottom: '4px' }}>Disk space Used</span>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                        <span style={{ fontSize: '18px', fontWeight: 700, color: '#a78bfa' }}>{formatBytes(storageData.disk.used)}</span>
                        <span style={{ fontSize: '10px', color: '#6b7280' }}>({storageData.disk.percentUsed}% used)</span>
                      </div>
                    </div>
                    <div style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', padding: '16px' }}>
                      <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#4b5563', display: 'block', marginBottom: '4px' }}>Free Space Available</span>
                      <span style={{ fontSize: '18px', fontWeight: 700, color: '#22c55e' }}>{formatBytes(storageData.disk.free)}</span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', padding: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', fontWeight: 600, color: '#4b5563', textTransform: 'uppercase', marginBottom: '6px' }}>
                      <span>Used Space ({storageData.disk.percentUsed}%)</span>
                      <span>Free Space ({(100 - parseFloat(storageData.disk.percentUsed)).toFixed(1)}%)</span>
                    </div>
                    <div style={{ width: '100%', height: '8px', backgroundColor: '#0e1015', borderRadius: '4px', overflow: 'hidden' }}>
                      <div 
                        style={{ height: '100%', width: `${storageData.disk.percentUsed}%`, backgroundColor: '#7c3aed', borderRadius: '4px', transition: 'all 0.5s' }}
                      />
                    </div>
                  </div>

                  {/* Breakdown table */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#4b5563' }}>Storage Consumers</div>
                    </div>

                    <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', overflow: 'hidden' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
                        <thead>
                          <tr style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            <th style={{ padding: '8px 12px', fontSize: '10px', color: '#4b5563' }}>Resource Name</th>
                            <th style={{ padding: '8px 12px', fontSize: '10px', color: '#4b5563' }}>Type</th>
                            <th style={{ padding: '8px 12px', fontSize: '10px', color: '#4b5563' }}>Organization</th>
                            <th style={{ padding: '8px 12px', fontSize: '10px', color: '#4b5563' }}>Owner</th>
                            <th style={{ padding: '8px 12px', fontSize: '10px', color: '#4b5563', textAlign: 'right' }}>Size Used</th>
                          </tr>
                        </thead>
                        <tbody>
                          {storageData.breakdown.map((item: any) => (
                            <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }} className="hover:bg-white/[0.01]">
                              <td style={{ padding: '8px 12px', fontWeight: 600, fontFamily: 'monospace', color: '#f1f3f6' }}>{item.name}</td>
                              <td style={{ padding: '8px 12px' }}>
                                <span style={{ padding: '1px 5px', borderRadius: '4px', fontSize: '9px', fontWeight: 600, backgroundColor: 'rgba(124,58,237,0.1)', color: '#c4b5fd', border: '1px solid rgba(124,58,237,0.2)' }}>{item.type}</span>
                              </td>
                              <td style={{ padding: '8px 12px', color: '#8a929e' }}>{item.teamName}</td>
                              <td style={{ padding: '8px 12px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                  <span style={{ color: '#f1f3f6' }}>{item.ownerName}</span>
                                  <span style={{ fontSize: '10px', color: '#4b5563', fontFamily: 'monospace' }}>{item.ownerEmail}</span>
                                </div>
                              </td>
                              <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace', color: '#f1f3f6', fontWeight: 600 }}>
                                {formatBytes(item.sizeUsed)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Storage Analyzer Section */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#4b5563' }}>VPS System Analyzer &amp; Cleaner</div>
                      </div>
                      
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          onClick={handleRunAnalyzer}
                          disabled={analyzerLoading || pruning}
                          style={{ height: '28px', padding: '0 12px', borderRadius: '6px', backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#9ba3af', fontSize: '11px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                          className="hover:bg-white/5 hover:text-white"
                        >
                          {analyzerLoading ? <Loader2 size={11} className="animate-spin" /> : <Search size={11} />}
                          Scan Disk
                        </button>

                        <button
                          onClick={() => handlePruneStorage('standard')}
                          disabled={pruning}
                          style={{ height: '28px', padding: '0 12px', borderRadius: '6px', backgroundColor: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b', fontSize: '11px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          {pruning && pruningMode === 'standard' ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                          Prune Cache
                        </button>

                        <button
                          onClick={() => handlePruneStorage('deep')}
                          disabled={pruning}
                          style={{ height: '28px', padding: '0 12px', borderRadius: '6px', backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontSize: '11px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          {pruning && pruningMode === 'deep' ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                          Deep Clean
                        </button>
                      </div>
                    </div>

                    {analyzerLoading && (
                      <div style={{ padding: '36px', textAlign: 'center', color: '#6b7280', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px' }}>
                        <Loader2 className="animate-spin text-violet-400" size={16} /> Scanning disk layout on VPS server...
                      </div>
                    )}

                    {pruning && (
                      <div style={{ padding: '36px', textAlign: 'center', color: '#6b7280', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px' }}>
                        <Loader2 className="animate-spin text-violet-400" size={16} /> Pruning unused Docker images and build caches...
                      </div>
                    )}

                    {pruningResults.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <span style={{ fontSize: '9px', fontWeight: 700, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cleanup Summary</span>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
                          {pruningResults.map((r, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '8px', backgroundColor: r.success ? 'rgba(34,197,94,0.04)' : 'rgba(239,68,68,0.04)', border: r.success ? '1px solid rgba(34,197,94,0.12)' : '1px solid rgba(239,68,68,0.12)', fontSize: '12px' }}>
                              <div style={{ width: '22px', height: '22px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: r.success ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: r.success ? '#22c55e' : '#ef4444', flexShrink: 0 }}>
                                {r.success ? <Check size={11} /> : <Trash2 size={11} />}
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: '11px', color: '#f1f3f6', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</div>
                                <div style={{ fontSize: '10px', color: r.success ? '#22c55e' : '#ef4444', fontFamily: 'monospace', marginTop: '1px' }}>Freed: {r.reclaimed}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {analyzerResult && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <span style={{ fontSize: '9px', fontWeight: 700, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Top directories</span>
                          <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '11px' }}>
                              <thead>
                                <tr style={{ backgroundColor: 'rgba(255,255,255,0.01)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                  <th style={{ padding: '6px 10px', color: '#4b5563' }}>Path</th>
                                  <th style={{ padding: '6px 10px', color: '#4b5563', textAlign: 'right' }}>Size</th>
                                </tr>
                              </thead>
                              <tbody>
                                {analyzerResult.topDirs.map((dir: any, i: number) => (
                                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                    <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: '#8a929e' }}>{dir.path}</td>
                                    <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: '#f1f3f6', textAlign: 'right', fontWeight: 600 }}>{dir.size}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <span style={{ fontSize: '9px', fontWeight: 700, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Docker System DF</span>
                          <pre style={{ margin: 0, padding: '12px', borderRadius: '8px', backgroundColor: '#0e1015', border: '1px solid rgba(255,255,255,0.06)', color: '#8a929e', fontFamily: 'monospace', fontSize: '10px', lineHeight: 1.5, overflowX: 'auto', maxHeight: '180px' }}>
                            {analyzerResult.dockerDf}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>

                </div>
              )}

              {/* SUB TAB: BILLING OVERRIDES */}
              {subTab === 'billing' && (
                <div style={{ padding: '20px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '24px' }}>
                    
                    {/* Left: Override Form */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#4b5563' }}>Set Manual Plan Override</div>
                      </div>

                      <form onSubmit={handleOverrideSubscription} className="space-y-4">
                        <div>
                          <label style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#4b5563', display: 'block', marginBottom: '6px' }}>Target Team ID</label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                            value={overrideTeamId}
                            onChange={(e) => setOverrideTeamId(e.target.value)}
                            style={{ width: '100%', height: '36px', padding: '0 12px', borderRadius: '7px', backgroundColor: '#0e1015', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', fontSize: '12px', fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box' }}
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#4b5563', display: 'block', marginBottom: '6px' }}>Subscription Plan</label>
                            <select
                              value={overridePlanId}
                              onChange={(e) => setOverridePlanId(e.target.value)}
                              style={{ width: '100%', height: '36px', padding: '0 12px', borderRadius: '7px', backgroundColor: '#0e1015', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', fontSize: '12px', outline: 'none', cursor: 'pointer', boxSizing: 'border-box' }}
                            >
                              <option value="hobby">Hobby (Free)</option>
                              <option value="pro">Pro ($29/mo)</option>
                              <option value="enterprise">Enterprise ($250/mo)</option>
                            </select>
                          </div>

                          <div>
                            <label style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#4b5563', display: 'block', marginBottom: '6px' }}>Billing Status</label>
                            <select
                              value={overrideStatus}
                              onChange={(e) => setOverrideStatus(e.target.value)}
                              style={{ width: '100%', height: '36px', padding: '0 12px', borderRadius: '7px', backgroundColor: '#0e1015', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', fontSize: '12px', outline: 'none', cursor: 'pointer', boxSizing: 'border-box' }}
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
                          style={{ width: '100%', height: '36px', borderRadius: '7px', backgroundColor: '#7c3aed', border: 'none', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                        >
                          <Sliders size={12} /> Apply Override
                        </button>
                      </form>
                    </div>

                    {/* Right: Quick Select Organizations Sidebar */}
                    <div style={{ borderLeft: '1px solid rgba(255,255,255,0.06)', paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#4b5563' }}>Select Organization</div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', overflowY: 'auto', maxHeight: '300px' }}>
                        {allSystemTeams.map((t: any) => {
                          const isSelected = overrideTeamId === t.id;
                          return (
                            <button
                              key={t.id}
                              onClick={() => {
                                setOverrideTeamId(t.id);
                                setOverridePlanId(t.planId);
                                setOverrideStatus(t.status);
                              }}
                              style={{
                                width: '100%', textAlign: 'left', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '4px', transition: 'all 0.12s',
                                backgroundColor: isSelected ? 'rgba(124,58,237,0.08)' : 'transparent',
                                borderColor: isSelected ? '#7c3aed' : 'rgba(255,255,255,0.06)'
                              }}
                              className={isSelected ? '' : 'hover:bg-white/5'}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                                <span style={{ fontWeight: 600, fontSize: '12px', color: '#f1f3f6' }}>{t.name}</span>
                                <span style={{ fontSize: '8px', fontWeight: 700, padding: '1px 4px', borderRadius: '3px', backgroundColor: 'rgba(255,255,255,0.05)', color: '#8a929e', textTransform: 'uppercase' }}>{t.planId}</span>
                              </div>
                              <span style={{ fontSize: '9px', fontFamily: 'monospace', color: '#4b5563', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>{t.id}</span>
                            </button>
                          );
                        })}
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
