"""
llm_service.py
--------------
All Gemini API interactions and structured response parsing.
Uses Google's genai SDK with gemini-2.0-flash (free tier).
"""

import os
import re
import logging

from google import genai

logger = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")


def _get_client() -> genai.Client:
    """Create a Gemini client using the API key from env."""
    return genai.Client(api_key=GEMINI_API_KEY)


# ── Connection ────────────────────────────────────────────────────────────────

def is_gemini_configured() -> bool:
    """Return True if the Gemini API key is set."""
    return bool(GEMINI_API_KEY)


def generate_response(prompt: str) -> str:
    """
    Send prompt to Gemini API. Returns response text or an error string
    prefixed with '❌'.
    """
    if not is_gemini_configured():
        return "❌ GEMINI_API_KEY is not set. Please add it to your .env file."

    try:
        client = _get_client()
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config={
                "temperature": 0.7,
                "max_output_tokens": 2048,
            },
        )
        return response.text.strip()
    except Exception as e:
        logger.error(f"Gemini API error: {e}")
        return f"❌ Gemini API error: {e}"


# ── Parsing helpers ───────────────────────────────────────────────────────────

def _normalise(line: str) -> str:
    line = line.strip()
    line = re.sub(r"^[-*•]\s+", "", line)
    line = re.sub(r"\*\*([^*]+)\*\*", r"\1", line)
    return line


def _extract_list(line: str) -> list[str]:
    val = line.split(":", 1)[1].strip().strip("[]").strip()
    if val.lower() in ("none", "n/a", "not specified", ""):
        return []
    return [s.strip().strip("[]") for s in val.split(",")
            if s.strip() and s.strip().lower() not in ("none", "n/a")]


# ── LLM actions ───────────────────────────────────────────────────────────────

def extract_jd_skills(jd_text: str) -> dict:
    prompt = f"""Extract the key skills and qualifications required for this job position.

JOB DESCRIPTION:
{jd_text[:1500]}

Respond with EXACTLY this format:

Technical Skills: Python, Java, SQL
Soft Skills: Communication, Leadership, Problem Solving
Tools & Technologies: Git, Docker, AWS
Experience Level: 3+ years

Write "None" if a category is empty."""
    return _parse_skills_response(generate_response(prompt))


def extract_resume_skills(resume_text: str) -> dict:
    prompt = (
        "Extract the skills and qualifications demonstrated in this resume.\n\n"
        f"RESUME:\n{resume_text[:1500]}\n\n"
        "Respond using EXACTLY this format — no bullets, no bold, no brackets:\n\n"
        "Technical Skills: Python, SQL, Machine Learning\n"
        "Soft Skills: Communication, Teamwork, Problem Solving\n"
        "Tools & Technologies: Git, Docker, AWS\n"
        "Experience Level: 5 years\n\n"
        "Write None if a category has no items."
    )
    return _parse_skills_response(generate_response(prompt))


def compare_resume_to_jd(jd_skills: dict, jd_text: str, resume_text: str) -> dict:
    jd_summary = (
        f"Technical Skills: {', '.join(jd_skills.get('technical_skills', []))}\n"
        f"Soft Skills: {', '.join(jd_skills.get('soft_skills', []))}\n"
        f"Tools & Technologies: {', '.join(jd_skills.get('tools_technologies', []))}\n"
        f"Experience Level: {jd_skills.get('experience_level', 'Unknown')}"
    )
    prompt = (
        "You are an expert HR recruiter. Compare the candidate resume to the job requirements.\n\n"
        f"JOB REQUIREMENTS:\n{jd_text[:800]}\n\n"
        f"REQUIRED SKILLS:\n{jd_summary}\n\n"
        f"CANDIDATE RESUME:\n{resume_text[:1200]}\n\n"
        "Output ONLY these 9 lines — no bullets, no markdown:\n\n"
        "Matching Technical Skills: <comma-separated or None>\n"
        "Missing Technical Skills: <comma-separated or None>\n"
        "Matching Soft Skills: <comma-separated or None>\n"
        "Missing Soft Skills: <comma-separated or None>\n"
        "Matching Tools & Technologies: <comma-separated or None>\n"
        "Missing Tools & Technologies: <comma-separated or None>\n"
        "Skills Match Score: <integer 0-100>\n"
        "Experience Fit: <one sentence>\n"
        "Overall Assessment: <two sentences>\n"
    )
    raw = generate_response(prompt)
    result = _parse_comparison_response(raw)
    result["raw_llm_output"] = raw
    return result


