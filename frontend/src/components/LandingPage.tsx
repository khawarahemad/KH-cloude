'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Server, Database, Shield, Zap, Cpu, Network, Layers, HelpCircle } from 'lucide-react';

interface LandingProps {
  onEnterApp: () => void;
}

export default function LandingPage({ onEnterApp }: LandingProps) {
  const containerVariants: any = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.15 }
    }
  };

  const itemVariants: any = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { duration: 0.6, ease: "easeOut" }
    }
  };

  return (
    <div className="min-h-screen bg-[#030303] text-white relative overflow-hidden font-sans selection:bg-white/10 selection:text-white">
      {/* Background Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-purple-900/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-900/10 blur-[120px] pointer-events-none" />
      <div className="absolute top-[30%] left-[40%] w-[300px] h-[300px] rounded-full bg-blue-900/10 blur-[100px] pointer-events-none" />

      {/* Header */}
      <header className="border-b border-white/5 backdrop-blur-md sticky top-0 z-50 bg-[#030303]/70">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-lg tracking-tight">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <span className="text-white text-sm font-black">KH</span>
            </div>
            <span>KH Cloud</span>
          </div>
          <nav className="hidden md:flex items-center gap-8 text-sm text-zinc-400 font-medium">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#storage" className="hover:text-white transition-colors">Object Storage</a>
            <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
            <a href="#docs" className="hover:text-white transition-colors">Docs</a>
          </nav>
          <button
            onClick={onEnterApp}
            className="h-9 px-4 rounded-full bg-white text-black font-semibold text-sm hover:bg-zinc-200 transition-colors flex items-center gap-1 shadow-md shadow-white/5 active:scale-95 duration-100"
          >
            Launch Console
            <ArrowRight size={14} />
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-24 pb-20 px-6 max-w-7xl mx-auto text-center">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="flex flex-col items-center gap-8"
        >
          <motion.div
            variants={itemVariants}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/5 text-xs text-indigo-300 font-medium"
          >
            <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
            Object Storage platform is now live
          </motion.div>

          <motion.h1
            variants={itemVariants}
            className="text-5xl md:text-7xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-white to-zinc-400 max-w-4xl leading-tight"
          >
            The Serverless Cloud Platform for Enterprise Builders
          </motion.h1>

          <motion.p
            variants={itemVariants}
            className="text-lg text-zinc-400 max-w-2xl font-light leading-relaxed"
          >
            Deploy high-performance web applications, provision relational & in-memory databases, and manage secure Object Storage buckets with zero infrastructure friction.
          </motion.p>

          <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-4 mt-4">
            <button
              onClick={onEnterApp}
              className="h-12 px-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-semibold flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20 active:scale-95 duration-100"
            >
              Get Started Free
              <ArrowRight size={16} />
            </button>
            <button
              onClick={onEnterApp}
              className="h-12 px-8 rounded-full border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 text-white font-medium flex items-center justify-center gap-2 active:scale-95 duration-100"
            >
              View Documentation
            </button>
          </motion.div>
        </motion.div>
      </section>

      {/* Main Feature Cards */}
      <section id="features" className="py-20 px-6 max-w-7xl mx-auto border-t border-white/5">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tight mb-4">Complete Suite of Developer Tooling</h2>
          <p className="text-zinc-400 text-sm max-w-lg mx-auto">Everything you need to launch, scale, and secure your production web applications.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Card 1: App hosting */}
          <div className="glass-card p-8 rounded-2xl relative overflow-hidden group hover:border-white/10 transition-colors">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl group-hover:bg-indigo-500/10 transition-colors" />
            <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 mb-6">
              <Server size={24} />
            </div>
            <h3 className="text-lg font-bold mb-2">Automated Deployments</h3>
            <p className="text-zinc-400 text-sm leading-relaxed">Connect your GitHub repositories. Every push automatically builds, rolls out zero-downtime container updates, and deploys HTTPS endpoints.</p>
          </div>

          {/* Card 2: Managed Databases */}
          <div className="glass-card p-8 rounded-2xl relative overflow-hidden group hover:border-white/10 transition-colors">
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full blur-2xl group-hover:bg-purple-500/10 transition-colors" />
            <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400 mb-6">
              <Database size={24} />
            </div>
            <h3 className="text-lg font-bold mb-2">One-Click Provisioning</h3>
            <p className="text-zinc-400 text-sm leading-relaxed">Launch dedicated PostgreSQL, Redis, or MySQL database instances instantly. Get credentials, automatic connection strings, and backups.</p>
          </div>

          {/* Card 3: Managed Storage */}
          <div className="glass-card p-8 rounded-2xl relative overflow-hidden group hover:border-white/10 transition-colors">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-colors" />
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 mb-6">
              <Layers size={24} />
            </div>
            <h3 className="text-lg font-bold mb-2">Object Storage Platform</h3>
            <p className="text-zinc-400 text-sm leading-relaxed">First-class MinIO-backed Object Storage. Drag & drop assets explorer, automatic WebP image resizing, folders, and S3-compatible SDK snippets.</p>
          </div>
        </div>
      </section>

      {/* Pricing Grid */}
      <section id="pricing" className="py-20 px-6 max-w-7xl mx-auto border-t border-white/5">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tight mb-4">Simple, Transparent Pricing</h2>
          <p className="text-zinc-400 text-sm max-w-lg mx-auto">Start building for free. Upgrade to a paid plan as your workload scales.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {/* Plan 1 */}
          <div className="glass-card p-8 rounded-2xl border border-white/5 flex flex-col justify-between">
            <div>
              <h4 className="text-zinc-400 text-xs font-bold tracking-wider uppercase mb-2">Hobby</h4>
              <div className="flex items-baseline gap-1 mb-6">
                <span className="text-4xl font-extrabold">$0</span>
                <span className="text-zinc-500 text-sm">/ month</span>
              </div>
              <ul className="space-y-3 text-sm text-zinc-300">
                <li className="flex items-center gap-2"><Zap size={14} className="text-indigo-400" /> 1 Team Member</li>
                <li className="flex items-center gap-2"><Zap size={14} className="text-indigo-400" /> 3 Active Projects</li>
                <li className="flex items-center gap-2"><Zap size={14} className="text-indigo-400" /> 5GB Object Storage</li>
                <li className="flex items-center gap-2"><Zap size={14} className="text-indigo-400" /> Shared DB clusters</li>
              </ul>
            </div>
            <button onClick={onEnterApp} className="w-full h-10 mt-8 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold text-sm transition-colors">
              Deploy Free
            </button>
          </div>

          {/* Plan 2: Pro */}
          <div className="glass-card p-8 rounded-2xl border-2 border-indigo-500 relative flex flex-col justify-between shadow-2xl shadow-indigo-500/5">
            <div className="absolute top-0 right-6 translate-y-[-50%] px-3 py-1 rounded-full bg-indigo-500 text-white text-[10px] font-bold uppercase tracking-wider">
              Most Popular
            </div>
            <div>
              <h4 className="text-indigo-300 text-xs font-bold tracking-wider uppercase mb-2">Pro Plan</h4>
              <div className="flex items-baseline gap-1 mb-6">
                <span className="text-4xl font-extrabold">$29</span>
                <span className="text-zinc-500 text-sm">/ month</span>
              </div>
              <ul className="space-y-3 text-sm text-zinc-300">
                <li className="flex items-center gap-2"><Zap size={14} className="text-indigo-400" /> Unlimited Team Members</li>
                <li className="flex items-center gap-2"><Zap size={14} className="text-indigo-400" /> 25 Active Projects</li>
                <li className="flex items-center gap-2"><Zap size={14} className="text-indigo-400" /> 50GB Object Storage</li>
                <li className="flex items-center gap-2"><Zap size={14} className="text-indigo-400" /> Dedicated databases</li>
                <li className="flex items-center gap-2"><Zap size={14} className="text-indigo-400" /> Custom Domain support</li>
              </ul>
            </div>
            <button onClick={onEnterApp} className="w-full h-10 mt-8 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-semibold text-sm transition-colors shadow-md shadow-indigo-500/20">
              Upgrade to Pro
            </button>
          </div>

          {/* Plan 3 */}
          <div className="glass-card p-8 rounded-2xl border border-white/5 flex flex-col justify-between">
            <div>
              <h4 className="text-zinc-400 text-xs font-bold tracking-wider uppercase mb-2">Enterprise</h4>
              <div className="flex items-baseline gap-1 mb-6">
                <span className="text-4xl font-extrabold">$250</span>
                <span className="text-zinc-500 text-sm">/ month</span>
              </div>
              <ul className="space-y-3 text-sm text-zinc-300">
                <li className="flex items-center gap-2"><Zap size={14} className="text-indigo-400" /> Custom server clusters</li>
                <li className="flex items-center gap-2"><Zap size={14} className="text-indigo-400" /> 500GB+ Object Storage</li>
                <li className="flex items-center gap-2"><Zap size={14} className="text-indigo-400" /> 99.9% Uptime SLA Guarantee</li>
                <li className="flex items-center gap-2"><Zap size={14} className="text-indigo-400" /> Dedicated Account Manager</li>
              </ul>
            </div>
            <button onClick={onEnterApp} className="w-full h-10 mt-8 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold text-sm transition-colors">
              Contact Sales
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-12 px-6 bg-black/40">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2 text-zinc-400 text-sm">
            <div className="w-6 h-6 rounded-md bg-white/10 flex items-center justify-center">
              <span className="text-white text-xs font-black">KH</span>
            </div>
            <span>© 2026 KH Cloud. All rights reserved. Built with Next.js 15 & NestJS.</span>
          </div>
          <div className="flex gap-6 text-sm text-zinc-500">
            <a href="#" className="hover:text-zinc-300 transition-colors">Terms</a>
            <a href="#" className="hover:text-zinc-300 transition-colors">Privacy</a>
            <a href="#" className="hover:text-zinc-300 transition-colors">Status</a>
            <a href="#" className="hover:text-zinc-300 transition-colors">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
