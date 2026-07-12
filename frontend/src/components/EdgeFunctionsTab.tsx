'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '@/lib/store';
import { apiRequest } from '@/lib/api';
import {
  Zap, Plus, RefreshCw, Trash, Play, Loader2, ArrowLeft, 
  Check, AlertCircle, Terminal, Settings, Eye, EyeOff, ChevronRight,
  Clock, Hash
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

  useEffect(() => {
    fetchFunctions();
  }, [activeTeam]);

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
    // Validate env vars JSON
    try {
      JSON.parse(envVarsRaw);
      setEnvVarsError('');
    } catch {
      setEnvVarsError('Invalid JSON in environment variables.');
      return;
    }

    setSaving(true);
    try {
      const updated = await apiRequest(`/edge-functions/${activeFn.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          teamId: activeTeam.id,
          code,
          envVars: envVarsRaw,
        }),
      });
      setActiveFn(updated);
      // refresh list
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
    try {
      payloadData = JSON.parse(invokePayload);
    } catch {
      alert('Invalid JSON in test payload.');
      return;
    }

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

  if (activeFn) {
    return (
      <div className="flex-1 flex flex-col min-h-0 bg-transparent">
        {/* Header */}
        <div className="app-panel-strong mx-4 mt-4 flex h-auto items-center justify-between gap-4 rounded-[1.75rem] px-5 py-4 shrink-0">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => setActiveFn(null)}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
            >
              <ArrowLeft size={15} />
            </button>
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-200">
                <Zap size={12} />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold tracking-tight text-white">{activeFn.name}</h2>
                <span className="mt-1 inline-flex rounded-full border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[9px] text-slate-500">{activeFn.slug}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-2 font-mono text-[10px] text-slate-400 md:flex">
              <Hash size={10} />
              <span>{activeFn.invokeCount || 0} invocations</span>
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className="app-button-primary h-11 px-4 text-xs disabled:opacity-60"
            >
              {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
              {saving ? 'Saving...' : 'Save & Deploy'}
            </button>
          </div>
        </div>

        {/* Editor + Side Panel */}
        <div className="flex-1 flex min-h-0 gap-4 px-4 pb-4 pt-4">

          {/* Code Editor */}
          <div className="app-panel flex-1 flex flex-col min-h-0 rounded-[1.75rem] overflow-hidden">
            <div className="flex h-12 items-center gap-3 border-b border-white/10 bg-white/[0.03] px-4 text-[10px] font-bold text-slate-500 shrink-0">
              <span className="text-orange-200">handler.js</span>
              <span>•</span>
              <span>KH Cloud Edge Runtime v1</span>
            </div>
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              spellCheck={false}
              className="flex-1 w-full bg-slate-950/70 p-5 font-mono text-[11px] leading-relaxed text-slate-200 outline-0 resize-none"
              style={{ tabSize: 2 }}
            />
          </div>

          {/* Side Panel */}
          <div className="app-panel w-[22rem] flex flex-col min-h-0 rounded-[1.75rem] overflow-hidden shrink-0">
            
            {/* Side Panel Tabs */}
            <div className="flex h-12 border-b border-white/10 bg-white/[0.03] text-[10px] font-bold shrink-0">
              <button
                type="button"
                onClick={() => setSidePanel('invoke')}
                className={`flex-1 flex items-center justify-center gap-1.5 transition-colors ${
                  sidePanel === 'invoke' ? 'border-b-2 border-orange-300 text-orange-200' : 'text-slate-500 hover:text-slate-200'
                }`}
              >
                <Play size={10} />
                Test
              </button>
              <button
                type="button"
                onClick={() => setSidePanel('env')}
                className={`flex-1 flex items-center justify-center gap-1.5 transition-colors ${
                  sidePanel === 'env' ? 'border-b-2 border-orange-300 text-orange-200' : 'text-slate-500 hover:text-slate-200'
                }`}
              >
                <Settings size={10} />
                Env
              </button>
              <button
                type="button"
                onClick={() => setSidePanel('guide')}
                className={`flex-1 flex items-center justify-center gap-1.5 transition-colors ${
                  sidePanel === 'guide' ? 'border-b-2 border-orange-300 text-orange-200' : 'text-slate-500 hover:text-slate-200'
                }`}
              >
                <Zap size={10} />
                Guide
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {sidePanel === 'invoke' ? (
                <>
                  {/* Invoke URL */}
                  <div>
                    <label className="app-muted-label block mb-2">Invoke URL</label>
                    <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/60 px-3 py-2 font-mono text-[9px] text-slate-300">
                      <span className="flex-1 truncate">{getInvokeUrl(activeFn)}</span>
                      <button
                        onClick={() => handleCopy(getInvokeUrl(activeFn), 'url')}
                        className="shrink-0 text-slate-500 transition-colors hover:text-white"
                      >
                        {copiedText === 'url' ? <Check size={10} className="text-emerald-400" /> : <ChevronRight size={10} />}
                      </button>
                    </div>
                  </div>

                  {/* Test Payload */}
                  <div>
                    <label className="app-muted-label block mb-2">Test payload (JSON)</label>
                    <textarea
                      value={invokePayload}
                      onChange={(e) => setInvokePayload(e.target.value)}
                      className="glass-input h-32 w-full rounded-[1.25rem] p-3 font-mono text-[10px] text-slate-200 outline-0 resize-none"
                    />
                  </div>

                  <button
                    onClick={handleInvoke}
                    disabled={invoking}
                    className="app-button-primary h-11 w-full justify-center text-xs disabled:opacity-60"
                  >
                    {invoking ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
                    {invoking ? 'Running...' : 'Run Test'}
                  </button>

                  {/* Invoke Result */}
                  {invokeResult && (
                    <div className={`rounded-xl border p-3 space-y-2 ${
                      invokeResult.success ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-red-500/20 bg-red-500/5'
                    }`}>
                      <div className="flex items-center gap-2 text-[10px] font-bold">
                        {invokeResult.success ? (
                          <><Check size={12} className="text-emerald-400" /><span className="text-emerald-400">Success</span></>
                        ) : (
                          <><AlertCircle size={12} className="text-red-400" /><span className="text-red-400">Error</span></>
                        )}
                        {invokeResult.duration && (
                          <span className="ml-auto font-mono text-slate-500">{invokeResult.duration}ms</span>
                        )}
                      </div>

                      {invokeResult.error && (
                        <p className="text-[10px] font-mono text-red-400 break-all">{invokeResult.error}</p>
                      )}

                      {invokeResult.logs && invokeResult.logs.length > 0 && (
                        <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-2 font-mono text-[9px] text-slate-400 space-y-0.5">
                          {invokeResult.logs.map((log: string, i: number) => (
                            <div key={i}>{log}</div>
                          ))}
                        </div>
                      )}

                      {invokeResult.result && (
                        <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-2">
                          <div className="mb-1.5 text-[8px] font-bold uppercase text-slate-500">Response body</div>
                          <pre className="max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[9px] text-slate-200 select-text">
                            {JSON.stringify(invokeResult.result, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : sidePanel === 'env' ? (
                <>
                  <div>
                    <label className="app-muted-label block mb-2">
                      Environment Variables (JSON)
                    </label>
                    <p className="mb-2 text-[9px] text-slate-500">
                      Accessible inside your function via the <code className="bg-white/5 px-1 rounded">env</code> object.
                    </p>
                    <textarea
                      value={envVarsRaw}
                      onChange={(e) => {
                        setEnvVarsRaw(e.target.value);
                        setEnvVarsError('');
                      }}
                      className={`glass-input h-48 w-full rounded-[1.25rem] p-3 font-mono text-[10px] text-slate-200 outline-0 resize-none ${
                        envVarsError ? 'border-red-500/40' : 'border-white/10'
                      }`}
                      placeholder='{"API_KEY": "...", "SECRET": "..."}'
                    />
                    {envVarsError && (
                      <p className="text-[9px] text-red-400 mt-1">{envVarsError}</p>
                    )}
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3 font-mono text-[9px] text-slate-500 space-y-1">
                    <div className="mb-1 font-bold text-slate-300">Access in code:</div>
                    <div>{'env.API_KEY → "sk-..."'}</div>
                    <div>{'env.DATABASE_URL → "..."'}</div>
                  </div>
                </>
              ) : (
                /* Guide Panel */
                <div className="space-y-4 text-[10px] leading-relaxed font-medium text-slate-400">
                  <div>
                    <h4 className="mb-1.5 font-bold uppercase tracking-wider text-white">Edge function context</h4>
                    <p className="mb-2">Your functions run securely sandboxed. They receive a single context parameter object:</p>
                    <pre className="rounded-2xl border border-white/10 bg-slate-950/70 p-3 font-mono text-[8px] text-slate-400 whitespace-pre-wrap">
                      {"export default async function handler({ req, env, storage, db }) {\n  // your code here\n}"}
                    </pre>
                  </div>

                  <hr className="border-white/10" />

                  <div>
                    <h4 className="mb-1.5 flex items-center gap-1 font-bold uppercase tracking-wider text-white">
                      <span className="w-1.5 h-1.5 rounded bg-indigo-400 inline-block" />
                      A. databases access (SQLite)
                    </h4>
                    <p className="mb-2">To query your workspace's virtual SQLite databases:</p>
                    <pre className="mb-2 rounded-2xl border border-indigo-500/10 bg-slate-950/70 p-3 font-mono text-[8px] leading-normal text-indigo-200 whitespace-pre-wrap">
                      {"// Query primary database:\nconst res = await db.query(\n  'SELECT * FROM storage_buckets'\n);\n\n// Query specific database:\nconst conn = db.connect('DB_ID');\nconst rows = await conn.query(\n  'SELECT * FROM users WHERE id = ?',\n  [1]\n);"}
                    </pre>
                  </div>

                  <hr className="border-white/10" />

                  <div>
                    <h4 className="mb-1.5 flex items-center gap-1 font-bold uppercase tracking-wider text-white">
                      <span className="w-1.5 h-1.5 rounded bg-emerald-400 inline-block" />
                      B. storage access (S3)
                    </h4>
                    <p className="mb-2">Read or list files inside your S3 object storage:</p>
                    <pre className="rounded-2xl border border-emerald-500/10 bg-slate-950/70 p-3 font-mono text-[8px] leading-normal text-emerald-200 whitespace-pre-wrap">
                      {"// Get file contents:\nconst file = await storage.getObject(\n  'bucket-name',\n  'uploads/avatar.png'\n);\n\n// List files with prefix:\nconst files = await storage.listObjects(\n  'bucket-name',\n  'uploads/'\n);"}
                    </pre>
                  </div>

                  <hr className="border-white/10" />

                  <div>
                    <h4 className="mb-1.5 flex items-center gap-1 font-bold uppercase tracking-wider text-white">
                      <span className="w-1.5 h-1.5 rounded bg-amber-400 inline-block" />
                      C. external API invocation
                    </h4>
                    <p className="mb-2">Send HTTP/HTTPS calls using the globally injected <code className="text-amber-400 font-mono">fetch()</code>:</p>
                    <pre className="rounded-2xl border border-amber-500/10 bg-slate-950/70 p-3 font-mono text-[8px] leading-normal text-amber-200 whitespace-pre-wrap">
                      {"const res = await fetch(\n  'https://api.github.com/users'\n);\nconst data = await res.json();"}
                    </pre>
                  </div>

                  <hr className="border-white/10" />

                  <div>
                    <h4 className="mb-1.5 flex items-center gap-1 font-bold uppercase tracking-wider text-white">
                      <span className="w-1.5 h-1.5 rounded bg-orange-400 inline-block" />
                      D. external auth API call
                    </h4>
                    <p className="mb-2">To call this function from an external app or client, pass the team's key (found in Workspace settings):</p>
                    <pre className="rounded-2xl border border-orange-500/10 bg-slate-950/70 p-3 font-mono text-[8px] leading-normal text-orange-200 whitespace-pre-wrap">
                      {"// Option A: Authorization header\ncurl -X POST \\\n  -H 'Authorization: Bearer YOUR_SERVICE_KEY' \\\n  -d '{\"foo\": \"bar\"}' \\\n  https://api.khawarahemad.com/api/edge-functions/FUNCTION_ID/invoke\n\n// Option B: Query parameter\ncurl -X POST \\\n  https://api.khawarahemad.com/api/edge-functions/FUNCTION_ID/invoke?apikey=YOUR_ANON_KEY"}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-transparent">
      {/* Header */}
      <div className="app-panel-strong mx-4 mt-4 rounded-[1.75rem] px-5 py-4 shrink-0">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-200">
              <Zap size={16} />
            </div>
            <div>
              <div className="app-muted-label mb-1">Edge runtime</div>
              <h2 className="text-xl font-semibold tracking-tight text-white">Edge functions</h2>
              <p className="mt-1 text-sm text-slate-400">Serverless functions with S3 storage access and runtime testing.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchFunctions}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={() => setCreateOpen(true)}
              className="app-button-primary h-11 px-5 text-xs"
            >
              <Plus size={14} />
              New function
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-3">
            <Loader2 className="animate-spin text-orange-200" size={32} />
            <span className="text-xs uppercase tracking-[0.18em]">Loading edge functions</span>
          </div>
        ) : functions.length === 0 ? (
          <div className="glass-card mx-auto flex max-w-xl flex-col items-center justify-center rounded-[2rem] border border-dashed border-white/10 py-24 text-center bg-white/[0.01]">
            <div className="relative mb-6">
              <div className="absolute inset-0 rounded-3xl bg-orange-500/20 blur-2xl animate-pulse" />
              <div className="relative flex h-16 w-16 items-center justify-center rounded-[1.5rem] bg-orange-500/10 border border-orange-500/20 text-orange-200">
                <Zap size={28} />
              </div>
            </div>
            <div className="app-muted-label mb-2">Edge runtime</div>
            <h3 className="mb-2 text-2xl font-semibold tracking-tight text-white">No edge functions deployed</h3>
            <p className="mb-8 max-w-xs text-sm leading-6 text-slate-300">
              Write serverless JavaScript functions that run at the edge. Access your S3 storage, call external APIs, and process webhooks in milliseconds.
            </p>

            <div className="mb-6 w-full space-y-2 rounded-[1.5rem] border border-white/10 bg-white/5 p-4 text-left">
              <div className="app-muted-label mb-2">Capabilities</div>
              {[
                'Full HTTP request/response lifecycle control',
                'Access your KH Cloud Object Storage (S3)',
                'Environment variables injection',
                'External fetch() to any API endpoint',
                'Invoke via HTTP POST from anywhere',
              ].map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px] text-slate-200">
                  <span className="font-bold text-orange-200">✓</span> {f}
                </div>
              ))}
            </div>

            <button
              onClick={() => setCreateOpen(true)}
              className="app-button-primary h-11 px-6 text-xs"
            >
              Deploy first function
            </button>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3 max-w-7xl mx-auto">
            {functions.map((fn) => (
              <div
                key={fn.id}
                onClick={() => setActiveFn(fn)}
                className="glass-card group flex cursor-pointer flex-col justify-between rounded-[1.75rem] border border-white/10 bg-white/[0.01] p-5 transition-all hover:-translate-y-0.5 hover:border-orange-400/20 active:scale-[0.99]"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-200 transition-colors group-hover:bg-orange-500/20">
                      <Zap size={14} />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white">{fn.name}</div>
                      <div className="text-[9px] font-mono text-slate-500">{fn.slug}</div>
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(fn.id); }}
                    className="p-1 text-slate-500 transition-colors opacity-0 group-hover:opacity-100 hover:text-red-300"
                  >
                    <Trash size={12} />
                  </button>
                </div>

                <div className="mb-3 truncate rounded-2xl border border-white/10 bg-slate-950/60 px-2.5 py-1.5 font-mono text-[10px] text-slate-500">
                  POST /api/edge-functions/{fn.id}/invoke
                </div>

                <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wider text-slate-500">
                  <span className="flex items-center gap-1">
                    <Hash size={9} />
                    {fn.invokeCount || 0} calls
                  </span>
                  {fn.lastInvokedAt && (
                    <span className="flex items-center gap-1">
                      <Clock size={9} />
                      {new Date(fn.lastInvokedAt).toLocaleDateString()}
                    </span>
                  )}
                  <span className="text-emerald-500 text-[8px]">● ACTIVE</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Function Modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-6 backdrop-blur-xl">
          <div className="glass-card w-full max-w-sm rounded-[1.75rem] border border-white/10 p-6 shadow-2xl">
            <h3 className="mb-1 text-xl font-semibold tracking-tight text-white">New edge function</h3>
            <p className="mb-5 text-sm text-slate-400">Give your serverless function a name to deploy it.</p>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="app-muted-label block mb-2">Function name</label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newFnName}
                  onChange={(e) => setNewFnName(e.target.value)}
                  placeholder="e.g. process-webhook"
                  className="glass-input h-11 w-full text-sm text-white"
                />
                <p className="mt-1 text-[9px] text-slate-500">Will deploy as slug: {newFnName.toLowerCase().replace(/[^a-z0-9]/g, '-')}</p>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setCreateOpen(false)} className="app-button-secondary h-11 px-4 text-xs">
                  Cancel
                </button>
                <button type="submit" className="app-button-primary h-11 px-4 text-xs">
                  Create Function
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
