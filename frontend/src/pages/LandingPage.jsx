import React, { useEffect, useRef, useState } from 'react';
import { useTheme } from '../utils/theme';

/* ── Pipeline mini-preview nodes ── */
const PIPELINE_NODES = [
  { id: 'n1', label: 'Push Trigger', type: 'trigger', x: 80, y: 40, color: '#22c55e' },
  { id: 'n2', label: 'Cache Restore', type: 'cache', x: 280, y: 10, color: '#0d9488' },
  { id: 'n3', label: 'Build', type: 'build', x: 480, y: 10, color: '#38bdf8' },
  { id: 'n4', label: 'Unit Tests', type: 'test', x: 280, y: 80, color: '#f59e0b' },
  { id: 'n5', label: 'Security Scan', type: 'security', x: 480, y: 80, color: '#f43f5e' },
  { id: 'n6', label: 'Deploy', type: 'deploy', x: 680, y: 40, color: '#6366f1' },
  { id: 'n7', label: 'Notify', type: 'notify', x: 880, y: 40, color: '#ec4899' },
];

const PIPELINE_EDGES = [
  { from: 'n1', to: 'n2' }, { from: 'n1', to: 'n4' },
  { from: 'n2', to: 'n3' }, { from: 'n3', to: 'n6' },
  { from: 'n4', to: 'n5' }, { from: 'n5', to: 'n6' },
  { from: 'n6', to: 'n7' },
];

function PipelineViz() {
  const { theme } = useTheme();
  const nodeMap = Object.fromEntries(PIPELINE_NODES.map(n => [n.id, n]));
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 300);
    return () => clearTimeout(t);
  }, []);

  const textColor = theme === 'light' ? '#1a1a2e' : '#f0f0f2';

  return (
    <div style={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
      <svg
        viewBox="0 0 1000 130"
        style={{ width: '100%', minWidth: 640, height: 'auto', display: 'block' }}
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Edges - rendered first so they appear behind nodes */}
        <g>
          {PIPELINE_EDGES.map((e, i) => {
            const from = nodeMap[e.from];
            const to = nodeMap[e.to];
            const x1 = from.x + 60; const y1 = from.y + 17;
            const x2 = to.x; const y2 = to.y + 17;
            const cx = (x1 + x2) / 2;
            return (
              <g key={i}>
                <path
                  d={`M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2}`}
                  fill="none"
                  stroke="rgba(115,122,230,0.2)"
                  strokeWidth="1.5"
                />
                <path
                  d={`M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2}`}
                  fill="none"
                  stroke="rgba(115,122,230,0.7)"
                  strokeWidth="1.5"
                  strokeDasharray="6 4"
                  style={{
                    strokeDashoffset: animated ? 0 : 200,
                    transition: `stroke-dashoffset ${1.2 + i * 0.1}s ease`,
                  }}
                />
              </g>
            );
          })}
        </g>
        {/* Nodes - rendered after edges so they appear on top */}
        <g>
          {PIPELINE_NODES.map((node, i) => (
            <g
              key={node.id}
              style={{
                opacity: animated ? 1 : 0,
                transform: animated ? 'translateY(0)' : 'translateY(8px)',
                transition: `opacity 0.4s ease ${i * 0.07}s, transform 0.4s ease ${i * 0.07}s`,
              }}
            >
              <rect
                x={node.x} y={node.y}
                width={118} height={34}
                rx={8}
                fill={theme === 'light' ? node.color + '25' : node.color + '18'}
                stroke={node.color + '60'}
                strokeWidth="1"
              />
              <circle cx={node.x + 14} cy={node.y + 17} r={4} fill={node.color} />
              <text
                x={node.x + 26} y={node.y + 22}
                fill={textColor}
                fontSize="11"
                fontWeight="600"
                fontFamily="'JetBrains Mono', monospace"
              >
                {node.label}
              </text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}

/* ── Feature cards ── */
const FEATURES = [
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="7" height="7" rx="1.5"/>
        <rect x="13" y="2" width="7" height="7" rx="1.5"/>
        <rect x="2" y="13" width="7" height="7" rx="1.5"/>
        <rect x="13" y="13" width="7" height="7" rx="1.5"/>
      </svg>
    ),
    title: 'Visual Workflow Builder',
    desc: 'Drag-and-drop pipeline stages onto a canvas. Connect nodes, configure settings, and see your CI/CD architecture come to life visually.',
    accent: '#38bdf8',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 3v5M7 6l4 2 4-2M4 11a7 7 0 0014 0"/>
        <path d="M8 16l3 3 3-3"/>
      </svg>
    ),
    title: 'AI Pipeline Generator',
    desc: 'Describe your project in plain English. The AI writes production-grade YAML and builds the visual node graph — in seconds.',
    accent: '#737AE6',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4h5M13 4h5M4 11h14M6 18h10"/>
        <path d="M6.5 4v7M15.5 4v7M11 11v7"/>
      </svg>
    ),
    title: 'Multi-Platform Output',
    desc: 'Export to GitLab CI, GitHub Actions, Jenkins, or CircleCI — all from the same visual canvas. Switch targets anytime.',
    accent: '#22c55e',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="9"/>
        <path d="M7 11h3l1-3 2 6 1-3h3"/>
      </svg>
    ),
    title: 'Pipeline Health Advisor',
    desc: 'AI grades your pipeline A–F across speed, security, reliability, and best practices — with actionable fix recommendations.',
    accent: '#f59e0b',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4h14a1 1 0 011 1v8a1 1 0 01-1 1H8l-4 3v-3a1 1 0 01-1-1V5a1 1 0 011-1z"/>
        <path d="M8 9h6M8 12h4"/>
      </svg>
    ),
    title: 'Pipeline Chat',
    desc: 'Ask anything about your pipeline. "Why is this slow?" "Add caching." "Is this secure?" Get answers with runnable snippets.',
    accent: '#ec4899',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 6h4M12 6h4M6 11h10M8 16h6"/>
        <path d="M7 6v5M15 6v5M11 11v5"/>
      </svg>
    ),
    title: 'Pipeline Migration',
    desc: 'Upload any Jenkinsfile. FlowForge converts it to your target platform, preserving all stage behavior and intent.',
    accent: '#f43f5e',
  },
];

