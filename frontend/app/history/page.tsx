"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import {
  fetchSessions,
  fetchSessionCandidates,
  deleteSession,
  AnalysisSession,
  Candidate,
} from "@/lib/api";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(dateStr: string) {
  const d = new Date(dateStr);
  return (
    d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) +
    "  ·  " +
    d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
  );
}

function verdictClass(verdict: string) {
  if (verdict === "Strong Match")   return "badge-strong";
  if (verdict === "Moderate Match") return "badge-moderate";
  return "badge-weak";
}

function scoreColor(v: number) {
  return v >= 70 ? "var(--accent-green)" : v >= 45 ? "var(--accent-amber)" : "var(--accent-red)";
}

// ── Small shared pieces ───────────────────────────────────────────────────────

function Pill({ text, variant = "neutral", idx = 0 }: { text: string; variant?: "match" | "miss" | "neutral"; idx?: number }) {
  return <span key={`${text}-${idx}`} className={`pill pill--sm pill-${variant}`}>{text}</span>;
}

function PillRow({ items, variant = "neutral" }: { items: string[]; variant?: "match" | "miss" | "neutral" }) {
  if (!items?.length) return <span className="empty-note">—</span>;
  // deduplicate before rendering to avoid key collisions
  const unique = Array.from(new Set(items));
  return (
    <div className="pill-row">
      {unique.map((s, i) => <Pill key={`${s}-${i}`} text={s} variant={variant} />)}
    </div>
  );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="score-bar-wrap">
      <span className="score-bar-label">{label}</span>
      <div className="score-bar-track">
        <div className="score-bar-fill" style={{ width: `${Math.min(value, 100)}%`, background: scoreColor(value) }} />
      </div>
      <span className="score-bar-value">{value.toFixed(1)}%</span>
    </div>
  );
}

// ── Excel export helper ───────────────────────────────────────────────────────

