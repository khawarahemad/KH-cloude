'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { apiRequest, getBaseDomain } from '@/lib/api';
import { useDialog } from './CustomDialogProvider';
import {
  Mail,
  Send,
  Globe,
  Key,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Plus,
  Trash2,
  Copy,
  Check,
  Code2,
  ExternalLink,
  Search,
  AlertTriangle,
  Server,
  FileText,
  ChevronRight,
  Info,
} from 'lucide-react';

type MailSubTab = 'overview' | 'domains' | 'keys' | 'logs';

interface MailDomain {
  id: string;
  domain: string;
  dkimSelector: string;
  dkimPublicKey: string;
  spfRecord: string;
  dmarcRecord: string;
  mxRecord: string;
  status: 'PENDING_DNS' | 'VERIFIED' | 'FAILED';
  spfVerified: boolean;
  dkimVerified: boolean;
  dmarcVerified: boolean;
  mxVerified: boolean;
  createdAt: string;
}

interface MailApiKey {
  id: string;
  name: string;
  key: string;
  createdAt: string;
  lastUsedAt?: string;
}

interface MailLog {
  id: string;
  from: string;
  to: string;
  subject: string;
  status: string;
  errorMessage?: string;
  messageId?: string;
  sizeBytes?: number;
  createdAt: string;
}

interface MailStats {
  totalSent: number;
  totalDelivered: number;
  totalFailed: number;
  deliveryRate: number;
  domainsCount: number;
  verifiedDomainsCount: number;
}

