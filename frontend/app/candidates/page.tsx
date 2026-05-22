"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { fetchCandidates, deleteCandidate, Candidate } from "@/lib/api";
import Link from "next/link";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── PDF Viewer Modal ──────────────────────────────────────────────────────────

function PdfViewerModal({
  candidateId,
  candidateName,
  token,
  onClose,
}: {
  candidateId: string;
  candidateName: string;
  token: string;
  onClose: () => void;
}) {
  // Build the proxy URL — token passed as query param because iframes
  // cannot send Authorization headers.
  const proxyUrl = `${BASE}/candidates/${candidateId}/resume?token=${encodeURIComponent(token)}`;

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="pdf-overlay" onClick={onClose}>
      <div className="pdf-modal" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="pdf-modal-header">
          <div className="pdf-modal-title-row">
            <span className="pdf-modal-icon">📄</span>
            <div>
              <p className="pdf-modal-title">{candidateName}</p>
              <p className="pdf-modal-sub">Resume Viewer</p>
            </div>
          </div>
          <div className="pdf-modal-actions">
            {/* Open in new tab — downloads the file directly */}
            <a
              href={proxyUrl}
              target="_blank"
              rel="noreferrer"
              className="pdf-open-btn"
              title="Open / download in new tab"
            >
              ↗ Open
            </a>
            <button className="pdf-close-btn" onClick={onClose} title="Close (Esc)">
              ✕
            </button>
          </div>
        </div>

        {/* Body — iframe points to backend proxy, never directly to Supabase */}
        <div className="pdf-modal-body">
          <iframe
            key={proxyUrl}          /* re-mount if candidate changes */
            src={proxyUrl}
            className="pdf-iframe"
            title={`Resume — ${candidateName}`}
          />
        </div>

      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ScoreDot({ score }: { score: number }) {
  const color =
    score >= 70 ? "var(--accent-green)" :
    score >= 45 ? "var(--accent-amber)" :
    "var(--accent-red)";
  return <span className="score-dot" style={{ background: color }} title={`${score}%`} />;
}

function PillSmall({ text, variant = "neutral" }: { text: string; variant?: "match" | "miss" | "neutral" }) {
  return <span className={`pill pill-${variant} pill--sm`}>{text}</span>;
}

function VerdictChip({ verdict }: { verdict: string }) {
  const cls =
    verdict === "Strong Match"   ? "badge-strong"   :
    verdict === "Moderate Match" ? "badge-moderate"  :
    "badge-weak";
  return <span className={`badge ${cls}`}>{verdict}</span>;
}

// ── Candidate row ─────────────────────────────────────────────────────────────

function CandidateRow({
  c,
  onDelete,
  onOpenResume,
}: {
  c: Candidate & { resume_storage_path?: string | null; candidate_name?: string | null; college_name?: string | null };
  onDelete: (id: string) => void;
  onOpenResume: (id: string, name: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const date        = new Date(c.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const displayName = c.candidate_name || c.file_name.replace(/\.[^.]+$/, "");
  // A candidate has a stored resume when the column is a non-empty string
  const hasResume   = typeof c.resume_storage_path === "string" && c.resume_storage_path.length > 0;

  return (
    <>
      <tr
        className={`cand-row ${expanded ? "cand-row--open" : ""}`}
        onClick={() => setExpanded(!expanded)}
      >
        {/* Name */}
        <td className="cand-cell cand-cell--name">
          <ScoreDot score={c.score_pct} />
          <div className="cand-name-block">
            <span className="cand-display-name">{displayName}</span>
            {c.college_name && (
              <span className="cand-college-small">🎓 {c.college_name}</span>
            )}
          </div>
        </td>

        {/* Score */}
        <td className="cand-cell cand-cell--center">
          <span className="cand-score">{c.score_pct}%</span>
        </td>

        {/* Verdict */}
        <td className="cand-cell cand-cell--center">
          <VerdictChip verdict={c.verdict} />
        </td>

        {/* Keyword overlap */}
        <td className="cand-cell cand-cell--mono cand-cell--center">
          {c.keyword_overlap?.toFixed(1)}%
        </td>

        {/* Semantic */}
        <td className="cand-cell cand-cell--mono cand-cell--center">
          {c.vector_similarity?.toFixed(1)}%
        </td>

        {/* Skills AI */}
        <td className="cand-cell cand-cell--mono cand-cell--center">
          {c.skills_match_score != null ? `${c.skills_match_score.toFixed(1)}%` : "—"}
        </td>

        {/* Date */}
        <td className="cand-cell cand-cell--date">{date}</td>

        {/* Actions */}
        <td className="cand-cell" onClick={(e) => e.stopPropagation()}>
          <div className="cand-row-actions">
            <button
              className={`cand-resume-btn${hasResume ? "" : " cand-resume-btn--disabled"}`}
              onClick={() => hasResume && onOpenResume(c.id, displayName)}
              title={hasResume ? "View resume" : "No resume stored — re-run analysis while signed in"}
              disabled={!hasResume}
            >
              📄
            </button>
            <button
              className="cand-delete"
              onClick={() => onDelete(c.id)}
              title="Remove candidate"
            >
              ✕
            </button>
          </div>
        </td>
      </tr>

      {/* Expanded detail row */}
      {expanded && (
        <tr className="cand-expand-row">
          <td colSpan={8} className="cand-expand-cell">
            <div className="cand-detail">

              {/* View Resume banner */}
              {hasResume && (
                <button
                  className="cand-resume-banner"
                  onClick={() => onOpenResume(c.id, displayName)}
                >
                  <span>📄</span>
                  <span>View Full Resume</span>
                  <span className="cand-resume-banner-arrow">→</span>
                </button>
              )}

              {/* AI Summary */}
              {c.ai_summary && (
                <div className="cand-detail-section">
                  <p className="cand-detail-label">🤖 AI Assessment</p>
                  <p className="cand-detail-text">{c.ai_summary}</p>
                </div>
              )}

              {/* Overall Assessment */}
              {c.overall_assessment && c.overall_assessment !== "Analysis failed" && (
                <div className="cand-detail-section">
                  <p className="cand-detail-label">📊 Overall Assessment</p>
                  <p className="cand-detail-text">{c.overall_assessment}</p>
                </div>
              )}

              {/* Experience Fit */}
              {c.experience_fit && c.experience_fit !== "Unknown" && (
                <div className="cand-detail-section">
                  <p className="cand-detail-label">⏰ Experience Fit</p>
                  <p className="cand-detail-text">{c.experience_fit}</p>
                </div>
              )}

              {/* Skills grid */}
              <div className="cand-skills-grid">
                <div className="cand-skills-col">
                  <p className="cand-detail-label">✅ Matching Technical</p>
                  <div className="pill-row">
                    {c.matching_technical?.length
                      ? c.matching_technical.map((s) => <PillSmall key={s} text={s} variant="match" />)
                      : <span className="empty-note">—</span>}
                  </div>
                </div>
                <div className="cand-skills-col">
                  <p className="cand-detail-label">❌ Missing Technical</p>
                  <div className="pill-row">
                    {c.missing_technical?.length
                      ? c.missing_technical.map((s) => <PillSmall key={s} text={s} variant="miss" />)
                      : <span className="empty-note">—</span>}
                  </div>
                </div>
                <div className="cand-skills-col">
                  <p className="cand-detail-label">✅ Matching Tools</p>
                  <div className="pill-row">
                    {c.matching_tools?.length
                      ? c.matching_tools.map((s) => <PillSmall key={s} text={s} variant="match" />)
                      : <span className="empty-note">—</span>}
                  </div>
                </div>
                <div className="cand-skills-col">
                  <p className="cand-detail-label">❌ Missing Tools</p>
                  <div className="pill-row">
                    {c.missing_tools?.length
                      ? c.missing_tools.map((s) => <PillSmall key={s} text={s} variant="miss" />)
                      : <span className="empty-note">—</span>}
                  </div>
                </div>
              </div>

              {/* Candidate's own skills */}
              {(c.resume_technical?.length || c.resume_soft?.length) ? (
                <div className="cand-skills-grid" style={{ marginTop: "1rem" }}>
                  <div className="cand-skills-col">
                    <p className="cand-detail-label">📄 Candidate Technical</p>
                    <div className="pill-row">{c.resume_technical?.map((s) => <PillSmall key={s} text={s} />)}</div>
                  </div>
                  <div className="cand-skills-col">
                    <p className="cand-detail-label">📄 Candidate Soft</p>
                    <div className="pill-row">{c.resume_soft?.map((s) => <PillSmall key={s} text={s} />)}</div>
                  </div>
                  <div className="cand-skills-col">
                    <p className="cand-detail-label">📄 Candidate Tools</p>
                    <div className="pill-row">{c.resume_tools?.map((s) => <PillSmall key={s} text={s} />)}</div>
                  </div>
                  {c.experience_level && c.experience_level !== "Unknown" && (
                    <div className="cand-skills-col">
                      <p className="cand-detail-label">📅 Experience</p>
                      <p className="cand-detail-text">{c.experience_level}</p>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CandidatesPage() {
  const { user, session, loading: authLoading } = useAuth();
  const [candidates, setCandidates] = useState<(Candidate & { resume_storage_path?: string | null; candidate_name?: string | null; college_name?: string | null })[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  // PDF viewer
  const [pdfViewer, setPdfViewer] = useState<{ id: string; name: string } | null>(null);

  // Filters
  const [search,        setSearch]        = useState("");
  const [verdictFilter, setVerdictFilter] = useState<string>("all");
  const [sortField,     setSortField]     = useState<"score_pct" | "created_at">("created_at");
  const [sortDir,       setSortDir]       = useState<"asc" | "desc">("desc");

  useEffect(() => {
    if (!user || !session) return;
    setLoading(true);
    fetchCandidates(session.access_token)
      .then(setCandidates)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [user, session]);

  const handleDelete = async (id: string) => {
    if (!session) return;
    try {
      await deleteCandidate(id, session.access_token);
      setCandidates((prev) => prev.filter((c) => c.id !== id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const handleOpenResume  = useCallback((id: string, name: string) => setPdfViewer({ id, name }), []);
  const handleCloseResume = useCallback(() => setPdfViewer(null), []);

  const toggleSort = (field: "score_pct" | "created_at") => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  };

  const filtered = useMemo(() => {
    let list = [...candidates];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) =>
        c.file_name.toLowerCase().includes(q) ||
        (c.candidate_name || "").toLowerCase().includes(q) ||
        (c.college_name   || "").toLowerCase().includes(q)
      );
    }
    if (verdictFilter !== "all") list = list.filter((c) => c.verdict === verdictFilter);
    list.sort((a, b) => {
      const aVal = sortField === "score_pct" ? a.score_pct : new Date(a.created_at).getTime();
      const bVal = sortField === "score_pct" ? b.score_pct : new Date(b.created_at).getTime();
      return sortDir === "asc" ? aVal - bVal : bVal - aVal;
    });
    return list;
  }, [candidates, search, verdictFilter, sortField, sortDir]);

  const stats = useMemo(() => ({
    total:    candidates.length,
    strong:   candidates.filter(c => c.score_pct >= 70).length,
    moderate: candidates.filter(c => c.score_pct >= 45 && c.score_pct < 70).length,
    weak:     candidates.filter(c => c.score_pct < 45).length,
    avg:      candidates.length
      ? Math.round(candidates.reduce((s, c) => s + c.score_pct, 0) / candidates.length * 10) / 10
      : 0,
  }), [candidates]);

  if (!authLoading && !user) {
    return (
      <div className="cand-gate">
        <div className="cand-gate-icon">🔒</div>
        <h2 className="cand-gate-title">Sign in to view candidates</h2>
        <p className="cand-gate-sub">Your candidate history is saved per-account.</p>
        <Link href="/" className="btn-primary">← Back to Screener</Link>
      </div>
    );
  }

  return (
    <>
      {/* PDF Viewer */}
      {pdfViewer && session && (
        <PdfViewerModal
          candidateId={pdfViewer.id}
          candidateName={pdfViewer.name}
          token={session.access_token}
          onClose={handleCloseResume}
        />
      )}

      <div className="cand-page">
        {/* Header */}
        <div className="cand-header">
          <div>
            <h1 className="cand-title">All Candidates</h1>
            <p className="cand-subtitle">Every resume you've screened, stored and searchable.</p>
          </div>
          <Link href="/" className="btn-secondary">+ Screen New Resumes</Link>
        </div>

        {/* Stats */}
        <div className="cand-stats">
          {[
            { val: stats.total,    lbl: "Total",    color: undefined },
            { val: stats.strong,   lbl: "Strong",   color: "var(--accent-green)" },
            { val: stats.moderate, lbl: "Moderate", color: "var(--accent-amber)" },
            { val: stats.weak,     lbl: "Weak",     color: "var(--accent-red)"   },
            { val: `${stats.avg}%`,lbl: "Avg Score",color: "var(--accent)"       },
          ].map(({ val, lbl, color }) => (
            <div key={lbl} className="cand-stat">
              <span className="cand-stat-val" style={color ? { color } : undefined}>{val}</span>
              <span className="cand-stat-lbl">{lbl}</span>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="cand-filters">
          <input
            className="cand-search"
            type="text"
            placeholder="🔍  Search by name, college, or filename…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="cand-filter-pills">
            {["all", "Strong Match", "Moderate Match", "Weak Match"].map((v) => (
              <button
                key={v}
                className={`cand-filter-btn ${verdictFilter === v ? "cand-filter-btn--active" : ""}`}
                onClick={() => setVerdictFilter(v)}
              >
                {v === "all" ? "All" : v}
              </button>
            ))}
          </div>
        </div>

        {error && <div className="error-box">{error}</div>}

        {loading ? (
          <div className="cand-loading">
            <span className="spinner" style={{ width: 24, height: 24, borderWidth: 3 }} />
            <span>Loading candidates…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="cand-empty">
            <span className="cand-empty-icon">📭</span>
            <p>{candidates.length === 0 ? "No candidates yet. Screen some resumes first!" : "No results match your filters."}</p>
          </div>
        ) : (
          <div className="cand-table-wrap">
            <table className="cand-table">
              <thead>
                <tr className="cand-thead-row">
                  <th className="cand-th">Candidate</th>
                  <th className="cand-th cand-th--sortable cand-th--center" onClick={() => toggleSort("score_pct")}>
                    Score {sortField === "score_pct" ? (sortDir === "desc" ? "↓" : "↑") : "↕"}
                  </th>
                  <th className="cand-th cand-th--center">Verdict</th>
                  <th className="cand-th cand-th--center">Keywords</th>
                  <th className="cand-th cand-th--center">Semantic</th>
                  <th className="cand-th cand-th--center">Skills AI</th>
                  <th className="cand-th cand-th--sortable" onClick={() => toggleSort("created_at")}>
                    Date {sortField === "created_at" ? (sortDir === "desc" ? "↓" : "↑") : "↕"}
                  </th>
                  <th className="cand-th" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <CandidateRow
                    key={c.id}
                    c={c}
                    onDelete={handleDelete}
                    onOpenResume={handleOpenResume}
                  />
                ))}
              </tbody>
            </table>
            <p className="cand-count">Showing {filtered.length} of {candidates.length} candidates</p>
          </div>
        )}
      </div>
    </>
  );
}