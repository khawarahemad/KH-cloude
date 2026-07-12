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
  const [sidePanel, setSidePanel] = useState<'env' | 'invoke'>('invoke');
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
      <div className="flex-1 flex flex-col min-h-0 bg-[#030303]">
        {/* Header */}
        <div className="h-14 border-b border-white/5 px-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveFn(null)}
              className="p-1.5 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white transition-colors"
            >
              <ArrowLeft size={15} />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-400">
                <Zap size={12} />
              </div>
              <h2 className="text-sm font-bold text-white">{activeFn.name}</h2>
              <span className="text-[9px] font-mono text-zinc-500 bg-white/5 px-1.5 py-0.5 rounded">{activeFn.slug}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-[10px] text-zinc-600 font-mono mr-1 flex items-center gap-1">
              <Hash size={10} />
              <span>{activeFn.invokeCount || 0} invocations</span>
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className="h-8 px-4 rounded-lg bg-white hover:bg-zinc-200 text-black font-bold text-xs transition-colors active:scale-95 flex items-center gap-1.5 disabled:opacity-50"
            >
              {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
              {saving ? 'Saving...' : 'Save & Deploy'}
            </button>
          </div>
        </div>

        {/* Editor + Side Panel */}
        <div className="flex-1 flex min-h-0">

          {/* Code Editor */}
          <div className="flex-1 flex flex-col min-h-0 border-r border-white/5">
            <div className="h-8 bg-[#040406] border-b border-white/5 px-4 flex items-center gap-3 text-[10px] font-bold text-zinc-600 shrink-0">
              <span className="text-orange-400/80">handler.js</span>
              <span>·</span>
              <span>KH Cloud Edge Runtime v1</span>
            </div>
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              spellCheck={false}
              className="flex-1 w-full bg-[#020204] p-5 font-mono text-[11px] text-zinc-300 outline-0 resize-none leading-relaxed"
              style={{ tabSize: 2 }}
            />
          </div>

          {/* Side Panel */}
          <div className="w-80 flex flex-col min-h-0 bg-[#040406] shrink-0">
            
            {/* Side Panel Tabs */}
            <div className="h-8 border-b border-white/5 flex text-[10px] font-bold shrink-0">
              <button
                onClick={() => setSidePanel('invoke')}
                className={`flex-1 flex items-center justify-center gap-1.5 transition-colors ${
                  sidePanel === 'invoke' ? 'text-orange-400 border-b border-orange-400' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <Play size={10} />
                Test & Invoke
              </button>
              <button
                onClick={() => setSidePanel('env')}
                className={`flex-1 flex items-center justify-center gap-1.5 transition-colors ${
                  sidePanel === 'env' ? 'text-orange-400 border-b border-orange-400' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <Settings size={10} />
                Environment
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {sidePanel === 'invoke' ? (
                <>
                  {/* Invoke URL */}
                  <div>
                    <label className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 block mb-1.5">Invoke URL</label>
                    <div className="flex items-center gap-2 bg-black/40 border border-white/5 rounded-lg px-2.5 py-1.5 font-mono text-[9px] text-zinc-400">
                      <span className="flex-1 truncate">{getInvokeUrl(activeFn)}</span>
                      <button
                        onClick={() => handleCopy(getInvokeUrl(activeFn), 'url')}
                        className="text-zinc-600 hover:text-white shrink-0"
                      >
                        {copiedText === 'url' ? <Check size={10} className="text-emerald-400" /> : <ChevronRight size={10} />}
                      </button>
                    </div>
                  </div>

                  {/* Test Payload */}
                  <div>
                    <label className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 block mb-1.5">Test Payload (JSON)</label>
                    <textarea
                      value={invokePayload}
                      onChange={(e) => setInvokePayload(e.target.value)}
                      className="w-full h-32 bg-black/40 border border-white/5 rounded-lg p-2.5 font-mono text-[10px] text-zinc-300 outline-0 resize-none focus:border-white/10"
                    />
                  </div>

                  <button
                    onClick={handleInvoke}
                    disabled={invoking}
                    className="w-full h-8 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors active:scale-95 disabled:opacity-50"
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
                          <span className="text-zinc-600 font-mono ml-auto">{invokeResult.duration}ms</span>
                        )}
                      </div>

                      {invokeResult.error && (
                        <p className="text-[10px] font-mono text-red-400 break-all">{invokeResult.error}</p>
                      )}

                      {invokeResult.logs && invokeResult.logs.length > 0 && (
                        <div className="bg-black/40 rounded-lg p-2 font-mono text-[9px] text-zinc-400 space-y-0.5">
                          {invokeResult.logs.map((log: string, i: number) => (
                            <div key={i}>{log}</div>
                          ))}
                        </div>
                      )}

                      {invokeResult.result && (
                        <div className="bg-black/40 rounded-lg p-2">
                          <div className="text-[8px] font-bold uppercase text-zinc-600 mb-1.5">Response Body</div>
                          <pre className="font-mono text-[9px] text-zinc-300 overflow-auto max-h-40 select-text whitespace-pre-wrap">
                            {JSON.stringify(invokeResult.result, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div>
                    <label className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">
                      Environment Variables (JSON)
                    </label>
                    <p className="text-[9px] text-zinc-600 mb-2">
                      Accessible inside your function via the <code className="bg-white/5 px-1 rounded">env</code> object.
                    </p>
                    <textarea
                      value={envVarsRaw}
                      onChange={(e) => {
                        setEnvVarsRaw(e.target.value);
                        setEnvVarsError('');
                      }}
                      className={`w-full h-48 bg-black/40 border rounded-lg p-2.5 font-mono text-[10px] text-zinc-300 outline-0 resize-none focus:border-white/10 ${
                        envVarsError ? 'border-red-500/40' : 'border-white/5'
                      }`}
                      placeholder='{"API_KEY": "...", "SECRET": "..."}'
                    />
                    {envVarsError && (
                      <p className="text-[9px] text-red-400 mt-1">{envVarsError}</p>
                    )}
                  </div>

                  <div className="p-3 bg-black/30 border border-white/5 rounded-xl text-[9px] text-zinc-500 font-mono space-y-1">
                    <div className="text-zinc-400 font-bold mb-1">Access in code:</div>
                    <div>{'env.API_KEY → "sk-..."'}</div>
                    <div>{'env.DATABASE_URL → "..."'}</div>
                  </div>
                </>
              )}
            </div>
          </div>

        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#030303]">
      {/* Header */}
      <div className="h-16 border-b border-white/5 px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-400">
            <Zap size={16} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">Edge Functions</h2>
            <p className="text-[10px] text-zinc-500">Serverless functions with S3 storage access</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchFunctions}
            className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white transition-colors"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setCreateOpen(true)}
            className="h-9 px-3.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-semibold text-xs transition-colors flex items-center gap-1.5 active:scale-95"
          >
            <Plus size={14} />
            New Function
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-500 gap-3">
            <Loader2 className="animate-spin text-orange-400" size={32} />
            <span className="text-xs">Loading edge functions...</span>
          </div>
        ) : functions.length === 0 ? (
          <div className="flex flex-col items-center justify-center border border-dashed border-white/10 rounded-2xl py-24 text-center max-w-lg mx-auto bg-white/[0.01]">
            <div className="relative mb-6">
              <div className="absolute inset-0 rounded-3xl bg-orange-500/20 blur-2xl animate-pulse" />
              <div className="relative w-16 h-16 rounded-3xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400">
                <Zap size={28} />
              </div>
            </div>
            <h3 className="font-extrabold text-lg text-white mb-2">No Edge Functions deployed</h3>
            <p className="text-xs text-zinc-400 max-w-xs mb-8 leading-relaxed">
              Write serverless JavaScript functions that run at the edge. Access your S3 storage, call external APIs, and process webhooks in milliseconds.
            </p>

            <div className="w-full text-left bg-black/30 border border-white/5 rounded-2xl p-4 mb-6 space-y-2">
              <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Capabilities:</div>
              {[
                'Full HTTP request/response lifecycle control',
                'Access your KH Cloud Object Storage (S3)',
                'Environment variables injection',
                'External fetch() to any API endpoint',
                'Invoke via HTTP POST from anywhere',
              ].map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px] text-zinc-300">
                  <span className="text-orange-400 font-bold">✓</span> {f}
                </div>
              ))}
            </div>

            <button
              onClick={() => setCreateOpen(true)}
              className="h-10 px-6 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs transition-all active:scale-95"
            >
              Deploy first function
            </button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 max-w-7xl mx-auto">
            {functions.map((fn) => (
              <div
                key={fn.id}
                onClick={() => setActiveFn(fn)}
                className="glass-card p-5 rounded-2xl border border-white/5 hover:border-orange-500/20 transition-all cursor-pointer bg-white/[0.01] group active:scale-[0.98]"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-400 group-hover:bg-orange-500/20 transition-colors">
                      <Zap size={14} />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-white">{fn.name}</div>
                      <div className="text-[9px] font-mono text-zinc-500">{fn.slug}</div>
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(fn.id); }}
                    className="p-1 text-zinc-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Trash size={12} />
                  </button>
                </div>

                <div className="text-[10px] font-mono text-zinc-500 bg-black/30 border border-white/5 rounded-lg px-2.5 py-1.5 truncate mb-3">
                  POST /api/edge-functions/{fn.id}/invoke
                </div>

                <div className="flex items-center justify-between text-[9px] text-zinc-600 font-bold uppercase tracking-wider">
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
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="glass p-6 rounded-2xl max-w-sm w-full border border-white/10 shadow-2xl">
            <h3 className="text-base font-bold mb-1">New Edge Function</h3>
            <p className="text-xs text-zinc-400 mb-5">Give your serverless function a name to deploy it.</p>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">Function Name</label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newFnName}
                  onChange={(e) => setNewFnName(e.target.value)}
                  placeholder="e.g. process-webhook"
                  className="w-full h-10 px-3 rounded-xl glass-input text-sm text-white"
                />
                <p className="text-[9px] text-zinc-600 mt-1">Will deploy as slug: {newFnName.toLowerCase().replace(/[^a-z0-9]/g, '-')}</p>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setCreateOpen(false)} className="h-9 px-4 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-semibold text-zinc-300">
                  Cancel
                </button>
                <button type="submit" className="h-9 px-4 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-semibold text-xs active:scale-95">
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
