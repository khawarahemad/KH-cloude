'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Server, Database, Layers, Shield, Zap, Cpu, Network, FileText, Sparkles } from 'lucide-react';

interface LandingProps {
  onEnterApp: () => void;
}

const stagger = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.12 },
  },
};

const rise = {
  hidden: { y: 18, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { duration: 0.55, ease: 'easeOut' } },
};

const features = [
  {
    icon: Server,
    title: 'Deploy with momentum',
    copy: 'Push from GitHub, ship through a real pipeline, and keep a clean path from build to rollout.',
  },
  {
    icon: Database,
    title: 'Provision systems, not widgets',
    copy: 'Stand up PostgreSQL, Redis, or MySQL instances with predictable connection details and backup-ready defaults.',
  },
  {
    icon: Layers,
    title: 'Object storage that feels built in',
    copy: 'Handle assets, previews, and S3-compatible workflows without bouncing to a separate product.',
  },
];

const plans = [
  {
    name: 'Hobby',
    price: '$0',
    accent: 'from-cyan-300/25 to-cyan-400/5',
    items: ['1 team member', '3 active projects', '5GB storage', 'Shared databases'],
  },
  {
    name: 'Pro',
    price: '$29',
    accent: 'from-amber-300/25 to-amber-400/5',
    featured: true,
    items: ['Unlimited teammates', '25 active projects', '50GB storage', 'Custom domains'],
  },
  {
    name: 'Enterprise',
    price: '$250',
    accent: 'from-emerald-300/20 to-emerald-400/5',
    items: ['Dedicated infrastructure', 'SLA coverage', 'Advanced support', 'Custom limits'],
  },
];

