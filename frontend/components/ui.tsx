// src/components/ui.tsx
"use client";

import { ReactNode } from "react";

// ── Score badge ───────────────────────────────────────────────────────────────

export function VerdictBadge({
  verdict,
}: {
  verdict: "Strong Match" | "Moderate Match" | "Weak Match" | string;
}) {
  const map: Record<string, string> = {
    "Strong Match":   "badge-strong",
    "Moderate Match": "badge-moderate",
    "Weak Match":     "badge-weak",
  };
  return (
    <span className={`badge ${map[verdict] ?? "badge-weak"}`}>{verdict}</span>
  );
}

// ── Horizontal score bar ──────────────────────────────────────────────────────

export function ScoreBar({
  value,
  max = 100,
  label,
}: {
  value: number;
  max?: number;
  label?: string;
}) {
  const pct = Math.min(100, (value / max) * 100);
  const color =
    pct >= 70 ? "var(--accent-green)" :
    pct >= 45 ? "var(--accent-amber)" :
    "var(--accent-red)";

  return (
    <div className="score-bar-wrap">
      {label && <span className="score-bar-label">{label}</span>}
      <div className="score-bar-track">
        <div
          className="score-bar-fill"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="score-bar-value">{value.toFixed(1)}%</span>
    </div>
  );
}

// ── Skill pill ────────────────────────────────────────────────────────────────

export function Pill({
  children,
  variant = "neutral",
}: {
  children: ReactNode;
  variant?: "match" | "miss" | "neutral";
}) {
  return <span className={`pill pill-${variant}`}>{children}</span>;
}

// ── Stat card ─────────────────────────────────────────────────────────────────

export function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="stat-card">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

export function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: string;
  children: ReactNode;
}) {
  return (
    <section className="section">
      <h2 className="section-title">
        {icon && <span>{icon}</span>} {title}
      </h2>
      {children}
    </section>
  );
}

// ── Collapsible card ──────────────────────────────────────────────────────────

export function Collapsible({
  header,
  children,
  defaultOpen = false,
}: {
  header: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="collapsible" open={defaultOpen}>
      <summary className="collapsible-header">{header}</summary>
      <div className="collapsible-body">{children}</div>
    </details>
  );
}
