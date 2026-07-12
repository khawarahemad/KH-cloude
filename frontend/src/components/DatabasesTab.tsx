'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { apiRequest } from '@/lib/api';
import { 
  Database, Plus, RefreshCw, Key, Copy, Check, Loader2, Trash, 
  Play, Terminal, ArrowLeft, AlertCircle, FileText, LayoutGrid,
  Table, Pencil, Save, X, ChevronLeft, ChevronRight, Search
} from 'lucide-react';

type DbView = 'sql' | 'table-editor' | 'guide';

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
  const [dbView, setDbView] = useState<DbView>('table-editor');
  const [tables, setTables] = useState<string[]>([]);
  const [tablesLoading, setTablesLoading] = useState(false);

  // SQL Console
  const [sqlQuery, setSqlQuery] = useState('-- Welcome to the KH Cloud SQL Console\n-- Write your SQL below and press Run Query\n\nCREATE TABLE IF NOT EXISTS users (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  name TEXT NOT NULL,\n  email TEXT UNIQUE NOT NULL,\n  created_at DATETIME DEFAULT CURRENT_TIMESTAMP\n);\n\nINSERT INTO users (name, email) VALUES (\'Alex Mercer\', \'alex@khcloud.app\');\n\nSELECT * FROM users;');
  const [queryExecuting, setQueryExecuting] = useState(false);
  const [queryResult, setQueryResult] = useState<any | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);

  // Table Editor
  const [activeTable, setActiveTable] = useState<string | null>(null);
  const [tableSchema, setTableSchema] = useState<{ columns: any[]; primaryKey: string } | null>(null);
  const [tableRows, setTableRows] = useState<any[]>([]);
  const [tableColumns, setTableColumns] = useState<string[]>([]);
  const [tableTotal, setTableTotal] = useState(0);
  const [tablePage, setTablePage] = useState(1);
  const [tablePageSize] = useState(50);
  const [tableLoading, setTableLoading] = useState(false);
  const [editingRowKey, setEditingRowKey] = useState<any | null>(null);
  const [editingRowData, setEditingRowData] = useState<Record<string, any>>({});
  const [addingRow, setAddingRow] = useState(false);
  const [newRowData, setNewRowData] = useState<Record<string, any>>({});
  const [tableFilter, setTableFilter] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<any | null>(null);

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

  // ---- Table Editor Methods ----

  const loadTableData = useCallback(async (tableName: string, page = 1, filter = '') => {
    if (!activeDb || !activeTeam) return;
    setTableLoading(true);
    try {
      const [schemaData, rowsData] = await Promise.all([
        apiRequest(`/databases/${activeDb.id}/schema/${tableName}?teamId=${activeTeam.id}`),
        apiRequest(`/databases/${activeDb.id}/rows/${tableName}?teamId=${activeTeam.id}&page=${page}&pageSize=${tablePageSize}${filter ? `&filter=${encodeURIComponent(filter)}` : ''}`),
      ]);
      setTableSchema(schemaData);
      setTableRows(rowsData.rows);
      setTableColumns(rowsData.columns);
      setTableTotal(rowsData.total);
      setTablePage(rowsData.page);
    } catch (err) {
      console.error(err);
    } finally {
      setTableLoading(false);
    }
  }, [activeDb, activeTeam, tablePageSize]);

  const handleSelectTable = async (tableName: string) => {
    setActiveTable(tableName);
    setEditingRowKey(null);
    setAddingRow(false);
    setTableFilter('');
    await loadTableData(tableName);
  };

  const handleSaveRow = async () => {
    if (!activeDb || !activeTeam || !activeTable || !tableSchema) return;
    setSaving(true);
    try {
      if (editingRowKey !== null) {
        await apiRequest(`/databases/${activeDb.id}/rows/${activeTable}/${tableSchema.primaryKey}`, {
          method: 'PUT',
          body: JSON.stringify({
            teamId: activeTeam.id,
            pkValue: editingRowKey,
            data: editingRowData,
          }),
        });
      }
      setEditingRowKey(null);
      setEditingRowData({});
      await loadTableData(activeTable, tablePage, tableFilter);
    } catch (err: any) {
      alert(err.message || 'Failed to save row.');
    } finally {
      setSaving(false);
    }
  };

  const handleInsertRow = async () => {
    if (!activeDb || !activeTeam || !activeTable) return;
    setSaving(true);
    try {
      await apiRequest(`/databases/${activeDb.id}/rows/${activeTable}`, {
        method: 'POST',
        body: JSON.stringify({
          teamId: activeTeam.id,
          data: newRowData,
        }),
      });
      setAddingRow(false);
      setNewRowData({});
      await loadTableData(activeTable, tablePage, tableFilter);
    } catch (err: any) {
      alert(err.message || 'Failed to insert row.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRow = async (pkValue: any) => {
    if (!activeDb || !activeTeam || !activeTable || !tableSchema) return;
    try {
      await apiRequest(
        `/databases/${activeDb.id}/rows/${activeTable}/${tableSchema.primaryKey}?teamId=${activeTeam.id}&pkValue=${pkValue}`,
        { method: 'DELETE' }
      );
      setDeleteConfirm(null);
      await loadTableData(activeTable, tablePage, tableFilter);
    } catch (err: any) {
      alert(err.message || 'Failed to delete row.');
    }
  };

  // ---- Database Actions ----

  const handleCreateDatabase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dbName.trim() || !activeTeam) return;
    try {
      await apiRequest('/databases', {
        method: 'POST',
        body: JSON.stringify({ name: dbName, type: dbType, teamId: activeTeam.id }),
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
    if (!confirm('Permanently delete this database? All tables and data will be destroyed.')) return;
    try {
      await apiRequest(`/databases/${id}?teamId=${activeTeam.id}`, { method: 'DELETE' });
      if (activeDb?.id === id) setActiveDb(null);
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
    if (db.type === 'POSTGRESQL') return `postgresql://${db.username}:${db.password}@${db.host}:${db.port}/${db.dbName}`;
    if (db.type === 'REDIS') return `redis://default:${db.password}@${db.host}:${db.port}`;
    return `mysql://${db.username}:${db.password}@${db.host}:${db.port}/${db.dbName}`;
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
        body: JSON.stringify({ sql: targetQuery, teamId: activeTeam.id }),
      });
      setQueryResult(data);
      fetchTables(activeDb.id);
    } catch (err: any) {
      setQueryError(err.message || 'Database query execution failed.');
    } finally {
      setQueryExecuting(false);
    }
  };

  // ---- Render: Active DB Workspace ----

  if (activeDb) {
    return (
      <div className="flex-1 flex flex-col min-h-0 bg-transparent">
        {/* Header */}
        <div className="app-panel-strong mx-4 mt-4 rounded-[1.75rem] px-5 py-4 shrink-0">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setActiveDb(null); setActiveTable(null); }}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
            >
              <ArrowLeft size={15} />
            </button>
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-cyan-400/10 text-cyan-200">
                <Database size={12} />
              </div>
              <div>
                <div className="app-muted-label mb-1">Database workspace</div>
                <h2 className="text-lg font-semibold text-white">{activeDb.name}</h2>
              </div>
              <span className="text-[9px] font-black uppercase bg-cyan-400/10 text-cyan-200 px-2 py-1 rounded-full">{activeDb.type}</span>
            </div>
          </div>

          {/* Sub-view toggle */}
          <div className="flex rounded-full border border-white/10 bg-white/5 p-1">
            <button
              onClick={() => setDbView('table-editor')}
              className={`flex items-center gap-1.5 rounded-full px-3 py-2 text-[10px] font-bold transition-all ${
                dbView === 'table-editor' ? 'bg-cyan-400/10 text-cyan-100 ring-1 ring-cyan-400/20' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Table size={11} />
              Table Editor
            </button>
            <button
              onClick={() => setDbView('sql')}
              className={`flex items-center gap-1.5 rounded-full px-3 py-2 text-[10px] font-bold transition-all ${
                dbView === 'sql' ? 'bg-cyan-400/10 text-cyan-100 ring-1 ring-cyan-400/20' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Terminal size={11} />
              SQL Console
            </button>
            <button
              onClick={() => setDbView('guide')}
              className={`flex items-center gap-1.5 rounded-full px-3 py-2 text-[10px] font-bold transition-all ${
                dbView === 'guide' ? 'bg-cyan-400/10 text-cyan-100 ring-1 ring-cyan-400/20' : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileText size={11} />
              Connection Guide
            </button>
          </div>
          </div>
        </div>

        {/* Workspace split */}
        <div className="flex-1 flex min-h-0 min-w-0 p-4 pt-0">

          {/* Tables Sidebar */}
          <aside className="glass-card w-56 flex flex-col min-h-0 rounded-[1.5rem] shrink-0 overflow-hidden">
            <div className="p-3 border-b border-white/10 flex items-center justify-between">
              <span className="app-muted-label">Tables</span>
              <button
                onClick={() => fetchTables(activeDb.id)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-400 transition-colors hover:text-white"
              >
                <RefreshCw size={10} className={tablesLoading ? 'animate-spin' : ''} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
              {tablesLoading ? (
                <div className="flex items-center justify-center p-6 text-slate-500 text-[10px] gap-1.5">
                  <Loader2 className="animate-spin" size={11} />Loading
                </div>
              ) : tables.length === 0 ? (
                <div className="p-3 text-center text-[10px] text-slate-500 italic leading-relaxed">
                  No tables yet.<br />Use SQL Console to create one.
                </div>
              ) : (
                tables.map(t => (
                  <button
                    key={t}
                    onClick={() => { setDbView('table-editor'); handleSelectTable(t); }}
                    className={`w-full text-left px-3 py-2.5 rounded-xl transition-all flex items-center gap-2 group text-[11px] font-semibold ${
                      activeTable === t && dbView === 'table-editor'
                        ? 'bg-cyan-400/10 text-cyan-100 ring-1 ring-cyan-400/20'
                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <FileText size={11} className={activeTable === t ? 'text-cyan-200' : 'text-slate-600 group-hover:text-cyan-200'} />
                    <span className="truncate flex-1">{t}</span>
                  </button>
                ))
              )}
            </div>
          </aside>

          {/* Main Content Area */}
          <main className="flex-1 flex flex-col min-h-0 min-w-0">

            {/* ===== TABLE EDITOR VIEW ===== */}
            {dbView === 'table-editor' && (
              <div className="flex-1 flex flex-col min-h-0">
                {!activeTable ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center text-slate-500 gap-4 px-6">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 border border-white/10 text-slate-600">
                      <Table size={22} />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-300 mb-1">Select a table</div>
                      <p className="text-xs text-slate-500 max-w-xs">
                        Click a table in the sidebar to open the Table Editor, or switch to SQL Console to create new tables.
                      </p>
                    </div>
                    <button
                      onClick={() => setDbView('sql')}
                      className="app-button-secondary h-10 px-4 text-xs"
                    >
                      <Terminal size={11} />
                      Open SQL Console
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Table toolbar */}
                    <div className="flex items-center justify-between shrink-0 border-b border-white/10 bg-slate-950/40 px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-white">{activeTable}</span>
                        {tableSchema && (
                          <span className="text-[8px] text-slate-500 font-mono">pk: {tableSchema.primaryKey}</span>
                        )}
                        {tableTotal > 0 && (
                          <span className="text-[9px] text-slate-500 bg-white/5 px-1.5 py-0.5 rounded-full">{tableTotal} rows</span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-600" />
                          <input
                            value={tableFilter}
                            onChange={(e) => setTableFilter(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && loadTableData(activeTable!, tablePage, tableFilter)}
                            placeholder="Filter (SQL WHERE)"
                            className="glass-input h-8 w-44 rounded-full pl-6 pr-2 text-[10px] font-mono text-white"
                          />
                        </div>
                        <button
                          onClick={() => loadTableData(activeTable!, tablePage, tableFilter)}
                          className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-400 transition-colors hover:text-white"
                        >
                          <RefreshCw size={11} className={tableLoading ? 'animate-spin' : ''} />
                        </button>
                        <button
                          onClick={() => { setAddingRow(true); setNewRowData({}); }}
                          className="app-button-primary h-8 px-3 text-[10px]"
                        >
                          <Plus size={10} />
                          Insert Row
                        </button>
                      </div>
                    </div>

                    {/* Table grid */}
                    <div className="flex-1 overflow-auto relative">
                      {tableLoading ? (
                        <div className="flex items-center justify-center h-full text-slate-500 gap-2">
                          <Loader2 className="animate-spin text-cyan-300" size={20} />
                          <span className="text-xs">Loading rows...</span>
                        </div>
                      ) : tableColumns.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-2">
                          <Database size={20} />
                          <span className="text-xs">No rows in this table yet. Click "Insert Row" to add one.</span>
                        </div>
                      ) : (
                        <table className="w-full text-left border-collapse text-[11px]">
                          <thead className="sticky top-0 z-10">
                            <tr className="bg-[#060608] border-b border-white/5">
                              {/* Action column */}
                              <th className="w-16 px-2 py-2 text-[9px] font-bold text-zinc-600 uppercase tracking-wider border-r border-white/5 bg-[#060608]">
                                Actions
                              </th>
                              {tableColumns.map(col => (
                                <th key={col} className="px-3 py-2 font-mono text-[10px] font-bold text-zinc-400 whitespace-nowrap border-r border-white/[0.03] min-w-28">
                                  <div className="flex items-center gap-1">
                                    {tableSchema?.columns.find(c => c.name === col)?.pk && (
                                      <span className="text-yellow-500 text-[8px]">🔑</span>
                                    )}
                                    {col}
                                    <span className="text-zinc-700 text-[8px] font-normal ml-0.5">
                                      {tableSchema?.columns.find(c => c.name === col)?.type}
                                    </span>
                                  </div>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/[0.03]">
                            {/* New row insertion */}
                            {addingRow && (
                              <tr className="bg-emerald-500/5 border border-emerald-500/20">
                                <td className="px-2 py-1.5 border-r border-white/5">
                                  <div className="flex gap-1">
                                    <button
                                      onClick={handleInsertRow}
                                      disabled={saving}
                                      className="p-1 text-emerald-400 hover:text-white bg-emerald-500/20 rounded transition-colors"
                                      title="Confirm Insert"
                                    >
                                      {saving ? <Loader2 size={10} className="animate-spin" /> : <Save size={10} />}
                                    </button>
                                    <button
                                      onClick={() => setAddingRow(false)}
                                      className="p-1 text-zinc-500 hover:text-white bg-white/5 rounded transition-colors"
                                    >
                                      <X size={10} />
                                    </button>
                                  </div>
                                </td>
                                {tableColumns.map(col => {
                                  const colDef = tableSchema?.columns.find(c => c.name === col);
                                  const isPk = colDef?.pk;
                                  return (
                                    <td key={col} className="px-1 py-1 border-r border-white/[0.03]">
                                      {isPk ? (
                                        <span className="text-zinc-600 text-[10px] font-mono px-2 italic">auto</span>
                                      ) : (
                                        <input
                                          value={newRowData[col] ?? ''}
                                          onChange={(e) => setNewRowData(p => ({ ...p, [col]: e.target.value }))}
                                          placeholder={colDef?.dflt_value ?? '...'}
                                          className="w-full min-w-20 h-6 px-2 bg-black/30 border border-emerald-500/30 rounded text-[10px] font-mono text-zinc-200 outline-0 focus:border-emerald-400"
                                        />
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            )}

                            {/* Existing rows */}
                            {tableRows.map((row, rIdx) => {
                              const pkVal = tableSchema ? row[tableSchema.primaryKey] : null;
                              const isEditing = editingRowKey !== null && editingRowKey === pkVal;
                              return (
                                <tr
                                  key={rIdx}
                                  className={`transition-colors group ${isEditing ? 'bg-indigo-500/5 border border-indigo-500/20' : 'hover:bg-white/[0.01]'}`}
                                >
                                  <td className="px-2 py-1.5 border-r border-white/5 shrink-0">
                                    {isEditing ? (
                                      <div className="flex gap-1">
                                        <button
                                          onClick={handleSaveRow}
                                          disabled={saving}
                                          className="p-1 text-indigo-400 hover:text-white bg-indigo-500/20 rounded"
                                          title="Save"
                                        >
                                          {saving ? <Loader2 size={10} className="animate-spin" /> : <Save size={10} />}
                                        </button>
                                        <button
                                          onClick={() => { setEditingRowKey(null); setEditingRowData({}); }}
                                          className="p-1 text-zinc-500 hover:text-white bg-white/5 rounded"
                                        >
                                          <X size={10} />
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                          onClick={() => {
                                            setEditingRowKey(pkVal);
                                            setEditingRowData({ ...row });
                                          }}
                                          className="p-1 text-zinc-500 hover:text-indigo-400 bg-white/5 hover:bg-indigo-500/10 rounded"
                                          title="Edit"
                                        >
                                          <Pencil size={10} />
                                        </button>
                                        <button
                                          onClick={() => setDeleteConfirm(pkVal)}
                                          className="p-1 text-zinc-500 hover:text-red-400 bg-white/5 hover:bg-red-500/10 rounded"
                                          title="Delete"
                                        >
                                          <Trash size={10} />
                                        </button>
                                      </div>
                                    )}
                                  </td>
                                  {tableColumns.map(col => (
                                    <td key={col} className="px-1 py-1 border-r border-white/[0.03] max-w-xs">
                                      {isEditing ? (
                                        <input
                                          value={editingRowData[col] ?? ''}
                                          onChange={(e) => setEditingRowData(p => ({ ...p, [col]: e.target.value }))}
                                          className="w-full min-w-20 h-6 px-2 bg-black/30 border border-indigo-500/30 rounded text-[10px] font-mono text-zinc-200 outline-0 focus:border-indigo-400"
                                        />
                                      ) : (
                                        <span className={`px-2 font-mono text-[10px] block truncate ${
                                          row[col] === null ? 'text-zinc-600 italic' : 'text-zinc-300'
                                        }`}>
                                          {row[col] !== null ? String(row[col]) : 'null'}
                                        </span>
                                      )}
                                    </td>
                                  ))}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>

                    {/* Pagination */}
                    {tableTotal > tablePageSize && (
                      <div className="h-9 border-t border-white/5 px-4 flex items-center justify-between bg-[#040406] shrink-0">
                        <span className="text-[9px] text-zinc-600 font-mono">
                          Showing {(tablePage - 1) * tablePageSize + 1}–{Math.min(tablePage * tablePageSize, tableTotal)} of {tableTotal}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            disabled={tablePage <= 1}
                            onClick={() => loadTableData(activeTable!, tablePage - 1, tableFilter)}
                            className="p-1 rounded hover:bg-white/5 text-zinc-500 hover:text-white disabled:opacity-30"
                          >
                            <ChevronLeft size={12} />
                          </button>
                          <span className="text-[9px] text-zinc-500 px-1">Page {tablePage}</span>
                          <button
                            disabled={tablePage * tablePageSize >= tableTotal}
                            onClick={() => loadTableData(activeTable!, tablePage + 1, tableFilter)}
                            className="p-1 rounded hover:bg-white/5 text-zinc-500 hover:text-white disabled:opacity-30"
                          >
                            <ChevronRight size={12} />
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ===== SQL CONSOLE VIEW ===== */}
            {dbView === 'sql' && (
              <div className="flex-1 flex flex-col min-h-0">
                {/* Query Editor */}
                <div className="flex-1 flex flex-col min-h-0 border-b border-white/5 p-4 relative">
                  <div className="flex items-center justify-between mb-2 shrink-0">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                      <Terminal size={12} />
                      SQL Editor
                    </div>
                    <button
                      onClick={() => handleExecuteQuery()}
                      disabled={queryExecuting}
                      className="h-8 px-4 rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 transition-colors active:scale-95 duration-100"
                    >
                      {queryExecuting ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                      Run Query
                    </button>
                  </div>
                  <textarea
                    value={sqlQuery}
                    onChange={(e) => setSqlQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        handleExecuteQuery();
                      }
                    }}
                    className="flex-1 w-full bg-[#050507] border border-white/5 rounded-xl p-4 font-mono text-xs text-zinc-300 outline-0 focus:border-white/10 resize-none select-text"
                    placeholder="Write SQL here... (Ctrl+Enter to run)"
                  />
                </div>

                {/* Output Panel */}
                <div className="h-[280px] flex flex-col min-h-0 bg-[#040406]">
                  <div className="h-9 border-b border-white/5 px-4 flex items-center text-[10px] font-bold text-zinc-600 uppercase tracking-wider bg-black/20 shrink-0">
                    Output Console
                  </div>
                  <div className="flex-1 overflow-auto p-4 select-text">
                    {queryExecuting && (
                      <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-2">
                        <Loader2 className="animate-spin text-indigo-400" size={20} />
                        <span className="text-[10px]">Executing query...</span>
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
                        <div className="text-[11px] font-bold text-emerald-400">✓ {queryResult.message || 'Query completed.'}</div>
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
                      <div className="flex items-center justify-center h-full text-zinc-700 text-xs italic">
                        Write SQL and press Ctrl+Enter or click "Run Query" to execute.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ===== CONNECTION GUIDE VIEW ===== */}
            {dbView === 'guide' && (
              <div className="flex-1 overflow-y-auto p-6 space-y-6 text-zinc-300 select-text text-left">
                <div>
                  <h3 className="text-sm font-bold text-white mb-1.5">Database Connection & Query Guide</h3>
                  <p className="text-xs text-zinc-500">
                    Each SQLite database is sandboxed under your workspace tenant. You can query your database instances in real-time inside your edge functions or query them externally from your client apps using HTTP/REST API endpoints securely with your workspace API Keys.
                  </p>
                </div>

                <div className="grid md:grid-cols-2 gap-6 items-start">
                  
                  {/* A. Query inside Edge Functions */}
                  <div className="space-y-3">
                    <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block">Option 1: Query inside Edge Functions</span>
                    <div className="bg-[#050507] border border-indigo-500/10 rounded-2xl p-5 space-y-3">
                      <p className="text-xs text-zinc-400">
                        Edge functions receive a pre-authorized <code className="bg-white/5 px-1 rounded text-white font-mono">db</code> client. No credentials required:
                      </p>
                      <pre className="bg-black/40 border border-white/5 rounded-xl p-3 font-mono text-[10px] text-indigo-300 whitespace-pre-wrap leading-relaxed">
{`export default async function handler({ db }) {
  // Query primary team database
  const res = await db.query(
    "SELECT * FROM storage_buckets"
  );
  
  // Or query this specific database
  const conn = db.connect("${activeDb?.id}");
  const rows = await conn.query(
    "SELECT * FROM storage_objects LIMIT 5"
  );
  
  return { status: 200, body: rows };
}`}
                      </pre>
                    </div>
                  </div>

                  {/* B. cURL External API Request */}
                  <div className="space-y-3">
                    <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block">Option 2: Query via cURL (HTTP API)</span>
                    <div className="bg-[#050507] border border-orange-500/10 rounded-2xl p-5 space-y-3">
                      <p className="text-xs text-zinc-400">
                        Query your database externally from your terminal using standard HTTP POST requests. Provide your team's API keys:
                      </p>
                      <pre className="bg-black/40 border border-white/5 rounded-xl p-3 font-mono text-[9px] text-orange-300 whitespace-pre-wrap leading-relaxed">
{`curl -X POST \\
  -H "Authorization: Bearer YOUR_SERVICE_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"sql": "SELECT * FROM storage_buckets"}' \\
  https://api.khawarahemad.com/api/databases/${activeDb?.id}/query`}
                      </pre>
                    </div>
                  </div>

                  {/* C. Node.js Integration */}
                  <div className="space-y-3">
                    <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block">Option 3: External Node.js (fetch)</span>
                    <div className="bg-[#050507] border border-white/5 rounded-2xl p-5 space-y-3">
                      <p className="text-xs text-zinc-400">
                        Query the database programmatically inside a Node.js / Next.js backend app:
                      </p>
                      <pre className="bg-black/40 border border-white/5 rounded-xl p-3 font-mono text-[10px] text-zinc-300 whitespace-pre-wrap leading-relaxed">
{`const runQuery = async () => {
  const res = await fetch(
    "https://api.khawarahemad.com/api/databases/${activeDb?.id}/query",
    {
      method: "POST",
      headers: {
        "Authorization": "Bearer YOUR_SERVICE_KEY",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        sql: "SELECT * FROM storage_buckets"
      })
    }
  );
  const data = await res.json();
  console.log("Query Result:", data);
};`}
                      </pre>
                    </div>
                  </div>

                  {/* D. Python Integration */}
                  <div className="space-y-3">
                    <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block">Option 4: External Python (requests)</span>
                    <div className="bg-[#050507] border border-white/5 rounded-2xl p-5 space-y-3">
                      <p className="text-xs text-zinc-400">
                        Fetch rows from your Python backends, data scripts, or machine learning pipelines:
                      </p>
                      <pre className="bg-black/40 border border-white/5 rounded-xl p-3 font-mono text-[10px] text-zinc-300 whitespace-pre-wrap leading-relaxed">
{`import requests

url = "https://api.khawarahemad.com/api/databases/${activeDb?.id}/query"
headers = {
    "Authorization": "Bearer YOUR_SERVICE_KEY",
    "Content-Type": "application/json"
}
payload = {
    "sql": "SELECT * FROM storage_buckets"
}

response = requests.post(url, headers=headers, json=payload)
data = response.json()
print("Query Data:", data)`}
                      </pre>
                    </div>
                  </div>

                </div>
              </div>
            )}

          </main>
        </div>

        {/* Delete Confirm Dialog */}
        {deleteConfirm !== null && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <div className="bg-[#0d0d0e] border border-red-500/20 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
              <div className="text-sm font-bold text-white mb-2">Delete Row?</div>
              <p className="text-xs text-zinc-400 mb-5">
                Permanently delete the row with <span className="font-mono text-zinc-300">{tableSchema?.primaryKey} = {deleteConfirm}</span>? This cannot be undone.
              </p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setDeleteConfirm(null)} className="h-8 px-4 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-semibold text-zinc-300">
                  Cancel
                </button>
                <button
                  onClick={() => handleDeleteRow(deleteConfirm)}
                  className="h-8 px-4 rounded-lg bg-red-500 hover:bg-red-600 text-white font-bold text-xs active:scale-95"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---- Render: Database List ----
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-transparent">
      {/* Header */}
      <div className="h-16 border-b border-white/5 px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
            <Database size={16} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">Database Instances</h2>
            <p className="text-[10px] text-zinc-500">Supabase-style table editor & SQL console</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchDatabases}
            className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white transition-colors"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setProvisionOpen(true)}
            className="h-9 px-3.5 rounded-lg bg-white hover:bg-zinc-200 text-black font-semibold text-xs transition-colors flex items-center gap-1.5 active:scale-95 duration-100"
          >
            <Plus size={14} />
            Create Database
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-500 gap-3">
            <Loader2 className="animate-spin text-indigo-400" size={32} />
            <span className="text-xs">Loading databases...</span>
          </div>
        ) : databases.length === 0 ? (
          <div className="flex flex-col items-center justify-center border border-dashed border-white/10 rounded-2xl py-24 text-center max-w-lg mx-auto bg-white/[0.01]">
            <div className="relative mb-6">
              <div className="absolute inset-0 rounded-3xl bg-indigo-500/20 blur-2xl animate-pulse" />
              <div className="relative w-16 h-16 rounded-3xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                <Database size={28} />
              </div>
            </div>
            <h3 className="font-extrabold text-lg text-white mb-2">No Databases provisioned</h3>
            <p className="text-xs text-zinc-400 max-w-xs mb-8 leading-relaxed">
              Launch PostgreSQL, MySQL, or Redis instances with a full Supabase-style Table Editor and SQL Console.
            </p>
            <button
              onClick={() => setProvisionOpen(true)}
              className="h-10 px-6 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-xs transition-all active:scale-95"
            >
              Provision first database
            </button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-6 max-w-7xl mx-auto">
            {databases.map((db) => {
              const connStr = getConnectionString(db);
              return (
                <div key={db.id} className="glass-card p-6 rounded-2xl border border-white/5 flex flex-col justify-between bg-white/[0.01] relative group">
                  <div>
                    <div className="flex items-center justify-between mb-3">
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

                    {db.status === 'RUNNING' && (
                      <div className="space-y-2 mt-3">
                        <div>
                          <label className="text-[9px] text-zinc-500 font-bold tracking-wider uppercase block mb-1">Connection URI</label>
                          <div className="flex items-center gap-2 bg-[#050507] border border-white/5 rounded-lg px-3 py-1.5 text-[10px] font-mono text-zinc-300">
                            <span className="truncate flex-1 select-all">{connStr}</span>
                            <button onClick={() => handleCopy(connStr, db.id + '-uri')} className="text-zinc-500 hover:text-white shrink-0">
                              {copiedId === db.id + '-uri' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                            </button>
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
                          setDbView('table-editor');
                          setActiveTable(null);
                          fetchTables(db.id);
                        }}
                        className="h-8 px-3 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-[10px] font-bold flex items-center gap-1.5 transition-all active:scale-95"
                      >
                        <Table size={11} />
                        Open Database
                      </button>
                    ) : <div />}

                    <button
                      onClick={() => handleDeleteDatabase(db.id)}
                      className="h-8 px-2.5 rounded-lg border border-red-500/10 hover:bg-red-500/10 text-red-500 hover:text-red-400 text-[10px] font-bold flex items-center gap-1.5 transition-colors"
                    >
                      <Trash size={12} />
                      Delete
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
            <p className="text-xs text-zinc-400 mb-4">Launch a dedicated database with Table Editor & SQL Console.</p>

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
                <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block mb-1">Engine</label>
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
                      {type === 'POSTGRESQL' ? 'PostgreSQL' : type === 'REDIS' ? 'Redis' : 'MySQL'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setProvisionOpen(false)} className="h-9 px-4 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-semibold">
                  Cancel
                </button>
                <button type="submit" className="h-9 px-4 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white font-semibold text-xs active:scale-95">
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