function exportToExcel(session: AnalysisSession, candidates: Candidate[]) {
  const rows = [
    ["Resume", "Candidate Name", "College", "Score (%)", "Verdict",
     "Keyword Overlap (%)", "Semantic Similarity (%)", "Skills Match (%)",
     "Matching Technical", "Missing Technical",
     "Matching Soft", "Missing Soft",
     "Matching Tools", "Missing Tools",
     "Experience Fit", "AI Summary"],
    ...candidates.map(c => [
      c.file_name,
      c.candidate_name || "—",
      c.college_name   || "—",
      c.score_pct,
      c.verdict,
      c.keyword_overlap,
      c.vector_similarity,
      c.skills_match_score ?? "—",
      (c.matching_technical || []).join(", "),
      (c.missing_technical  || []).join(", "),
      (c.matching_soft      || []).join(", "),
      (c.missing_soft       || []).join(", "),
      (c.matching_tools     || []).join(", "),
      (c.missing_tools      || []).join(", "),
      c.experience_fit      || "",
      c.ai_summary          || "",
    ]),
  ];

  const csv = rows.map(r =>
    r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")
  ).join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  const jd   = (session.jd_filename || "analysis").replace(/\.[^.]+$/, "");
  const date = new Date(session.created_at).toISOString().slice(0, 10);
  a.href     = url;
  a.download = `${jd}_${date}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Candidate card ─────────────────────────────────────────────────────────────

function CandidateCard({ c, rank }: { c: Candidate; rank: number }) {
  const [open, setOpen] = useState(false);
  const displayName     = c.candidate_name || c.file_name.replace(/\.[^.]+$/, "");
  const hasAI           = !!(c.skills_match_score != null || c.ai_summary || c.matching_technical?.length);

  // merge resume skills and deduplicate
  const allResumeSkills = Array.from(new Set([
    ...(c.resume_technical || []),
    ...(c.resume_soft      || []),
    ...(c.resume_tools     || []),
  ]));

  return (
    <details className="collapsible" open={false} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="collapsible-header">
        <div className="card-header">
          <span className="card-rank">#{rank}</span>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="card-name">{displayName}</div>
            {c.college_name && (
              <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)", marginTop: 1 }}>
                🎓 {c.college_name}
              </div>
            )}
          </div>

          <span className={`badge ${verdictClass(c.verdict)}`}>{c.verdict}</span>
          <span className="card-score">{c.score_pct}%</span>
        </div>
      </summary>

      <div className="collapsible-body">
        {/* Score bars */}
        <div className="metrics-row">
          <ScoreBar label="Overall"  value={c.score_pct} />
          <ScoreBar label="Keywords" value={c.keyword_overlap} />
          <ScoreBar label="Semantic" value={c.vector_similarity} />
          {c.skills_match_score != null && (
            <ScoreBar label="Skills AI" value={c.skills_match_score} />
          )}
        </div>

        {/* AI summary */}
        {c.ai_summary && (
          <div className="ai-box" style={{ marginBottom: "1rem" }}>
            <p className="ai-box-label">🤖 AI Assessment</p>
            <p className="ai-box-text">{c.ai_summary}</p>
          </div>
        )}

        {/* Experience + overall */}
        {c.experience_fit && c.experience_fit !== "Unknown" && (
          <div className="info-box" style={{ marginBottom: "0.6rem" }}>
            <span className="info-icon">⏰</span>
            <span>{c.experience_fit}</span>
          </div>
        )}
        {c.overall_assessment && c.overall_assessment !== "Analysis failed" && (
          <div className="info-box" style={{ marginBottom: "0.75rem" }}>
            <span className="info-icon">📊</span>
            <span>{c.overall_assessment}</span>
          </div>
        )}

        {/* Skills comparison — matching vs missing */}
        {hasAI && (
          <div className="skills-grid" style={{ marginBottom: "1rem" }}>
            <div>
              <p className="skills-col-title match">✅ Matching Skills</p>
              <p className="skills-group-label">Technical</p>
              <PillRow items={c.matching_technical} variant="match" />
              <p className="skills-group-label">Soft Skills</p>
              <PillRow items={c.matching_soft} variant="match" />
              <p className="skills-group-label">Tools &amp; Tech</p>
              <PillRow items={c.matching_tools} variant="match" />
            </div>
            <div>
              <p className="skills-col-title miss">❌ Missing Skills</p>
              <p className="skills-group-label">Technical</p>
              <PillRow items={c.missing_technical} variant="miss" />
              <p className="skills-group-label">Soft Skills</p>
              <PillRow items={c.missing_soft} variant="miss" />
              <p className="skills-group-label">Tools &amp; Tech</p>
              <PillRow items={c.missing_tools} variant="miss" />
            </div>
          </div>
        )}

        {/* Candidate's own extracted skills */}
        {allResumeSkills.length > 0 && (
          <details className="collapsible" style={{ marginBottom: 0 }}>
            <summary className="collapsible-header">
              <div style={{ padding: "0.6rem 1rem", cursor: "pointer" }}>
                <span className="sub-toggle">📄 Candidate&apos;s Extracted Skills</span>
              </div>
            </summary>
            <div className="collapsible-body">
              <div className="resume-skills-grid">
                <div>
                  <p className="skills-group-label">Technical</p>
                  <PillRow items={c.resume_technical} />
                </div>
                <div>
                  <p className="skills-group-label">Soft Skills</p>
                  <PillRow items={c.resume_soft} />
                </div>
                <div>
                  <p className="skills-group-label">Tools &amp; Tech</p>
                  <PillRow items={c.resume_tools} />
                </div>
              </div>
              {c.experience_level && c.experience_level !== "Unknown" && (
                <p className="exp-level">Experience: {c.experience_level}</p>
              )}
            </div>
          </details>
        )}

        {/* NLP keywords */}
        <details className="collapsible" style={{ marginTop: "0.5rem", marginBottom: 0 }}>
          <summary className="collapsible-header">
            <div style={{ padding: "0.6rem 1rem", cursor: "pointer" }}>
              <span className="sub-toggle">🔍 NLP Keyword Analysis</span>
            </div>
          </summary>
          <div className="collapsible-body">
            <p className="skills-group-label">Matched Keywords</p>
            <PillRow items={(c.matched_keywords || []).slice(0, 30)} variant="match" />
            <p className="skills-group-label" style={{ marginTop: "0.75rem" }}>Missing Keywords (top 20)</p>
            <PillRow items={c.missing_keywords || []} variant="miss" />
          </div>
        </details>
      </div>
    </details>
  );
}

// ── Session card ──────────────────────────────────────────────────────────────

function SessionCard({
  session,
  onDelete,
  token,
}: {
  session: AnalysisSession;
  onDelete: (id: string) => void;
  token: string;
}) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [loaded,     setLoaded]     = useState(false);
  const [open,       setOpen]       = useState(false);
  const [exporting,  setExporting]  = useState(false);

  const handleToggle = async (e: React.SyntheticEvent<HTMLDetailsElement>) => {
    const isOpen = (e.target as HTMLDetailsElement).open;
    setOpen(isOpen);
    if (isOpen && !loaded) {
      setLoading(true);
      try {
        const data = await fetchSessionCandidates(session.id, token);
        setCandidates(data);
        setLoaded(true);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleExport = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setExporting(true);
    try {
      let data = candidates;
      if (!loaded) {
        data = await fetchSessionCandidates(session.id, token);
        setCandidates(data);
        setLoaded(true);
      }
      exportToExcel(session, data);
    } finally {
      setExporting(false);
    }
  };

  const totalW      = session.total_candidates || 1;
  const strongPct   = ((session.strong_count   || 0) / totalW) * 100;
  const moderatePct = ((session.moderate_count || 0) / totalW) * 100;
  const weakPct     = ((session.weak_count     || 0) / totalW) * 100;
  const avgScore    = session.avg_score || 0;

  return (
    <details className="session-card" onToggle={handleToggle}>
      <summary className="session-card-summary">
        {/* ── Header row ── */}
        <div className="session-card-header">

          {/* Left — score ring + meta */}
          <div className="session-card-left">
            <svg width="54" height="54" style={{ flexShrink: 0 }}>
              <circle cx="27" cy="27" r="20" fill="none" stroke="var(--border)" strokeWidth="4" />
              <circle cx="27" cy="27" r="20" fill="none"
                stroke={scoreColor(avgScore)} strokeWidth="4"
                strokeDasharray={`${(avgScore / 100) * 125.7} 125.7`}
                strokeLinecap="round" transform="rotate(-90 27 27)" />
              <text x="27" y="32" textAnchor="middle" fontSize="11"
                fontWeight="700" fill={scoreColor(avgScore)} fontFamily="var(--font-mono)">
                {Math.round(avgScore)}%
              </text>
            </svg>

            <div className="session-card-meta">
              <span className="session-card-jd">
                📄 {session.jd_filename || "Job Description"}
              </span>
              <span className="session-card-date">{fmtDate(session.created_at)}</span>
              <div className="session-card-tags">
                {session.ai_enabled && (
                  <span className="session-tag session-tag--ai">🤖 AI</span>
                )}
                {session.jd_experience_level && session.jd_experience_level !== "Unknown" && (
                  <span className="session-tag">{session.jd_experience_level}</span>
                )}
                {(session.jd_technical_skills || []).slice(0, 4).map((s, i) => (
                  <span key={`tag-${s}-${i}`} className="session-tag">{s}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Right — stacked bar + controls */}
          <div className="session-card-right">
            <div className="session-bar-group">
              <div className="session-stacked-bar">
                <div style={{ width: `${strongPct}%`,   background: "var(--accent-green)" }} title={`${session.strong_count} strong`} />
                <div style={{ width: `${moderatePct}%`, background: "var(--accent-amber)" }} title={`${session.moderate_count} moderate`} />
                <div style={{ width: `${weakPct}%`,     background: "var(--accent-red)"   }} title={`${session.weak_count} weak`} />
              </div>
              <div className="session-bar-legend">
                <span style={{ color: "var(--accent-green)" }}>
                  {session.strong_count} strong
                </span>
                <span style={{ color: "var(--accent-amber)" }}>
                  {session.moderate_count} mod
                </span>
                <span style={{ color: "var(--accent-red)" }}>
                  {session.weak_count} weak
                </span>
              </div>
            </div>

            <span className="session-total-label">
              {session.total_candidates} candidate{session.total_candidates !== 1 ? "s" : ""}
            </span>

            <button
              className="btn-secondary session-export-btn"
              onClick={handleExport}
              disabled={exporting}
              title="Export to CSV"
            >
              {exporting ? <span className="spinner" style={{ borderTopColor: "var(--text-primary)" }} /> : "📊"}
              {exporting ? "Exporting…" : "Export"}
            </button>

            <button
              className="session-delete-btn"
              onClick={(e) => { e.stopPropagation(); onDelete(session.id); }}
              title="Delete session"
            >
              ✕
            </button>

            <span className={`session-chevron ${open ? "session-chevron--open" : ""}`}>›</span>
          </div>
        </div>
      </summary>

      {/* ── Expanded body ── */}
      <div className="session-card-body">

        {/* Stats strip */}
        <div className="session-stats-strip">
          <div className="session-stat-item">
            <span className="session-stat-val">{session.total_candidates}</span>
            <span className="session-stat-lbl">Candidates</span>
          </div>
          <div className="session-stat-item">
            <span className="session-stat-val" style={{ color: "var(--accent)" }}>
              {Math.round(session.avg_score || 0)}%
            </span>
            <span className="session-stat-lbl">Avg Score</span>
          </div>
          <div className="session-stat-item">
            <span className="session-stat-val" style={{ color: "var(--accent-green)" }}>
              {session.strong_count}
            </span>
            <span className="session-stat-lbl">Strong</span>
          </div>
          <div className="session-stat-item">
            <span className="session-stat-val" style={{ color: "var(--accent-amber)" }}>
              {session.moderate_count}
            </span>
            <span className="session-stat-lbl">Moderate</span>
          </div>
          <div className="session-stat-item">
            <span className="session-stat-val" style={{ color: "var(--accent-red)" }}>
              {session.weak_count}
            </span>
            <span className="session-stat-lbl">Weak</span>
          </div>
        </div>

        {/* JD requirements — same layout as screener page */}
        {(
          (session.jd_technical_skills?.length || 0) +
          (session.jd_soft_skills?.length      || 0) +
          (session.jd_tools?.length            || 0)
        ) > 0 && (
          <div className="session-section">
            <h3 className="session-section-title">🎯 Job Requirements (AI-Extracted)</h3>
            <div className="jd-skills-grid">
              <div>
                <p className="skills-group-label">Technical Skills</p>
                <PillRow items={session.jd_technical_skills || []} />
              </div>
              <div>
                <p className="skills-group-label">Soft Skills</p>
                <PillRow items={session.jd_soft_skills || []} />
              </div>
              <div>
                <p className="skills-group-label">Tools &amp; Technologies</p>
                <PillRow items={session.jd_tools || []} />
              </div>
            </div>
            {session.jd_experience_level && session.jd_experience_level !== "Unknown" && (
              <p className="exp-level">
                Required Experience: {session.jd_experience_level}
              </p>
            )}
          </div>
        )}

        {/* AI Ranking Analysis */}
        {session.ranking_analysis && (
          <div className="session-section">
            <h3 className="session-section-title">🤖 AI Ranking Analysis</h3>
            <div className="ai-box">
              <p className="ai-box-text">{session.ranking_analysis}</p>
            </div>
          </div>
        )}

        {/* Ranked Candidates */}
        <div className="session-section">
          <h3 className="session-section-title">
            🏆 Ranked Candidates ({session.total_candidates})
          </h3>
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "1.5rem 0", color: "var(--text-secondary)", fontSize: 14 }}>
              <span className="spinner" style={{ borderTopColor: "var(--text-secondary)", width: 18, height: 18 }} />
              Loading candidates…
            </div>
          ) : (
            <div className="leaderboard">
              {candidates.map((c, i) => (
                <CandidateCard key={c.id} c={c} rank={i + 1} />
              ))}
            </div>
          )}
        </div>

        {/* Executive Summary */}
        {session.executive_summary && (
          <div className="session-section">
            <h3 className="session-section-title">📝 Executive Summary</h3>
            <div className="exec-summary">
              {session.executive_summary.split("\n\n").map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
          </div>
        )}

      </div>
    </details>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function HistoryPage() {
  const { user, session, loading: authLoading } = useAuth();
  const [sessions, setSessions] = useState<AnalysisSession[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  useEffect(() => {
    if (!user || !session) return;
    setLoading(true);
    fetchSessions(session.access_token)
      .then(setSessions)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [user, session]);

  const handleDelete = async (id: string) => {
    if (!session) return;
    try {
      await deleteSession(id, session.access_token);
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  };

  if (!authLoading && !user) {
    return (
      <div className="cand-gate">
        <div className="cand-gate-icon">🔒</div>
        <h2 className="cand-gate-title">Sign in to view history</h2>
        <p className="cand-gate-sub">Your analysis history is saved per-account.</p>
        <Link href="/" className="btn-primary">← Back to Screener</Link>
      </div>
    );
  }

  const totalCandidates  = sessions.reduce((s, r) => s + (r.total_candidates || 0), 0);
  const totalStrong      = sessions.reduce((s, r) => s + (r.strong_count     || 0), 0);
  const overallAvg       = sessions.length
    ? Math.round(sessions.reduce((s, r) => s + (r.avg_score || 0), 0) / sessions.length * 10) / 10
    : 0;

  return (
    <div className="history-page">

      {/* Header */}
      <div className="history-header">
        <div>
          <h1 className="history-title">Analysis History</h1>
          <p className="history-sub">
            Every screening run you&apos;ve performed — fully retrievable with all candidate details.
          </p>
        </div>
        <Link href="/" className="btn-primary">+ New Analysis</Link>
      </div>

      {/* Stats strip */}
      <div className="history-stats">
        <div className="history-stat">
          <span className="history-stat-val">{sessions.length}</span>
          <span className="history-stat-lbl">Analyses Run</span>
        </div>
        <div className="history-stat">
          <span className="history-stat-val">{totalCandidates}</span>
          <span className="history-stat-lbl">Total Candidates</span>
        </div>
        <div className="history-stat">
          <span className="history-stat-val" style={{ color: "var(--accent)" }}>
            {overallAvg}%
          </span>
          <span className="history-stat-lbl">Avg Score</span>
        </div>
        <div className="history-stat">
          <span className="history-stat-val" style={{ color: "var(--accent-green)" }}>
            {totalStrong}
          </span>
          <span className="history-stat-lbl">Strong Matches</span>
        </div>
      </div>

      {error && <div className="error-box" style={{ marginBottom: "1.5rem" }}>{error}</div>}

      {loading ? (
        <div className="cand-loading">
          <span className="spinner" style={{ width: 24, height: 24, borderWidth: 3, borderTopColor: "var(--text-secondary)" }} />
          Loading history…
        </div>
      ) : sessions.length === 0 ? (
        <div className="cand-empty">
          <span className="cand-empty-icon">📭</span>
          <p>No analyses yet. Run your first screening to see history here.</p>
          <Link href="/" className="btn-primary" style={{ marginTop: "1rem" }}>
            Start Screening →
          </Link>
        </div>
      ) : (
        <div className="sessions-list">
          {sessions.map((s) => (
            <SessionCard
              key={s.id}
              session={s}
              onDelete={handleDelete}
              token={session?.access_token ?? ""}
            />
          ))}
        </div>
      )}
    </div>
  );
}