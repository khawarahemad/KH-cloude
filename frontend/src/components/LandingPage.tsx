'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowRight, Server, Database, Layers, Zap, HardDrive, Network,
  Check, Globe, Github, Terminal
} from 'lucide-react';

interface LandingProps {
  onEnterApp: () => void;
}

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

const features = [
  {
    icon: Server,
    color: '#7c3aed',
    bg: 'rgba(124,58,237,0.12)',
    border: 'rgba(124,58,237,0.2)',
    title: 'Deploy from Git',
    desc: 'Connect any repository and deploy in seconds. Automatic CI/CD with instant rollbacks.',
  },
  {
    icon: Database,
    color: '#3b82f6',
    bg: 'rgba(59,130,246,0.12)',
    border: 'rgba(59,130,246,0.2)',
    title: 'Managed Databases',
    desc: 'PostgreSQL, Redis, and MySQL with automatic backups, connection pooling, and metrics.',
  },
  {
    icon: HardDrive,
    color: '#22c55e',
    bg: 'rgba(34,197,94,0.12)',
    border: 'rgba(34,197,94,0.2)',
    title: 'Object Storage',
    desc: 'S3-compatible storage built into your workflow. Upload, preview, and share assets.',
  },
  {
    icon: Zap,
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.12)',
    border: 'rgba(245,158,11,0.2)',
    title: 'Edge Functions',
    desc: 'Write and deploy serverless handlers at the edge. Zero cold starts, instant response.',
  },
  {
    icon: Globe,
    color: '#06b6d4',
    bg: 'rgba(6,182,212,0.12)',
    border: 'rgba(6,182,212,0.2)',
    title: 'Custom Domains',
    desc: 'Bring your own domain with automatic SSL, smart routing, and global CDN.',
  },
  {
    icon: Network,
    color: '#ec4899',
    bg: 'rgba(236,72,153,0.12)',
    border: 'rgba(236,72,153,0.2)',
    title: 'Team Collaboration',
    desc: 'Invite team members, set roles, and manage access across all your projects.',
  },
];

const plans = [
  {
    name: 'Hobby',
    price: '$0',
    period: '/mo',
    desc: 'For personal projects and experiments.',
    items: ['1 team member', '3 active projects', '5 GB storage', 'Community support'],
    cta: 'Start for free',
    featured: false,
  },
  {
    name: 'Pro',
    price: '$29',
    period: '/mo',
    desc: 'For teams shipping production apps.',
    items: ['Unlimited teammates', '25 active projects', '50 GB storage', 'Custom domains', 'Priority support'],
    cta: 'Start Pro trial',
    featured: true,
  },
  {
    name: 'Enterprise',
    price: '$250',
    period: '/mo',
    desc: 'For organizations with custom needs.',
    items: ['Dedicated infrastructure', 'Custom resource limits', 'SLA coverage', '24/7 support'],
    cta: 'Contact us',
    featured: false,
  },
];

