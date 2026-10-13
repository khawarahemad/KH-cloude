'use client';

import React, { useState, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { apiRequest } from '@/lib/api';
import { useDialog } from './CustomDialogProvider';
import { 
  Loader2, ShieldCheck, Activity, Copy, Eye, EyeOff, 
  RefreshCw, Trash2, CheckCircle2, AlertCircle, Server, Terminal, Wrench 
} from 'lucide-react';

export default function ProxiesPanel({ projectId }: { projectId: string }) {
  const { user } = useAppStore();
  const { confirm, alert } = useDialog();

  const [loading, setLoading] = useState(true);
  const [resources, setResources] = useState<any[]>([]);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  
  // Connection info state
  const [connectionInfo, setConnectionInfo] = useState<any | null>(null);
  const [showUri, setShowUri] = useState(false);
  const [copied, setCopied] = useState(false);

  // Diagnostics state
  const [diagnostics, setDiagnostics] = useState<any | null>(null);
  const [diagnosing, setDiagnosing] = useState(false);

  const fetchResources = async () => {
    try {
      const data = await apiRequest(`/projects/${projectId}/networking/resources`);
      setResources(data);
    } catch (err: any) {
      if (err.status !== 401 && err.status !== 403) {
        console.error('Failed to load proxy resources:', err);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResources();
  }, [projectId]);

  // Clean polling when a resource is in transition
  useEffect(() => {
    const isBusy = resources.some(r => r.status === 'PROVISIONING' || r.status === 'REMOVING');
    if (!isBusy) return;

    const interval = setInterval(() => {
      fetchResources();
    }, 2500);
    return () => clearInterval(interval);
  }, [resources, projectId]);

  const handleEnableProxy = async () => {
    setActionInProgress('enable');
    try {
      await apiRequest(`/projects/${projectId}/networking/resources`, {
        method: 'POST',
        body: JSON.stringify({ type: 'WEBSOCKET_PROXY', provider: 'XRAY' })
      });
      await fetchResources();
    } catch (err: any) {
      alert({
        title: 'Provisioning Failed',
        message: err.message || 'Failed to enable proxy.',
        type: 'error'
      });
    } finally {
      setActionInProgress(null);
    }
  };

  const handleReconcile = async (resourceId: string) => {
    setActionInProgress(`reconcile-${resourceId}`);
    try {
      await apiRequest(`/projects/${projectId}/networking/resources/${resourceId}/reconcile`, {
        method: 'POST'
      });
      await fetchResources();
      alert({
        title: 'Reconciliation Started',
        message: 'Proxy configuration has been synchronized with Traefik edge routing.',
        type: 'info'
      });
    } catch (err: any) {
      alert({
        title: 'Reconciliation Failed',
        message: err.message || 'Failed to re-sync proxy.',
        type: 'error'
      });
    } finally {
      setActionInProgress(null);
    }
  };

  const handleDisableProxy = async (resourceId: string) => {
    const confirmed = await confirm({
      title: 'Disable Proxy',
      message: 'Are you sure you want to disable this proxy? All current connections will be dropped.',
      confirmText: 'Disable',
      isDanger: true,
    });
    if (!confirmed) return;

    setActionInProgress(`disable-${resourceId}`);
    try {
      await apiRequest(`/projects/${projectId}/networking/resources/${resourceId}`, {
        method: 'DELETE'
      });
      await fetchResources();
      if (connectionInfo?.id === resourceId) setConnectionInfo(null);
      setDiagnostics(null);
    } catch (err: any) {
      alert({
        title: 'Action Failed',
        message: err.message || 'Failed to disable proxy.',
        type: 'error'
      });
    } finally {
      setActionInProgress(null);
    }
  };

  const handleRegenerate = async (resourceId: string) => {
    const confirmed = await confirm({
      title: 'Regenerate Credential',
      message: 'All existing proxy connections using the current credential will immediately stop working. Continue?',
      confirmText: 'Regenerate',
      isDanger: true,
    });
    if (!confirmed) return;

    setActionInProgress(`regenerate-${resourceId}`);
    try {
      await apiRequest(`/projects/${projectId}/networking/resources/${resourceId}/regenerate`, {
        method: 'POST'
      });
      await fetchResources();
      setConnectionInfo(null);
      setShowUri(false);
      setDiagnostics(null);
    } catch (err: any) {
      alert({
        title: 'Regeneration Failed',
        message: err.message || 'Failed to rotate credential.',
        type: 'error'
      });
    } finally {
      setActionInProgress(null);
    }
  };

  const handleShowConnection = async (resourceId: string) => {
    if (connectionInfo?.id === resourceId) {
      setConnectionInfo(null);
      return;
    }
    
    setActionInProgress(`fetch-conn-${resourceId}`);
    try {
      const data = await apiRequest(`/projects/${projectId}/networking/resources/${resourceId}`);
      setConnectionInfo(data);
      setShowUri(false);
    } catch (err: any) {
      alert({
        title: 'Access Denied',
        message: err.message || 'Failed to retrieve connection information.',
        type: 'error'
      });
    } finally {
      setActionInProgress(null);
    }
  };

  const handleDiagnose = async (resourceId: string) => {
    setDiagnosing(true);
    try {
      const data = await apiRequest(`/projects/${projectId}/networking/resources/${resourceId}/diagnose`);
      setDiagnostics(data);
    } catch (err: any) {
      alert({
        title: 'Diagnostics Failed',
        message: err.message || 'Unable to query proxy container status.',
        type: 'error'
      });
    } finally {
      setDiagnosing(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  const wsProxy = resources.find(r => r.type === 'WEBSOCKET_PROXY');

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '20px', color: '#6b7280' }}>
        <Loader2 size={16} className="animate-spin" /> Loading proxy configuration...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '40px' }}>
      <div>
        <div style={{ fontSize: '11px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#4b5563', marginBottom: '3px' }}>Proxies</div>
        <div style={{ fontSize: '12px', color: '#6b7280' }}>Deploy protocol-specific networking proxies directly to this project container.</div>
      </div>

      {/* WebSocket Proxy Card */}
      <div className="rw-card" style={{ padding: '20px', maxWidth: '640px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#f1f3f6' }}>WebSocket Proxy</h3>
              {wsProxy && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 600,
                  backgroundColor: wsProxy.status === 'READY' ? 'rgba(16,185,129,0.1)' : wsProxy.status === 'ERROR' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
                  color: wsProxy.status === 'READY' ? '#34d399' : wsProxy.status === 'ERROR' ? '#f87171' : '#fbbf24'
                }}>
                  {wsProxy.status === 'READY' && <CheckCircle2 size={10} />}
                  {wsProxy.status === 'ERROR' && <AlertCircle size={10} />}
                  {wsProxy.status === 'PROVISIONING' && <Loader2 size={10} className="animate-spin" />}
                  {wsProxy.status === 'REMOVING' && <Loader2 size={10} className="animate-spin" />}
                  {wsProxy.status}
                </div>
              )}
            </div>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#6b7280' }}>Secure VLESS WebSocket proxy routed via Traefik edge (TLS port 443)</p>
          </div>
          
          {!wsProxy && (
            <button 
              className="rw-btn rw-btn-primary" 
              onClick={handleEnableProxy}
              disabled={actionInProgress === 'enable'}
            >
              {actionInProgress === 'enable' ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
              Enable Proxy
            </button>
          )}
        </div>

        {wsProxy && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', padding: '14px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div>
                <div style={{ fontSize: '10px', color: '#6b7280', marginBottom: '2px', textTransform: 'uppercase' }}>Provider</div>
                <div style={{ fontSize: '12px', color: '#e5e7eb', fontWeight: 600 }}>{wsProxy.provider}</div>
              </div>
              <div>
                <div style={{ fontSize: '10px', color: '#6b7280', marginBottom: '2px', textTransform: 'uppercase' }}>Protocol</div>
                <div style={{ fontSize: '12px', color: '#e5e7eb', fontWeight: 600 }}>VLESS</div>
              </div>
              <div>
                <div style={{ fontSize: '10px', color: '#6b7280', marginBottom: '2px', textTransform: 'uppercase' }}>Transport</div>
                <div style={{ fontSize: '12px', color: '#e5e7eb', fontWeight: 600 }}>WS (TLS 443)</div>
              </div>
              <div>
                <div style={{ fontSize: '10px', color: '#6b7280', marginBottom: '2px', textTransform: 'uppercase' }}>Path</div>
                <div style={{ fontSize: '12px', color: '#a78bfa', fontWeight: 600, fontFamily: 'monospace' }}>/v2ray-ws</div>
              </div>
            </div>

            {wsProxy.status === 'ERROR' && (
              <div style={{ padding: '14px', borderRadius: '8px', backgroundColor: 'rgba(239,68,68,0.08)', color: '#fca5a5', fontSize: '12px', border: '1px solid rgba(239,68,68,0.2)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                  <AlertCircle size={16} />
                  Proxy provisioning encountered an error
                </div>
                {wsProxy.errorDetails && (
                  <div style={{ fontSize: '11px', fontFamily: 'monospace', backgroundColor: 'rgba(0,0,0,0.4)', padding: '8px 10px', borderRadius: '6px', color: '#f87171', wordBreak: 'break-all' }}>
                    {wsProxy.errorDetails}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                  <button 
                    className="rw-btn rw-btn-primary" 
                    style={{ fontSize: '11px', padding: '4px 10px', height: 'auto' }}
                    onClick={() => handleReconcile(wsProxy.id)}
                    disabled={actionInProgress !== null}
                  >
                    <RefreshCw size={12} className={actionInProgress?.startsWith('reconcile') ? 'animate-spin' : ''} />
                    Retry Provisioning
                  </button>
                  <button 
                    className="rw-btn" 
                    style={{ fontSize: '11px', padding: '4px 10px', height: 'auto', backgroundColor: '#181b22', border: '1px solid rgba(255,255,255,0.1)' }}
                    onClick={() => handleDiagnose(wsProxy.id)}
                    disabled={diagnosing}
                  >
                    <Wrench size={12} />
                    Run Diagnostics
                  </button>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button 
                className="rw-btn" 
                style={{ backgroundColor: '#181b22', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e7eb' }}
                onClick={() => handleShowConnection(wsProxy.id)}
                disabled={wsProxy.status !== 'READY' || actionInProgress?.startsWith('fetch-conn')}
              >
                {actionInProgress === `fetch-conn-${wsProxy.id}` ? <Loader2 size={14} className="animate-spin" /> : <Activity size={14} />}
                {connectionInfo?.id === wsProxy.id ? 'Hide Connection' : 'Show Connection'}
              </button>

              <button 
                className="rw-btn" 
                style={{ backgroundColor: '#181b22', border: '1px solid rgba(255,255,255,0.1)', color: '#9ca3af' }}
                onClick={() => handleDiagnose(wsProxy.id)}
                disabled={diagnosing || actionInProgress !== null}
                title="Inspect Docker runtime container and health"
              >
                {diagnosing ? <Loader2 size={14} className="animate-spin" /> : <Server size={14} />}
                Diagnose
              </button>
              
              <button 
                className="rw-btn" 
                style={{ backgroundColor: '#181b22', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e7eb' }}
                onClick={() => handleRegenerate(wsProxy.id)}
                disabled={wsProxy.status === 'PROVISIONING' || wsProxy.status === 'REMOVING' || actionInProgress !== null}
              >
                {actionInProgress === `regenerate-${wsProxy.id}` ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Regenerate Credential
              </button>

              <button 
                className="rw-btn" 
                style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}
                onClick={() => handleDisableProxy(wsProxy.id)}
                disabled={wsProxy.status === 'PROVISIONING' || wsProxy.status === 'REMOVING' || actionInProgress !== null}
              >
                {actionInProgress === `disable-${wsProxy.id}` ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Disable
              </button>
            </div>

            {/* Diagnostics Drawer */}
            {diagnostics && (
              <div style={{ padding: '14px', backgroundColor: '#0d1117', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#e5e7eb', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Server size={14} style={{ color: diagnostics.running ? '#34d399' : '#f87171' }} />
                    Proxy Runtime Health
                  </div>
                  <div style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{
                      padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600,
                      backgroundColor: diagnostics.running ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                      color: diagnostics.running ? '#34d399' : '#f87171'
                    }}>
                      Container: {diagnostics.containerStatus || (diagnostics.running ? 'running' : 'stopped')}
                    </span>
                    <button 
                      onClick={() => setDiagnostics(null)} 
                      style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '11px', marginLeft: '6px' }}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', fontSize: '11px', backgroundColor: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '6px' }}>
                  <div>
                    <span style={{ color: '#6b7280' }}>Edge Domain: </span>
                    <span style={{ color: '#e5e7eb', fontFamily: 'monospace' }}>{diagnostics.canonicalDomain}</span>
                  </div>
                  <div>
                    <span style={{ color: '#6b7280' }}>Internal Port: </span>
                    <span style={{ color: '#e5e7eb', fontFamily: 'monospace' }}>10000 (ws)</span>
                  </div>
                  <div>
                    <span style={{ color: '#6b7280' }}>Exit Code: </span>
                    <span style={{ color: diagnostics.exitCode === 0 || diagnostics.running ? '#34d399' : '#f87171', fontFamily: 'monospace' }}>
                      {diagnostics.exitCode ?? (diagnostics.running ? 0 : 'N/A')}
                    </span>
                  </div>
                </div>

                {diagnostics.logs && (
                  <div style={{ marginTop: '4px' }}>
                    <div style={{ fontSize: '10px', color: '#6b7280', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Terminal size={10} /> Container Logs
                    </div>
                    <pre style={{ margin: 0, padding: '8px 10px', backgroundColor: '#000', borderRadius: '6px', fontSize: '10px', color: '#9ca3af', fontFamily: 'monospace', maxHeight: '120px', overflowY: 'auto' }}>
                      {diagnostics.logs}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {/* Connection Information Drawer */}
            {connectionInfo?.id === wsProxy.id && connectionInfo.connectionInfo && (
              <div style={{ marginTop: '8px', padding: '16px', backgroundColor: '#0e1015', borderRadius: '8px', border: '1px solid rgba(124,58,237,0.3)', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#c4b5fd' }}>VLESS Connection String (URI)</div>
                    <button 
                      onClick={() => copyToClipboard(connectionInfo.connectionInfo.uri)}
                      className="rw-btn" 
                      style={{ fontSize: '11px', padding: '4px 8px', height: 'auto', backgroundColor: copied ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.1)' }}
                    >
                      {copied ? <CheckCircle2 size={12} style={{ color: '#34d399' }}/> : <Copy size={12} />}
                      {copied ? 'Copied' : 'Copy URI'}
                    </button>
                  </div>
                  
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input 
                      type={showUri ? "text" : "password"} 
                      readOnly 
                      value={connectionInfo.connectionInfo.uri}
                      style={{ 
                        width: '100%', padding: '10px 40px 10px 12px', backgroundColor: '#000', 
                        border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', 
                        color: '#a78bfa', fontFamily: 'monospace', fontSize: '11px', outline: 'none'
                      }}
                    />
                    <button 
                      onClick={() => setShowUri(!showUri)}
                      style={{ position: 'absolute', right: '12px', background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: 0, display: 'flex' }}
                    >
                      {showUri ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                {/* Manual Configuration Breakdown Table */}
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Manual Client Parameters
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px', fontSize: '11px', backgroundColor: '#000', padding: '10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div>
                      <span style={{ color: '#6b7280' }}>Address: </span>
                      <span style={{ color: '#e5e7eb', fontFamily: 'monospace' }}>{connectionInfo.connectionInfo.address}</span>
                    </div>
                    <div>
                      <span style={{ color: '#6b7280' }}>Port: </span>
                      <span style={{ color: '#e5e7eb', fontFamily: 'monospace' }}>{connectionInfo.connectionInfo.port}</span>
                    </div>
                    <div>
                      <span style={{ color: '#6b7280' }}>UUID: </span>
                      <span style={{ color: '#a78bfa', fontFamily: 'monospace' }}>{connectionInfo.connectionInfo.uuid}</span>
                    </div>
                    <div>
                      <span style={{ color: '#6b7280' }}>Transport: </span>
                      <span style={{ color: '#e5e7eb', fontFamily: 'monospace' }}>{connectionInfo.connectionInfo.transport} (WebSocket)</span>
                    </div>
                    <div>
                      <span style={{ color: '#6b7280' }}>Path: </span>
                      <span style={{ color: '#a78bfa', fontFamily: 'monospace' }}>{connectionInfo.connectionInfo.path}</span>
                    </div>
                    <div>
                      <span style={{ color: '#6b7280' }}>TLS / SNI: </span>
                      <span style={{ color: '#e5e7eb', fontFamily: 'monospace' }}>{connectionInfo.connectionInfo.sni}</span>
                    </div>
                  </div>
                </div>
                
                <div style={{ fontSize: '11px', color: '#6b7280' }}>
                  Import this URI or parameters into <strong>v2rayN</strong>, <strong>Shadowrocket</strong>, <strong>Nekobox</strong>, or <strong>Sing-box</strong>. Ensure your project domain DNS is resolving to this server and SSL certificate has verified.
                </div>
              </div>
            )}

          </div>
        )}
      </div>

    </div>
  );
}