/* ── How it works steps ── */
const STEPS = [
  {
    num: '01',
    title: 'Build or Generate',
    desc: 'Drag nodes from the library to design your pipeline visually, or use the AI generator — just describe what you want.',
    color: '#737AE6',
  },
  {
    num: '02',
    title: 'Configure & Connect',
    desc: 'Click any node to set images, scripts, environments, and approvers. Connect stages with edges to define flow and dependencies.',
    color: '#38bdf8',
  },
  {
    num: '03',
    title: 'Export & Ship',
    desc: 'Export clean, production-ready YAML for your platform. Download the file, commit it, and watch your pipeline run.',
    color: '#22c55e',
  },
];

/* ── AI Provider badges ── */
const AI_PROVIDERS = ['Claude', 'GPT-4', 'Gemini', 'Featherless', 'Ollama'];
const CICD_PLATFORMS = ['GitLab CI', 'GitHub Actions', 'Jenkins', 'CircleCI'];

/* ── A single animated counter ── */
function Stat({ value, label }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--ff-accent)', letterSpacing: '-0.03em' }}>
        {value}
      </div>
      <div style={{ fontSize: '0.75rem', color: 'var(--ff-muted)', textTransform: 'uppercase', letterSpacing: '0.12em', marginTop: 4 }}>
        {label}
      </div>
    </div>
  );
}

