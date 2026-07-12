'use client';

import React, { useState, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { apiRequest } from '@/lib/api';
import {
  Zap, Plus, RefreshCw, Trash, Play, Loader2, ArrowLeft,
  Check, AlertCircle, Settings, Copy, Clock, Hash
} from 'lucide-react';

const DEFAULT_CODE = `// KH Cloud Edge Function
// Available context: { req, env, storage }
// - req: { method, path, query, body, headers }
// - env: your configured environment variables
// - storage: { getObject(bucket, key), listObjects(bucket, prefix) }

export default async function handler({ req, env, storage }) {
  const { method, path, query, body, headers } = req;

  // Example: fetch external API
  // const res = await fetch('https://api.example.com/data');
  // const data = await res.json();

  // Example: read from S3/MinIO storage
  // const file = await storage.getObject('my-bucket', 'data.json');

  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: {
      message: 'Hello from KH Cloud Edge!',
      method,
      path,
      timestamp: new Date().toISOString(),
      env_keys: Object.keys(env),
    },
  };
}`;

export default function EdgeFunctionsTab() {
  const { activeTeam } = useAppStore();
  const [functions, setFunctions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFn, setActiveFn] = useState<any | null>(null);
  const [code, setCode] = useState(DEFAULT_CODE);
  const [envVarsRaw, setEnvVarsRaw] = useState('{}');
  const [envVarsError, setEnvVarsError] = useState('');
  const [saving, setSaving] = useState(false);
  const [invoking, setInvoking] = useState(false);
  const [invokeResult, setInvokeResult] = useState<any | null>(null);
  const [invokePayload, setInvokePayload] = useState('{\n  "method": "GET",\n  "path": "/",\n  "body": null\n}');
  const [createOpen, setCreateOpen] = useState(false);
  const [newFnName, setNewFnName] = useState('');
  const [sidePanel, setSidePanel] = useState<'env' | 'invoke' | 'guide'>('invoke');
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [apiKeys, setApiKeys] = useState<any[]>([]);

  const fetchFunctions = async () => {
    if (!activeTeam) return;
    setLoading(true);
    try {
      const [fns, keys] = await Promise.all([
        apiRequest(`/edge-functions?teamId=${activeTeam.id}`),
        apiRequest(`/teams/${activeTeam.id}/keys`),
      ]);
      setFunctions(fns);
      setApiKeys(keys);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchFunctions(); }, [activeTeam]);

  useEffect(() => {
    if (activeFn) {
      setCode(activeFn.code || DEFAULT_CODE);
      setEnvVarsRaw(activeFn.envVars || '{}');
      setInvokeResult(null);
    }
  }, [activeFn]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFnName.trim() || !activeTeam) return;
    try {
      const fn = await apiRequest('/edge-functions', {
        method: 'POST',
        body: JSON.stringify({ name: newFnName, teamId: activeTeam.id }),
      });
      setNewFnName('');
      setCreateOpen(false);
      await fetchFunctions();
      setActiveFn(fn);
    } catch (err: any) {
      alert(err.message || 'Failed to create function.');
    }
  };

  const handleSave = async () => {
    if (!activeFn || !activeTeam) return;
    try { JSON.parse(envVarsRaw); setEnvVarsError(''); }
    catch { setEnvVarsError('Invalid JSON in environment variables.'); return; }

    setSaving(true);
    try {
      const updated = await apiRequest(`/edge-functions/${activeFn.id}`, {
        method: 'PUT',
        body: JSON.stringify({ teamId: activeTeam.id, code, envVars: envVarsRaw }),
      });
      setActiveFn(updated);
      setFunctions(prev => prev.map(f => f.id === updated.id ? updated : f));
    } catch (err: any) {
      alert(err.message || 'Failed to save function.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!activeTeam) return;
    if (!confirm('Delete this edge function permanently?')) return;
    try {
      await apiRequest(`/edge-functions/${id}?teamId=${activeTeam.id}`, { method: 'DELETE' });
      if (activeFn?.id === id) setActiveFn(null);
      fetchFunctions();
    } catch (err: any) {
      alert(err.message || 'Failed to delete.');
    }
  };

  const handleInvoke = async () => {
    if (!activeFn || !activeTeam) return;
    let payloadData: any = {};
    try { payloadData = JSON.parse(invokePayload); }
    catch { alert('Invalid JSON in test payload.'); return; }

    const serviceKeyObj = apiKeys.find(k => k.role === 'SERVICE_ROLE');
    setInvoking(true);
    setInvokeResult(null);
    try {
      const res = await apiRequest(`/edge-functions/${activeFn.id}/invoke${serviceKeyObj ? `?apikey=${serviceKeyObj.key}` : ''}`, {
        method: 'POST',
        body: JSON.stringify({ teamId: activeTeam.id, ...payloadData }),
      });
      setInvokeResult(res);
    } catch (err: any) {
      setInvokeResult({ success: false, error: err.message });
    } finally {
      setInvoking(false);
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(id);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const getInvokeUrl = (fn: any) => {
    if (typeof window === 'undefined') return '';
    const host = window.location.hostname.endsWith('khawarahemad.com')
      ? 'https://api.khawarahemad.com'
      : 'http://localhost:5000';
    return `${host}/api/edge-functions/${fn.id}/invoke`;
  };

  /* ─── EDITOR VIEW ─── */
  if (activeFn) {
    return (
      <div className="rw-page">
        {/* Sub-header */}
        <div className="rw-page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
            <button
              onClick={() => setActiveFn(null)}
              style={{
                width: '30px', height: '30px', borderRadius: '7px',
                backgroundColor: '#181b22', border: '1px solid rgba(255,255,255,0.09)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#9ba3af', cursor: 'pointer', flexShrink: 0,
              }}
            >
              <ArrowLeft size={13} />
            </button>
            <div style={{
              width: '30px', height: '30px', borderRadius: '8px', flexShrink: 0,
              backgroundColor: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Zap size={13} style={{ color: '#f59e0b' }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#f1f3f6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {activeFn.name}
              </div>
              <code style={{ fontSize: '10px', color: '#4b5563', fontFamily: 'monospace' }}>{activeFn.slug}</code>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '0 10px', height: '30px', borderRadius: '7px',
              backgroundColor: '#181b22', border: '1px solid rgba(255,255,255,0.07)',
              fontSize: '11px', color: '#6b7280',
            }}>
              <Hash size={10} /> {activeFn.invokeCount || 0} calls
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                height: '30px', padding: '0 14px', borderRadius: '7px',
                backgroundColor: '#7c3aed', border: '1px solid rgba(124,58,237,0.5)',
                color: '#fff', fontSize: '12px', fontWeight: 500,
                cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
              {saving ? 'Saving...' : 'Save & Deploy'}
            </button>
          </div>
        </div>

        {/* Editor layout */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0, gap: '0', overflow: 'hidden' }}>
          {/* Code area */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, borderRight: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{
              height: '36px', backgroundColor: '#0e1015',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              display: 'flex', alignItems: 'center', padding: '0 16px', gap: '8px',
              flexShrink: 0,
            }}>
              <span style={{ fontSize: '11px', color: '#f59e0b', fontFamily: 'monospace', fontWeight: 500 }}>handler.js</span>
              <span style={{ fontSize: '11px', color: '#4b5563' }}>·</span>
              <span style={{ fontSize: '11px', color: '#4b5563' }}>KH Cloud Edge Runtime v1</span>
            </div>
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              spellCheck={false}
              style={{
                flex: 1, width: '100%',
                backgroundColor: '#08090c', padding: '16px',
                fontFamily: 'JetBrains Mono, Fira Code, Consolas, monospace',
                fontSize: '12px', lineHeight: 1.65,
                color: '#d1d5db', outline: 'none', resize: 'none',
                border: 'none',
              }}
            />
          </div>

          {/* Side panel */}
          <div style={{ width: '340px', display: 'flex', flexDirection: 'column', minHeight: 0, flexShrink: 0, backgroundColor: '#111318' }}>
            {/* Side panel tabs */}
            <div style={{
              height: '36px', borderBottom: '1px solid rgba(255,255,255,0.06)',
              display: 'flex', backgroundColor: '#0e1015',
            }}>
              {[
                { id: 'invoke', label: 'Test', icon: Play },
                { id: 'env', label: 'Env', icon: Settings },
                { id: 'guide', label: 'Guide', icon: Zap },
              ].map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setSidePanel(id as any)}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                    fontSize: '11px', fontWeight: 500, cursor: 'pointer',
                    color: sidePanel === id ? '#f1f3f6' : '#4b5563',
                    backgroundColor: 'transparent', border: 'none',
                    borderBottom: sidePanel === id ? '2px solid #7c3aed' : '2px solid transparent',
                    transition: 'color 0.12s',
                  }}
                >
                  <Icon size={11} /> {label}
                </button>
              ))}
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {sidePanel === 'invoke' ? (
                <>
                  {/* Invoke URL */}
                  <div>
                    <label className="rw-label">Invoke URL</label>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      backgroundColor: '#0e1015', border: '1px solid rgba(255,255,255,0.07)',
                      borderRadius: '7px', padding: '7px 10px',
                    }}>
                      <code style={{ flex: 1, fontSize: '10px', fontFamily: 'monospace', color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {getInvokeUrl(activeFn)}
                      </code>
                      <button onClick={() => handleCopy(getInvokeUrl(activeFn), 'url')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: copiedText === 'url' ? '#22c55e' : '#6b7280', display: 'flex' }}>
                        {copiedText === 'url' ? <Check size={11} /> : <Copy size={11} />}
                      </button>
                    </div>
                  </div>

                  {/* Payload */}
                  <div>
                    <label className="rw-label">Test payload (JSON)</label>
                    <textarea
                      value={invokePayload}
                      onChange={(e) => setInvokePayload(e.target.value)}
                      rows={5}
                      className="rw-textarea"
                      style={{ fontFamily: 'monospace', fontSize: '11px', backgroundColor: '#0e1015', resize: 'none' }}
                    />
                  </div>

                  <button
                    onClick={handleInvoke}
                    disabled={invoking}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                      height: '34px', borderRadius: '7px', fontSize: '12px', fontWeight: 500,
                      backgroundColor: '#7c3aed', border: '1px solid rgba(124,58,237,0.5)',
                      color: '#fff', cursor: invoking ? 'not-allowed' : 'pointer',
                      opacity: invoking ? 0.7 : 1,
                    }}
                  >
                    {invoking ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
                    {invoking ? 'Running...' : 'Run test'}
                  </button>

                  {invokeResult && (
                    <div style={{
                      padding: '12px', borderRadius: '8px',
                      backgroundColor: invokeResult.success ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)',
                      border: `1px solid ${invokeResult.success ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', fontSize: '11px', fontWeight: 500 }}>
                        {invokeResult.success
                          ? <><Check size={11} style={{ color: '#22c55e' }} /><span style={{ color: '#22c55e' }}>Success</span></>
                          : <><AlertCircle size={11} style={{ color: '#ef4444' }} /><span style={{ color: '#ef4444' }}>Error</span></>
                        }
                        {invokeResult.duration && <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#4b5563', fontFamily: 'monospace' }}>{invokeResult.duration}ms</span>}
                      </div>
                      {invokeResult.error && <p style={{ fontSize: '10px', fontFamily: 'monospace', color: '#fca5a5', wordBreak: 'break-all' }}>{invokeResult.error}</p>}
                      {invokeResult.logs?.length > 0 && (
                        <div style={{ backgroundColor: '#08090c', borderRadius: '6px', padding: '8px', fontFamily: 'monospace', fontSize: '10px', color: '#9ba3af', marginBottom: '8px' }}>
                          {invokeResult.logs.map((log: string, i: number) => <div key={i}>{log}</div>)}
                        </div>
                      )}
                      {invokeResult.result && (
                        <pre style={{ fontSize: '10px', fontFamily: 'monospace', color: '#d1d5db', whiteSpace: 'pre-wrap', overflow: 'auto', maxHeight: '160px' }}>
                          {JSON.stringify(invokeResult.result, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}
                </>
              ) : sidePanel === 'env' ? (
                <>
                  <div>
                    <label className="rw-label">Environment variables (JSON)</label>
                    <p style={{ fontSize: '11px', color: '#4b5563', marginBottom: '8px' }}>Accessible in your function via the <code style={{ fontFamily: 'monospace', color: '#a78bfa' }}>env</code> object.</p>
                    <textarea
                      value={envVarsRaw}
                      onChange={(e) => { setEnvVarsRaw(e.target.value); setEnvVarsError(''); }}
                      rows={8}
                      className="rw-textarea"
                      placeholder='{"API_KEY": "...", "SECRET": "..."}'
                      style={{
                        fontFamily: 'monospace', fontSize: '11px', backgroundColor: '#0e1015', resize: 'none',
                        borderColor: envVarsError ? 'rgba(239,68,68,0.4)' : undefined,
                      }}
                    />
                    {envVarsError && <p style={{ fontSize: '11px', color: '#ef4444', marginTop: '4px' }}>{envVarsError}</p>}
                  </div>
                  <div style={{ backgroundColor: '#0e1015', borderRadius: '7px', padding: '10px', fontFamily: 'monospace', fontSize: '10px', color: '#6b7280' }}>
                    <div style={{ fontWeight: 500, color: '#9ba3af', marginBottom: '6px' }}>Access in code:</div>
                    <div>{'env.API_KEY → "sk-..."'}</div>
                    <div>{'env.DATABASE_URL → "..."'}</div>
                  </div>
                </>
              ) : (
                <div style={{ fontSize: '12px', color: '#6b7280', lineHeight: 1.7, display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div>
                    <h4 style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ba3af', marginBottom: '8px' }}>Edge function context</h4>
                    <pre style={{ backgroundColor: '#0e1015', borderRadius: '7px', padding: '10px', fontSize: '10px', fontFamily: 'monospace', color: '#d1d5db', whiteSpace: 'pre-wrap' }}>{`export default async function handler({ req, env, storage, db }) {
  // your code here
}`}</pre>
                  </div>
                  {[
                    { color: '#818cf8', title: 'A. Database (SQLite)', code: `const res = await db.query(\n  'SELECT * FROM storage_buckets'\n);\n\nconst conn = db.connect('DB_ID');\nconst rows = await conn.query('SELECT * FROM users WHERE id = ?', [1]);` },
                    { color: '#34d399', title: 'B. Storage (S3)', code: `const file = await storage.getObject(\n  'bucket-name',\n  'uploads/avatar.png'\n);\n\nconst files = await storage.listObjects(\n  'bucket-name',\n  'uploads/'\n);` },
                    { color: '#fbbf24', title: 'C. External API', code: `const res = await fetch(\n  'https://api.github.com/users'\n);\nconst data = await res.json();` },
                  ].map(({ color, title, code: snippet }) => (
                    <div key={title}>
                      <div style={{ fontSize: '11px', fontWeight: 600, color, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</div>
                      <pre style={{ backgroundColor: '#0e1015', borderRadius: '7px', padding: '10px', fontSize: '10px', fontFamily: 'monospace', color: '#d1d5db', whiteSpace: 'pre-wrap' }}>{snippet}</pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ─── LIST VIEW ─── */
  return (
    <div className="rw-page">
      <div className="rw-page-header">
        <div>
          <h1 className="rw-page-title">Edge Functions</h1>
          <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '2px' }}>
            Serverless functions with storage access and runtime testing.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={fetchFunctions}
            style={{
              width: '32px', height: '32px', borderRadius: '8px',
              backgroundColor: '#181b22', border: '1px solid rgba(255,255,255,0.09)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#6b7280', cursor: 'pointer',
            }}
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setCreateOpen(true)} className="rw-btn-primary">
            <Plus size={13} /> New function
          </button>
        </div>
      </div>

      <div className="rw-page-content">
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px', gap: '12px', color: '#6b7280' }}>
            <Loader2 size={18} className="animate-spin" style={{ color: '#7c3aed' }} />
            <span style={{ fontSize: '13px' }}>Loading edge functions...</span>
          </div>
        ) : functions.length === 0 ? (
          <div className="rw-empty">
            <div className="rw-empty-icon">
              <Zap size={20} style={{ color: '#f59e0b' }} />
            </div>
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#f1f3f6' }}>No edge functions</h3>
            <p style={{ fontSize: '13px', color: '#6b7280', maxWidth: '360px' }}>
              Write serverless JavaScript functions that run at the edge. Access storage, call APIs, and process webhooks in milliseconds.
            </p>
            <button onClick={() => setCreateOpen(true)} className="rw-btn-primary rw-btn-lg" style={{ marginTop: '4px' }}>
              <Plus size={14} /> Deploy first function
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
            {functions.map((fn) => (
              <div
                key={fn.id}
                onClick={() => setActiveFn(fn)}
                className="rw-card-interactive"
                style={{ padding: '16px', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '32px', height: '32px', borderRadius: '8px', flexShrink: 0,
                      backgroundColor: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Zap size={14} style={{ color: '#f59e0b' }} />
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 500, color: '#f1f3f6' }}>{fn.name}</div>
                      <code style={{ fontSize: '10px', color: '#4b5563', fontFamily: 'monospace' }}>{fn.slug}</code>
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(fn.id); }}
                    style={{
                      width: '26px', height: '26px', borderRadius: '6px', flexShrink: 0,
                      backgroundColor: 'transparent', border: '1px solid transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#4b5563', cursor: 'pointer', transition: 'all 0.12s',
                    }}
                    onMouseEnter={e => {
                      const el = e.currentTarget as HTMLElement;
                      el.style.backgroundColor = 'rgba(239,68,68,0.1)';
                      el.style.borderColor = 'rgba(239,68,68,0.2)';
                      el.style.color = '#ef4444';
                    }}
                    onMouseLeave={e => {
                      const el = e.currentTarget as HTMLElement;
                      el.style.backgroundColor = 'transparent';
                      el.style.borderColor = 'transparent';
                      el.style.color = '#4b5563';
                    }}
                  >
                    <Trash size={11} />
                  </button>
                </div>

                <div style={{
                  padding: '6px 8px', borderRadius: '6px',
                  backgroundColor: '#0e1015', border: '1px solid rgba(255,255,255,0.06)',
                  fontFamily: 'monospace', fontSize: '10px', color: '#4b5563',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  marginBottom: '10px',
                }}>
                  POST /api/edge-functions/{fn.id}/invoke
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#6b7280' }}>
                    <Hash size={10} /> {fn.invokeCount || 0} calls
                  </span>
                  {fn.lastInvokedAt && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#6b7280' }}>
                      <Clock size={10} /> {new Date(fn.lastInvokedAt).toLocaleDateString()}
                    </span>
                  )}
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: '#22c55e', fontWeight: 500 }}>
                    <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#22c55e' }} />
                    Active
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create modal */}
      {createOpen && (
        <div className="rw-modal-backdrop">
          <div className="rw-modal animate-scale-in">
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#f1f3f6', marginBottom: '6px' }}>New edge function</h3>
            <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '20px' }}>Give your serverless function a name to deploy it.</p>
            <form onSubmit={handleCreate}>
              <label className="rw-label">Function name</label>
              <input
                type="text"
                required
                autoFocus
                value={newFnName}
                onChange={(e) => setNewFnName(e.target.value)}
                placeholder="e.g. process-webhook"
                className="rw-input"
                style={{ marginBottom: '6px' }}
              />
              <p style={{ fontSize: '11px', color: '#4b5563', marginBottom: '20px' }}>
                Slug: <code style={{ fontFamily: 'monospace', color: '#6b7280' }}>{newFnName.toLowerCase().replace(/[^a-z0-9]/g, '-')}</code>
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" onClick={() => setCreateOpen(false)} className="rw-btn-secondary">Cancel</button>
                <button type="submit" className="rw-btn-primary">Create function</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
