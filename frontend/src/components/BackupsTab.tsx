'use client';

import React, { useState, useEffect } from 'react';
import {
  Shield,
  Download,
  RefreshCw,
  HardDrive,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Terminal,
  Copy,
  Check,
  Cloud,
  Trash2,
  KeyRound,
  ExternalLink,
  Archive,
} from 'lucide-react';
import { getApiBase } from '@/lib/api';

interface BackupItem {
  id: string;
  filename: string;
  sizeBytes: number;
  sizeFormatted: string;
  createdAt: string;
  isEncrypted: boolean;
}

interface BackupConfig {
  scheduleEnabled: boolean;
  scheduleInterval: string;
  encryptionKeyConfigured: boolean;
  githubRepoConfigured: boolean;
  githubRepo?: string;
  s3Configured: boolean;
  s3Bucket?: string;
  s3Endpoint?: string;
}

export default function BackupsTab() {
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [config, setConfig] = useState<BackupConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const restoreCommand = 'curl -fsSL https://raw.githubusercontent.com/khawarahemad/KH-cloude/main/restore.sh | bash';

  const fetchBackups = async () => {
    try {
      setLoading(true);
      const [listRes, configRes] = await Promise.all([
        fetch(`${getApiBase()}/backups/list`),
        fetch(`${getApiBase()}/backups/config`),
      ]);

      if (listRes.ok) {
        const listData = await listRes.json();
        setBackups(listData.backups || []);
      }
      if (configRes.ok) {
        const configData = await configRes.json();
        setConfig(configData.config || null);
      }
    } catch (err: any) {
      console.error('Failed to fetch backup data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBackups();
  }, []);

  const handleCreateBackup = async () => {
    try {
      setCreating(true);
      setMessage(null);
      const res = await fetch(`${getApiBase()}/backups/create`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMessage({ type: 'success', text: `Encrypted snapshot created successfully (${data.backup?.filename})!` });
        await fetchBackups();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to create backup snapshot.' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error triggering backup.' });
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteBackup = async (filename: string) => {
    if (!confirm(`Are you sure you want to delete backup snapshot "${filename}"?`)) return;
    try {
      const res = await fetch(`${getApiBase()}/backups/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setBackups((prev) => prev.filter((b) => b.filename !== filename));
        setMessage({ type: 'success', text: `Deleted backup ${filename}` });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: 'Failed to delete backup.' });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2500);
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-white/5 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-violet-600/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
              <Shield size={20} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Disaster Recovery & Backups</h1>
              <p className="text-xs text-zinc-400 mt-0.5">
                Automated AES-256-GCM encrypted snapshots with remote GitHub / S3 sync and 1-command VPS restore.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchBackups}
            disabled={loading}
            className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 text-xs font-medium border border-white/5 flex items-center gap-2 transition"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={handleCreateBackup}
            disabled={creating}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-lg shadow-violet-500/20 flex items-center gap-2 transition disabled:opacity-50"
          >
            {creating ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                Encrypting Snapshot...
              </>
            ) : (
              <>
                <Archive size={14} />
                Create Snapshot Now
              </>
            )}
          </button>
        </div>
      </div>

      {/* Alerts */}
      {message && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between gap-3 text-xs ${
            message.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
              : 'bg-red-500/10 border-red-500/20 text-red-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            <span>{message.text}</span>
          </div>
          <button onClick={() => setMessage(null)} className="text-zinc-400 hover:text-white">
            ✕
          </button>
        </div>
      )}

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-[#12141a] border border-white/5 relative overflow-hidden">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-medium">Encryption Standard</span>
            <Lock size={16} className="text-emerald-400" />
          </div>
          <div className="text-lg font-bold text-white">AES-256-CBC</div>
          <div className="text-[11px] text-emerald-400 flex items-center gap-1 mt-1 font-medium">
            <CheckCircle2 size={12} /> PBKDF2 100k Iterations
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-[#12141a] border border-white/5 relative overflow-hidden">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-medium">Auto-Backup Schedule</span>
            <RefreshCw size={16} className="text-violet-400" />
          </div>
          <div className="text-lg font-bold text-white">Daily (Every 24h)</div>
          <div className="text-[11px] text-zinc-400 mt-1">Automatic zero-downtime capture</div>
        </div>

        <div className="p-5 rounded-2xl bg-[#12141a] border border-white/5 relative overflow-hidden">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-medium">GitHub Remote Sync</span>
            <svg
              className={`w-4 h-4 ${config?.githubRepoConfigured ? 'text-emerald-400' : 'text-zinc-500'}`}
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
              />
            </svg>
          </div>
          <div className="text-lg font-bold text-white">
            {config?.githubRepoConfigured ? 'Active' : 'Unconfigured'}
          </div>
          <div className="text-[11px] text-zinc-400 mt-1 truncate">
            {config?.githubRepo || 'Configure in .env (BACKUP_GITHUB_REPO)'}
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-[#12141a] border border-white/5 relative overflow-hidden">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-medium">Remote S3 / R2 Sync</span>
            <Cloud size={16} className={config?.s3Configured ? 'text-emerald-400' : 'text-zinc-500'} />
          </div>
          <div className="text-lg font-bold text-white">
            {config?.s3Configured ? 'Active' : 'Unconfigured'}
          </div>
          <div className="text-[11px] text-zinc-400 mt-1 truncate">
            {config?.s3Bucket ? `Bucket: ${config.s3Bucket}` : 'Cloudflare R2 / AWS S3 target'}
          </div>
        </div>
      </div>

      {/* 1-Command Disaster Recovery Wizard Box */}
      <div className="p-6 rounded-2xl bg-gradient-to-br from-violet-950/30 via-[#12141a] to-[#12141a] border border-violet-500/20 relative">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-300">
              <Terminal size={18} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">1-Command VPS Disaster Recovery</h3>
              <p className="text-xs text-zinc-400">
                If your VPS ever crashes or gets destroyed, run this on a brand-new VPS to restore everything in 3 minutes:
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-black/60 border border-white/10 font-mono text-xs text-emerald-400 overflow-x-auto">
          <div className="flex items-center gap-2 select-all">
            <span className="text-zinc-500 select-none">$</span>
            <span>{restoreCommand}</span>
          </div>
          <button
            onClick={() => copyToClipboard(restoreCommand)}
            className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-sans flex items-center gap-1.5 transition shrink-0"
          >
            {copiedCmd ? (
              <>
                <Check size={13} className="text-emerald-400" />
                <span className="text-emerald-400">Copied!</span>
              </>
            ) : (
              <>
                <Copy size={13} />
                <span>Copy Command</span>
              </>
            )}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4 text-[11px] text-zinc-400">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
            <span>Restores SQLite DB & Prisma Schema</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
            <span>Restores MinIO S3 Files & Buckets</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
            <span>Restores Let's Encrypt SSL & .env Secrets</span>
          </div>
        </div>
      </div>

      {/* Snapshot Archives List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <HardDrive size={18} className="text-violet-400" />
            Available Snapshot Archives ({backups.length})
          </h2>
        </div>

        <div className="rounded-2xl border border-white/5 bg-[#12141a] overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-zinc-500 text-xs flex flex-col items-center gap-3">
              <RefreshCw size={20} className="animate-spin text-violet-400" />
              <span>Loading backup archives...</span>
            </div>
          ) : backups.length === 0 ? (
            <div className="p-12 text-center text-zinc-500 text-xs flex flex-col items-center gap-3">
              <Archive size={28} className="text-zinc-600" />
              <span className="text-zinc-400 font-medium">No backup archives created yet.</span>
              <p className="text-zinc-500 text-[11px] max-w-sm">
                Click &quot;Create Snapshot Now&quot; above to capture your first encrypted snapshot bundle.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {backups.map((b) => (
                <div
                  key={b.id}
                  className="p-4 md:px-6 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-white/[0.02] transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center text-zinc-400 shrink-0">
                      <Archive size={16} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-white font-mono truncate">{b.filename}</span>
                        {b.isEncrypted && (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-[10px] text-emerald-400 font-medium flex items-center gap-1">
                            <Lock size={10} /> Encrypted
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-zinc-500 mt-0.5">
                        Created {new Date(b.createdAt).toLocaleString()} • {b.sizeFormatted}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <a
                      href={`${getApiBase()}/backups/download/${encodeURIComponent(b.filename)}`}
                      className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-200 text-xs font-medium border border-white/5 flex items-center gap-1.5 transition"
                    >
                      <Download size={13} />
                      <span>Download</span>
                    </a>
                    <button
                      onClick={() => handleDeleteBackup(b.filename)}
                      className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition"
                      title="Delete Backup"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