export default function LandingPage({ onEnterApp }: LandingProps) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0b0d11', color: '#f1f3f6', overflowX: 'hidden' }}>

      {/* ─── Navigation ─────────────────────────────────────────────────── */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          height: '60px',
          borderBottom: scrolled ? '1px solid rgba(255,255,255,0.08)' : '1px solid transparent',
          backgroundColor: scrolled ? 'rgba(11,13,17,0.9)' : 'transparent',
          backdropFilter: scrolled ? 'blur(12px)' : 'none',
          transition: 'all 0.2s ease',
          display: 'flex',
          alignItems: 'center',
          padding: '0 24px',
        }}
      >
        <div style={{ maxWidth: '1100px', margin: '0 auto', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '32px', height: '32px', borderRadius: '9px',
              background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(124,58,237,0.4)',
            }}>
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#fff', letterSpacing: '0.04em' }}>KH</span>
            </div>
            <span style={{ fontSize: '15px', fontWeight: 700, letterSpacing: '-0.02em', color: '#f1f3f6' }}>KH Cloud</span>
          </div>

          {/* Nav links */}
          <nav style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {['Features', 'Pricing', 'Docs'].map((link) => (
              <a
                key={link}
                href={`#${link.toLowerCase()}`}
                style={{
                  padding: '6px 12px', borderRadius: '6px', fontSize: '13px', fontWeight: 500,
                  color: '#9ba3af', textDecoration: 'none', transition: 'color 0.12s, background-color 0.12s',
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.color = '#f1f3f6';
                  el.style.backgroundColor = 'rgba(255,255,255,0.06)';
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.color = '#9ba3af';
                  el.style.backgroundColor = 'transparent';
                }}
              >
                {link}
              </a>
            ))}
            <button
              onClick={onEnterApp}
              style={{
                marginLeft: '8px',
                display: 'flex', alignItems: 'center', gap: '6px',
                height: '34px', padding: '0 16px',
                borderRadius: '8px',
                backgroundColor: '#7c3aed',
                border: '1px solid rgba(124,58,237,0.5)',
                color: '#fff',
                fontSize: '13px', fontWeight: 500,
                cursor: 'pointer',
                boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLElement;
                el.style.backgroundColor = '#6d28d9';
                el.style.boxShadow = '0 4px 16px rgba(124,58,237,0.4)';
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLElement;
                el.style.backgroundColor = '#7c3aed';
                el.style.boxShadow = '0 1px 3px rgba(0,0,0,0.4)';
              }}
            >
              Launch console <ArrowRight size={13} />
            </button>
          </nav>
        </div>
      </header>

      {/* ─── Hero ───────────────────────────────────────────────────────── */}
      <motion.section
        variants={stagger}
        initial="hidden"
        animate="visible"
        style={{ maxWidth: '1100px', margin: '0 auto', padding: '96px 24px 80px', textAlign: 'center' }}
      >
        {/* Badge */}
        <motion.div variants={fadeUp} style={{ display: 'flex', justifyContent: 'center', marginBottom: '28px' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '7px',
            padding: '5px 14px', borderRadius: '9999px',
            backgroundColor: 'rgba(124,58,237,0.12)',
            border: '1px solid rgba(124,58,237,0.3)',
            fontSize: '12px', fontWeight: 500, color: '#c4b5fd',
          }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#7c3aed', boxShadow: '0 0 8px rgba(124,58,237,0.8)' }} />
            Now in production — deploy in seconds
          </div>
        </motion.div>

        {/* Headline */}
        <motion.h1
          variants={fadeUp}
          style={{
            fontSize: 'clamp(38px, 6vw, 68px)',
            fontWeight: 700,
            letterSpacing: '-0.04em',
            lineHeight: 1.08,
            color: '#f1f3f6',
            marginBottom: '20px',
            maxWidth: '800px',
            margin: '0 auto 20px',
          }}
        >
          The cloud platform built for{' '}
          <span style={{
            background: 'linear-gradient(135deg, #a78bfa, #7c3aed)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            teams that ship.
          </span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          variants={fadeUp}
          style={{
            fontSize: '16px', color: '#9ba3af', lineHeight: 1.7,
            maxWidth: '560px', margin: '0 auto 36px',
          }}
        >
          Deploy apps, manage databases, store objects, and run edge functions — 
          all from one beautifully designed control plane.
        </motion.p>

        {/* CTA buttons */}
        <motion.div variants={fadeUp} style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={onEnterApp}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              height: '44px', padding: '0 24px',
              borderRadius: '10px',
              backgroundColor: '#7c3aed',
              border: '1px solid rgba(124,58,237,0.5)',
              color: '#fff', fontSize: '14px', fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 4px 20px rgba(124,58,237,0.35)',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.backgroundColor = '#6d28d9';
              el.style.boxShadow = '0 6px 28px rgba(124,58,237,0.5)';
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.backgroundColor = '#7c3aed';
              el.style.boxShadow = '0 4px 20px rgba(124,58,237,0.35)';
            }}
          >
            Get started free <ArrowRight size={15} />
          </button>
          <a
            href="#features"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              height: '44px', padding: '0 24px',
              borderRadius: '10px',
              backgroundColor: '#181b22',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#d1d5db', fontSize: '14px', fontWeight: 500,
              cursor: 'pointer', textDecoration: 'none',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.backgroundColor = '#1e222c';
              el.style.borderColor = 'rgba(255,255,255,0.18)';
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.backgroundColor = '#181b22';
              el.style.borderColor = 'rgba(255,255,255,0.1)';
            }}
          >
            View platform
          </a>
        </motion.div>

        {/* Stats */}
        <motion.div
          variants={fadeUp}
          style={{
            display: 'flex', justifyContent: 'center', gap: '40px',
            marginTop: '60px', flexWrap: 'wrap',
          }}
        >
          {[['10k+', 'Deployments'], ['99.9%', 'Uptime SLA'], ['<50ms', 'Response time'], ['24/7', 'Support']].map(([val, label]) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '22px', fontWeight: 700, color: '#f1f3f6', letterSpacing: '-0.03em' }}>{val}</div>
              <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>{label}</div>
            </div>
          ))}
        </motion.div>
      </motion.section>

      {/* ─── Dashboard preview card ───────────────────────────────────── */}
      <section style={{ maxWidth: '1100px', margin: '0 auto', padding: '0 24px 80px' }}>
        <div style={{
          backgroundColor: '#111318',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '16px',
          overflow: 'hidden',
          boxShadow: '0 32px 80px rgba(0,0,0,0.5)',
        }}>
          {/* Fake browser bar */}
          <div style={{
            height: '40px', backgroundColor: '#0e1015',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex', alignItems: 'center', padding: '0 16px', gap: '8px',
          }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#ef4444', opacity: 0.7 }} />
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#f59e0b', opacity: 0.7 }} />
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#22c55e', opacity: 0.7 }} />
            <div style={{
              flex: 1, marginLeft: '8px', height: '22px',
              backgroundColor: '#181b22', borderRadius: '6px',
              border: '1px solid rgba(255,255,255,0.06)',
              display: 'flex', alignItems: 'center', padding: '0 12px',
              fontSize: '11px', color: '#4b5563',
            }}>
              cloud.khawarahemad.com
            </div>
          </div>

          {/* Fake dashboard content */}
          <div style={{ padding: '24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
            {[
              { label: 'Active Projects', value: '12', color: '#7c3aed', icon: Layers },
              { label: 'Databases', value: '4', color: '#3b82f6', icon: Database },
              { label: 'Storage Used', value: '78 GB', color: '#22c55e', icon: HardDrive },
              { label: 'Edge Functions', value: '22', color: '#f59e0b', icon: Zap },
            ].map(({ label, value, color, icon: Icon }) => (
              <div
                key={label}
                style={{
                  backgroundColor: '#181b22',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: '10px',
                  padding: '16px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span style={{ fontSize: '11px', color: '#6b7280', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
                  <div style={{ width: '28px', height: '28px', borderRadius: '7px', backgroundColor: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={13} style={{ color }} />
                  </div>
                </div>
                <div style={{ fontSize: '24px', fontWeight: 700, color: '#f1f3f6', letterSpacing: '-0.03em' }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Features ───────────────────────────────────────────────────── */}
      <section id="features" style={{ maxWidth: '1100px', margin: '0 auto', padding: '40px 24px 80px' }}>
        <div style={{ marginBottom: '48px' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            fontSize: '11px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em',
            color: '#7c3aed', marginBottom: '12px',
          }}>
            <Zap size={11} /> Platform features
          </div>
          <h2 style={{ fontSize: '32px', fontWeight: 700, letterSpacing: '-0.03em', color: '#f1f3f6', marginBottom: '12px' }}>
            Everything in one place
          </h2>
          <p style={{ fontSize: '15px', color: '#9ba3af', maxWidth: '520px' }}>
            One control plane for all your infrastructure. No tab switching. No context loss.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                style={{
                  backgroundColor: '#111318',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: '12px',
                  padding: '20px',
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.14)')}
                onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)')}
              >
                <div style={{
                  width: '36px', height: '36px', borderRadius: '9px',
                  backgroundColor: f.bg, border: `1px solid ${f.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: '14px',
                }}>
                  <Icon size={16} style={{ color: f.color }} />
                </div>
                <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#f1f3f6', marginBottom: '6px' }}>{f.title}</h3>
                <p style={{ fontSize: '13px', color: '#6b7280', lineHeight: 1.6 }}>{f.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ─── Pricing ────────────────────────────────────────────────────── */}
      <section id="pricing" style={{ maxWidth: '1100px', margin: '0 auto', padding: '40px 24px 80px' }}>
        <div style={{ marginBottom: '48px' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            fontSize: '11px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em',
            color: '#7c3aed', marginBottom: '12px',
          }}>
            Pricing
          </div>
          <h2 style={{ fontSize: '32px', fontWeight: 700, letterSpacing: '-0.03em', color: '#f1f3f6', marginBottom: '12px' }}>
            Simple, transparent pricing
          </h2>
          <p style={{ fontSize: '15px', color: '#9ba3af' }}>
            Start free. Scale as you grow. No hidden fees.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px', alignItems: 'start' }}>
          {plans.map((plan) => (
            <div
              key={plan.name}
              style={{
                backgroundColor: plan.featured ? '#13111a' : '#111318',
                border: plan.featured ? '1px solid rgba(124,58,237,0.4)' : '1px solid rgba(255,255,255,0.07)',
                borderRadius: '14px',
                padding: '24px',
                position: 'relative',
                boxShadow: plan.featured ? '0 8px 32px rgba(124,58,237,0.15)' : 'none',
              }}
            >
              {plan.featured && (
                <div style={{
                  position: 'absolute', top: '-1px', left: '20px', right: '20px',
                  height: '2px', background: 'linear-gradient(90deg, transparent, #7c3aed, transparent)',
                }} />
              )}
              {plan.featured && (
                <div style={{
                  position: 'absolute', top: '16px', right: '16px',
                  padding: '3px 10px', borderRadius: '9999px', fontSize: '10px',
                  fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em',
                  backgroundColor: 'rgba(124,58,237,0.2)', color: '#a78bfa',
                  border: '1px solid rgba(124,58,237,0.3)',
                }}>
                  Popular
                </div>
              )}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '13px', fontWeight: 500, color: plan.featured ? '#c4b5fd' : '#9ba3af', marginBottom: '8px' }}>
                  {plan.name}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '36px', fontWeight: 700, letterSpacing: '-0.04em', color: '#f1f3f6' }}>{plan.price}</span>
                  <span style={{ fontSize: '13px', color: '#6b7280' }}>{plan.period}</span>
                </div>
                <p style={{ fontSize: '12px', color: '#6b7280' }}>{plan.desc}</p>
              </div>
              <div style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {plan.items.map((item) => (
                  <div key={item} style={{ display: 'flex', alignItems: 'center', gap: '9px', fontSize: '13px', color: '#d1d5db' }}>
                    <div style={{
                      width: '16px', height: '16px', borderRadius: '50%', flexShrink: 0,
                      backgroundColor: plan.featured ? 'rgba(124,58,237,0.2)' : 'rgba(255,255,255,0.06)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Check size={9} style={{ color: plan.featured ? '#a78bfa' : '#6b7280' }} />
                    </div>
                    {item}
                  </div>
                ))}
              </div>
              <button
                onClick={onEnterApp}
                style={{
                  width: '100%', height: '38px',
                  borderRadius: '8px',
                  backgroundColor: plan.featured ? '#7c3aed' : '#181b22',
                  border: plan.featured ? '1px solid rgba(124,58,237,0.5)' : '1px solid rgba(255,255,255,0.1)',
                  color: plan.featured ? '#fff' : '#d1d5db',
                  fontSize: '13px', fontWeight: 500,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  transition: 'all 0.15s',
                  boxShadow: plan.featured ? '0 2px 8px rgba(124,58,237,0.3)' : 'none',
                }}
              >
                {plan.cta} <ArrowRight size={13} />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Footer ────────────────────────────────────────────────────── */}
      <footer style={{
        borderTop: '1px solid rgba(255,255,255,0.06)',
        backgroundColor: '#0e1015',
        padding: '32px 24px',
      }}>
        <div style={{
          maxWidth: '1100px', margin: '0 auto',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '24px', height: '24px', borderRadius: '7px',
              background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: '9px', fontWeight: 800, color: '#fff' }}>KH</span>
            </div>
            <span style={{ fontSize: '13px', color: '#6b7280' }}>© 2026 KH Cloud. All rights reserved.</span>
          </div>
          <div style={{ display: 'flex', gap: '20px' }}>
            {['Terms', 'Privacy', 'Status', 'Docs'].map((link) => (
              <a
                key={link}
                href="#"
                style={{ fontSize: '13px', color: '#6b7280', textDecoration: 'none', transition: 'color 0.12s' }}
                onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#9ba3af')}
                onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#6b7280')}
              >
                {link}
              </a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
