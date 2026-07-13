'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { apiRequest } from '@/lib/api';
import { 
  Database, Plus, RefreshCw, Key, Copy, Check, Loader2, Trash, 
  Play, Terminal, ArrowLeft, AlertCircle, FileText, LayoutGrid,
  Table, Pencil, Save, X, ChevronLeft, ChevronRight, Search
} from 'lucide-react';
import { useDialog } from './CustomDialogProvider';

type DbView = 'sql' | 'table-editor' | 'guide';

export default function DatabasesTab() {
  const { activeTeam } = useAppStore();
  const { confirm, alert } = useDialog();
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
      alert({ title: 'Error', message: err.message || 'Failed to save row.', type: 'error' });
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
      alert({ title: 'Error', message: err.message || 'Failed to insert row.', type: 'error' });
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
      alert({ title: 'Error', message: err.message || 'Failed to delete row.', type: 'error' });
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
    const confirmed = await confirm({
      title: 'Delete Database',
      message: 'Permanently delete this database? All tables and data will be destroyed.',
      confirmText: 'Delete Database',
      isDanger: true,
    });
    if (!confirmed) return;
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
      <div className="rw-page">
        <div style={{ backgroundColor: '#111318', borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
            <button
              onClick={() => { setActiveDb(null); setActiveTable(null); }}
              style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ba3af', cursor: 'pointer', transition: 'all 0.12s' }}
              className="hover:bg-white/5 hover:text-white"
            >
              <ArrowLeft size={14} />
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Database size={16} style={{ color: '#a78bfa' }} />
              </div>
              <div style={{ minWidth: 0 }}>
                <h1 style={{ fontSize: '15px', fontWeight: 600, color: '#f1f3f6', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeDb.name}</h1>
                <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>Managed Database Instance</div>
              </div>
              <span style={{ padding: '2px 8px', borderRadius: '9999px', fontSize: '9px', fontWeight: 600, backgroundColor: 'rgba(124,58,237,0.15)', color: '#c4b5fd', border: '1px solid rgba(124,58,237,0.25)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{activeDb.type}</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '16px' }}>
            {([['table-editor', 'Table Editor', LayoutGrid], ['sql', 'SQL Console', Terminal], ['guide', 'Guide', FileText]] as const).map(([id, label, Icon]) => {
              const isActive = dbView === id;
              return (
                <button
                  key={id}
                  onClick={() => setDbView(id as DbView)}
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

        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', minHeight: 'calc(100vh - 160px)', backgroundColor: '#090a0d' }}>
          
          <div style={{ borderRight: '1px solid rgba(255,255,255,0.06)', backgroundColor: '#0e1015', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#4b5563' }}>Tables</span>
              <button
                onClick={() => fetchTables(activeDb.id)}
                style={{ width: '24px', height: '24px', borderRadius: '6px', backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ba3af', cursor: 'pointer', transition: 'all 0.12s' }}
                className="hover:bg-white/5 hover:text-white"
              >
                <RefreshCw size={11} className={tablesLoading ? 'animate-spin' : ''} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', overflowY: 'auto' }}>
              {tablesLoading ? (
                <div style={{ padding: '24px 0', textAlign: 'center', color: '#4b5563', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                  <Loader2 className="animate-spin" size={12} /> Loading...
                </div>
              ) : tables.length === 0 ? (
                <div style={{ padding: '24px 8px', textAlign: 'center', color: '#4b5563', fontSize: '11px', lineHeight: 1.5, border: '1px dashed rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                  No tables yet.<br />Use console to build schema.
                </div>
              ) : (
                tables.map(t => {
                  const isSelected = activeTable === t && dbView === 'table-editor';
                  return (
                    <button
                      key={t}
                      onClick={() => { setDbView('table-editor'); handleSelectTable(t); }}
                      style={{
                        width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: '8px', border: 'none', fontSize: '12px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.12s',
                        backgroundColor: isSelected ? 'rgba(124,58,237,0.1)' : 'transparent',
                        color: isSelected ? '#c4b5fd' : '#8a929e'
                      }}
                      className={isSelected ? '' : 'hover:bg-white/5 hover:text-white'}
                    >
                      <Table size={12} style={{ color: isSelected ? '#a78bfa' : '#4b5563', flexShrink: 0 }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{t}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            
            {dbView === 'table-editor' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%' }}>
                {!activeTable ? (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '48px' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4b5563', marginBottom: '16px' }}>
                      <Table size={20} />
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#f1f3f6', marginBottom: '6px' }}>Database Table Browser</div>
                    <p style={{ fontSize: '12px', color: '#6b7280', maxWidth: '320px', margin: '0 0 16px 0', lineHeight: 1.5 }}>Select any database table from the left sidebar to view, update, insert, or filter data rows directly.</p>
                    <button onClick={() => setDbView('sql')} style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '32px', padding: '0 14px', borderRadius: '7px', backgroundColor: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#9ba3af', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }} className="hover:bg-white/5 hover:text-white">
                      <Terminal size={12} /> Write SQL Query
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', backgroundColor: '#111318', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '12px', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap', gap: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#f1f3f6', fontFamily: 'monospace' }}>{activeTable}</span>
                        {tableSchema && <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 600, backgroundColor: 'rgba(245,158,11,0.1)', color: '#f59e0b', fontFamily: 'monospace' }}>PK: {tableSchema.primaryKey}</span>}
                        {tableTotal > 0 && <span style={{ padding: '2px 8px', borderRadius: '9999px', fontSize: '10px', backgroundColor: 'rgba(255,255,255,0.05)', color: '#8a929e' }}>{tableTotal} rows</span>}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ position: 'relative' }}>
                          <Search size={11} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#4b5563' }} />
                          <input
                            value={tableFilter}
                            onChange={(e) => setTableFilter(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && loadTableData(activeTable!, tablePage, tableFilter)}
                            placeholder="SQL Filter (e.g. id = 5)"
                            style={{ height: '28px', width: '180px', borderRadius: '6px', backgroundColor: '#0e1015', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', fontSize: '11px', fontFamily: 'monospace', paddingLeft: '28px', paddingRight: '8px', outline: 'none' }}
                          />
                        </div>
                        <button
                          onClick={() => loadTableData(activeTable!, tablePage, tableFilter)}
                          style={{ width: '28px', height: '28px', borderRadius: '6px', backgroundColor: 'transparent', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ba3af', cursor: 'pointer' }}
                          className="hover:bg-white/5 hover:text-white"
                        >
                          <RefreshCw size={11} className={tableLoading ? 'animate-spin' : ''} />
                        </button>
                        <button
                          onClick={() => { setAddingRow(true); setNewRowData({}); }}
                          style={{ height: '28px', padding: '0 12px', borderRadius: '6px', backgroundColor: '#7c3aed', border: 'none', color: '#fff', fontSize: '11px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          <Plus size={11} /> New Row
                        </button>
                      </div>
                    </div>

                    <div style={{ overflowX: 'auto', maxHeight: '480px' }}>
                      {tableLoading ? (
                        <div style={{ padding: '64px', textAlign: 'center', color: '#6b7280', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                          <Loader2 className="animate-spin text-violet-400" size={16} /> Loading data rows...
                        </div>
                      ) : tableColumns.length === 0 ? (
                        <div style={{ padding: '48px', textAlign: 'center', color: '#4b5563', fontSize: '12px' }}>This table is empty. Click "New Row" to insert a record.</div>
                      ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
                          <thead>
                            <tr style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                              <th style={{ width: '70px', padding: '10px 16px', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#4b5563' }}>Actions</th>
                              {tableColumns.map(col => (
                                <th key={col} style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: '11px', color: '#8a929e', borderRight: '1px solid rgba(255,255,255,0.03)' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    {tableSchema?.columns.find(c => c.name === col)?.pk && <span style={{ fontSize: '10px' }}>🔑</span>}
                                    <span>{col}</span>
                                    <span style={{ fontSize: '9px', color: '#4b5563', fontWeight: 400 }}>({tableSchema?.columns.find(c => c.name === col)?.type})</span>
                                  </div>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {addingRow && (
                              <tr style={{ backgroundColor: 'rgba(34,197,94,0.03)', borderBottom: '1px solid rgba(34,197,94,0.1)' }}>
                                <td style={{ padding: '8px 16px' }}>
                                  <div style={{ display: 'flex', gap: '4px' }}>
                                    <button onClick={handleInsertRow} disabled={saving} style={{ height: '24px', width: '24px', borderRadius: '4px', backgroundColor: 'rgba(34,197,94,0.15)', border: 'none', color: '#22c55e', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                      {saving ? <Loader2 size={10} className="animate-spin" /> : <Save size={10} />}
                                    </button>
                                    <button onClick={() => setAddingRow(false)} style={{ height: '24px', width: '24px', borderRadius: '4px', backgroundColor: 'rgba(255,255,255,0.05)', border: 'none', color: '#9ba3af', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                      <X size={10} />
                                    </button>
                                  </div>
                                </td>
                                {tableColumns.map(col => {
                                  const isPk = tableSchema?.columns.find(c => c.name === col)?.pk;
                                  return (
                                    <td key={col} style={{ padding: '8px 12px', borderRight: '1px solid rgba(255,255,255,0.03)' }}>
                                      <input
                                        type="text"
                                        placeholder={isPk ? '(Auto-generated)' : 'value'}
                                        disabled={isPk}
                                        value={newRowData[col] || ''}
                                        onChange={e => setNewRowData({ ...newRowData, [col]: e.target.value })}
                                        style={{ width: '100%', height: '24px', padding: '0 6px', borderRadius: '4px', backgroundColor: '#0e1015', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', fontSize: '11px', fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box' }}
                                      />
                                    </td>
                                  );
                                })}
                              </tr>
                            )}

                            {tableRows.map((row, rIdx) => {
                              const pkCol = tableSchema?.primaryKey || tableColumns[0];
                              const pkVal = row[pkCol];
                              const isEditing = editingRowKey === pkVal;

                              return (
                                <tr key={rIdx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }} className="hover:bg-white/[0.01]">
                                  <td style={{ padding: '10px 16px' }}>
                                    {isEditing ? (
                                      <div style={{ display: 'flex', gap: '4px' }}>
                                        <button onClick={handleSaveRow} disabled={saving} style={{ height: '24px', width: '24px', borderRadius: '4px', backgroundColor: 'rgba(34,197,94,0.15)', border: 'none', color: '#22c55e', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                          {saving ? <Loader2 size={10} className="animate-spin" /> : <Save size={10} />}
                                        </button>
                                        <button onClick={() => setEditingRowKey(null)} style={{ height: '24px', width: '24px', borderRadius: '4px', backgroundColor: 'rgba(255,255,255,0.05)', border: 'none', color: '#9ba3af', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                          <X size={10} />
                                        </button>
                                      </div>
                                    ) : (
                                      <div style={{ display: 'flex', gap: '6px' }}>
                                        <button onClick={() => { setEditingRowKey(pkVal); setEditingRowData(row); }} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: '0' }} className="hover:text-white"><Pencil size={11} /></button>
                                        <button onClick={() => handleDeleteRow(pkVal)} style={{ background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer', padding: '0' }} className="hover:text-red-400"><Trash size={11} /></button>
                                      </div>
                                    )}
                                  </td>
                                  {tableColumns.map(col => (
                                    <td key={col} style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: '11px', color: '#f1f3f6', borderRight: '1px solid rgba(255,255,255,0.03)' }}>
                                      {isEditing && col !== pkCol ? (
                                        <input
                                          type="text"
                                          value={editingRowData[col] ?? ''}
                                          onChange={e => setEditingRowData({ ...editingRowData, [col]: e.target.value })}
                                          style={{ width: '100%', height: '24px', padding: '0 6px', borderRadius: '4px', backgroundColor: '#0e1015', border: '1px solid rgba(124,58,237,0.3)', color: '#fff', fontSize: '11px', fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box' }}
                                        />
                                      ) : (
                                        <span>{row[col] === null ? <em style={{ color: '#4b5563' }}>null</em> : String(row[col])}</span>
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
                  </div>
                )}
              </div>
            )}

            {dbView === 'sql' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#4b5563', marginBottom: '2px' }}>SQL Query Console</div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>Execute database commands directly. Auto-commits changes.</div>
                  </div>
                  <button
                    onClick={() => handleExecuteQuery()}
                    disabled={queryExecuting || !sqlQuery.trim()}
                    style={{ height: '30px', padding: '0 14px', borderRadius: '7px', backgroundColor: '#7c3aed', border: 'none', color: '#fff', fontSize: '11px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', opacity: (queryExecuting || !sqlQuery.trim()) ? 0.6 : 1 }}
                  >
                    {queryExecuting ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
                    Run Query
                  </button>
                </div>

                <textarea
                  value={sqlQuery}
                  onChange={e => setSqlQuery(e.target.value)}
                  rows={8}
                  style={{ width: '100%', padding: '16px', borderRadius: '10px', backgroundColor: '#08090c', border: '1px solid rgba(255,255,255,0.06)', color: '#c4b5fd', fontFamily: '"JetBrains Mono", "Fira Code", monospace', fontSize: '12px', lineHeight: 1.7, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
                />

                {queryError && (
                  <div style={{ padding: '12px 16px', borderRadius: '8px', backgroundColor: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171', fontSize: '12px', display: 'flex', alignItems: 'flex-start', gap: '8px', fontFamily: 'monospace' }}>
                    <AlertCircle size={14} style={{ marginTop: '2px', flexShrink: 0 }} />
                    <span style={{ whiteSpace: 'pre-wrap' }}>{queryError}</span>
                  </div>
                )}

                {queryResult && (
                  <div style={{ backgroundColor: '#111318', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '10px', overflow: 'hidden' }}>
                    <div style={{ padding: '8px 12px', backgroundColor: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: '11px', color: '#6b7280', fontWeight: 500 }}>
                      Query returned {queryResult.length || 0} rows
                    </div>
                    {queryResult.length > 0 && (
                      <div style={{ overflowX: 'auto', maxHeight: '280px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '11px' }}>
                          <thead>
                            <tr style={{ backgroundColor: 'rgba(255,255,255,0.01)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                              {Object.keys(queryResult[0]).map(key => (
                                <th key={key} style={{ padding: '8px 12px', fontFamily: 'monospace', color: '#8a929e', fontWeight: 600 }}>{key}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {queryResult.map((row: any, rIdx: number) => (
                              <tr key={rIdx} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                {Object.keys(row).map(key => (
                                  <td key={key} style={{ padding: '8px 12px', fontFamily: 'monospace', color: '#f1f3f6' }}>
                                    {row[key] === null ? <em style={{ color: '#4b5563' }}>null</em> : String(row[key])}
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
              </div>
            )}

            {dbView === 'guide' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '700px' }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#4b5563', marginBottom: '2px' }}>Connection Guide</div>
                  <div style={{ fontSize: '12px', color: '#6b7280' }}>Connect your web applications to this database instance using standard URIs.</div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#4b5563' }}>Internal URI (Used in KH Cloud apps)</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#08090c', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '10px 14px' }}>
                    <code style={{ flex: 1, fontSize: '12px', fontFamily: 'monospace', color: '#c4b5fd', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getConnectionString(activeDb)}</code>
                    <button onClick={() => handleCopy(getConnectionString(activeDb), activeDb.id + '-uri')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: copiedId === activeDb.id + '-uri' ? '#22c55e' : '#4b5563' }}>
                      {copiedId === activeDb.id + '-uri' ? <Check size={13} /> : <Copy size={13} />}
                    </button>
                  </div>
                </div>

                <div style={{ backgroundColor: '#111318', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#f1f3f6' }}>Connection Parameters</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', fontSize: '12px' }}>
                    {[
                      { label: 'Host / Server', value: activeDb.host },
                      { label: 'Port', value: String(activeDb.port) },
                      { label: 'Database Name', value: activeDb.dbName || activeDb.name },
                      { label: 'Username', value: activeDb.username || 'default' },
                      { label: 'Password', value: '••••••••••••' },
                    ].map(f => (
                      <div key={f.label} style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: '8px' }}>
                        <span style={{ fontSize: '9px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#4b5563' }}>{f.label}</span>
                        <code style={{ fontFamily: 'monospace', color: '#9ba3af' }}>{f.value}</code>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    );
  }

  // ---- Render: Database List ----
  return (
    <div className="rw-page">
      <div className="rw-page-header">
        <div>
          <h1 className="rw-page-title">Databases</h1>
          <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '2px' }}>Provision managed PostgreSQL, Redis, or MySQL database instances.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button onClick={fetchDatabases} style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: '#181b22', border: '1px solid rgba(255,255,255,0.09)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', cursor: 'pointer', transition: 'all 0.12s' }} className="hover:bg-white/5 hover:text-white">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setProvisionOpen(true)} className="rw-btn rw-btn-primary">
            <Plus size={13} /> Create Database
          </button>
        </div>
      </div>

      <div className="rw-page-content">
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px', gap: '12px', color: '#6b7280' }}>
            <Loader2 size={18} className="animate-spin" style={{ color: '#7c3aed' }} />
            <span style={{ fontSize: '13px' }}>Loading databases...</span>
          </div>
        ) : databases.length === 0 ? (
          <div className="rw-empty">
            <div className="rw-empty-icon"><Database size={20} style={{ color: '#6b7280' }} /></div>
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#f1f3f6' }}>No databases provisioned</h3>
            <p style={{ fontSize: '13px', color: '#6b7280', maxWidth: '320px' }}>Launch production-ready PostgreSQL, MySQL, or Redis instances in one click.</p>
            <button onClick={() => setProvisionOpen(true)} className="rw-btn rw-btn-primary rw-btn-lg" style={{ marginTop: '4px' }}><Plus size={14} /> Provision database</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px', maxWidth: '960px' }}>
            {databases.map((db) => {
              const connStr = getConnectionString(db);
              const isRunning = db.status === 'RUNNING';
              const isCreating = db.status === 'CREATING';
              return (
                <div key={db.id} className="rw-card-interactive" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Database size={14} style={{ color: '#a78bfa' }} />
                      </div>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#f1f3f6' }}>{db.name}</div>
                        <div style={{ fontSize: '9px', color: '#4b5563', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: '1px' }}>{db.type}</div>
                      </div>
                    </div>
                    <span style={{
                      padding: '2px 8px', borderRadius: '9999px', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em',
                      backgroundColor: isRunning ? 'rgba(34,197,94,0.1)' : 'rgba(124,58,237,0.1)',
                      color: isRunning ? '#22c55e' : '#a78bfa',
                      border: isRunning ? '1px solid rgba(34,197,94,0.2)' : '1px solid rgba(124,58,237,0.2)',
                      ...(isCreating ? { animation: 'rw-pulse-dot 1.8s infinite' } : {})
                    }}>{db.status}</span>
                  </div>

                  {isRunning && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ fontSize: '9px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#4b5563' }}>Internal URI</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#0e1015', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '6px', padding: '6px 10px' }}>
                        <code style={{ flex: 1, fontSize: '10px', fontFamily: 'monospace', color: '#9ba3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{connStr}</code>
                        <button onClick={() => handleCopy(connStr, db.id + '-uri')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: copiedId === db.id + '-uri' ? '#22c55e' : '#4b5563', display: 'flex' }}>
                          {copiedId === db.id + '-uri' ? <Check size={11} /> : <Copy size={11} />}
                        </button>
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    {isRunning ? (
                      <button onClick={() => { setActiveDb(db); setDbView('table-editor'); setActiveTable(null); fetchTables(db.id); }} style={{ display: 'flex', alignItems: 'center', gap: '5px', height: '28px', padding: '0 12px', borderRadius: '6px', backgroundColor: '#7c3aed', border: 'none', color: '#fff', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                        <Table size={11} /> Open
                      </button>
                    ) : <div />}
                    <button onClick={() => handleDeleteDatabase(db.id)} style={{ display: 'flex', alignItems: 'center', gap: '5px', height: '28px', padding: '0 12px', borderRadius: '6px', backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                      <Trash size={11} /> Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {provisionOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-6">
          <div style={{ backgroundColor: '#111318', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', padding: '24px', maxWidth: '380px', width: '100%', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
            <h3 className="mb-1 text-base font-bold text-white">Provision Managed Database</h3>
            <p className="mb-4 text-xs text-slate-400">Launch an instant, isolated database instance.</p>

            <form onSubmit={handleCreateDatabase} className="space-y-4">
              <div>
                <label style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#4b5563', display: 'block', marginBottom: '6px' }}>Database Name</label>
                <input
                  type="text"
                  required
                  value={dbName}
                  onChange={(e) => setDbName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="production-db"
                  style={{ width: '100%', height: '36px', padding: '0 12px', borderRadius: '7px', backgroundColor: '#0e1015', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#4b5563', display: 'block', marginBottom: '6px' }}>Database Engine</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['POSTGRESQL', 'REDIS', 'MYSQL'] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setDbType(type)}
                      style={{
                        height: '42px', borderRadius: '8px', border: dbType === type ? '1px solid #7c3aed' : '1px solid rgba(255,255,255,0.08)', fontSize: '11px', fontWeight: 600, flexDirection: 'column', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.12s',
                        backgroundColor: dbType === type ? 'rgba(124,58,237,0.08)' : 'rgba(255,255,255,0.02)',
                        color: dbType === type ? '#c4b5fd' : '#8a929e'
                      }}
                    >
                      {type === 'POSTGRESQL' ? 'Postgres' : type === 'REDIS' ? 'Redis' : 'MySQL'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setProvisionOpen(false)} style={{ height: '32px', padding: '0 14px', borderRadius: '7px', backgroundColor: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#9ba3af', fontSize: '12px', cursor: 'pointer' }}>
                  Cancel
                </button>
                <button type="submit" style={{ height: '32px', padding: '0 16px', borderRadius: '7px', backgroundColor: '#7c3aed', border: 'none', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                  Provision
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
