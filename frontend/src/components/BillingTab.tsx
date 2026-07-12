'use client';

import React, { useState, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { apiRequest } from '@/lib/api';
import { CreditCard, Check, Shield, Zap, DollarSign, Loader2 } from 'lucide-react';

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
    <div className="flex-1 flex flex-col min-h-0 bg-[#030303]">
      {/* Header */}
      <div className="h-16 border-b border-white/5 px-6 flex items-center shrink-0">
        <h2 className="text-sm font-bold tracking-tight">Billing & Usage</h2>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-500 gap-3">
            <Loader2 className="animate-spin text-indigo-400" size={32} />
            <span className="text-xs">Connecting to Stripe gateway...</span>
          </div>
        ) : (
          <div className="max-w-5xl mx-auto space-y-8">
            
            {/* Usage Summary Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="glass-card p-5 rounded-2xl border border-white/5">
                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block mb-1">Active Projects</span>
                <span className="text-2xl font-black text-white">{billing?.usage?.activeProjects}</span>
              </div>
              <div className="glass-card p-5 rounded-2xl border border-white/5">
                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block mb-1">Active Databases</span>
                <span className="text-2xl font-black text-white">{billing?.usage?.databasesCount}</span>
              </div>
              <div className="glass-card p-5 rounded-2xl border border-white/5">
                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block mb-1">Storage Assets</span>
                <span className="text-2xl font-black text-white">{billing?.usage?.storageGB} GB</span>
              </div>
              <div className="glass-card p-5 rounded-2xl border border-white/5">
                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block mb-1">Current Month Cost</span>
                <span className="text-2xl font-black text-indigo-400">${billing?.usage?.currentSpend}</span>
              </div>
            </div>

            {/* Plans Section */}
            <div>
              <h3 className="text-xs font-bold text-zinc-400 mb-1 uppercase tracking-wider">Select Subscription Plan</h3>
              <p className="text-[10px] text-zinc-500 mb-4">
                Plan modifications are restricted. Only system administrators can change a team's plan.
              </p>
              <div className="grid md:grid-cols-3 gap-6">
                {billing?.plans?.map((plan: any) => {
                  const isCurrent = billing?.subscription?.planId === plan.id;
                  return (
                    <div
                      key={plan.id}
                      className={`glass-card p-6 rounded-2xl border relative flex flex-col justify-between h-56 transition-all ${
                        isCurrent ? 'border-indigo-500 bg-indigo-500/[0.02]' : 'border-white/5'
                      }`}
                    >
                      {isCurrent && (
                        <span className="absolute top-4 right-4 text-[9px] font-bold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400">
                          Active
                        </span>
                      )}

                      <div>
                        <h4 className="text-xs font-bold text-white mb-1">{plan.name}</h4>
                        <div className="flex items-baseline gap-0.5 mb-4">
                          <span className="text-2xl font-black">${plan.price}</span>
                          <span className="text-zinc-500 text-[10px]">/ month</span>
                        </div>
                        <p className="text-[10px] text-zinc-400 leading-relaxed font-semibold">{plan.specs}</p>
                      </div>

                      <button
                        disabled={true}
                        className={`w-full h-9 mt-6 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-not-allowed ${
                          isCurrent
                            ? 'bg-indigo-500/10 text-indigo-400'
                            : 'bg-zinc-800/40 text-zinc-500'
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
              <h3 className="text-xs font-bold text-zinc-400 mb-4 uppercase tracking-wider">Invoice History</h3>
              <div className="border border-white/5 rounded-2xl overflow-hidden glass-card">
                {billing?.invoices?.length === 0 ? (
                  <div className="p-8 text-center text-zinc-500 text-xs font-medium">No invoices found.</div>
                ) : (
                  <div className="divide-y divide-white/5">
                    {billing?.invoices?.map((inv: any) => (
                      <div key={inv.id} className="p-4 flex items-center justify-between text-xs">
                        <div>
                          <span className="font-bold text-zinc-300 block">{inv.id}</span>
                          <span className="text-[10px] text-zinc-500 mt-0.5 block">{inv.date}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="font-bold text-white">{inv.amount}</span>
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
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