/* ── Main component ── */
export default function LandingPage({ onEnterApp }) {
  const { theme, toggleTheme } = useTheme();
  const heroRef = useRef(null);
  const [scrolled, setScrolled] = useState(false);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 60);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /* ── Inline style helpers ── */
  const s = {
    page: {
      minHeight: '100vh',
      background: 'var(--ff-bg)',
      color: 'var(--ff-text)',
      fontFamily: "'Inter', -apple-system, sans-serif",
      overflowX: 'hidden',
    },
    nav: {
      position: 'sticky',
      top: 0,
      zIndex: 50,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 clamp(1.5rem, 5vw, 4rem)',
      height: 60,
      background: scrolled ? 'rgba(16,16,18,0.92)' : 'transparent',
      backdropFilter: scrolled ? 'blur(14px)' : 'none',
      borderBottom: scrolled ? '1px solid var(--ff-border)' : '1px solid transparent',
      transition: 'all 300ms ease',
    },
    navLight: {
      background: scrolled ? 'rgba(250,250,250,0.92)' : 'transparent',
    },
    logo: {
      display: 'flex', alignItems: 'center', gap: 10,
    },
    logoMark: {
      width: 30, height: 30, borderRadius: 8,
      background: 'linear-gradient(135deg, var(--ff-accent), #a5b4fc)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    },
    logoText: {
      fontSize: '0.9375rem', fontWeight: 700, letterSpacing: '-0.02em',
      color: 'var(--ff-text)',
    },
    navLinks: {
      display: 'flex', alignItems: 'center', gap: 8,
    },
    hero: {
      padding: 'clamp(4rem, 10vh, 7rem) clamp(1.5rem, 5vw, 4rem) clamp(3rem, 7vh, 5rem)',
      maxWidth: 1100,
      margin: '0 auto',
      opacity: entered ? 1 : 0,
      transform: entered ? 'none' : 'translateY(16px)',
      transition: 'opacity 0.6s ease, transform 0.6s ease',
    },
    eyebrow: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      padding: '5px 12px',
      borderRadius: 99,
      border: '1px solid rgba(115,122,230,0.3)',
      background: 'rgba(115,122,230,0.08)',
      fontSize: '0.75rem',
      fontWeight: 600,
      color: 'var(--ff-accent)',
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      marginBottom: '1.25rem',
    },
    h1: {
      fontSize: 'clamp(2.25rem, 5.5vw, 4rem)',
      fontWeight: 800,
      letterSpacing: '-0.035em',
      lineHeight: 1.1,
      color: 'var(--ff-text)',
      marginBottom: '1.25rem',
    },
    h1Accent: {
      background: 'linear-gradient(135deg, var(--ff-accent), #a5b4fc)',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      backgroundClip: 'text',
    },
    heroSub: {
      fontSize: 'clamp(1rem, 2vw, 1.2rem)',
      color: 'var(--ff-text-secondary)',
      maxWidth: 560,
      lineHeight: 1.65,
      marginBottom: '2rem',
    },
    ctaRow: {
      display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: '3.5rem',
    },
    btnPrimary: {
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '0.7rem 1.6rem',
      background: 'var(--ff-accent)',
      color: '#fff',
      borderRadius: 12,
      border: 'none',
      fontWeight: 600,
      fontSize: '0.9rem',
      cursor: 'pointer',
      transition: 'filter 180ms ease, transform 120ms ease',
      letterSpacing: '-0.01em',
    },
    btnSecondary: {
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '0.7rem 1.4rem',
      background: 'var(--ff-card-bg)',
      color: 'var(--ff-text-secondary)',
      borderRadius: 12,
      border: '1px solid var(--ff-border)',
      fontWeight: 500,
      fontSize: '0.9rem',
      cursor: 'pointer',
      transition: 'all 180ms ease',
    },
    vizWrap: {
      borderRadius: 16,
      border: '1px solid var(--ff-card-border)',
      background: 'var(--ff-surface)',
      padding: '1.25rem 1rem',
      boxShadow: '0 20px 60px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.04)',
    },
    vizBar: {
      display: 'flex', alignItems: 'center', gap: 6,
      marginBottom: 14,
      paddingBottom: 12,
      borderBottom: '1px solid var(--ff-card-border)',
    },
    vizDot: (c) => ({
      width: 9, height: 9, borderRadius: '50%', background: c, flexShrink: 0,
    }),
    vizLabel: {
      fontSize: '0.7rem',
      color: 'var(--ff-muted)',
      fontFamily: "'JetBrains Mono', monospace",
      marginLeft: 'auto',
    },
    section: {
      padding: 'clamp(3rem, 8vh, 5rem) clamp(1.5rem, 5vw, 4rem)',
      maxWidth: 1100,
      margin: '0 auto',
    },
    sectionLabel: {
      fontSize: '0.7rem',
      color: 'var(--ff-accent)',
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.14em',
      marginBottom: 10,
    },
    sectionTitle: {
      fontSize: 'clamp(1.5rem, 3.5vw, 2.25rem)',
      fontWeight: 700,
      letterSpacing: '-0.025em',
      color: 'var(--ff-text)',
      marginBottom: '0.6rem',
      lineHeight: 1.2,
    },
    sectionSub: {
      fontSize: '1rem',
      color: 'var(--ff-text-secondary)',
      maxWidth: 500,
      lineHeight: 1.6,
      marginBottom: '2.5rem',
    },
    grid3: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))',
      gap: 16,
    },
    featureCard: {
      background: 'var(--ff-card-bg)',
      border: '1px solid var(--ff-card-border)',
      borderRadius: 16,
      padding: '1.4rem',
      transition: 'border-color 200ms ease, background 200ms ease',
      cursor: 'default',
    },
    featureIcon: (accent) => ({
      width: 42, height: 42,
      borderRadius: 10,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: accent + '18',
      color: accent,
      marginBottom: 14,
      flexShrink: 0,
    }),
    featureTitle: {
      fontSize: '0.9375rem',
      fontWeight: 600,
      color: 'var(--ff-text)',
      marginBottom: 6,
    },
    featureDesc: {
      fontSize: '0.8125rem',
      color: 'var(--ff-text-secondary)',
      lineHeight: 1.6,
    },
    stepsRow: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))',
      gap: 20,
    },
    stepCard: {
      padding: '1.5rem',
      borderRadius: 16,
      background: 'var(--ff-card-bg)',
      border: '1px solid var(--ff-card-border)',
      position: 'relative',
      overflow: 'hidden',
    },
    stepNum: (c) => ({
      fontSize: '3.5rem',
      fontWeight: 800,
      color: c + '50',
      fontFamily: "'JetBrains Mono', monospace",
      lineHeight: 1,
      marginBottom: 12,
      letterSpacing: '-0.04em',
    }),
    stepTitle: {
      fontSize: '1rem',
      fontWeight: 600,
      color: 'var(--ff-text)',
      marginBottom: 8,
    },
    stepDesc: {
      fontSize: '0.8125rem',
      color: 'var(--ff-text-secondary)',
      lineHeight: 1.65,
    },
    divider: {
      height: 1,
      background: 'var(--ff-border)',
      margin: '0 clamp(1.5rem, 5vw, 4rem)',
    },
    platformSection: {
      padding: 'clamp(2.5rem, 6vh, 4rem) clamp(1.5rem, 5vw, 4rem)',
      maxWidth: 1100,
      margin: '0 auto',
    },
    badgeRow: {
      display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12,
    },
    badge: {
      padding: '5px 12px',
      borderRadius: 8,
      border: '1px solid var(--ff-card-border)',
      background: 'var(--ff-card-bg)',
      fontSize: '0.7875rem',
      fontWeight: 500,
      color: 'var(--ff-text-secondary)',
      fontFamily: "'JetBrains Mono', monospace",
    },
    statsRow: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      justifyItems: 'center',
      gap: 24,
      padding: '2.5rem 1.5rem',
      background: 'var(--ff-card-bg)',
      border: '1px solid var(--ff-card-border)',
      borderRadius: 16,
      marginBottom: '3rem',
    },
    cta: {
      padding: 'clamp(3rem, 8vh, 5rem) clamp(1.5rem, 5vw, 4rem)',
      textAlign: 'center',
    },
    ctaBox: {
      maxWidth: 620,
      margin: '0 auto',
      padding: 'clamp(2.5rem, 5vw, 4rem)',
      borderRadius: 24,
      border: '1px solid rgba(115,122,230,0.2)',
      background: 'radial-gradient(ellipse at 50% 0%, rgba(115,122,230,0.08), transparent 70%)',
      boxShadow: '0 0 60px rgba(115,122,230,0.06)',
    },
    ctaTitle: {
      fontSize: 'clamp(1.6rem, 3.5vw, 2.25rem)',
      fontWeight: 700,
      letterSpacing: '-0.025em',
      color: 'var(--ff-text)',
      marginBottom: 12,
    },
    ctaSub: {
      fontSize: '0.9375rem',
      color: 'var(--ff-text-secondary)',
      marginBottom: 28,
      lineHeight: 1.6,
    },
    footer: {
      borderTop: '1px solid var(--ff-border)',
      padding: '1.5rem clamp(1.5rem, 5vw, 4rem)',
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    footerText: {
      fontSize: '0.75rem',
      color: 'var(--ff-muted)',
    },
  };

  /* Hover state for feature cards */
  const [hoveredFeature, setHoveredFeature] = useState(null);
  const [hoveredBtn, setHoveredBtn] = useState(null);

  return (
    <div style={s.page}>
      {/* ── Nav ── */}
      <nav style={{ ...s.nav, ...(theme === 'light' ? s.navLight : {}) }}>
        <span style={s.logoText}>FlowForge</span>

        <div style={s.navLinks}>
          <button
            onClick={toggleTheme}
            className="ff-theme-toggle"
            aria-label="Toggle theme"
            style={{ marginRight: 4 }}
          />
          <button
            onClick={onEnterApp}
            onMouseEnter={() => setHoveredBtn('nav')}
            onMouseLeave={() => setHoveredBtn(null)}
            style={{
              ...s.btnPrimary,
              filter: hoveredBtn === 'nav' ? 'brightness(1.12)' : 'none',
              transform: hoveredBtn === 'nav' ? 'scale(1.02)' : 'none',
            }}
          >
            Launch App
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 7h8M7 3l4 4-4 4"/></svg>
          </button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <div style={s.hero}>
        <div style={s.eyebrow}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ff-accent)', display: 'inline-block' }} />
          AI-Powered CI/CD Automation
        </div>

        <h1 style={s.h1}>
          Build pipelines{' '}
          <span style={s.h1Accent}>visually,</span>
          <br />
          ship them confidently.
        </h1>

        <p style={s.heroSub}>
          FlowForge lets you design CI/CD workflows with drag-and-drop nodes, generate them from natural language,
          and export clean config for any platform — powered by the AI of your choice.
        </p>

        <div style={s.ctaRow}>
          <button
            onClick={onEnterApp}
            onMouseEnter={() => setHoveredBtn('hero')}
            onMouseLeave={() => setHoveredBtn(null)}
            style={{
              ...s.btnPrimary,
              padding: '0.8rem 1.8rem',
              fontSize: '0.9375rem',
              filter: hoveredBtn === 'hero' ? 'brightness(1.12)' : 'none',
              transform: hoveredBtn === 'hero' ? 'scale(1.02)' : 'none',
            }}
          >
            Start Building — Free
            <svg width="15" height="15" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 7h8M7 3l4 4-4 4"/></svg>
          </button>
          <button
            onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
            onMouseEnter={() => setHoveredBtn('learn')}
            onMouseLeave={() => setHoveredBtn(null)}
            style={{
              ...s.btnSecondary,
              padding: '0.8rem 1.6rem',
              fontSize: '0.9375rem',
              borderColor: hoveredBtn === 'learn' ? 'var(--ff-border-strong)' : undefined,
              color: hoveredBtn === 'learn' ? 'var(--ff-text)' : undefined,
            }}
          >
            See how it works
          </button>
        </div>

        {/* Pipeline preview */}
        <div style={s.vizWrap}>
          <div style={s.vizBar}>
            <span style={s.vizDot('#ff5f57')} />
            <span style={s.vizDot('#febc2e')} />
            <span style={s.vizDot('#28c840')} />
            <span style={s.vizLabel}>flowforge — pipeline-canvas.ff</span>
          </div>
          <PipelineViz />
        </div>
      </div>

      {/* ── Stats bar ── */}
      <div style={{ padding: '0 clamp(1.5rem, 5vw, 4rem)', maxWidth: 1100, margin: '0 auto' }}>
        <div style={s.statsRow}>
          <Stat value="5+" label="AI Providers" />
          <Stat value="4+" label="CI/CD Platforms" />
          <Stat value="20" label="Node Types" />
          <Stat value="∞" label="Pipelines" />
        </div>
      </div>

      {/* ── Features ── */}
      <div id="features" style={s.section}>
        <div style={s.sectionLabel}>Capabilities</div>
        <h2 style={s.sectionTitle}>Everything your CI/CD workflow needs</h2>
        <p style={s.sectionSub}>
          From visual design to AI generation, health scoring to live chat — FlowForge covers the full pipeline lifecycle.
        </p>

        <div style={s.grid3}>
          {FEATURES.map((f, i) => (
            <div
              key={i}
              style={{
                ...s.featureCard,
                borderColor: hoveredFeature === i ? f.accent + '40' : 'var(--ff-card-border)',
                background: hoveredFeature === i ? f.accent + '08' : 'var(--ff-card-bg)',
              }}
              onMouseEnter={() => setHoveredFeature(i)}
              onMouseLeave={() => setHoveredFeature(null)}
            >
              <div style={s.featureIcon(f.accent)}>{f.icon}</div>
              <div style={s.featureTitle}>{f.title}</div>
              <div style={s.featureDesc}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={s.divider} />

      {/* ── How it works ── */}
      <div style={s.section}>
        <div style={s.sectionLabel}>Workflow</div>
        <h2 style={s.sectionTitle}>From idea to running pipeline in 3 steps</h2>
        <p style={s.sectionSub}>
          No YAML expertise required. FlowForge handles the config — you focus on what your pipeline should do.
        </p>

        <div style={s.stepsRow}>
          {STEPS.map((step, i) => (
            <div key={i} style={s.stepCard}>
              <div style={s.stepNum(step.color)}>{step.num}</div>
              <div style={{ ...s.stepTitle, color: step.color }}>{step.title}</div>
              <div style={s.stepDesc}>{step.desc}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={s.divider} />

      {/* ── Platforms ── */}
      <div style={s.platformSection}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 420px), 1fr))', gap: 32 }}>
          <div>
            <div style={s.sectionLabel}>AI Providers</div>
            <div style={{ fontSize: '1.0625rem', fontWeight: 600, color: 'var(--ff-text)', marginBottom: 6 }}>
              Bring your own model
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--ff-text-secondary)', lineHeight: 1.6, marginBottom: 14 }}>
              Use any AI provider — from hosted APIs to your own local Ollama. Even plug in a custom key per-request.
            </div>
            <div style={s.badgeRow}>
              {AI_PROVIDERS.map(p => (
                <span key={p} style={s.badge}>{p}</span>
              ))}
            </div>
          </div>
          <div>
            <div style={s.sectionLabel}>CI/CD Targets</div>
            <div style={{ fontSize: '1.0625rem', fontWeight: 600, color: 'var(--ff-text)', marginBottom: 6 }}>
              Platform-independent
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--ff-text-secondary)', lineHeight: 1.6, marginBottom: 14 }}>
              Design once, export anywhere. GitLab CI, GitHub Actions, Jenkins, or CircleCI — clean output every time.
            </div>
            <div style={s.badgeRow}>
              {CICD_PLATFORMS.map(p => (
                <span key={p} style={s.badge}>{p}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={s.divider} />

      {/* ── BYOM callout ── */}
      <div style={{ ...s.section, paddingTop: 'clamp(2.5rem, 6vh, 4rem)', paddingBottom: 'clamp(2.5rem, 6vh, 4rem)' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 460px), 1fr))',
          gap: 24,
          alignItems: 'center',
        }}>
          <div>
            <div style={s.sectionLabel}>Privacy-First</div>
            <h2 style={{ ...s.sectionTitle, marginBottom: 10 }}>Your keys, your models, your data</h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--ff-text-secondary)', lineHeight: 1.65 }}>
              FlowForge never stores your API keys. Supply them per-request via Bring-Your-Own-Model mode,
              or use your backend's configured keys. Run fully local with Ollama — no cloud calls, no telemetry.
            </p>
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
          }}>
            {[
              { label: 'Keys never persisted', icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="4" y="7" width="8" height="7" rx="1.5"/><path d="M6 7V5a2 2 0 014 0v2"/></svg> },
              { label: 'Local LLM support', icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="2" y="3" width="12" height="8" rx="1.5"/><path d="M5 14h6M8 11v3"/></svg> },
              { label: 'Self-hostable backend', icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M3 3h10v4H3zM3 9h10v4H3z"/><circle cx="5" cy="5" r="0.5" fill="currentColor"/><circle cx="5" cy="11" r="0.5" fill="currentColor"/></svg> },
              { label: 'Open source friendly', icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M8 2l2.5 5 5.5.8-4 3.9.9 5.3L8 14.5l-4.9 2.5.9-5.3-4-3.9 5.5-.8z"/></svg> },
            ].map((item, i) => (
              <div key={i} style={{
                padding: '0.875rem 1rem',
                borderRadius: 12,
                border: '1px solid var(--ff-card-border)',
                background: 'var(--ff-card-bg)',
                display: 'flex', alignItems: 'center', gap: 10,
                fontSize: '0.8125rem',
                color: 'var(--ff-text-secondary)',
                fontWeight: 500,
              }}>
                <span style={{ color: 'var(--ff-accent)' }}>{item.icon}</span>
                {item.label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── CTA ── */}
      <div style={s.cta}>
        <div style={s.ctaBox}>
          <div style={{ ...s.sectionLabel, textAlign: 'center', marginBottom: 12 }}>Get Started</div>
          <div style={s.ctaTitle}>Ready to build your pipeline?</div>
          <p style={s.ctaSub}>
            No account required. No credit card. Open FlowForge, drag in your first node,
            and have a working CI/CD config in under five minutes.
          </p>
          <button
            onClick={onEnterApp}
            onMouseEnter={() => setHoveredBtn('cta')}
            onMouseLeave={() => setHoveredBtn(null)}
            style={{
              ...s.btnPrimary,
              padding: '0.85rem 2rem',
              fontSize: '0.9375rem',
              filter: hoveredBtn === 'cta' ? 'brightness(1.12)' : 'none',
              transform: hoveredBtn === 'cta' ? 'scale(1.02)' : 'none',
            }}
          >
            Open FlowForge
            <svg width="15" height="15" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 7h8M7 3l4 4-4 4"/></svg>
          </button>
        </div>
      </div>

      {/* ── Footer ── */}
      <footer style={s.footer}>
        <span style={{ ...s.footerText, fontWeight: 600 }}>FlowForge</span>
        <span style={s.footerText}>
          AI-powered visual CI/CD automation — build, export, ship.
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <a
            href="https://github.com/praneel7015/flowforge"
            target="_blank"
            rel="noopener noreferrer"
            style={{ ...s.footerText, color: 'var(--ff-muted)', textDecoration: 'none' }}
          >
            GitHub
          </a>
          <button
            onClick={onEnterApp}
            style={{ ...s.footerText, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ff-accent)' }}
          >
            Open App →
          </button>
        </div>
      </footer>
    </div>
  );
}
