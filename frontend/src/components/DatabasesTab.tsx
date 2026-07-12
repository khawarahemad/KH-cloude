'use client';

import React, { useState, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { apiRequest } from '@/lib/api';
import { 
  Database, Plus, RefreshCw, Key, Copy, Check, Loader2, Trash, 
  Play, Terminal, ArrowLeft, AlertCircle, FileText, LayoutGrid
} from 'lucide-react';

export default function DatabasesTab() {
  const { activeTeam } = useAppStore();
  const [databases, setDatabases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [provisionOpen, setProvisionOpen] = useState(false);
  const [dbName, setDbName] = useState('');
  const [dbType, setDbType] = useState<'POSTGRESQL' | 'REDIS' | 'MYSQL'>('POSTGRESQL');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Active database manager state
  const [activeDb, setActiveDb] = useState<any | null>(null);
  const [tables, setTables] = useState<string[]>([]);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [sqlQuery, setSqlQuery] = useState('CREATE TABLE IF NOT EXISTS users (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  name TEXT NOT NULL,\n  email TEXT UNIQUE NOT NULL,\n  created_at DATETIME DEFAULT CURRENT_TIMESTAMP\n);\n\nINSERT INTO users (name, email) VALUES (\n  \'Alex Mercer\',\n  \'alex@khcloud.app\'\n);\n\nSELECT * FROM users;');
  const [queryExecuting, setQueryExecuting] = useState(false);
  const [queryResult, setQueryResult] = useState<any | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);

  const fetchDatabases = async () => {
    if (!activeTeam) return;
    setLoading(true);
    try {
      const data = await apiRequest(`/databases?teamId=${activeTeam.id}`);
      setDatabases(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTables = async (dbId: string) => {
    if (!activeTeam) return;
    setTablesLoading(true);
    try {
      const data = await apiRequest(`/databases/${dbId}/tables?teamId=${activeTeam.id}`);
      setTables(data);
    } catch (err) {
      console.error(err);
    } finally {
      setTablesLoading(false);
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
    if (!confirm('Are you sure you want to permanently delete this database? All stored tables and data will be destroyed.')) return;
    try {
      await apiRequest(`/databases/${id}?teamId=${activeTeam.id}`, {
        method: 'DELETE',
      });
      if (activeDb?.id === id) {
        setActiveDb(null);
      }
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

  const handleExecuteQuery = async (queryText?: string) => {
    if (!activeDb || !activeTeam) return;
    const targetQuery = queryText || sqlQuery;
    if (!targetQuery.trim()) return;

    setQueryExecuting(true);
    setQueryResult(null);
    setQueryError(null);

    try {
      const data = await apiRequest(`/databases/${activeDb.id}/query`, {
        method: 'POST',
        body: JSON.stringify({
          sql: targetQuery,
          teamId: activeTeam.id,
        }),
      });
      setQueryResult(data);
      // Refresh table schema sidebar in case they created/deleted a table
      fetchTables(activeDb.id);
    } catch (err: any) {
      setQueryError(err.message || 'Database query execution failed.');
    } finally {
      setQueryExecuting(false);
    }
  };

  const handleInspectTable = (tableName: string) => {
    const inspectSql = `SELECT * FROM ${tableName} LIMIT 50;`;
    setSqlQuery(inspectSql);
    handleExecuteQuery(inspectSql);
  };

  // UI rendering branches
  if (activeDb) {
    return (
      <div className="flex-1 flex flex-col min-h-0 bg-[#030303]">
        {/* Header */}
        <div className="h-16 border-b border-white/5 px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setActiveDb(null);
                setQueryResult(null);
                setQueryError(null);
              }}
              className="p-1.5 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white transition-colors"
            >
              <ArrowLeft size={16} />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white leading-none">{activeDb.name}</h2>
                <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase bg-indigo-500/10 text-indigo-400">
                  {activeDb.type}
                </span>
              </div>
              <p className="text-[10px] text-zinc-500 font-medium mt-1">Interactive Supabase-style SQL Explorer</p>
            </div>
          </div>
        </div>

        {/* Workspace split */}
        <div className="flex-1 flex min-h-0 min-w-0">
          
          {/* Tables Sidebar */}
          <aside className="w-56 border-r border-white/5 flex flex-col min-h-0 bg-[#040406] shrink-0">
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
              <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Database Tables</span>
              <button
                onClick={() => fetchTables(activeDb.id)}
                className="p-1 hover:bg-white/5 rounded text-zinc-500 hover:text-white transition-colors"
                title="Refresh Table List"
              >
                <RefreshCw size={11} className={tablesLoading ? 'animate-spin' : ''} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {tablesLoading ? (
                <div className="flex items-center justify-center p-8 text-zinc-600 text-xs gap-2">
                  <Loader2 className="animate-spin text-zinc-500" size={12} />
                  <span>Loading tables...</span>
                </div>
              ) : tables.length === 0 ? (
                <div className="p-4 text-center text-[10px] text-zinc-600 italic">
                  No tables present. Create one in the SQL console!
                </div>
              ) : (
                tables.map(t => (
                  <button
                    key={t}
                    onClick={() => handleInspectTable(t)}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/[0.03] text-zinc-400 hover:text-white transition-all flex items-center gap-2 group text-xs font-semibold"
                  >
                    <FileText size={13} className="text-zinc-600 group-hover:text-indigo-400" />
                    <span className="truncate flex-1">{t}</span>
                  </button>
                ))
              )}
            </div>
          </aside>

          {/* Code Area & Console */}
          <main className="flex-1 flex flex-col min-h-0 min-w-0 bg-[#030303]">
            
            {/* Query Input Editor */}
            <div className="flex-1 flex flex-col min-h-0 border-b border-white/5 p-4 relative">
              <div className="flex items-center justify-between mb-2 shrink-0">
                <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                  <Terminal size={12} />
                  SQL Editor Query
                </div>
                
                <button
                  onClick={() => handleExecuteQuery()}
                  disabled={queryExecuting}
                  className="h-8 px-4 rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 transition-colors active:scale-95 duration-100"
                >
                  {queryExecuting ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Play size={12} />
                  )}
                  Run Query
                </button>
              </div>

              <textarea
                value={sqlQuery}
                onChange={(e) => setSqlQuery(e.target.value)}
                className="flex-1 w-full bg-[#050507] border border-white/5 rounded-xl p-4 font-mono text-xs text-zinc-300 outline-0 focus:border-white/10 resize-none select-text"
              />
            </div>

            {/* Query Results / Output Panel */}
            <div className="h-[280px] flex flex-col min-h-0 bg-[#040406]">
              <div className="h-10 border-b border-white/5 px-4 flex items-center justify-between shrink-0 text-[10px] font-bold text-zinc-500 uppercase tracking-wider bg-black/20">
                <span>Output Console</span>
              </div>

              <div className="flex-1 overflow-auto p-4 select-text">
                {queryExecuting && (
                  <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-2">
                    <Loader2 className="animate-spin text-indigo-400" size={20} />
                    <span className="text-[10px]">Executing query on virtual engine...</span>
                  </div>
                )}

                {queryError && (
                  <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 flex items-start gap-3">
                    <AlertCircle size={16} className="shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold mb-1">SQL Execution Failed</div>
                      <p className="font-mono">{queryError}</p>
                    </div>
                  </div>
                )}

                {queryResult && (
                  <div className="space-y-4">
                    {/* Success notification */}
                    <div className="text-[11px] font-bold text-emerald-400">
                      ✓ {queryResult.message || 'Query completed.'}
                    </div>

                    {/* Output Rows Table */}
                    {queryResult.rows && queryResult.rows.length > 0 && (
                      <div className="border border-white/5 rounded-xl overflow-hidden bg-black/40">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="border-b border-white/5 bg-black/50 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                              {queryResult.columns.map((col: string) => (
                                <th key={col} className="p-2.5 font-mono">{col}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {queryResult.rows.map((row: any, rIdx: number) => (
                              <tr key={rIdx} className="hover:bg-white/[0.01] transition-colors">
                                {queryResult.columns.map((col: string) => (
                                  <td key={col} className="p-2.5 font-mono text-[11px] text-zinc-300">
                                    {row[col] !== null ? String(row[col]) : <span className="text-zinc-600 italic">null</span>}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {!queryExecuting && !queryError && !queryResult && (
                  <div className="flex items-center justify-center h-full text-zinc-600 text-xs italic">
                    Type a query above and click "Run Query" to see output.
                  </div>
                )}
              </div>
            </div>

          </main>

        </div>
      </div>
    );
  }

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
          <div className="flex flex-col items-center justify-center border border-dashed border-white/10 rounded-2xl py-20 text-center glass-card max-w-lg mx-auto bg-white/[0.01]">
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
          <div className="grid md:grid-cols-2 gap-6 max-w-7xl mx-auto">
            {databases.map((db) => {
              const connStr = getConnectionString(db);
              return (
                <div key={db.id} className="glass-card p-6 rounded-2xl border border-white/5 flex flex-col justify-between h-64 bg-white/[0.01] relative group">
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

                  <div className="flex items-center justify-between pt-4 border-t border-white/5 mt-4">
                    {db.status === 'RUNNING' ? (
                      <button
                        onClick={() => {
                          setActiveDb(db);
                          fetchTables(db.id);
                        }}
                        className="h-8 px-3 rounded-lg bg-indigo-500/10 hover:bg-indigo-500 text-indigo-400 hover:text-white text-[10px] font-black tracking-wide flex items-center gap-1.5 transition-all"
                      >
                        <LayoutGrid size={11} />
                        SQL Console
                      </button>
                    ) : <div />}

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
                  onChange={(e) => setDbName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
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
