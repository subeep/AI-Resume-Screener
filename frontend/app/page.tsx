"use client";

import { useEffect, useRef, useState } from "react";
import {
  AnalyzeResponse,
  HealthResponse,
  analyzeResumes,
  buildExportUrl,
  fetchHealth,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import ResumeCard from "@/components/ResumeCard";
import Uploader from "@/components/Uploader";
import { Pill, Section, StatCard } from "@/components/ui";

export default function Home() {
  const { session, user } = useAuth();

  const [health,    setHealth]    = useState<HealthResponse | null>(null);
  const [jdFiles,   setJdFiles]   = useState<File[]>([]);
  const [resumes,   setResumes]   = useState<File[]>([]);
  const [enableAi,  setEnableAi]  = useState(true);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [result,    setResult]    = useState<AnalyzeResponse | null>(null);
  const [exporting, setExporting] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchHealth().then(setHealth).catch(() => setHealth(null));
  }, []);

  const handleSubmit = async () => {
    if (!jdFiles[0] || resumes.length === 0) {
      setError("Please upload a job description and at least one resume.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const data = await analyzeResumes(
        jdFiles[0], resumes, enableAi,
        session?.access_token ?? null
      );
      setResult(data);
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (!jdFiles[0] || resumes.length === 0) return;
    setExporting(true);
    try {
      await buildExportUrl(jdFiles[0], resumes, enableAi, session?.access_token).download();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <main className="main">
      {/* ── Hero ────────────────────────────────────────────────── */}
      <header className="hero">
        <div className="hero-eyebrow">AI-Powered</div>
        <h1 className="hero-title">Resume Screener</h1>
        <p className="hero-sub">
          Upload resumes and a job description — get ranked candidates with
          AI skills analysis in seconds.
        </p>

        <div className="hero-chips">
          <div className={`status-chip ${health?.gemini_configured ? "status-ok" : "status-err"}`}>
            {health === null
              ? "⏳ Checking backend…"
              : health.gemini_configured
              ? `✅ Gemini AI connected · ${health.model}`
              : "❌ Gemini API key not configured"}
          </div>
          {health?.supabase_configured && (
            <div className={`status-chip ${user ? "status-ok" : "status-warn"}`}>
              {user ? `🗄 Saving to DB · ${user.email}` : "🗄 DB ready — sign in to save results"}
            </div>
          )}
        </div>
      </header>

      {/* ── Upload panel ──────────────────────────────────────────── */}
      <section className="upload-panel">
        <div className="upload-grid">
          <div>
            <p className="upload-label">Job Description</p>
            <Uploader label="Drop JD here" accept=".pdf,.docx" multiple={false} files={jdFiles} onFiles={setJdFiles} />
          </div>
          <div>
            <p className="upload-label">Resumes</p>
            <Uploader label="Drop resumes here" accept=".pdf,.docx" multiple files={resumes} onFiles={setResumes} />
          </div>
        </div>

        <div className="controls-row">
          <label className="toggle-label">
            <input type="checkbox" checked={enableAi} onChange={(e) => setEnableAi(e.target.checked)} className="toggle-input" />
            <span className="toggle-track"><span className="toggle-thumb" /></span>
            Enable AI Analysis (Gemini)
          </label>

          <button
            className="btn-primary"
            onClick={handleSubmit}
            disabled={loading || !jdFiles[0] || resumes.length === 0}
          >
            {loading ? <><span className="spinner" /> Analysing…</> : "▶ Screen Resumes"}
          </button>
        </div>

        {error && <div className="error-box">⚠ {error}</div>}
      </section>

      {/* ── Results ───────────────────────────────────────────────── */}
      {result && (
        <div ref={resultsRef} className="results">

          {/* DB save notice */}
          {result.saved_to_db && (
            <div className="db-notice">
              🗄 Results saved to your candidate database.{" "}
              <a href="/candidates" className="db-notice-link">View all candidates →</a>
            </div>
          )}
          {!result.saved_to_db && !user && (
            <div className="db-notice db-notice--warn">
              ⚠ Not saved — sign in to persist your results across sessions.
            </div>
          )}

          <Section title="Summary" icon="📊">
            <div className="stats-row">
              <StatCard label="Total Candidates" value={result.stats.total} />
              <StatCard label="Avg Score"         value={`${result.stats.avg}%`} />
              <StatCard label="Strong Matches"    value={result.stats.strong}   sub="≥ 70%" />
              <StatCard label="Moderate"          value={result.stats.moderate} sub="45–70%" />
              <StatCard label="Weak Matches"      value={result.stats.weak}     sub="< 45%" />
            </div>
          </Section>

          {result.jd_skills && (
            <Section title="Job Requirements (AI-Extracted)" icon="🎯">
              <div className="jd-skills-grid">
                <div>
                  <p className="skills-group-label">Technical Skills</p>
                  <div className="pill-row">
                    {result.jd_skills.technical_skills.map((s) => <Pill key={s} variant="neutral">{s}</Pill>)}
                  </div>
                </div>
                <div>
                  <p className="skills-group-label">Soft Skills</p>
                  <div className="pill-row">
                    {result.jd_skills.soft_skills.map((s) => <Pill key={s} variant="neutral">{s}</Pill>)}
                  </div>
                </div>
                <div>
                  <p className="skills-group-label">Tools & Technologies</p>
                  <div className="pill-row">
                    {result.jd_skills.tools_technologies.map((s) => <Pill key={s} variant="neutral">{s}</Pill>)}
                  </div>
                </div>
              </div>
              {result.jd_skills.experience_level !== "Unknown" && (
                <p className="exp-level">Required Experience: {result.jd_skills.experience_level}</p>
              )}
            </Section>
          )}

          {result.ranking_analysis && (
            <Section title="AI Ranking Analysis" icon="🤖">
              <div className="ai-box">
                <p className="ai-box-text">{result.ranking_analysis}</p>
              </div>
            </Section>
          )}

          <Section title="Ranked Candidates" icon="🏆">
            <div className="leaderboard">
              {result.results.map((r, i) => (
                <ResumeCard key={r.name} result={r} rank={i + 1} />
              ))}
            </div>
          </Section>

          {result.executive_summary && (
            <Section title="Executive Summary" icon="📝">
              <div className="exec-summary">
                {result.executive_summary.split("\n\n").map((para, i) => <p key={i}>{para}</p>)}
              </div>
            </Section>
          )}

          <div className="export-row">
            <button className="btn-secondary" onClick={handleExport} disabled={exporting}>
              {exporting ? "⏳ Exporting…" : "📊 Download Excel Report"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}