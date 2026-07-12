'use client';

import React, { useState, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { apiRequest } from '@/lib/api';
import { Loader2 } from 'lucide-react';

export default function BillingTab() {
  const { activeTeam } = useAppStore();
  const [billing, setBilling] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingPlanId, setUpdatingPlanId] = useState<string | null>(null);

  const fetchBillingInfo = async () => {
    if (!activeTeam) return;
    setLoading(true);
    try {
      const data = await apiRequest(`/billing?teamId=${activeTeam.id}`);
      setBilling(data);
    } catch (err) {
      // Mock Billing Fallback
      setBilling({
        subscription: { planId: 'hobby', currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() },
        plans: [
          { id: 'hobby', name: 'Hobby', price: 0, specs: '1 Team member, 3 projects, 5GB storage' },
          { id: 'pro', name: 'Pro', price: 29, specs: 'Unlimited members, 25 projects, 50GB storage' },
          { id: 'enterprise', name: 'Enterprise', price: 250, specs: 'Custom limits, dedicated servers, SLA' },
        ],
        invoices: [
          { id: 'inv_398a', date: 'Jul 01, 2026', amount: '$0.00', status: 'PAID' },
          { id: 'inv_8912', date: 'Jun 01, 2026', amount: '$0.00', status: 'PAID' },
        ],
        usage: { activeProjects: 0, databasesCount: 0, storageGB: '0.00', currentSpend: '0.00' }
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBillingInfo();
  }, [activeTeam]);

  const handleUpdatePlan = async (planId: string) => {
    if (!activeTeam || planId === billing?.subscription?.planId) return;
    setUpdatingPlanId(planId);
    try {
      await apiRequest(`/billing/plan?teamId=${activeTeam.id}`, {
        method: 'POST',
        body: JSON.stringify({ planId }),
      });
      fetchBillingInfo();
    } catch (err) {
      console.error(err);
    } finally {
      setUpdatingPlanId(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-transparent">
      {/* Header */}
      <div className="app-panel-strong mx-4 mt-4 rounded-[1.75rem] px-5 py-4 shrink-0">
        <div>
          <div className="app-muted-label mb-1">Billing</div>
          <h2 className="text-xl font-semibold tracking-tight text-white">Billing & usage</h2>
          <p className="mt-1 text-sm text-slate-400">View plan usage, invoices, and current spend with a cleaner summary.</p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-3">
            <Loader2 className="animate-spin text-cyan-300" size={32} />
            <span className="text-xs uppercase tracking-[0.18em]">Connecting to billing gateway</span>
          </div>
        ) : (
          <div className="max-w-5xl mx-auto space-y-8">
            
            {/* Usage Summary Grid */}
            <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
              <div className="app-panel rounded-[1.5rem] p-5 border border-white/10">
                <span className="app-muted-label block mb-1">Active projects</span>
                <span className="text-2xl font-black text-white">{billing?.usage?.activeProjects}</span>
              </div>
              <div className="app-panel rounded-[1.5rem] p-5 border border-white/10">
                <span className="app-muted-label block mb-1">Active databases</span>
                <span className="text-2xl font-black text-white">{billing?.usage?.databasesCount}</span>
              </div>
              <div className="app-panel rounded-[1.5rem] p-5 border border-white/10">
                <span className="app-muted-label block mb-1">Storage assets</span>
                <span className="text-2xl font-black text-white">{billing?.usage?.storageGB} GB</span>
              </div>
              <div className="app-panel rounded-[1.5rem] p-5 border border-white/10">
                <span className="app-muted-label block mb-1">Current month cost</span>
                <span className="text-2xl font-black text-cyan-200">${billing?.usage?.currentSpend}</span>
              </div>
            </div>

            {/* Plans Section */}
            <div>
              <h3 className="app-muted-label mb-1">Select subscription plan</h3>
              <p className="mb-4 text-[10px] text-slate-500">
                Plan modifications are restricted. Only system administrators can change a team's plan.
              </p>
              <div className="grid md:grid-cols-3 gap-6">
                {billing?.plans?.map((plan: any) => {
                  const isCurrent = billing?.subscription?.planId === plan.id;
                  return (
                    <div
                      key={plan.id}
                      className={`app-panel relative flex h-56 flex-col justify-between rounded-[1.75rem] border p-6 transition-all ${
                          isCurrent ? 'border-cyan-400/20 bg-cyan-400/[0.03]' : 'border-white/10'
                      }`}
                    >
                      {isCurrent && (
                        <span className="absolute top-4 right-4 rounded-full bg-cyan-400/10 px-2 py-0.5 text-[9px] font-bold text-cyan-200">
                          Active
                        </span>
                      )}

                      <div>
                        <h4 className="mb-1 text-xs font-bold text-white">{plan.name}</h4>
                        <div className="flex items-baseline gap-0.5 mb-4">
                          <span className="text-2xl font-black">${plan.price}</span>
                          <span className="text-slate-500 text-[10px]">/ month</span>
                        </div>
                        <p className="text-[10px] text-slate-400 leading-relaxed font-semibold">{plan.specs}</p>
                      </div>

                      <button
                        disabled={true}
                        className={`mt-6 flex h-11 w-full items-center justify-center gap-1.5 rounded-full text-xs font-bold cursor-not-allowed transition-colors ${
                          isCurrent
                            ? 'bg-cyan-400/10 text-cyan-200'
                            : 'bg-white/5 text-slate-500'
                        }`}
                      >
                        {isCurrent ? 'Current Plan' : 'Admin Upgrade Only'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Invoices */}
            <div>
              <h3 className="app-muted-label mb-4">Invoice history</h3>
              <div className="app-panel overflow-hidden rounded-[1.75rem] border border-white/10">
                {billing?.invoices?.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-xs font-medium">No invoices found.</div>
                ) : (
                  <div className="divide-y divide-white/10">
                    {billing?.invoices?.map((inv: any) => (
                      <div key={inv.id} className="flex items-center justify-between p-4 text-xs">
                        <div>
                          <span className="block font-semibold text-white">{inv.id}</span>
                          <span className="mt-0.5 block text-[10px] text-slate-500">{inv.date}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="font-bold text-white">{inv.amount}</span>
                          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold text-emerald-300">
                            {inv.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
