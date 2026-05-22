// src/components/ResumeCard.tsx
"use client";

import { ResumeResult } from "@/lib/api";
import { Collapsible, Pill, ScoreBar, VerdictBadge } from "./ui";

export default function ResumeCard({
  result,
  rank,
}: {
  result: ResumeResult;
  rank: number;
}) {
  const sc = result.skills_comparison;
  const rs = result.resume_skills_data;

  return (
    <Collapsible
      defaultOpen={rank === 1}
      header={
        <div className="card-header">
          <span className="card-rank">#{rank}</span>
          <span className="card-name">{result.name}</span>
          <VerdictBadge verdict={result.verdict} />
          <span className="card-score">{result.score_pct}%</span>
        </div>
      }
    >
      {/* Metric row */}
      <div className="metrics-row">
        <ScoreBar value={result.score_pct}          label="Overall" />
        <ScoreBar value={result.keyword_overlap}    label="Keywords" />
        <ScoreBar value={result.vector_similarity}  label="Semantic" />
        {result.skills_match_score != null && (
          <ScoreBar value={result.skills_match_score} label="Skills AI" />
        )}
      </div>

      {/* AI summary */}
      {result.ai_summary && (
        <div className="ai-box">
          <p className="ai-box-label">🤖 AI Assessment</p>
          <p className="ai-box-text">{result.ai_summary}</p>
        </div>
      )}

      {/* Skills comparison */}
      {sc && (
        <div className="skills-grid">
          <div>
            <p className="skills-col-title match">✅ Matching Skills</p>
            <p className="skills-group-label">Technical</p>
            <div className="pill-row">
              {sc.matching_technical.length
                ? sc.matching_technical.map((s) => <Pill key={s} variant="match">{s}</Pill>)
                : <span className="empty-note">—</span>}
            </div>
            <p className="skills-group-label">Soft Skills</p>
            <div className="pill-row">
              {sc.matching_soft.length
                ? sc.matching_soft.map((s) => <Pill key={s} variant="match">{s}</Pill>)
                : <span className="empty-note">—</span>}
            </div>
            <p className="skills-group-label">Tools & Tech</p>
            <div className="pill-row">
              {sc.matching_tools.length
                ? sc.matching_tools.map((s) => <Pill key={s} variant="match">{s}</Pill>)
                : <span className="empty-note">—</span>}
            </div>
          </div>

          <div>
            <p className="skills-col-title miss">❌ Missing Skills</p>
            <p className="skills-group-label">Technical</p>
            <div className="pill-row">
              {sc.missing_technical.length
                ? sc.missing_technical.map((s) => <Pill key={s} variant="miss">{s}</Pill>)
                : <span className="empty-note">—</span>}
            </div>
            <p className="skills-group-label">Soft Skills</p>
            <div className="pill-row">
              {sc.missing_soft.length
                ? sc.missing_soft.map((s) => <Pill key={s} variant="miss">{s}</Pill>)
                : <span className="empty-note">—</span>}
            </div>
            <p className="skills-group-label">Tools & Tech</p>
            <div className="pill-row">
              {sc.missing_tools.length
                ? sc.missing_tools.map((s) => <Pill key={s} variant="miss">{s}</Pill>)
                : <span className="empty-note">—</span>}
            </div>
          </div>
        </div>
      )}

      {/* Experience fit */}
      {sc?.experience_fit && sc.experience_fit !== "Unknown" && (
        <div className="info-box">
          <span className="info-icon">⏰</span>
          <span>{sc.experience_fit}</span>
        </div>
      )}

      {/* Overall assessment */}
      {sc?.overall_assessment && sc.overall_assessment !== "Analysis failed" && (
        <div className="info-box">
          <span className="info-icon">📊</span>
          <span>{sc.overall_assessment}</span>
        </div>
      )}

      {/* Candidate's extracted skills */}
      {rs && (
        <Collapsible header={<span className="sub-toggle">📄 Candidate's Extracted Skills</span>}>
          <div className="resume-skills-grid">
            <div>
              <p className="skills-group-label">Technical</p>
              <div className="pill-row">
                {rs.technical_skills.map((s) => <Pill key={s}>{s}</Pill>)}
              </div>
            </div>
            <div>
              <p className="skills-group-label">Soft Skills</p>
              <div className="pill-row">
                {rs.soft_skills.map((s) => <Pill key={s}>{s}</Pill>)}
              </div>
            </div>
            <div>
              <p className="skills-group-label">Tools & Tech</p>
              <div className="pill-row">
                {rs.tools_technologies.map((s) => <Pill key={s}>{s}</Pill>)}
              </div>
            </div>
          </div>
          {rs.experience_level && rs.experience_level !== "Unknown" && (
            <p className="exp-level">Experience: {rs.experience_level}</p>
          )}
        </Collapsible>
      )}

      {/* NLP keywords */}
      <Collapsible header={<span className="sub-toggle">🔍 NLP Keyword Analysis</span>}>
        <p className="skills-group-label">Matched Keywords</p>
        <div className="pill-row">
          {result.matched_keywords.slice(0, 30).map((k) => (
            <Pill key={k} variant="match">{k}</Pill>
          ))}
        </div>
        <p className="skills-group-label" style={{ marginTop: "0.75rem" }}>Missing Keywords (top 20)</p>
        <div className="pill-row">
          {result.missing_keywords.map((k) => (
            <Pill key={k} variant="miss">{k}</Pill>
          ))}
        </div>
      </Collapsible>

      {/* Raw LLM output (debug) */}
      {result.raw_llm_output && (
        <Collapsible header={<span className="sub-toggle">🔬 Raw LLM Output (debug)</span>}>
          <pre className="raw-output">{result.raw_llm_output}</pre>
        </Collapsible>
      )}
    </Collapsible>
  );
}
