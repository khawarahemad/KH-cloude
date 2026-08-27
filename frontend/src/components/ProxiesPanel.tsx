'use client';

import React, { useState, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { apiRequest } from '@/lib/api';
import { useDialog } from './CustomDialogProvider';
import { Loader2, ShieldCheck, Activity, Copy, Eye, EyeOff, RefreshCw, Trash2, CheckCircle2, AlertCircle } from 'lucide-react';

export default function ProxiesPanel({ projectId }: { projectId: string }) {
  const { user } = useAppStore();
  const { confirm, alert } = useDialog();

  const [loading, setLoading] = useState(true);
  const [resources, setResources] = useState<any[]>([]);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  
  // Connection info modal/reveal state
  const [connectionInfo, setConnectionInfo] = useState<any | null>(null);
  const [showUri, setShowUri] = useState(false);
  const [copied, setCopied] = useState(false);

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
    // Poll every 5s if any resource is provisioning
    const interval = setInterval(() => {
      setResources(prev => {
        if (prev.some(r => r.status === 'PROVISIONING' || r.status === 'REMOVING')) {
          fetchResources();
        }
        return prev;
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [projectId]);

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
      <div className="rw-card" style={{ padding: '20px', maxWidth: '600px' }}>
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
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#6b7280' }}>Secure WebSocket proxy powered by Xray (VLESS)</p>
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
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', padding: '16px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div>
                <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '2px' }}>Provider</div>
                <div style={{ fontSize: '13px', color: '#e5e7eb', fontWeight: 500 }}>{wsProxy.provider}</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '2px' }}>Protocol</div>
                <div style={{ fontSize: '13px', color: '#e5e7eb', fontWeight: 500 }}>VLESS</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '2px' }}>Transport</div>
                <div style={{ fontSize: '13px', color: '#e5e7eb', fontWeight: 500 }}>WebSocket (ws)</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '2px' }}>Path</div>
                <div style={{ fontSize: '13px', color: '#e5e7eb', fontWeight: 500, fontFamily: 'monospace' }}>/v2ray-ws</div>
              </div>
            </div>

            {wsProxy.status === 'ERROR' && (
              <div style={{ padding: '12px', borderRadius: '6px', backgroundColor: 'rgba(239,68,68,0.1)', color: '#fca5a5', fontSize: '12px', border: '1px solid rgba(239,68,68,0.2)', display: 'flex', gap: '8px' }}>
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <div style={{ fontWeight: 600, marginBottom: '2px' }}>Proxy provisioning failed.</div>
                  <div style={{ opacity: 0.8 }}>The backend failed to reconcile the desired networking state. Check project logs or contact support.</div>
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

            {/* Connection Information Drawer */}
            {connectionInfo?.id === wsProxy.id && connectionInfo.connectionInfo && (
              <div style={{ marginTop: '8px', padding: '16px', backgroundColor: '#0e1015', borderRadius: '8px', border: '1px solid rgba(124,58,237,0.3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#c4b5fd' }}>Connection String (URI)</div>
                  <button 
                    onClick={() => copyToClipboard(connectionInfo.connectionInfo.uri)}
                    className="rw-btn" 
                    style={{ fontSize: '11px', padding: '4px 8px', height: 'auto', backgroundColor: copied ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.1)' }}
                  >
                    {copied ? <CheckCircle2 size={12} style={{ color: '#34d399' }}/> : <Copy size={12} />}
                    {copied ? 'Copied' : 'Copy'}
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
                      color: '#a78bfa', fontFamily: 'monospace', fontSize: '12px', outline: 'none'
                    }}
                  />
                  <button 
                    onClick={() => setShowUri(!showUri)}
                    style={{ position: 'absolute', right: '12px', background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: 0, display: 'flex' }}
                  >
                    {showUri ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                
                <div style={{ marginTop: '12px', fontSize: '11px', color: '#6b7280' }}>
                  Import this URI into v2rayN, Nekobox, Shadowrocket, or any VLESS-compatible client. Ensure your project's custom domain is properly pointed via DNS.
                </div>
              </div>
            )}

          </div>
        )}
      </div>

    </div>
  );
}
