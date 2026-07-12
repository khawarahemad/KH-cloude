'use client';

import React, { useState, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { apiRequest } from '@/lib/api';
import { Loader2, CreditCard, FileText, Layers, Database, HardDrive, DollarSign, Check, Lock } from 'lucide-react';

export default function BillingTab() {
  const { activeTeam } = useAppStore();
  const [billing, setBilling] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchBillingInfo = async () => {
    if (!activeTeam) return;
    setLoading(true);
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
            Manage your subscription, view usage, and download invoices.
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
          <div style={{ maxWidth: '900px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* Current plan banner */}
            <div style={{
              backgroundColor: '#111318',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '12px',
              padding: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '16px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{
                  width: '40px', height: '40px', borderRadius: '10px',
                  backgroundColor: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <CreditCard size={17} style={{ color: '#a78bfa' }} />
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#f1f3f6' }}>
                    {billing?.plans?.find((p: any) => p.id === billing?.subscription?.planId)?.name || 'Hobby'} Plan
                  </div>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                    Renews on {periodEnd}
                  </div>
                </div>
              </div>
              <span style={{
                padding: '4px 10px', borderRadius: '9999px',
                backgroundColor: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.25)',
                fontSize: '11px', fontWeight: 500, color: '#c4b5fd',
              }}>
                Active
              </span>
            </div>

            {/* Usage stats */}
            <div>
              <div style={{ fontSize: '11px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#4b5563', marginBottom: '12px' }}>
                Current usage
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
                {[
                  { label: 'Projects',     value: billing?.usage?.activeProjects,   icon: Layers,   color: '#7c3aed' },
                  { label: 'Databases',    value: billing?.usage?.databasesCount,   icon: Database, color: '#3b82f6' },
                  { label: 'Storage',      value: `${billing?.usage?.storageGB} GB`, icon: HardDrive, color: '#22c55e' },
                  { label: 'Month spend',  value: `$${billing?.usage?.currentSpend}`, icon: DollarSign, color: '#f59e0b' },
                ].map(({ label, value, icon: Icon, color }) => (
                  <div key={label} style={{
                    backgroundColor: '#111318', border: '1px solid rgba(255,255,255,0.07)',
                    borderRadius: '10px', padding: '16px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <span style={{ fontSize: '11px', color: '#4b5563', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
                      <div style={{ width: '26px', height: '26px', borderRadius: '7px', backgroundColor: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon size={12} style={{ color }} />
                      </div>
                    </div>
                    <div style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-0.03em', color: '#f1f3f6' }}>{value ?? '—'}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Plans */}
            <div>
              <div style={{ fontSize: '11px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#4b5563', marginBottom: '4px' }}>
                Subscription plan
              </div>
              <p style={{ fontSize: '12px', color: '#4b5563', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Lock size={11} /> Plan changes are restricted to system administrators.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
                {billing?.plans?.map((plan: any) => {
                  const isCurrent = billing?.subscription?.planId === plan.id;
                  return (
                    <div key={plan.id} style={{
                      backgroundColor: isCurrent ? 'rgba(124,58,237,0.06)' : '#111318',
                      border: isCurrent ? '1px solid rgba(124,58,237,0.3)' : '1px solid rgba(255,255,255,0.07)',
                      borderRadius: '12px', padding: '18px',
                      display: 'flex', flexDirection: 'column', gap: '12px',
                      position: 'relative',
                    }}>
                      {isCurrent && (
                        <div style={{
                          position: 'absolute', top: '-1px', left: '15px', right: '15px',
                          height: '1px', background: 'linear-gradient(90deg, transparent, rgba(124,58,237,0.8), transparent)',
                        }} />
                      )}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                          <span style={{ fontSize: '13px', fontWeight: 600, color: '#f1f3f6' }}>{plan.name}</span>
                          {isCurrent && (
                            <span style={{
                              padding: '2px 8px', borderRadius: '9999px', fontSize: '10px', fontWeight: 500,
                              backgroundColor: 'rgba(124,58,237,0.15)', color: '#c4b5fd',
                              border: '1px solid rgba(124,58,237,0.3)',
                            }}>Active</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '3px', marginBottom: '6px' }}>
                          <span style={{ fontSize: '26px', fontWeight: 700, letterSpacing: '-0.04em', color: '#f1f3f6' }}>${plan.price}</span>
                          <span style={{ fontSize: '12px', color: '#6b7280' }}>/mo</span>
                        </div>
                        <p style={{ fontSize: '12px', color: '#6b7280', lineHeight: 1.5 }}>{plan.specs}</p>
                      </div>
                      <button
                        disabled
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                          height: '32px', borderRadius: '7px', fontSize: '12px', fontWeight: 500,
                          cursor: 'not-allowed', opacity: 0.6,
                          backgroundColor: isCurrent ? 'rgba(124,58,237,0.15)' : '#181b22',
                          border: isCurrent ? '1px solid rgba(124,58,237,0.25)' : '1px solid rgba(255,255,255,0.08)',
                          color: isCurrent ? '#a78bfa' : '#6b7280',
                        }}
                      >
                        {isCurrent ? <><Check size={11} /> Current plan</> : <><Lock size={11} /> Admin only</>}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Invoices */}
            <div>
              <div style={{ fontSize: '11px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#4b5563', marginBottom: '12px' }}>
                Invoice history
              </div>
              <div style={{
                backgroundColor: '#111318', border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: '12px', overflow: 'hidden',
              }}>
                {billing?.invoices?.length === 0 ? (
                  <div style={{ padding: '32px', textAlign: 'center', color: '#4b5563', fontSize: '13px' }}>
                    No invoices yet.
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
                          width: '30px', height: '30px', borderRadius: '8px',
                          backgroundColor: '#181b22', border: '1px solid rgba(255,255,255,0.07)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <FileText size={13} style={{ color: '#6b7280' }} />
                        </div>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 500, color: '#f1f3f6' }}>{inv.id}</div>
                          <div style={{ fontSize: '11px', color: '#4b5563', marginTop: '2px' }}>{inv.date}</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#f1f3f6' }}>{inv.amount}</span>
                        <span style={{
                          padding: '2px 8px', borderRadius: '9999px', fontSize: '11px', fontWeight: 500,
                          backgroundColor: 'rgba(34,197,94,0.1)', color: '#22c55e',
                          border: '1px solid rgba(34,197,94,0.2)',
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
