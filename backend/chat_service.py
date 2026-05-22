"""
chat_service.py
---------------
Async streaming chat via Google Gemini API.
Uses async generator so it never blocks uvicorn's event loop.
"""

import os
import logging
from typing import AsyncGenerator

from google import genai

logger = logging.getLogger(__name__)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")


# ── Connection check ──────────────────────────────────────────────────────────

def is_gemini_configured() -> bool:
    """Return True if GEMINI_API_KEY is set."""
    return bool(GEMINI_API_KEY)


# ── Context builder ───────────────────────────────────────────────────────────

def _fmt_candidate(c: dict) -> str:
    lines = []
    name = c.get("candidate_name") or c.get("file_name", "Unknown")
    lines.append(f"Candidate: {name}")
    if c.get("college_name"):
        lines.append(f"  College: {c['college_name']}")
    if c.get("experience_level") and c["experience_level"] != "Unknown":
        lines.append(f"  Experience: {c['experience_level']}")
    lines.append(
        f"  Score: {c.get('score_pct', 0)}%  |  Verdict: {c.get('verdict', '—')}"
    )
    lines.append(
        f"  Keyword Overlap: {c.get('keyword_overlap', 0)}%  |"
        f"  Semantic: {c.get('vector_similarity', 0)}%"
    )
    if c.get("skills_match_score") is not None:
        lines.append(f"  AI Skills Match: {c['skills_match_score']}%")
    if c.get("matching_technical"):
        lines.append(f"  Matching Technical: {', '.join(c['matching_technical'])}")
    if c.get("missing_technical"):
        lines.append(f"  Missing Technical: {', '.join(c['missing_technical'])}")
    if c.get("matching_soft"):
        lines.append(f"  Matching Soft: {', '.join(c['matching_soft'])}")
    if c.get("missing_soft"):
        lines.append(f"  Missing Soft: {', '.join(c['missing_soft'])}")
    if c.get("matching_tools"):
        lines.append(f"  Matching Tools: {', '.join(c['matching_tools'])}")
    if c.get("missing_tools"):
        lines.append(f"  Missing Tools: {', '.join(c['missing_tools'])}")
    if c.get("experience_fit") and c["experience_fit"] != "Unknown":
        lines.append(f"  Experience Fit: {c['experience_fit']}")
    if c.get("overall_assessment") and c["overall_assessment"] != "Analysis failed":
        lines.append(f"  Assessment: {c['overall_assessment']}")
    if c.get("ai_summary"):
        lines.append(f"  AI Summary: {c['ai_summary']}")
    if c.get("resume_technical"):
        lines.append(f"  Candidate Skills: {', '.join(c['resume_technical'])}")
    return "\n".join(lines)


def _fmt_session(s: dict) -> str:
    lines = [
        f"Analysis Run: {s.get('jd_filename', 'Unknown JD')}  "
        f"({s.get('created_at', '')[:10]})"
    ]
    lines.append(
        f"  Candidates: {s.get('total_candidates', 0)}  |"
        f"  Avg Score: {s.get('avg_score', 0)}%  |"
        f"  Strong: {s.get('strong_count', 0)}"
        f"  Moderate: {s.get('moderate_count', 0)}"
        f"  Weak: {s.get('weak_count', 0)}"
    )
    if s.get("jd_technical_skills"):
        lines.append(
            f"  Required Technical: {', '.join(s['jd_technical_skills'][:8])}"
        )
    if s.get("jd_experience_level") and s["jd_experience_level"] != "Unknown":
        lines.append(f"  Required Experience: {s['jd_experience_level']}")
    return "\n".join(lines)


def build_system_prompt(candidates: list[dict], sessions: list[dict]) -> str:
    sorted_cands = sorted(
        candidates, key=lambda c: c.get("score_pct", 0), reverse=True
    )[:30]

    sessions_text   = "\n\n".join(_fmt_session(s) for s in sessions[:10])
    candidates_text = "\n\n---\n\n".join(_fmt_candidate(c) for c in sorted_cands)
    has_data        = bool(sorted_cands or sessions)

    system = (
        "You are ResumeAI Assistant — an expert HR analyst embedded in an AI resume "
        "screening platform.\n"
        "You help recruiters analyse candidates, compare applicants, identify skill gaps, "
        "and make hiring decisions.\n\n"
        "Your personality: concise, data-driven, and actionable. "
        "Cite specific scores and skills when answering. "
        "Use bullet points and short paragraphs. Never be verbose.\n\n"
        "You can:\n"
        "- Answer questions about any candidate in the database\n"
        "- Compare candidates against each other\n"
        "- Identify top candidates for a role\n"
        "- Highlight skill gaps and missing requirements\n"
        "- Summarise analysis sessions\n"
        "- Give hiring recommendations based on scores\n"
        "- Explain what the scores mean\n\n"
    )

    if has_data:
        system += (
            "You have access to the user's complete candidate database below.\n"
            "Use this data to answer all questions accurately.\n\n"
            f"{'=' * 50}\n"
            f"ANALYSIS SESSIONS ({len(sessions)} total)\n"
            f"{'=' * 50}\n"
            f"{sessions_text or 'No sessions found.'}\n\n"
            f"{'=' * 50}\n"
            f"CANDIDATES ({len(sorted_cands)} shown, sorted by score)\n"
            f"{'=' * 50}\n"
            f"{candidates_text or 'No candidates found.'}\n\n"
        )
    else:
        system += (
            "The user has no candidates in the database yet.\n"
            "Encourage them to run their first analysis.\n"
            "You can still answer general HR and recruitment questions.\n\n"
        )

    system += (
        "RULES:\n"
        "- Always be specific — cite candidate names, scores, and skills\n"
        "- If asked to compare, list candidates in ranked order with scores\n"
        "- If data is not in the database, say so clearly\n"
        "- Keep responses concise — use bullet points for lists\n"
        "- For recommendations, always explain your reasoning with data\n"
    )
    return system


# ── Async streaming via Gemini API ────────────────────────────────────────────

async def stream_chat(
    messages: list[dict],
    system_prompt: str,
) -> AsyncGenerator[str, None]:
    """
    Async generator that streams text chunks from the Gemini API.
    Converts the chat message format to Gemini's contents format.
    """
    if not is_gemini_configured():
        yield (
            "❌ **Gemini API key is not configured.**\n\n"
            "Add your API key to the `.env` file:\n"
            "```\nGEMINI_API_KEY=your_key_here\n```\n"
            "Get a free key at: https://aistudio.google.com/apikey"
        )
        return

    try:
        client = genai.Client(api_key=GEMINI_API_KEY)

        # Build Gemini-compatible message history
        # Gemini uses "user" and "model" roles (not "assistant")
        gemini_history = []
        for msg in messages:
            role = msg["role"]
            if role == "assistant":
                role = "model"
            gemini_history.append({
                "role": role,
                "parts": [{"text": msg["content"]}],
            })

        logger.info(f"Chat streaming with model: {GEMINI_MODEL}")

        response = client.models.generate_content_stream(
            model=GEMINI_MODEL,
            contents=gemini_history,
            config={
                "system_instruction": system_prompt,
                "temperature": 0.7,
                "max_output_tokens": 1024,
            },
        )

        for chunk in response:
            if chunk.text:
                yield chunk.text

    except Exception as e:
        logger.error(f"stream_chat error: {e}")
        yield f"❌ Gemini API error: {str(e)}"