export default function LandingPage({ onEnterApp }: LandingProps) {
  return (
    <div className="min-h-screen overflow-hidden text-white app-shell">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/70 backdrop-blur-2xl">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white shadow-[0_16px_40px_rgba(2,6,23,0.3)]">
              <span className="text-[11px] font-black tracking-[0.22em] text-cyan-200">KH</span>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">KH Cloud</div>
              <div className="text-sm font-semibold tracking-tight text-white">Control plane for modern teams</div>
            </div>
          </div>

          <nav className="hidden items-center gap-7 text-sm text-slate-400 md:flex">
            <a href="#features" className="transition-colors hover:text-white">Features</a>
            <a href="#pricing" className="transition-colors hover:text-white">Pricing</a>
            <a href="#workflow" className="transition-colors hover:text-white">Workflow</a>
          </nav>

          <button onClick={onEnterApp} className="app-button-primary h-11 px-5 text-sm">
            Launch console
            <ArrowRight size={16} />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 pb-20 pt-10 md:pt-16">
        <motion.section variants={stagger} initial="hidden" animate="visible" className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div className="space-y-8">
            <motion.div variants={rise} className="app-chip w-fit">
              <span className="h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(110,231,183,0.8)]" />
              Production infrastructure, arranged clearly
            </motion.div>

            <motion.div variants={rise} className="space-y-5">
              <h1 className="max-w-3xl text-5xl font-semibold tracking-tight text-white md:text-7xl">
                A sharper cloud console for teams that ship every day.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-slate-300 md:text-lg">
                KH Cloud gives you one place for deployments, databases, object storage, and edge logic. The interface is built to feel more like a serious control room and less like a template.
              </p>
            </motion.div>

            <motion.div variants={rise} className="flex flex-col gap-3 sm:flex-row">
              <button onClick={onEnterApp} className="app-button-primary h-12 px-6">
                Get started
                <ArrowRight size={16} />
              </button>
              <a href="#features" className="app-button-secondary h-12 px-6">
                Explore platform
              </a>
            </motion.div>

            <motion.div variants={rise} className="grid gap-4 sm:grid-cols-3">
              {[
                ['Deploys', 'Git-powered delivery'],
                ['Storage', 'Built-in object workflows'],
                ['Control', 'Teams and access boundaries'],
              ].map(([label, value]) => (
                <div key={label} className="app-panel rounded-[1.5rem] p-4">
                  <div className="app-muted-label mb-2">{label}</div>
                  <div className="text-sm font-semibold text-white">{value}</div>
                </div>
              ))}
            </motion.div>
          </div>

          <motion.div variants={rise} className="relative">
            <div className="absolute -inset-6 rounded-[2rem] bg-cyan-400/8 blur-3xl" />
            <div className="app-panel-strong relative overflow-hidden rounded-[2rem] p-6 md:p-7">
              <div className="flex items-center justify-between">
                <div>
                  <div className="app-muted-label">Live surface</div>
                  <div className="mt-2 text-xl font-semibold text-white">Deployment Overview</div>
                </div>
                <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-300">
                  healthy
                </div>
              </div>

              <div className="mt-6 grid gap-4">
                {[
                  ['Projects', '12 active services'],
                  ['Databases', '4 managed instances'],
                  ['Storage', '78 GB stored'],
                  ['Edge functions', '22 deployed handlers'],
                ].map(([label, value], index) => (
                  <div key={label} className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{label}</div>
                        <div className="mt-1 text-sm font-semibold text-white">{value}</div>
                      </div>
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/5 text-cyan-200">
                        {index === 0 && <Cpu size={18} />}
                        {index === 1 && <Database size={18} />}
                        {index === 2 && <Layers size={18} />}
                        {index === 3 && <Network size={18} />}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                  <Sparkles size={14} className="text-cyan-200" />
                  Operator note
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-300">
                  The new UI emphasizes hierarchy, contrast, and fewer visual dead-ends. It is intentionally denser, but more readable.
                </p>
              </div>
            </div>
          </motion.div>
        </motion.section>

        <section id="features" className="mt-20 grid gap-6 border-t border-white/10 pt-12 md:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div key={feature.title} className="app-panel rounded-[1.75rem] p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-400/10 text-cyan-200">
                  <Icon size={22} />
                </div>
                <h3 className="mt-5 text-lg font-semibold text-white">{feature.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-300">{feature.copy}</p>
              </div>
            );
          })}
        </section>

        <section id="workflow" className="mt-20 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="app-panel rounded-[1.75rem] p-6 md:p-7">
            <div className="app-muted-label">Workflow</div>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">One console, one model, less context switching.</h2>
            <p className="mt-4 text-sm leading-6 text-slate-300">
              The app is organized around teams, then projects, databases, storage, and edge functions. That hierarchy keeps the mental model stable as the surface grows.
            </p>
            <div className="mt-6 space-y-3 text-sm text-slate-200">
              {['Create a workspace and invite collaborators', 'Connect code, storage, and data services', 'Review deployment health and usage in one place'].map((item) => (
                <div key={item} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <Shield size={16} className="text-cyan-200" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="app-panel rounded-[1.75rem] p-6 md:p-7">
            <div className="app-muted-label mb-3">What you get</div>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                ['Deployments', 'Clear status, logs, domains, and environment controls.'],
                ['Databases', 'Query tools, row editors, and connection handling.'],
                ['Storage', 'Upload, browse, preview, and share object assets.'],
                ['Edge functions', 'Write, invoke, and iterate on runtime handlers.'],
              ].map(([title, copy]) => (
                <div key={title} className="rounded-2xl border border-white/10 bg-slate-950/65 p-4">
                  <div className="text-sm font-semibold text-white">{title}</div>
                  <p className="mt-2 text-sm leading-6 text-slate-400">{copy}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" className="mt-20 border-t border-white/10 pt-12">
          <div className="max-w-2xl">
            <div className="app-muted-label">Pricing</div>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-4xl">Simple tiers, still presented with care.</h2>
          </div>

          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {plans.map((plan) => (
              <div key={plan.name} className={`app-panel rounded-[1.75rem] p-6 ${plan.featured ? 'ring-1 ring-amber-300/25' : ''}`}>
                <div className={`rounded-[1.5rem] bg-gradient-to-br ${plan.accent} p-4 border border-white/10`}>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">{plan.name}</div>
                  <div className="mt-3 text-4xl font-semibold tracking-tight text-white">{plan.price}</div>
                  <div className="mt-1 text-sm text-slate-300">per month</div>
                </div>
                <div className="mt-5 space-y-3">
                  {plan.items.map((item) => (
                    <div key={item} className="flex items-center gap-2 text-sm text-slate-300">
                      <Zap size={14} className="text-cyan-200" />
                      {item}
                    </div>
                  ))}
                </div>
                <button onClick={onEnterApp} className={`mt-6 w-full ${plan.featured ? 'app-button-primary' : 'app-button-secondary'} h-11`}>
                  {plan.featured ? 'Choose Pro' : 'Select plan'}
                </button>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 bg-slate-950/70 px-6 py-8 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 text-sm text-slate-500 md:flex-row md:items-center md:justify-between">
          <div>© 2026 KH Cloud. Built for deployment, storage, and control.</div>
          <div className="flex gap-5">
            <a href="#" className="transition-colors hover:text-slate-300">Terms</a>
            <a href="#" className="transition-colors hover:text-slate-300">Privacy</a>
            <a href="#" className="transition-colors hover:text-slate-300">Status</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