def generate_resume_summary(resume_text: str, jd_text: str) -> str:
    prompt = f"""You are an expert HR recruiter. Analyse this resume against the job description.

JOB DESCRIPTION:
{jd_text[:1000]}

RESUME:
{resume_text[:1000]}

Provide a concise 3-4 sentence assessment: key strengths, notable gaps, overall fit."""
    return generate_response(prompt)


def generate_ranking_analysis(leaderboard: list[dict], jd_text: str) -> str:
    top = ", ".join(f"{r['name']}: {r['score_pct']:.1f}%" for r in leaderboard[:5])
    prompt = f"""As an HR expert, analyse these scores and explain the top candidates.

Job Requirements (excerpt):
{jd_text[:500]}

Top Candidates: {top}

Provide 2-3 sentences: why the top candidate stands out, and any concerns."""
    return generate_response(prompt)


def generate_executive_summary(summary_data: str) -> str:
    prompt = f"""As an expert HR recruiter, write a comprehensive executive summary.

{summary_data}

Provide 4-6 paragraphs covering:
1. Hiring recommendations and top candidate analysis
2. Common skills gaps
3. Strategic insights
4. Suggested next steps"""
    return generate_response(prompt)


# ── Internal parsers ──────────────────────────────────────────────────────────

def _parse_skills_response(response: str) -> dict:
    empty = {"technical_skills": [], "soft_skills": [], "tools_technologies": [], "experience_level": "Unknown"}
    if not response or "❌" in response:
        return empty
    try:
        data = {**empty}
        for raw in response.strip().split("\n"):
            line = _normalise(raw)
            if not line or ":" not in line:
                continue
            ll = line.lower()
            if "technical skills" in ll:
                data["technical_skills"] = _extract_list(line)
            elif "soft skills" in ll:
                data["soft_skills"] = _extract_list(line)
            elif "tools" in ll and "technologies" in ll:
                data["tools_technologies"] = _extract_list(line)
            elif "experience level" in ll:
                val = line.split(":", 1)[1].strip()
                if val and val.lower() not in ("none", "n/a", "not specified", "unknown", ""):
                    data["experience_level"] = val
        return data
    except Exception as e:
        logger.warning(f"Skills parse error: {e}")
        return empty


def _parse_comparison_response(response: str) -> dict:
    empty = {
        "matching_technical": [], "missing_technical": [],
        "matching_soft": [], "missing_soft": [],
        "matching_tools": [], "missing_tools": [],
        "skills_match_score": 0.0,
        "experience_fit": "Unknown",
        "overall_assessment": "Analysis failed",
        "raw_llm_output": "",
    }
    if not response or not response.strip():
        return empty

    KEY_MAP = [
        ("matching technical skills", "matching_technical",  "list"),
        ("missing technical skills",  "missing_technical",   "list"),
        ("matching soft skills",      "matching_soft",       "list"),
        ("missing soft skills",       "missing_soft",        "list"),
        ("matching tools",            "matching_tools",      "list"),
        ("missing tools",             "missing_tools",       "list"),
        ("skills match score",        "skills_match_score",  "score"),
        ("experience fit",            "experience_fit",      "text"),
        ("overall assessment",        "overall_assessment",  "assessment"),
    ]
    try:
        data = {**empty, "overall_assessment": ""}
        assessment_lines: list[str] = []
        current_section = None

        for raw in response.strip().split("\n"):
            line = _normalise(raw)
            if not line:
                continue
            ll = line.lower()
            matched = False

            if ":" in line:
                for key_str, field, kind in KEY_MAP:
                    if key_str in ll:
                        matched = True
                        current_section = None
                        if kind == "list":
                            data[field] = _extract_list(line)
                        elif kind == "score":
                            m = re.search(r"(\d+(?:\.\d+)?)", line.split(":", 1)[1])
                            if m:
                                v = float(m.group(1))
                                data[field] = v / 100.0 if v > 1 else v
                        elif kind == "text":
                            data[field] = line.split(":", 1)[1].strip()
                        elif kind == "assessment":
                            current_section = "assessment"
                            t = line.split(":", 1)[1].strip()
                            if t:
                                assessment_lines.append(t)
                        break

            if not matched and current_section == "assessment":
                assessment_lines.append(line)

        data["overall_assessment"] = " ".join(assessment_lines).strip() or "No assessment provided"
        return data
    except Exception as e:
        logger.warning(f"Comparison parse error: {e}")
        return empty
