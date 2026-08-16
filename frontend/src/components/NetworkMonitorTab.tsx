'use client';

import React, { useState, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { apiRequest } from '@/lib/api';
import {
  Activity,
  Wifi,
  Globe,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  Trash2,
  Search,
  Lock,
  Unlock,
  Clock,
  ArrowUpRight,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Layers,
  BarChart2,
  PieChart as PieIcon,
  Radio,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from 'recharts';
import { useDialog } from './CustomDialogProvider';

export default function NetworkMonitorTab() {
  const { user } = useAppStore();
  const { confirm, alert } = useDialog();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<any | null>(null);

  // Search filters
  const [ipSearch, setIpSearch] = useState('');
  const [logSearch, setLogSearch] = useState('');

  // Auto-refresh state
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Action pending state
  const [actionIp, setActionIp] = useState<string | null>(null);
  const [cleaning, setCleaning] = useState(false);

  const fetchStats = async (isManual = false) => {
    if (!user) return;
    if (isManual) setRefreshing(true);
    try {
      const data = await apiRequest(`/admin/network/stats?adminUserId=${user.id}`);
      setStats(data);
    } catch (err: any) {
      console.error('Failed to load network stats:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [user]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchStats();
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, user]);

  const handleCleanLogs = async () => {
    if (!user) return;
    const confirmed = await confirm({
      title: 'Prune Old Network Logs',
      message: 'This will purge all network request logs older than 7 days. Continue?',
      confirmText: 'Purge Old Logs',
      isDanger: false,
    });
    if (!confirmed) return;

    setCleaning(true);
    try {
      const res = await apiRequest(`/admin/network/clean?adminUserId=${user.id}`, {
        method: 'POST',
      });
      alert({
        title: 'Cleanup Complete',
        message: res.message || 'Old logs purged successfully.',
        type: 'success',
      });
      fetchStats(true);
    } catch (err: any) {
      alert({
        title: 'Cleanup Failed',
        message: err.message || 'Failed to prune old logs.',
        type: 'error',
      });
    } finally {
      setCleaning(false);
    }
  };

  const handleToggleBan = async (ip: string, isCurrentlyBanned: boolean) => {
    if (!user) return;
    const actionText = isCurrentlyBanned ? 'unban' : 'ban';
    const confirmed = await confirm({
      title: `${isCurrentlyBanned ? 'Unban' : 'Ban'} IP Address`,
      message: `Are you sure you want to ${actionText} IP ${ip}?`,
      confirmText: isCurrentlyBanned ? 'Unban IP' : 'Ban IP',
      isDanger: !isCurrentlyBanned,
    });
    if (!confirmed) return;

    setActionIp(ip);
    try {
      if (isCurrentlyBanned) {
        await apiRequest(`/admin/network/ban/${ip}?adminUserId=${user.id}`, {
          method: 'DELETE',
        });
        alert({ title: 'IP Unbanned', message: `IP ${ip} has been unbanned.`, type: 'success' });
      } else {
        await apiRequest(`/admin/network/ban/${ip}?adminUserId=${user.id}`, {
          method: 'POST',
        });
        alert({ title: 'IP Banned', message: `IP ${ip} has been manually banned.`, type: 'success' });
      }
      fetchStats(true);
    } catch (err: any) {
      alert({ title: 'Action Failed', message: err.message || 'Failed to update IP ban status.', type: 'error' });
    } finally {
      setActionIp(null);
    }
  };

  if (loading && !stats) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '100px', gap: '12px', color: '#6b7280' }}>
        <Loader2 size={20} className="animate-spin" style={{ color: '#7c3aed' }} />
        <span style={{ fontSize: '14px', fontWeight: 500 }}>Loading Network Monitor stats...</span>
      </div>
    );
  }

  const overview = stats?.overview || {};
  const dailyTrends = stats?.dailyTrends || [];
  const statusDist = stats?.statusDistribution || {};
  const topIps = (stats?.topIps || []).filter((item: any) =>
    item.ip.toLowerCase().includes(ipSearch.toLowerCase()) ||
    (item.lastPath && item.lastPath.toLowerCase().includes(ipSearch.toLowerCase()))
  );
  const recentLogs = (stats?.recentLogs || []).filter((item: any) =>
    item.ip.toLowerCase().includes(logSearch.toLowerCase()) ||
    item.path.toLowerCase().includes(logSearch.toLowerCase())
  );

  // Chart data formatting
  const statusChartData = [
    { name: '2xx Success', count: statusDist['2xx'] || 0, color: '#10b981' },
    { name: '3xx Redirect', count: statusDist['3xx'] || 0, color: '#3b82f6' },
    { name: '4xx Client Err', count: statusDist['4xx'] || 0, color: '#f59e0b' },
    { name: '429 Rate Limit', count: statusDist['429'] || 0, color: '#ec4899' },
    { name: '5xx Server Err', count: statusDist['5xx'] || 0, color: '#ef4444' },
  ];

  return (
    <div className="rw-page-container" style={{ paddingBottom: '60px' }}>
      {/* Header */}
      <div className="rw-page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              backgroundColor: 'rgba(124,58,237,0.15)',
              border: '1px solid rgba(124,58,237,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#a78bfa',
            }}
          >
            <Activity size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 className="rw-page-title" style={{ fontSize: '20px' }}>Network Monitor</h1>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  fontSize: '11px',
                  fontWeight: 600,
                  backgroundColor: 'rgba(16,185,129,0.12)',
                  color: '#10b981',
                  border: '1px solid rgba(16,185,129,0.25)',
                }}
              >
                <Radio size={11} className="animate-pulse" /> Live Tracking
              </span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  fontSize: '11px',
                  fontWeight: 500,
                  backgroundColor: '#181b22',
                  color: '#9ba3af',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <Clock size={11} /> 7-Day Auto Retention
              </span>
            </div>
            <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '2px' }}>
              Observe IP traffic trends, 7-day request history, rate-limiting violations, and security bans.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className="rw-btn"
            style={{
              backgroundColor: autoRefresh ? 'rgba(124,58,237,0.15)' : '#181b22',
              color: autoRefresh ? '#c4b5fd' : '#9ba3af',
              border: autoRefresh ? '1px solid rgba(124,58,237,0.3)' : '1px solid rgba(255,255,255,0.09)',
            }}
          >
            <Radio size={13} style={{ color: autoRefresh ? '#a78bfa' : '#6b7280' }} />
            {autoRefresh ? 'Auto Live (5s)' : 'Live Polling Off'}
          </button>
          <button
            onClick={() => fetchStats(true)}
            disabled={refreshing}
            className="rw-btn"
            style={{ backgroundColor: '#181b22', border: '1px solid rgba(255,255,255,0.09)', color: '#9ba3af' }}
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} /> Refresh
          </button>
          <button
            onClick={handleCleanLogs}
            disabled={cleaning}
            className="rw-btn"
            style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}
          >
            {cleaning ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Prune Logs (&gt;7d)
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="rw-page-content" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Metric Cards Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
          {/* Card 1: Total Requests */}
          <div className="rw-card" style={{ padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Total Requests (7D)
              </span>
              <div style={{ padding: '6px', borderRadius: '8px', backgroundColor: 'rgba(59,130,246,0.1)', color: '#60a5fa' }}>
                <Globe size={15} />
              </div>
            </div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: '#f1f3f6', letterSpacing: '-0.02em' }}>
              {overview.totalRequests7d?.toLocaleString() || 0}
            </div>
            <div style={{ fontSize: '12px', color: '#4b5563', marginTop: '4px' }}>
              <span style={{ color: '#60a5fa', fontWeight: 600 }}>{overview.totalRequests24h?.toLocaleString() || 0}</span> in last 24 hours
            </div>
          </div>

          {/* Card 2: Unique IPs */}
          <div className="rw-card" style={{ padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Unique IPs (7D)
              </span>
              <div style={{ padding: '6px', borderRadius: '8px', backgroundColor: 'rgba(124,58,237,0.1)', color: '#a78bfa' }}>
                <Wifi size={15} />
              </div>
            </div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: '#f1f3f6', letterSpacing: '-0.02em' }}>
              {overview.uniqueIps7d?.toLocaleString() || 0}
            </div>
            <div style={{ fontSize: '12px', color: '#4b5563', marginTop: '4px' }}>
              <span style={{ color: '#a78bfa', fontWeight: 600 }}>{overview.uniqueIps24h?.toLocaleString() || 0}</span> active in 24 hours
            </div>
          </div>

          {/* Card 3: Rate Limited Hits (429) */}
          <div className="rw-card" style={{ padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Rate Limited (429)
              </span>
              <div style={{ padding: '6px', borderRadius: '8px', backgroundColor: 'rgba(236,72,153,0.1)', color: '#f472b6' }}>
                <ShieldAlert size={15} />
              </div>
            </div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: overview.rateLimitedCount7d > 0 ? '#f472b6' : '#f1f3f6', letterSpacing: '-0.02em' }}>
              {overview.rateLimitedCount7d?.toLocaleString() || 0}
            </div>
            <div style={{ fontSize: '12px', color: '#4b5563', marginTop: '4px' }}>
              Blocked by rate limits
            </div>
          </div>

          {/* Card 4: Active Bans */}
          <div className="rw-card" style={{ padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Active IP Bans
              </span>
              <div style={{ padding: '6px', borderRadius: '8px', backgroundColor: overview.activeBansCount > 0 ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)', color: overview.activeBansCount > 0 ? '#f87171' : '#34d399' }}>
                <Lock size={15} />
              </div>
            </div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: overview.activeBansCount > 0 ? '#f87171' : '#34d399', letterSpacing: '-0.02em' }}>
              {overview.activeBansCount || 0}
            </div>
            <div style={{ fontSize: '12px', color: '#4b5563', marginTop: '4px' }}>
              {overview.activeBansCount > 0 ? 'Enforced in DDoS Firewall' : 'All IPs clear'}
            </div>
          </div>
        </div>

        {/* Charts Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '16px' }}>
          {/* 7-Day Traffic Trend */}
          <div className="rw-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#f1f3f6' }}>7-Day Request Volume</h3>
                <p style={{ fontSize: '12px', color: '#6b7280' }}>Daily breakdown of requests and unique IPs over the past week</p>
              </div>
              <BarChart2 size={16} style={{ color: '#7c3aed' }} />
            </div>

            <div style={{ width: '100%', height: '200px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyTrends} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRequests" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#7c3aed" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="colorIps" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" stroke="#4b5563" fontSize={11} tickLine={false} />
                  <YAxis stroke="#4b5563" fontSize={11} tickLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#181b22', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px', color: '#fff' }}
                  />
                  <Area type="monotone" dataKey="requests" name="Total Requests" stroke="#8b5cf6" fillOpacity={1} fill="url(#colorRequests)" />
                  <Area type="monotone" dataKey="uniqueIps" name="Unique IPs" stroke="#3b82f6" fillOpacity={1} fill="url(#colorIps)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* HTTP Status Code Distribution */}
          <div className="rw-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#f1f3f6' }}>HTTP Status Code Distribution</h3>
                <p style={{ fontSize: '12px', color: '#6b7280' }}>Breakdown of response status codes across 7 days</p>
              </div>
              <PieIcon size={16} style={{ color: '#10b981' }} />
            </div>

            <div style={{ width: '100%', height: '200px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={statusChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="name" stroke="#4b5563" fontSize={10} tickLine={false} />
                  <YAxis stroke="#4b5563" fontSize={11} tickLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#181b22', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px', color: '#fff' }}
                  />
                  <Bar dataKey="count" name="Count" radius={[4, 4, 0, 0]}>
                    {statusChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Top Hitting IPs Table Section */}
        <div className="rw-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#f1f3f6' }}>Top Hitting IP Addresses</h3>
              <p style={{ fontSize: '12px', color: '#6b7280' }}>
                Ranked list of client IPs hitting your endpoints over the 7-day retention window
              </p>
            </div>

            <div className="rw-search-input" style={{ width: '220px' }}>
              <Search size={13} style={{ color: '#6b7280' }} />
              <input
                type="text"
                placeholder="Search IP or path..."
                value={ipSearch}
                onChange={(e) => setIpSearch(e.target.value)}
                style={{ fontSize: '12px' }}
              />
            </div>
          </div>

          {topIps.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px', color: '#6b7280', fontSize: '13px' }}>
              No IP traffic recorded yet.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px', minWidth: '800px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', color: '#4b5563', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.05em' }}>
                    <th style={{ padding: '10px 12px' }}>IP Address</th>
                    <th style={{ padding: '10px 12px' }}>Total Hits (7d)</th>
                    <th style={{ padding: '10px 12px' }}>24h Hits</th>
                    <th style={{ padding: '10px 12px' }}>Status Breakdown</th>
                    <th style={{ padding: '10px 12px' }}>Last Endpoint</th>
                    <th style={{ padding: '10px 12px' }}>Last Seen</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {topIps.map((item: any, idx: number) => {
                    const isBanned = item.isBanned;
                    return (
                      <tr
                        key={item.ip}
                        style={{
                          borderBottom: '1px solid rgba(255,255,255,0.04)',
                          backgroundColor: isBanned ? 'rgba(239,68,68,0.04)' : 'transparent',
                        }}
                      >
                        <td style={{ padding: '12px', fontWeight: 600, color: '#f1f3f6' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ color: '#6b7280', fontSize: '11px', width: '20px' }}>#{idx + 1}</span>
                            <span style={{ fontFamily: 'monospace', color: '#c4b5fd' }}>{item.ip}</span>
                            {isBanned && (
                              <span style={{ padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, backgroundColor: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}>
                                BANNED ({Math.ceil(item.banExpiresInSeconds / 60)}m)
                              </span>
                            )}
                          </div>
                        </td>

                        <td style={{ padding: '12px', color: '#f1f3f6', fontWeight: 600 }}>
                          {item.totalHits.toLocaleString()}
                        </td>

                        <td style={{ padding: '12px', color: '#9ba3af' }}>
                          {item.hits24h.toLocaleString()}
                        </td>

                        <td style={{ padding: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            {item.status2xx > 0 && (
                              <span style={{ padding: '1px 5px', borderRadius: '4px', fontSize: '10px', backgroundColor: 'rgba(16,185,129,0.1)', color: '#34d399' }}>
                                2xx: {item.status2xx}
                              </span>
                            )}
                            {item.status4xx > 0 && (
                              <span style={{ padding: '1px 5px', borderRadius: '4px', fontSize: '10px', backgroundColor: 'rgba(245,158,11,0.1)', color: '#fbbf24' }}>
                                4xx: {item.status4xx}
                              </span>
                            )}
                            {item.status429 > 0 && (
                              <span style={{ padding: '1px 5px', borderRadius: '4px', fontSize: '10px', backgroundColor: 'rgba(236,72,153,0.1)', color: '#f472b6' }}>
                                429: {item.status429}
                              </span>
                            )}
                            {item.status5xx > 0 && (
                              <span style={{ padding: '1px 5px', borderRadius: '4px', fontSize: '10px', backgroundColor: 'rgba(239,68,68,0.1)', color: '#f87171' }}>
                                5xx: {item.status5xx}
                              </span>
                            )}
                          </div>
                        </td>

                        <td style={{ padding: '12px', color: '#9ba3af', fontFamily: 'monospace', fontSize: '11px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.lastPath}
                        </td>

                        <td style={{ padding: '12px', color: '#6b7280', fontSize: '11px' }}>
                          {new Date(item.lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </td>

                        <td style={{ padding: '12px', textAlign: 'right' }}>
                          <button
                            onClick={() => handleToggleBan(item.ip, isBanned)}
                            disabled={actionIp === item.ip}
                            className="rw-btn"
                            style={{
                              fontSize: '11px',
                              padding: '4px 8px',
                              backgroundColor: isBanned ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                              color: isBanned ? '#34d399' : '#f87171',
                              border: isBanned ? '1px solid rgba(16,185,129,0.2)' : '1px solid rgba(239,68,68,0.2)',
                            }}
                          >
                            {actionIp === item.ip ? (
                              <Loader2 size={11} className="animate-spin" />
                            ) : isBanned ? (
                              <>
                                <Unlock size={11} /> Unban
                              </>
                            ) : (
                              <>
                                <Lock size={11} /> Ban IP
                              </>
                            )}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Live Request Stream Section */}
        <div className="rw-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#f1f3f6' }}>Recent Request Feed</h3>
              <p style={{ fontSize: '12px', color: '#6b7280' }}>
                Latest 50 requests recorded by the network monitoring interceptor
              </p>
            </div>

            <div className="rw-search-input" style={{ width: '220px' }}>
              <Search size={13} style={{ color: '#6b7280' }} />
              <input
                type="text"
                placeholder="Filter path or IP..."
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                style={{ fontSize: '12px' }}
              />
            </div>
          </div>

          {recentLogs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px', color: '#6b7280', fontSize: '13px' }}>
              No recent requests matching filter.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px', minWidth: '800px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', color: '#4b5563', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.05em' }}>
                    <th style={{ padding: '8px 10px' }}>Time</th>
                    <th style={{ padding: '8px 10px' }}>Method</th>
                    <th style={{ padding: '8px 10px' }}>Path</th>
                    <th style={{ padding: '8px 10px' }}>Status</th>
                    <th style={{ padding: '8px 10px' }}>Client IP</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Latency</th>
                  </tr>
                </thead>
                <tbody>
                  {recentLogs.map((log: any) => {
                    const methodColor =
                      log.method === 'GET' ? '#3b82f6' :
                      log.method === 'POST' ? '#10b981' :
                      log.method === 'DELETE' ? '#ef4444' : '#f59e0b';

                    const statusBg =
                      log.statusCode === 429 ? 'rgba(236,72,153,0.15)' :
                      log.statusCode >= 500 ? 'rgba(239,68,68,0.15)' :
                      log.statusCode >= 400 ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)';
                    const statusFg =
                      log.statusCode === 429 ? '#f472b6' :
                      log.statusCode >= 500 ? '#f87171' :
                      log.statusCode >= 400 ? '#fbbf24' : '#34d399';

                    return (
                      <tr key={log.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        <td style={{ padding: '8px 10px', color: '#6b7280', fontSize: '11px' }}>
                          {new Date(log.createdAt).toLocaleTimeString()}
                        </td>

                        <td style={{ padding: '8px 10px' }}>
                          <span
                            style={{
                              padding: '1px 6px',
                              borderRadius: '4px',
                              fontSize: '10px',
                              fontWeight: 700,
                              backgroundColor: `${methodColor}1a`,
                              color: methodColor,
                              border: `1px solid ${methodColor}33`,
                            }}
                          >
                            {log.method}
                          </span>
                        </td>

                        <td style={{ padding: '8px 10px', color: '#f1f3f6', fontFamily: 'monospace', fontSize: '11px' }}>
                          {log.path}
                        </td>

                        <td style={{ padding: '8px 10px' }}>
                          <span
                            style={{
                              padding: '1px 6px',
                              borderRadius: '4px',
                              fontSize: '10px',
                              fontWeight: 600,
                              backgroundColor: statusBg,
                              color: statusFg,
                            }}
                          >
                            {log.statusCode}
                          </span>
                        </td>

                        <td style={{ padding: '8px 10px', color: '#c4b5fd', fontFamily: 'monospace', fontSize: '11px' }}>
                          {log.ip}
                        </td>

                        <td style={{ padding: '8px 10px', textAlign: 'right', color: '#6b7280', fontSize: '11px' }}>
                          {log.responseTimeMs}ms
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