export default function MailTab() {
  const { activeTeam } = useAppStore();
  const { alert, confirm } = useDialog();

  const [currentTab, setCurrentTab] = useState<MailSubTab>('overview');
  const [stats, setStats] = useState<MailStats | null>(null);
  const [domains, setDomains] = useState<MailDomain[]>([]);
  const [keys, setKeys] = useState<MailApiKey[]>([]);
  const [logs, setLogs] = useState<MailLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Add domain state
  const [addDomainOpen, setAddDomainOpen] = useState(false);
  const [newDomainName, setNewDomainName] = useState('');
  const [selectedDomain, setSelectedDomain] = useState<MailDomain | null>(null);

  // Add API Key state
  const [addKeyOpen, setAddKeyOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  // Send Test Email modal
  const [sendOpen, setSendOpen] = useState(false);
  const [sendFrom, setSendFrom] = useState('');
  const [sendTo, setSendTo] = useState('');
  const [sendSubject, setSendSubject] = useState('Welcome to KH Cloud Mail');
  const [sendBody, setSendBody] = useState('<p>Hello from KH Cloud Mail Delivery System!</p><p>This email was delivered via our self-hosted transactional email infrastructure.</p>');
  const [sending, setSending] = useState(false);

  // Copy helper
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Logs filter
  const [logSearch, setLogSearch] = useState('');
  const [logStatus, setLogStatus] = useState('ALL');
  const [selectedLog, setSelectedLog] = useState<MailLog | null>(null);

  const baseDomain = getBaseDomain();

  const loadData = useCallback(async () => {
    if (!activeTeam) return;
    setLoading(true);
    try {
      const [statsRes, domainsRes, keysRes, logsRes] = await Promise.all([
        apiRequest(`/mail/stats?teamId=${activeTeam.id}`).catch(() => null),
        apiRequest(`/mail/domains?teamId=${activeTeam.id}`).catch(() => []),
        apiRequest(`/mail/keys?teamId=${activeTeam.id}`).catch(() => []),
        apiRequest(`/mail/logs?teamId=${activeTeam.id}&status=${logStatus}&search=${encodeURIComponent(logSearch)}`).catch(() => ({ logs: [] })),
      ]);

      if (statsRes) setStats(statsRes);
      if (Array.isArray(domainsRes)) {
        setDomains(domainsRes);
        if (domainsRes.length > 0 && !selectedDomain) {
          setSelectedDomain(domainsRes[0]);
        }
      }
      if (Array.isArray(keysRes)) setKeys(keysRes);
      if (logsRes && Array.isArray(logsRes.logs)) setLogs(logsRes.logs);
    } catch (err: any) {
      console.error('Failed to load mail data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTeam, logStatus, logSearch]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Add Domain
  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDomainName.trim() || !activeTeam) return;
    try {
      const res = await apiRequest('/mail/domains', {
        method: 'POST',
        body: JSON.stringify({ domain: newDomainName.trim(), teamId: activeTeam.id }),
      });
      setDomains((prev) => [res, ...prev]);
      setSelectedDomain(res);
      setAddDomainOpen(false);
      setNewDomainName('');
      alert({ title: 'Domain Added', message: `Domain ${res.domain} has been registered! Please add the DNS records to verify ownership.`, type: 'success' });
    } catch (err: any) {
      alert({ title: 'Error', message: err.message || 'Failed to add domain', type: 'error' });
    }
  };

  // Verify Domain
  const handleVerifyDomain = async (domainId: string) => {
    if (!activeTeam) return;
    setRefreshing(true);
    try {
      const res = await apiRequest(`/mail/domains/${domainId}/verify?teamId=${activeTeam.id}`, {
        method: 'POST',
      });
      setDomains((prev) => prev.map((d) => (d.id === domainId ? res.domain : d)));
      if (selectedDomain?.id === domainId) {
        setSelectedDomain(res.domain);
      }
      if (res.results.status === 'VERIFIED') {
        alert({ title: 'Domain Verified!', message: `Congratulations! ${res.domain.domain} is verified and ready to send emails.`, type: 'success' });
      } else {
        alert({
          title: 'Verification Incomplete',
          message: `DNS check results:\n• SPF: ${res.results.spf ? '✓ Verified' : '✗ Not Found'}\n• DKIM: ${res.results.dkim ? '✓ Verified' : '✗ Not Found'}\n• DMARC: ${res.results.dmarc ? '✓ Verified' : '○ Pending'}\n\nDNS changes can take several minutes to propagate. Please check your DNS provider.`,
          type: 'warning',
        });
      }
    } catch (err: any) {
      alert({ title: 'Verification Error', message: err.message || 'Failed to verify DNS', type: 'error' });
    } finally {
      setRefreshing(false);
    }
  };

  // Delete Domain
  const handleDeleteDomain = async (domainId: string, domainName: string) => {
    const ok = await confirm({
      title: 'Delete Mail Domain',
      message: `Are you sure you want to remove "${domainName}"? You will not be able to send emails from this domain until re-added.`,
    });
    if (!ok || !activeTeam) return;

    try {
      await apiRequest(`/mail/domains/${domainId}?teamId=${activeTeam.id}`, {
        method: 'DELETE',
      });
      setDomains((prev) => prev.filter((d) => d.id !== domainId));
      if (selectedDomain?.id === domainId) {
        setSelectedDomain(null);
      }
    } catch (err: any) {
      alert({ title: 'Error', message: err.message || 'Failed to delete domain', type: 'error' });
    }
  };

  // Create API Key
  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTeam) return;
    try {
      const res = await apiRequest('/mail/keys', {
        method: 'POST',
        body: JSON.stringify({ name: newKeyName.trim() || 'Production Mail Key', teamId: activeTeam.id }),
      });
      setKeys((prev) => [res, ...prev]);
      setCreatedKey(res.key);
      setNewKeyName('');
    } catch (err: any) {
      alert({ title: 'Error', message: err.message || 'Failed to create API key', type: 'error' });
    }
  };

  // Delete API Key
  const handleDeleteKey = async (keyId: string, name: string) => {
    const ok = await confirm({
      title: 'Revoke API Key',
      message: `Are you sure you want to revoke API key "${name}"? Applications using this key will immediately lose access.`,
    });
    if (!ok || !activeTeam) return;

    try {
      await apiRequest(`/mail/keys/${keyId}?teamId=${activeTeam.id}`, {
        method: 'DELETE',
      });
      setKeys((prev) => prev.filter((k) => k.id !== keyId));
    } catch (err: any) {
      alert({ title: 'Error', message: err.message || 'Failed to revoke key', type: 'error' });
    }
  };

  // Send Test Email
  const handleSendTestEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTeam || !sendFrom || !sendTo) return;
    setSending(true);
    try {
      const res = await apiRequest('/mail/send', {
        method: 'POST',
        body: JSON.stringify({
          from: sendFrom,
          to: sendTo,
          subject: sendSubject,
          html: sendBody,
          teamId: activeTeam.id,
        }),
      });
      alert({ title: 'Email Dispatched', message: `Test email successfully queued/dispatched! Message ID: ${res.messageId}`, type: 'success' });
      setSendOpen(false);
      loadData();
    } catch (err: any) {
      alert({ title: 'Send Failed', message: err.message || 'Could not send test email', type: 'error' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0e1015] text-white">
      {/* Top Header */}
      <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400">
            <Mail size={20} />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-lg font-semibold tracking-tight">Mail Delivery System</h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Active
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              Unlimited transactional email delivery, custom domains, SPF/DKIM verification & SMTP.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => {
              setRefreshing(true);
              loadData();
            }}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
            title="Refresh"
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          </button>

          <button
            onClick={() => {
              // Pre-fill from address with first domain if available
              if (domains.length > 0 && !sendFrom) {
                setSendFrom(`hello@${domains[0].domain}`);
              }
              setSendOpen(true);
            }}
            className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-xs font-medium text-white flex items-center space-x-1.5 transition-colors shadow-lg shadow-violet-600/20"
          >
            <Send size={14} />
            <span>Send Test Email</span>
          </button>
        </div>
      </div>

      {/* Sub Navigation */}
      <div className="px-6 border-b border-white/5 flex items-center space-x-6">
        {[
          { id: 'overview', label: 'Overview', icon: FileText },
          { id: 'domains', label: `Domains (${domains.length})`, icon: Globe },
          { id: 'keys', label: 'API & SMTP', icon: Key },
          { id: 'logs', label: 'Logs / Outbox', icon: Clock },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setCurrentTab(tab.id as MailSubTab)}
              className={`py-3 text-xs font-medium flex items-center space-x-2 border-b-2 transition-colors ${
                active
                  ? 'border-violet-500 text-violet-400'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* OVERVIEW TAB */}
        {currentTab === 'overview' && (
          <div className="space-y-6 max-w-5xl">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-[#14161f] border border-white/5">
                <div className="text-xs text-zinc-400 font-medium">Total Emails Sent</div>
                <div className="text-2xl font-bold mt-1 text-white">{stats?.totalSent ?? 0}</div>
                <div className="text-[11px] text-zinc-500 mt-1">Platform lifetime</div>
              </div>

              <div className="p-4 rounded-xl bg-[#14161f] border border-white/5">
                <div className="text-xs text-zinc-400 font-medium">Delivered Successfully</div>
                <div className="text-2xl font-bold mt-1 text-emerald-400">{stats?.totalDelivered ?? 0}</div>
                <div className="text-[11px] text-emerald-500/80 mt-1">Direct & Queued</div>
              </div>

              <div className="p-4 rounded-xl bg-[#14161f] border border-white/5">
                <div className="text-xs text-zinc-400 font-medium">Delivery Success Rate</div>
                <div className="text-2xl font-bold mt-1 text-violet-400">{stats?.deliveryRate ?? 100}%</div>
                <div className="text-[11px] text-zinc-500 mt-1">Optimized routing</div>
              </div>

              <div className="p-4 rounded-xl bg-[#14161f] border border-white/5">
                <div className="text-xs text-zinc-400 font-medium">Verified Custom Domains</div>
                <div className="text-2xl font-bold mt-1 text-blue-400">
                  {stats?.verifiedDomainsCount ?? 0} / {stats?.domainsCount ?? 0}
                </div>
                <div className="text-[11px] text-zinc-500 mt-1">DKIM & SPF configured</div>
              </div>
            </div>

            {/* Quick Start / Setup Banner */}
            <div className="p-6 rounded-2xl bg-gradient-to-r from-violet-950/40 via-[#181a24] to-[#14161f] border border-violet-500/20">
              <h2 className="text-base font-semibold text-white">How to use KH Cloud Mail</h2>
              <p className="text-xs text-zinc-300 mt-1 leading-relaxed max-w-2xl">
                KH Cloud provides a complete replacement for Resend, SendGrid, and Mailgun. You have unlimited
                sending capability directly from your projects with high deliverability.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                <div className="p-4 rounded-xl bg-black/30 border border-white/5">
                  <div className="w-7 h-7 rounded-lg bg-violet-600/20 text-violet-400 flex items-center justify-center font-bold text-xs mb-2">
                    1
                  </div>
                  <h3 className="text-xs font-semibold text-white">Add Custom Domain</h3>
                  <p className="text-[11px] text-zinc-400 mt-1">
                    Register your sending domain (e.g. <code>yourdomain.com</code>) to automatically generate DKIM and
                    SPF records.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-black/30 border border-white/5">
                  <div className="w-7 h-7 rounded-lg bg-violet-600/20 text-violet-400 flex items-center justify-center font-bold text-xs mb-2">
                    2
                  </div>
                  <h3 className="text-xs font-semibold text-white">Add DNS Records</h3>
                  <p className="text-[11px] text-zinc-400 mt-1">
                    Copy the 3 TXT records (SPF, DKIM, DMARC) into your Cloudflare, GoDaddy, or Namecheap DNS manager.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-black/30 border border-white/5">
                  <div className="w-7 h-7 rounded-lg bg-violet-600/20 text-violet-400 flex items-center justify-center font-bold text-xs mb-2">
                    3
                  </div>
                  <h3 className="text-xs font-semibold text-white">Send via API or SMTP</h3>
                  <p className="text-[11px] text-zinc-400 mt-1">
                    Use our REST API (drop-in Resend replacement) or connect with standard SMTP credentials in Nodemailer.
                  </p>
                </div>
              </div>
            </div>

            {/* Recent Outbox Preview */}
            <div className="rounded-xl bg-[#14161f] border border-white/5 overflow-hidden">
              <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between">
                <h3 className="text-xs font-semibold text-white">Recent Outbox</h3>
                <button
                  onClick={() => setCurrentTab('logs')}
                  className="text-xs text-violet-400 hover:text-violet-300 flex items-center space-x-1"
                >
                  <span>View All Logs</span>
                  <ChevronRight size={13} />
                </button>
              </div>

              {logs.length === 0 ? (
                <div className="p-8 text-center text-zinc-500 text-xs">
                  No emails sent yet. Click "Send Test Email" to send your first message.
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                  {logs.slice(0, 5).map((log) => (
                    <div key={log.id} className="px-5 py-3 flex items-center justify-between text-xs">
                      <div className="flex items-center space-x-3">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            log.status === 'SENT' || log.status === 'DELIVERED'
                              ? 'bg-emerald-400'
                              : log.status === 'QUEUED'
                              ? 'bg-amber-400'
                              : 'bg-red-400'
                          }`}
                        />
                        <span className="font-medium text-white">{log.to}</span>
                        <span className="text-zinc-500">•</span>
                        <span className="text-zinc-400 truncate max-w-xs">{log.subject}</span>
                      </div>
                      <span className="text-zinc-500 text-[11px]">
                        {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* DOMAINS TAB */}
        {currentTab === 'domains' && (
          <div className="space-y-6 max-w-5xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-white">Sending Domains</h2>
                <p className="text-xs text-zinc-400">
                  Configure custom domains to sign emails with 2048-bit DKIM and pass DMARC/SPF checks.
                </p>
              </div>
              <button
                onClick={() => setAddDomainOpen(true)}
                className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-xs font-medium text-white flex items-center space-x-1.5 transition-colors"
              >
                <Plus size={14} />
                <span>Add Domain</span>
              </button>
            </div>

            {domains.length === 0 ? (
              <div className="p-12 text-center rounded-2xl bg-[#14161f] border border-dashed border-white/10">
                <div className="w-12 h-12 rounded-2xl bg-violet-600/10 text-violet-400 mx-auto flex items-center justify-center mb-3">
                  <Globe size={24} />
                </div>
                <h3 className="text-sm font-semibold text-white">No Domains Configured</h3>
                <p className="text-xs text-zinc-400 max-w-sm mx-auto mt-1">
                  Add your domain (e.g. <code>mydomain.com</code>) to generate DKIM and SPF verification records.
                </p>
                <button
                  onClick={() => setAddDomainOpen(true)}
                  className="mt-4 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-xs font-medium text-white inline-flex items-center space-x-2"
                >
                  <Plus size={14} />
                  <span>Add First Domain</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Domain Selector Column */}
                <div className="space-y-2">
                  {domains.map((dom) => {
                    const isSelected = selectedDomain?.id === dom.id;
                    const isVerified = dom.status === 'VERIFIED';

                    return (
                      <div
                        key={dom.id}
                        onClick={() => setSelectedDomain(dom)}
                        className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-violet-600/10 border-violet-500/40 text-white'
                            : 'bg-[#14161f] border-white/5 text-zinc-300 hover:border-white/10'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-xs tracking-tight">{dom.domain}</span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                              isVerified
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                            }`}
                          >
                            {isVerified ? 'Verified' : 'Pending DNS'}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2 mt-2 text-[11px] text-zinc-400">
                          <span>DKIM: {dom.dkimVerified ? '✓' : '✗'}</span>
                          <span>•</span>
                          <span>SPF: {dom.spfVerified ? '✓' : '✗'}</span>
                          <span>•</span>
                          <span>DMARC: {dom.dmarcVerified ? '✓' : '○'}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Domain Details & DNS Configuration */}
                {selectedDomain && (
                  <div className="md:col-span-2 rounded-2xl bg-[#14161f] border border-white/5 p-6 space-y-6">
                    <div className="flex items-center justify-between border-b border-white/5 pb-4">
                      <div>
                        <div className="flex items-center space-x-2">
                          <h3 className="text-base font-semibold text-white">{selectedDomain.domain}</h3>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                              selectedDomain.status === 'VERIFIED'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                            }`}
                          >
                            {selectedDomain.status === 'VERIFIED' ? 'Verified' : 'DNS Propagation Pending'}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-400 mt-0.5">
                          Add the following DNS records in your domain registrar (Cloudflare, GoDaddy, Namecheap).
                        </p>
                      </div>

                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleVerifyDomain(selectedDomain.id)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-medium text-white flex items-center space-x-1.5 transition-colors"
                        >
                          <ShieldCheck size={14} />
                          <span>Verify DNS</span>
                        </button>
                        <button
                          onClick={() => handleDeleteDomain(selectedDomain.id, selectedDomain.domain)}
                          className="p-1.5 rounded-lg bg-white/5 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 transition-colors"
                          title="Delete Domain"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {/* DNS Records Table */}
                    <div className="space-y-4">
                      {/* SPF */}
                      <div className="p-4 rounded-xl bg-black/30 border border-white/5 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-500/20 text-blue-400">
                              TXT
                            </span>
                            <span className="text-xs font-semibold text-white">SPF Record</span>
                          </div>
                          <span
                            className={`text-[11px] font-medium ${
                              selectedDomain.spfVerified ? 'text-emerald-400' : 'text-amber-400'
                            }`}
                          >
                            {selectedDomain.spfVerified ? '✓ Validated' : 'Pending verification'}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div>
                            <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Host / Name</div>
                            <div className="font-mono text-zinc-300 mt-0.5 truncate">@ (or domain)</div>
                          </div>
                          <div className="col-span-2">
                            <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Value / Target</div>
                            <div className="flex items-center justify-between mt-0.5 bg-black/40 px-2 py-1 rounded border border-white/5">
                              <code className="text-zinc-300 font-mono text-[11px] truncate select-all">
                                {selectedDomain.spfRecord}
                              </code>
                              <button
                                onClick={() => handleCopy(selectedDomain.spfRecord, 'spf')}
                                className="ml-2 text-zinc-400 hover:text-white"
                              >
                                {copiedKey === 'spf' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* DKIM */}
                      <div className="p-4 rounded-xl bg-black/30 border border-white/5 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-violet-500/20 text-violet-400">
                              TXT
                            </span>
                            <span className="text-xs font-semibold text-white">DKIM Record (2048-bit RSA)</span>
                          </div>
                          <span
                            className={`text-[11px] font-medium ${
                              selectedDomain.dkimVerified ? 'text-emerald-400' : 'text-amber-400'
                            }`}
                          >
                            {selectedDomain.dkimVerified ? '✓ Validated' : 'Pending verification'}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div>
                            <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Host / Name</div>
                            <div className="flex items-center justify-between mt-0.5 bg-black/40 px-2 py-1 rounded border border-white/5">
                              <code className="text-zinc-300 font-mono text-[11px] truncate">
                                {selectedDomain.dkimSelector}._domainkey
                              </code>
                              <button
                                onClick={() => handleCopy(`${selectedDomain.dkimSelector}._domainkey`, 'dkim_host')}
                                className="ml-1 text-zinc-400 hover:text-white"
                              >
                                {copiedKey === 'dkim_host' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                              </button>
                            </div>
                          </div>
                          <div className="col-span-2">
                            <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Value / Target</div>
                            <div className="flex items-center justify-between mt-0.5 bg-black/40 px-2 py-1 rounded border border-white/5">
                              <code className="text-zinc-300 font-mono text-[11px] truncate select-all">
                                {selectedDomain.dkimPublicKey}
                              </code>
                              <button
                                onClick={() => handleCopy(selectedDomain.dkimPublicKey, 'dkim_val')}
                                className="ml-2 text-zinc-400 hover:text-white"
                              >
                                {copiedKey === 'dkim_val' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* DMARC */}
                      <div className="p-4 rounded-xl bg-black/30 border border-white/5 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-500/20 text-amber-400">
                              TXT
                            </span>
                            <span className="text-xs font-semibold text-white">DMARC Policy</span>
                          </div>
                          <span
                            className={`text-[11px] font-medium ${
                              selectedDomain.dmarcVerified ? 'text-emerald-400' : 'text-zinc-400'
                            }`}
                          >
                            {selectedDomain.dmarcVerified ? '✓ Validated' : 'Recommended'}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div>
                            <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Host / Name</div>
                            <div className="font-mono text-zinc-300 mt-0.5">_dmarc</div>
                          </div>
                          <div className="col-span-2">
                            <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Value / Target</div>
                            <div className="flex items-center justify-between mt-0.5 bg-black/40 px-2 py-1 rounded border border-white/5">
                              <code className="text-zinc-300 font-mono text-[11px] truncate select-all">
                                {selectedDomain.dmarcRecord}
                              </code>
                              <button
                                onClick={() => handleCopy(selectedDomain.dmarcRecord, 'dmarc')}
                                className="ml-2 text-zinc-400 hover:text-white"
                              >
                                {copiedKey === 'dmarc' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* MX */}
                      <div className="p-4 rounded-xl bg-black/30 border border-white/5 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-purple-500/20 text-purple-400">
                              MX
                            </span>
                            <span className="text-xs font-semibold text-white">Inbound / MX Routing</span>
                          </div>
                          <span className="text-[11px] font-medium text-zinc-400">Priority 10</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div>
                            <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Host / Name</div>
                            <div className="font-mono text-zinc-300 mt-0.5">@</div>
                          </div>
                          <div className="col-span-2">
                            <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Value / Target</div>
                            <div className="flex items-center justify-between mt-0.5 bg-black/40 px-2 py-1 rounded border border-white/5">
                              <code className="text-zinc-300 font-mono text-[11px] truncate">
                                {selectedDomain.mxRecord}
                              </code>
                              <button
                                onClick={() => handleCopy(selectedDomain.mxRecord, 'mx')}
                                className="ml-2 text-zinc-400 hover:text-white"
                              >
                                {copiedKey === 'mx' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* API & SMTP TAB */}
        {currentTab === 'keys' && (
          <div className="space-y-6 max-w-5xl">
            {/* SMTP Server Connection Details Box */}
            <div className="p-6 rounded-2xl bg-[#14161f] border border-white/5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-xl bg-violet-600/20 text-violet-400 flex items-center justify-center">
                    <Server size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">SMTP Server Connection</h3>
                    <p className="text-xs text-zinc-400">
                      Standard SMTP credentials compatible with Nodemailer, Python, Rails, Django, and WordPress.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-2">
                <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                  <div className="text-[10px] text-zinc-500 uppercase font-semibold">SMTP Host</div>
                  <div className="flex items-center justify-between mt-1">
                    <code className="text-xs font-mono text-white">mail.{baseDomain}</code>
                    <button
                      onClick={() => handleCopy(`mail.${baseDomain}`, 'smtp_host')}
                      className="text-zinc-400 hover:text-white"
                    >
                      {copiedKey === 'smtp_host' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                    </button>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                  <div className="text-[10px] text-zinc-500 uppercase font-semibold">Ports</div>
                  <div className="text-xs font-mono text-white mt-1">
                    2525 <span className="text-zinc-500">(Standard)</span> • 587
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                  <div className="text-[10px] text-zinc-500 uppercase font-semibold">Username</div>
                  <div className="text-xs font-mono text-zinc-300 mt-1 truncate">
                    Your Mail API Key
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                  <div className="text-[10px] text-zinc-500 uppercase font-semibold">Password</div>
                  <div className="text-xs font-mono text-zinc-300 mt-1 truncate">
                    Your Mail API Key
                  </div>
                </div>
              </div>
            </div>

            {/* API Keys List */}
            <div className="rounded-2xl bg-[#14161f] border border-white/5 overflow-hidden">
              <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">Mail API Keys</h3>
                  <p className="text-xs text-zinc-400">
                    Use API keys to authenticate sending via REST API (Resend SDK) or SMTP.
                  </p>
                </div>
                <button
                  onClick={() => setAddKeyOpen(true)}
                  className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-xs font-medium text-white flex items-center space-x-1.5 transition-colors"
                >
                  <Plus size={14} />
                  <span>Create API Key</span>
                </button>
              </div>

              {createdKey && (
                <div className="m-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs">
                  <div className="font-semibold text-emerald-400 flex items-center space-x-2">
                    <CheckCircle2 size={16} />
                    <span>API Key Created Successfully</span>
                  </div>
                  <p className="text-zinc-300 mt-1">
                    Please copy this key now. For security purposes, it will not be displayed in full again.
                  </p>
                  <div className="flex items-center justify-between mt-3 bg-black/40 p-2 rounded-lg border border-white/5">
                    <code className="text-emerald-300 font-mono text-xs select-all">{createdKey}</code>
                    <button
                      onClick={() => handleCopy(createdKey, 'new_created_key')}
                      className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white flex items-center space-x-1"
                    >
                      {copiedKey === 'new_created_key' ? <Check size={12} /> : <Copy size={12} />}
                      <span>Copy</span>
                    </button>
                  </div>
                </div>
              )}

              {keys.length === 0 ? (
                <div className="p-8 text-center text-zinc-500 text-xs">
                  No API keys created yet. Create an API key to send emails programmatically.
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                  {keys.map((k) => (
                    <div key={k.id} className="px-6 py-4 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-semibold text-white">{k.name}</div>
                        <div className="flex items-center space-x-2 mt-1">
                          <code className="font-mono text-zinc-400 text-[11px]">
                            {k.key.substring(0, 16)}••••••••••••••••
                          </code>
                          <button
                            onClick={() => handleCopy(k.key, k.id)}
                            className="text-zinc-400 hover:text-white"
                            title="Copy Key"
                          >
                            {copiedKey === k.id ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center space-x-4">
                        <span className="text-[11px] text-zinc-500">
                          Created {new Date(k.createdAt).toLocaleDateString()}
                        </span>
                        <button
                          onClick={() => handleDeleteKey(k.id, k.name)}
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Revoke Key"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Code Snippets Section */}
            <div className="rounded-2xl bg-[#14161f] border border-white/5 p-6 space-y-4">
              <div className="flex items-center space-x-2">
                <Code2 size={16} className="text-violet-400" />
                <h3 className="text-sm font-semibold text-white">Integration Code Examples</h3>
              </div>

              <div className="space-y-4">
                {/* Node.js Nodemailer */}
                <div className="space-y-1">
                  <div className="text-xs font-medium text-zinc-300">Node.js / TypeScript (Nodemailer)</div>
                  <pre className="p-4 rounded-xl bg-black/50 border border-white/5 text-[11px] font-mono text-zinc-300 overflow-x-auto">
{`import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: 'mail.${baseDomain}',
  port: 2525,
  secure: false,
  auth: {
    user: 'kh_mail_live_YOUR_API_KEY',
    pass: 'kh_mail_live_YOUR_API_KEY',
  },
});

await transporter.sendMail({
  from: 'hello@${domains[0]?.domain || 'yourdomain.com'}',
  to: 'user@example.com',
  subject: 'Hello from KH Cloud!',
  html: '<p>Sent with unlimited KH Cloud Mail!</p>',
});`}
                  </pre>
                </div>

                {/* Resend Drop-in REST API */}
                <div className="space-y-1">
                  <div className="text-xs font-medium text-zinc-300">cURL / Resend-Compatible REST API</div>
                  <pre className="p-4 rounded-xl bg-black/50 border border-white/5 text-[11px] font-mono text-zinc-300 overflow-x-auto">
{`curl -X POST https://api.${baseDomain}/api/v1/emails \\
  -H "Authorization: Bearer kh_mail_live_YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "from": "hello@${domains[0]?.domain || 'yourdomain.com'}",
    "to": ["user@example.com"],
    "subject": "Hello via KH Cloud REST API",
    "html": "<strong>It works!</strong>"
  }'`}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* LOGS TAB */}
        {currentTab === 'logs' && (
          <div className="space-y-4 max-w-5xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-white">Mail Delivery Logs</h2>
                <p className="text-xs text-zinc-400">Audit trail of all sent, delivered, and queued messages.</p>
              </div>

              <div className="flex items-center space-x-2">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-2.5 text-zinc-500" />
                  <input
                    type="text"
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                    placeholder="Search by to, subject..."
                    className="w-48 pl-9 pr-3 py-1.5 rounded-lg bg-[#14161f] border border-white/10 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500"
                  />
                </div>

                <select
                  value={logStatus}
                  onChange={(e) => setLogStatus(e.target.value)}
                  className="px-3 py-1.5 rounded-lg bg-[#14161f] border border-white/10 text-xs text-white focus:outline-none focus:border-violet-500"
                >
                  <option value="ALL">All Status</option>
                  <option value="SENT">Sent / Delivered</option>
                  <option value="QUEUED">Queued</option>
                  <option value="FAILED">Failed</option>
                </select>
              </div>
            </div>

            <div className="rounded-xl bg-[#14161f] border border-white/5 overflow-hidden">
              {logs.length === 0 ? (
                <div className="p-12 text-center text-zinc-500 text-xs">
                  No matching mail logs found.
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-black/30 border-b border-white/5 text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
                    <tr>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3">Recipient</th>
                      <th className="px-5 py-3">Subject</th>
                      <th className="px-5 py-3">Sender</th>
                      <th className="px-5 py-3">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-zinc-300">
                    {logs.map((log) => {
                      const isSuccess = log.status === 'SENT' || log.status === 'DELIVERED';
                      return (
                        <tr
                          key={log.id}
                          onClick={() => setSelectedLog(log)}
                          className="hover:bg-white/[0.02] cursor-pointer transition-colors"
                        >
                          <td className="px-5 py-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                                isSuccess
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                  : log.status === 'QUEUED'
                                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                  : 'bg-red-500/10 text-red-400 border-red-500/20'
                              }`}
                            >
                              {log.status}
                            </span>
                          </td>
                          <td className="px-5 py-3 font-medium text-white">{log.to}</td>
                          <td className="px-5 py-3 text-zinc-300 max-w-xs truncate">{log.subject}</td>
                          <td className="px-5 py-3 text-zinc-400">{log.from}</td>
                          <td className="px-5 py-3 text-zinc-500 text-[11px]">
                            {new Date(log.createdAt).toLocaleString()}
                          </td>
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

      {/* ADD DOMAIN MODAL */}
      {addDomainOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#14161f] border border-white/10 p-6 space-y-4">
            <h3 className="text-base font-semibold text-white">Add Custom Sending Domain</h3>
            <p className="text-xs text-zinc-400">
              Enter your root domain or subdomain. We'll generate DKIM and SPF records for your DNS registrar.
            </p>

            <form onSubmit={handleAddDomain} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-zinc-300">Domain Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. yourdomain.com or mail.yourdomain.com"
                  value={newDomainName}
                  onChange={(e) => setNewDomainName(e.target.value)}
                  className="mt-1 w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAddDomainOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-xs font-medium text-white transition-colors"
                >
                  Add Domain
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE API KEY MODAL */}
      {addKeyOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#14161f] border border-white/10 p-6 space-y-4">
            <h3 className="text-base font-semibold text-white">Create Mail API Key</h3>
            <p className="text-xs text-zinc-400">
              Generate a secure key to authenticate your server or frontend with the Mail Delivery System.
            </p>

            <form onSubmit={handleCreateKey} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-zinc-300">Key Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Production Next.js App"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  className="mt-1 w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAddKeyOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-xs font-medium text-white transition-colors"
                >
                  Create Key
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SEND TEST EMAIL MODAL */}
      {sendOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-[#14161f] border border-white/10 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">Send Test Email</h3>
              <button onClick={() => setSendOpen(false)} className="text-zinc-400 hover:text-white text-xs">
                ✕
              </button>
            </div>

            <form onSubmit={handleSendTestEmail} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-zinc-300">From</label>
                <input
                  type="text"
                  required
                  placeholder={`hello@${domains[0]?.domain || 'yourdomain.com'}`}
                  value={sendFrom}
                  onChange={(e) => setSendFrom(e.target.value)}
                  className="mt-1 w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-300">To (Recipient)</label>
                <input
                  type="email"
                  required
                  placeholder="your.personal@email.com"
                  value={sendTo}
                  onChange={(e) => setSendTo(e.target.value)}
                  className="mt-1 w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-300">Subject</label>
                <input
                  type="text"
                  required
                  value={sendSubject}
                  onChange={(e) => setSendSubject(e.target.value)}
                  className="mt-1 w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white focus:outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-300">HTML Content</label>
                <textarea
                  rows={4}
                  value={sendBody}
                  onChange={(e) => setSendBody(e.target.value)}
                  className="mt-1 w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white font-mono focus:outline-none focus:border-violet-500"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3">
                <button
                  type="button"
                  onClick={() => setSendOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sending}
                  className="px-4 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-xs font-medium text-white flex items-center space-x-1.5 disabled:opacity-50"
                >
                  <Send size={13} className={sending ? 'animate-pulse' : ''} />
                  <span>{sending ? 'Sending...' : 'Send Message'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* LOG DETAILS MODAL */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-[#14161f] border border-white/10 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div>
                <h3 className="text-sm font-semibold text-white">Email Delivery Details</h3>
                <code className="text-[10px] text-zinc-500 font-mono">{selectedLog.messageId}</code>
              </div>
              <button onClick={() => setSelectedLog(null)} className="text-zinc-400 hover:text-white text-xs">
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-3 gap-2">
                <div className="text-zinc-500">Status</div>
                <div className="col-span-2 font-medium text-white">{selectedLog.status}</div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="text-zinc-500">To</div>
                <div className="col-span-2 font-medium text-white">{selectedLog.to}</div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="text-zinc-500">From</div>
                <div className="col-span-2 text-zinc-300">{selectedLog.from}</div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="text-zinc-500">Subject</div>
                <div className="col-span-2 text-zinc-300">{selectedLog.subject}</div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="text-zinc-500">Timestamp</div>
                <div className="col-span-2 text-zinc-400">{new Date(selectedLog.createdAt).toLocaleString()}</div>
              </div>

              {selectedLog.errorMessage && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                  <div className="font-semibold">Error Message:</div>
                  <div className="font-mono mt-0.5">{selectedLog.errorMessage}</div>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-medium text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

