'use client';

import React, { useState, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { apiRequest } from '@/lib/api';
import { Loader2, CreditCard, FileText, Layers, Database, HardDrive, DollarSign, Check, Lock } from 'lucide-react';

export default function BillingTab() {
  const { activeTeam, billingCache: billing, setBillingCache: setBilling } = useAppStore();
  const [loading, setLoading] = useState(billing === null);

  const fetchBillingInfo = async () => {
    if (!activeTeam) return;
    if (!billing) setLoading(true);
    try {
      const data = await apiRequest(`/billing?teamId=${activeTeam.id}`);
      setBilling(data);
    } catch {
      setBilling({
        subscription: { planId: 'hobby', currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() },
        plans: [
          { id: 'hobby',      name: 'Hobby',      price: 0,   specs: '1 member · 3 projects · 5 GB' },
          { id: 'pro',        name: 'Pro',         price: 29,  specs: 'Unlimited members · 25 projects · 50 GB' },
          { id: 'enterprise', name: 'Enterprise',  price: 250, specs: 'Custom limits · Dedicated · SLA' },
        ],
        invoices: [
          { id: 'INV-2026-07', date: 'Jul 01, 2026', amount: '$0.00', status: 'PAID' },
          { id: 'INV-2026-06', date: 'Jun 01, 2026', amount: '$0.00', status: 'PAID' },
        ],
        usage: { activeProjects: 0, databasesCount: 0, storageGB: '0.00', currentSpend: '0.00' },
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBillingInfo(); }, [activeTeam]);

  const periodEnd = billing?.subscription?.currentPeriodEnd
    ? new Date(billing.subscription.currentPeriodEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—';

  return (
    <div className="rw-page">
      {/* Page header */}
      <div className="rw-page-header">
        <div>
          <h1 className="rw-page-title">Billing & Usage</h1>
          <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '2px' }}>
            Manage workspace subscription plan, view resource usage limits, and download invoices.
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="rw-page-content">
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px', gap: '12px', color: '#6b7280' }}>
            <Loader2 size={18} className="animate-spin" style={{ color: '#7c3aed' }} />
            <span style={{ fontSize: '13px' }}>Loading billing information...</span>
          </div>
        ) : (
          <div style={{ maxWidth: '960px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* Current plan banner */}
            <div style={{
              backgroundColor: '#111318',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '12px',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '16px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '40px', height: '40px', borderRadius: '10px',
                  backgroundColor: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <CreditCard size={18} style={{ color: '#a78bfa' }} />
                </div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#f1f3f6' }}>
                    {billing?.plans?.find((p: any) => p.id === billing?.subscription?.planId)?.name || 'Hobby'} Plan
                  </div>
                  <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '3px' }}>
                    Subscription billing cycle renews on {periodEnd}
                  </div>
                </div>
              </div>
              <span style={{
                padding: '3px 10px', borderRadius: '9999px',
                backgroundColor: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)',
                fontSize: '10px', fontWeight: 600, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.04em'
              }}>
                Active
              </span>
            </div>

            {/* Usage stats */}
            <div>
              <div style={{ fontSize: '11px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#4b5563', marginBottom: '12px' }}>
                Current Usage Summary
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                {[
                  { label: 'Projects',     value: billing?.usage?.activeProjects,   icon: Layers,   color: '#7c3aed' },
                  { label: 'Databases',    value: billing?.usage?.databasesCount,   icon: Database, color: '#3b82f6' },
                  { label: 'Storage',      value: `${billing?.usage?.storageGB} GB`, icon: HardDrive, color: '#22c55e' },
                  { label: 'Month Spend',  value: `$${billing?.usage?.currentSpend}`, icon: DollarSign, color: '#f59e0b' },
                ].map(({ label, value, icon: Icon, color }) => (
                  <div key={label} style={{
                    backgroundColor: '#111318', border: '1px solid rgba(255,255,255,0.07)',
                    borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '10px', color: '#4b5563', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
                      <div style={{ width: '26px', height: '26px', borderRadius: '7px', backgroundColor: `${color}12`, border: `1px solid ${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon size={12} style={{ color }} />
                      </div>
                    </div>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: '#f1f3f6' }}>{value ?? '—'}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Plans */}
            <div>
              <div style={{ fontSize: '11px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#4b5563', marginBottom: '4px' }}>
                Subscription Plans
              </div>
              <p style={{ fontSize: '12px', color: '#4b5563', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Lock size={11} /> Workspace plan modifications require administrator privileges.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                {billing?.plans?.map((plan: any) => {
                  const isCurrent = billing?.subscription?.planId === plan.id;
                  return (
                    <div key={plan.id} style={{
                      backgroundColor: isCurrent ? 'rgba(124,58,237,0.04)' : '#111318',
                      border: isCurrent ? '1px solid rgba(124,58,237,0.35)' : '1px solid rgba(255,255,255,0.07)',
                      borderRadius: '12px', padding: '20px',
                      display: 'flex', flexDirection: 'column', gap: '14px',
                    }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '14px', fontWeight: 600, color: '#f1f3f6' }}>{plan.name}</span>
                          {isCurrent && (
                            <span style={{
                              padding: '2px 8px', borderRadius: '9999px', fontSize: '9px', fontWeight: 600,
                              backgroundColor: 'rgba(124,58,237,0.15)', color: '#c4b5fd',
                              border: '1px solid rgba(124,58,237,0.3)', textTransform: 'uppercase', letterSpacing: '0.05em'
                            }}>ACTIVE</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '2px' }}>
                          <span style={{ fontSize: '24px', fontWeight: 700, color: '#f1f3f6' }}>${plan.price}</span>
                          <span style={{ fontSize: '12px', color: '#4b5563' }}>/month</span>
                        </div>
                        <p style={{ fontSize: '12px', color: '#6b7280', lineHeight: 1.5, margin: '4px 0 0 0' }}>{plan.specs}</p>
                      </div>
                      <button
                        disabled
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                          height: '32px', borderRadius: '7px', fontSize: '11px', fontWeight: 600,
                          cursor: 'not-allowed', opacity: 0.8,
                          backgroundColor: isCurrent ? 'rgba(124,58,237,0.12)' : '#181b22',
                          border: isCurrent ? '1px solid rgba(124,58,237,0.2)' : '1px solid rgba(255,255,255,0.07)',
                          color: isCurrent ? '#a78bfa' : '#6b7280', width: '100%'
                        }}
                      >
                        {isCurrent ? <><Check size={11} /> Current Plan</> : <><Lock size={11} /> Locked</>}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Invoices */}
            <div>
              <div style={{ fontSize: '11px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#4b5563', marginBottom: '12px' }}>
                Invoice History
              </div>
              <div style={{
                backgroundColor: '#111318', border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: '12px', overflow: 'hidden',
              }}>
                {billing?.invoices?.length === 0 ? (
                  <div style={{ padding: '32px', textAlign: 'center', color: '#4b5563', fontSize: '13px' }}>
                    No invoices recorded.
                  </div>
                ) : (
                  billing?.invoices?.map((inv: any, i: number) => (
                    <div
                      key={inv.id}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '14px 16px',
                        borderBottom: i < billing.invoices.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                          width: '32px', height: '32px', borderRadius: '8px',
                          backgroundColor: '#181b22', border: '1px solid rgba(255,255,255,0.08)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <FileText size={14} style={{ color: '#6b7280' }} />
                        </div>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: '#f1f3f6' }}>{inv.id}</div>
                          <div style={{ fontSize: '11px', color: '#4b5563', marginTop: '2px' }}>{inv.date}</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#f1f3f6' }}>{inv.amount}</span>
                        <span style={{
                          padding: '2px 8px', borderRadius: '9999px', fontSize: '9px', fontWeight: 600,
                          backgroundColor: 'rgba(34,197,94,0.1)', color: '#22c55e',
                          border: '1px solid rgba(34,197,94,0.2)', textTransform: 'uppercase', letterSpacing: '0.04em'
                        }}>
                          {inv.status}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
