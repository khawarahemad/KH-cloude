'use client';

import React, { useState, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { apiRequest } from '@/lib/api';
import { Database, Plus, RefreshCw, Key, Copy, Check, Loader2, Trash } from 'lucide-react';

export default function DatabasesTab() {
  const { activeTeam } = useAppStore();
  const [databases, setDatabases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [provisionOpen, setProvisionOpen] = useState(false);
  const [dbName, setDbName] = useState('');
  const [dbType, setDbType] = useState<'POSTGRESQL' | 'REDIS' | 'MYSQL'>('POSTGRESQL');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchDatabases = async () => {
    if (!activeTeam) return;
    setLoading(true);
    try {
      const data = await apiRequest(`/databases?teamId=${activeTeam.id}`);
      setDatabases(data);
    } catch (err) {
      setDatabases([
        { id: 'db-1', name: 'main-postgres', type: 'POSTGRESQL', host: 'main-postgres-postgresql.db.khcloud.app', port: 5432, dbName: 'main-postgres_db', username: 'khclouduser', password: 'password123', status: 'RUNNING' }
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDatabases();
  }, [activeTeam]);

  // Poll database status if they are creating
  useEffect(() => {
    if (databases.some(d => d.status === 'CREATING')) {
      const interval = setInterval(() => {
        fetchDatabases();
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [databases]);

  const handleCreateDatabase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dbName.trim() || !activeTeam) return;

    try {
      await apiRequest('/databases', {
        method: 'POST',
        body: JSON.stringify({
          name: dbName,
          type: dbType,
          teamId: activeTeam.id,
        }),
      });
      setDbName('');
      setProvisionOpen(false);
      fetchDatabases();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteDatabase = async (id: string) => {
    if (!activeTeam) return;
    if (!confirm('Are you sure you want to permanently delete this database? This action cannot be undone.')) return;
    try {
      await apiRequest(`/databases/${id}?teamId=${activeTeam.id}`, {
        method: 'DELETE',
      });
      fetchDatabases();
    } catch (err) {
      console.error(err);
    }
  };

  const handleCopy = (str: string, id: string) => {
    navigator.clipboard.writeText(str);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getConnectionString = (db: any) => {
    if (db.type === 'POSTGRESQL') {
      return `postgresql://${db.username}:${db.password}@${db.host}:${db.port}/${db.dbName}`;
    } else if (db.type === 'REDIS') {
      return `redis://default:${db.password}@${db.host}:${db.port}`;
    } else {
      return `mysql://${db.username}:${db.password}@${db.host}:${db.port}/${db.dbName}`;
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#030303]">
      {/* Header */}
      <div className="h-16 border-b border-white/5 px-6 flex items-center justify-between shrink-0">
        <h2 className="text-sm font-bold tracking-tight">Database Provisioning</h2>
        <button
          onClick={() => setProvisionOpen(true)}
          className="h-9 px-3.5 rounded-lg bg-white hover:bg-zinc-200 text-black font-semibold text-xs transition-colors flex items-center gap-1.5 active:scale-95 duration-100"
        >
          <Plus size={14} />
          Create Database
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-500 gap-3">
            <Loader2 className="animate-spin text-indigo-400" size={32} />
            <span className="text-xs">Connecting to database service...</span>
          </div>
        ) : databases.length === 0 ? (
          <div className="flex flex-col items-center justify-center border border-dashed border-white/10 rounded-2xl py-20 text-center glass-card max-w-lg mx-auto">
            <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-zinc-500 mb-4">
              <Database size={20} />
            </div>
            <h3 className="font-bold text-sm mb-1">No Databases active</h3>
            <p className="text-xs text-zinc-400 max-w-xs mb-6">Create PostgreSQL, MySQL, or Redis databases connected directly to your application containers.</p>
            <button
              onClick={() => setProvisionOpen(true)}
              className="h-9 px-4 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white font-semibold text-xs transition-colors active:scale-95"
            >
              Provision first database
            </button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-6 max-w-6xl mx-auto">
            {databases.map((db) => {
              const connStr = getConnectionString(db);
              return (
                <div key={db.id} className="glass-card p-6 rounded-2xl border border-white/5 flex flex-col justify-between h-56 relative group">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                          <Database size={16} />
                        </div>
                        <div>
                          <span className="text-xs font-bold text-white block">{db.name}</span>
                          <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider">{db.type}</span>
                        </div>
                      </div>

                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                        db.status === 'RUNNING'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : db.status === 'CREATING'
                          ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 animate-pulse'
                          : 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20'
                      }`}>
                        {db.status}
                      </span>
                    </div>

                    {/* Connection Strings */}
                    {db.status === 'RUNNING' && (
                      <div className="space-y-3 mt-4">
                        <div>
                          <label className="text-[9px] text-zinc-500 font-bold tracking-wider uppercase block mb-1">Connection URI</label>
                          <div className="flex items-center gap-2 bg-[#050507] border border-white/5 rounded-lg px-3 py-1.5 text-[10px] font-mono text-zinc-300">
                            <span className="truncate flex-1 select-all">{connStr}</span>
                            <button
                              onClick={() => handleCopy(connStr, db.id + '-uri')}
                              className="text-zinc-500 hover:text-white shrink-0"
                            >
                              {copiedId === db.id + '-uri' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-[9px] text-zinc-500 font-bold tracking-wider uppercase block mb-1">Host</label>
                            <span className="text-[10px] font-mono text-zinc-300 block truncate">{db.host}</span>
                          </div>
                          <div>
                            <label className="text-[9px] text-zinc-500 font-bold tracking-wider uppercase block mb-1">Password</label>
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] font-mono text-zinc-300 truncate">••••••••</span>
                              <button
                                onClick={() => handleCopy(db.password, db.id + '-pw')}
                                className="text-zinc-500 hover:text-white"
                              >
                                {copiedId === db.id + '-pw' ? <Check size={10} className="text-emerald-400" /> : <Key size={10} />}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end pt-4 border-t border-white/5">
                    <button
                      onClick={() => handleDeleteDatabase(db.id)}
                      className="h-8 px-2.5 rounded-lg border border-red-500/10 hover:bg-red-500/10 text-red-500 hover:text-red-400 text-[10px] font-bold flex items-center gap-1.5 transition-colors"
                    >
                      <Trash size={12} />
                      Delete Database
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Provision Modal */}
      {provisionOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="glass p-6 rounded-2xl max-w-sm w-full border border-white/10 shadow-2xl">
            <h3 className="text-base font-bold mb-1">Provision Managed Database</h3>
            <p className="text-xs text-zinc-400 mb-4">Launch high-performance dedicated database instances.</p>

            <form onSubmit={handleCreateDatabase} className="space-y-4">
              <div>
                <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block mb-1">Database Name</label>
                <input
                  type="text"
                  required
                  value={dbName}
                  onChange={(e) => setDbName(e.target.value)}
                  placeholder="e.g. production-db"
                  className="w-full h-10 px-3 rounded-xl glass-input text-sm text-white"
                />
              </div>

              <div>
                <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block mb-1">Database Engine</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['POSTGRESQL', 'REDIS', 'MYSQL'] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setDbType(type)}
                      className={`h-12 rounded-xl border text-[10px] font-bold flex flex-col items-center justify-center gap-1 transition-all ${
                        dbType === type
                          ? 'border-indigo-500 bg-indigo-500/5 text-indigo-400'
                          : 'border-white/5 bg-white/[0.01] text-zinc-400 hover:text-white hover:border-white/10'
                      }`}
                    >
                      <span>{type === 'POSTGRESQL' ? 'PostgreSQL' : type === 'REDIS' ? 'Redis' : 'MySQL'}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setProvisionOpen(false)}
                  className="h-9 px-4 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="h-9 px-4 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white font-semibold text-xs active:scale-95"
                >
                  Provision Instance
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
