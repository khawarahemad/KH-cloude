'use client';

import React, { useState, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { apiRequest } from '@/lib/api';
import {
  Bell,
  Send,
  Save,
  Check,
  AlertCircle,
  Loader2,
  Settings,
  Hash,
} from 'lucide-react';

export default function SettingsTab() {
  const { user, setUser } = useAppStore();

  const [webhookUrl, setWebhookUrl] = useState(user?.discordWebhookUrl || '');
  const [notifyDeploys, setNotifyDeploys] = useState(
    user?.discordNotifyDeploys ?? true
  );
  const [notifyErrors, setNotifyErrors] = useState(
    user?.discordNotifyErrors ?? true
  );
  const [notifyDatabases, setNotifyDatabases] = useState(
    user?.discordNotifyDatabases ?? true
  );

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [testResult, setTestResult] = useState<{
    success: boolean;
    msg: string;
  } | null>(null);

  useEffect(() => {
    if (user) {
      setWebhookUrl(user.discordWebhookUrl || '');
      setNotifyDeploys(user.discordNotifyDeploys ?? true);
      setNotifyErrors(user.discordNotifyErrors ?? true);
      setNotifyDatabases(user.discordNotifyDatabases ?? true);
    }
  }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSaving(true);
    setSuccessMsg('');
    setErrorMsg('');
    setTestResult(null);

    try {
      const updatedUser = await apiRequest(`/users/${user.id}/settings`, {
        method: 'POST',
        body: JSON.stringify({
          discordWebhookUrl: webhookUrl || null,
          discordNotifyDeploys: notifyDeploys,
          discordNotifyErrors: notifyErrors,
          discordNotifyDatabases: notifyDatabases,
        }),
      });

      setUser(updatedUser);
      setSuccessMsg('Settings saved successfully!');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleSendTest = async () => {
    if (!webhookUrl) {
      setErrorMsg('Please enter a Discord Webhook URL to test.');
      return;
    }
    if (!user) return;

    setTesting(true);
    setTestResult(null);
    setSuccessMsg('');
    setErrorMsg('');

    try {
      await apiRequest(`/users/${user.id}/settings/test-discord`, {
        method: 'POST',
        body: JSON.stringify({
          webhookUrl,
        }),
      });

      setTestResult({
        success: true,
        msg: 'Test notification sent! Check your Discord channel.',
      });
    } catch (err: any) {
      setTestResult({
        success: false,
        msg: err.message || 'Failed to send test notification.',
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="rw-page">
      {/* Page header */}
      <div className="rw-page-header">
        <div>
          <h1 className="rw-page-title">User Settings</h1>
          <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '2px' }}>
            Manage account settings, webhook integrations, and notification
            preferences.
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="rw-page-content">
        <div
          style={{
            maxWidth: '640px',
            display: 'flex',
            flexDirection: 'column',
            gap: '24px',
          }}
        >
          {/* Form */}
          <form
            onSubmit={handleSave}
            style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}
          >
            {/* Status alerts */}
            {successMsg && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  backgroundColor: 'rgba(34, 197, 94, 0.1)',
                  border: '1px solid rgba(34, 197, 94, 0.25)',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  color: '#22c55e',
                  fontSize: '13px',
                }}
              >
                <Check size={16} />
                <span>{successMsg}</span>
              </div>
            )}

            {errorMsg && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  color: '#ef4444',
                  fontSize: '13px',
                }}
              >
                <AlertCircle size={16} />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Discord webhook section */}
            <div
              style={{
                backgroundColor: '#111318',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: '12px',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(124,58,237,0.12)',
                    border: '1px solid rgba(124,58,237,0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Bell size={16} style={{ color: '#a78bfa' }} />
                </div>
                <div>
                  <h3
                    style={{
                      fontSize: '14px',
                      fontWeight: 600,
                      color: '#f1f3f6',
                    }}
                  >
                    Discord Integration
                  </h3>
                  <p style={{ fontSize: '12px', color: '#6b7280' }}>
                    Receive real-time updates directly to your Discord channel.
                  </p>
                </div>
              </div>

              {/* Webhook input */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label className="rw-label">Discord Webhook URL</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <span
                      style={{
                        position: 'absolute',
                        left: '12px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: '#4b5563',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      <Hash size={14} />
                    </span>
                    <input
                      type="url"
                      value={webhookUrl}
                      onChange={(e) => setWebhookUrl(e.target.value)}
                      placeholder="https://discord.com/api/webhooks/..."
                      className="rw-input"
                      style={{ paddingLeft: '32px', width: '100%' }}
                    />
                  </div>
                  <button
                    type="button"
                    disabled={testing || !webhookUrl}
                    onClick={handleSendTest}
                    className="rw-btn-secondary"
                    style={{
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    {testing ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Send size={13} />
                    )}
                    Test
                  </button>
                </div>
                <p style={{ fontSize: '11px', color: '#4b5563', marginTop: '2px' }}>
                  Provide a webhook URL created in your Discord channel's
                  Integrations settings.
                </p>
              </div>

              {/* Test result display */}
              {testResult && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    backgroundColor: testResult.success
                      ? 'rgba(34, 197, 94, 0.08)'
                      : 'rgba(239, 68, 68, 0.08)',
                    border: testResult.success
                      ? '1px solid rgba(34, 197, 94, 0.15)'
                      : '1px solid rgba(239, 68, 68, 0.15)',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: testResult.success ? '#22c55e' : '#ef4444',
                  }}
                >
                  {testResult.success ? (
                    <Check size={14} />
                  ) : (
                    <AlertCircle size={14} />
                  )}
                  <span>{testResult.msg}</span>
                </div>
              )}

              {/* Notification Toggles */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  marginTop: '10px',
                  borderTop: '1px solid rgba(255,255,255,0.06)',
                  paddingTop: '16px',
                }}
              >
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: '#4b5563',
                  }}
                >
                  Notification Preferences
                </div>

                {[
                  {
                    id: 'deploys',
                    label: 'Deployments',
                    desc: 'Notify when builds start, complete successfully, or fail.',
                    value: notifyDeploys,
                    setter: setNotifyDeploys,
                  },
                  {
                    id: 'databases',
                    label: 'Databases',
                    desc: 'Notify on database creation, deletion, or online status.',
                    value: notifyDatabases,
                    setter: setNotifyDatabases,
                  },
                  {
                    id: 'errors',
                    label: 'Errors & Failures',
                    desc: 'Receive alerts when builds fail or containers crash.',
                    value: notifyErrors,
                    setter: setNotifyErrors,
                  },
                ].map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: '16px',
                      padding: '8px 0',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span
                        style={{
                          fontSize: '13px',
                          fontWeight: 500,
                          color: '#d1d5db',
                        }}
                      >
                        {item.label}
                      </span>
                      <span style={{ fontSize: '11px', color: '#6b7280' }}>
                        {item.desc}
                      </span>
                    </div>

                    {/* Styled Checkbox / Toggle Switch */}
                    <label
                      style={{
                        position: 'relative',
                        display: 'inline-block',
                        width: '38px',
                        height: '20px',
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={item.value}
                        onChange={(e) => item.setter(e.target.checked)}
                        style={{
                          opacity: 0,
                          width: 0,
                          height: 0,
                        }}
                      />
                      <span
                        style={{
                          position: 'absolute',
                          inset: 0,
                          backgroundColor: item.value
                            ? '#7c3aed'
                            : 'rgba(255,255,255,0.08)',
                          borderRadius: '100px',
                          border: item.value
                            ? '1px solid rgba(124,58,237,0.4)'
                            : '1px solid rgba(255,255,255,0.09)',
                          transition: 'all 0.2s ease',
                        }}
                      >
                        <span
                          style={{
                            position: 'absolute',
                            left: item.value ? '20px' : '3px',
                            bottom: '2px',
                            width: '14px',
                            height: '14px',
                            backgroundColor: item.value ? '#ffffff' : '#4b5563',
                            borderRadius: '50%',
                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                            boxShadow: item.value
                              ? '0 1px 3px rgba(0,0,0,0.3)'
                              : 'none',
                          }}
                        />
                      </span>
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* Save bar */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                marginTop: '4px',
              }}
            >
              <button
                type="submit"
                disabled={saving}
                className="rw-btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                {saving ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Save size={14} />
                )}
                Save Changes
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
