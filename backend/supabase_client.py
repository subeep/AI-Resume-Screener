"""
supabase_client.py
------------------
Talks to Supabase REST API directly with plain `requests`.
Uses verify=False to bypass Windows SSL certificate verification issues.
Handles: candidates, analysis_sessions, resume PDF storage
"""

import logging
import os
import urllib3
import requests

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
logger = logging.getLogger(__name__)


# ── Config ─────────────────────────────────────────────────────────────────────

def _cfg():
    url = os.getenv("SUPABASE_URL", "").rstrip("/")
    key = os.getenv("SUPABASE_SERVICE_KEY", "")
    return url, key

def _headers(extra: dict | None = None) -> dict:
    _, key = _cfg()
    h = {
        "apikey":        key,
        "Authorization": f"Bearer {key}",
        "Content-Type":  "application/json",
        "Prefer":        "return=minimal",
    }
    if extra:
        h.update(extra)
    return h

def is_configured() -> bool:
    url, key = _cfg()
    return bool(url and key)


# ── JWT verification ───────────────────────────────────────────────────────────

def verify_jwt(token: str) -> dict | None:
    url, _ = _cfg()
    anon_key = os.getenv("SUPABASE_ANON_KEY", "")
    if not url or not anon_key or not token:
        return None
    try:
        resp = requests.get(
            f"{url}/auth/v1/user",
            headers={"apikey": anon_key, "Authorization": f"Bearer {token}"},
            timeout=10,
            verify=False,
        )
        if resp.status_code == 200:
            data = resp.json()
            logger.info(f"JWT verified: {data.get('email')}")
            return {"id": data["id"], "email": data.get("email", "")}
        logger.warning(f"JWT verify failed {resp.status_code}: {resp.text[:100]}")
    except Exception as e:
        logger.error(f"verify_jwt error: {e}")
    return None


# ── Resume PDF Storage ────────────────────────────────────────────────────────

STORAGE_BUCKET = "resumes"


def upload_resume_pdf(
    file_bytes: bytes,
    file_name: str,
    user_id: str,
    session_id: str,
    content_type: str = "application/pdf",
) -> str | None:
    """
    Upload a resume file to Supabase Storage.
    Path inside bucket: {user_id}/{session_id}/{sanitised_filename}
    Returns the storage path string (NOT a URL), or None on failure.
    """
    url, key = _cfg()
    if not is_configured():
        return None

    safe_name    = file_name.replace(" ", "_")
    storage_path = f"{user_id}/{session_id}/{safe_name}"

    try:
        resp = requests.post(
            f"{url}/storage/v1/object/{STORAGE_BUCKET}/{storage_path}",
            data=file_bytes,
            headers={
                "apikey":        key,
                "Authorization": f"Bearer {key}",
                "Content-Type":  content_type,
                "x-upsert":      "true",
            },
            timeout=30,
            verify=False,
        )
        if resp.status_code in (200, 201):
            logger.info(f"✅ Resume uploaded: {storage_path}")
            return storage_path
        logger.error(f"Storage upload failed {resp.status_code}: {resp.text[:300]}")
        return None
    except Exception as e:
        logger.error(f"upload_resume_pdf error: {e}")
        return None


def fetch_resume_bytes(storage_path: str) -> tuple[bytes, str] | None:
    """
    Download a stored resume file using the service-role key (bypasses RLS).
    Returns (file_bytes, content_type) or None on failure.

    We use the authenticated download endpoint — NOT a signed URL — so the
    browser never touches Supabase directly and there are no X-Frame-Options
    issues.
    """
    url, key = _cfg()
    if not is_configured() or not storage_path:
        return None
    try:
        resp = requests.get(
            f"{url}/storage/v1/object/authenticated/{STORAGE_BUCKET}/{storage_path}",
            headers={
                "apikey":        key,
                "Authorization": f"Bearer {key}",
            },
            timeout=30,
            verify=False,
        )
        if resp.status_code == 200:
            content_type = resp.headers.get("Content-Type", "application/pdf")
            logger.info(f"✅ Resume fetched: {storage_path} ({len(resp.content)} bytes)")
            return resp.content, content_type
        logger.error(f"Resume fetch failed {resp.status_code}: {resp.text[:200]}")
        return None
    except Exception as e:
        logger.error(f"fetch_resume_bytes error: {e}")
        return None


# ── Analysis Sessions ──────────────────────────────────────────────────────────

def save_session(session_id: str, user_id: str, session_data: dict) -> bool:
    url, _ = _cfg()
    if not is_configured():
        return False
    row = {
        "id":                  session_id,
        "user_id":             user_id,
        "jd_filename":         session_data.get("jd_filename"),
        "jd_experience_level": session_data.get("jd_experience_level"),
        "jd_technical_skills": session_data.get("jd_technical_skills", []),
        "jd_soft_skills":      session_data.get("jd_soft_skills", []),
        "jd_tools":            session_data.get("jd_tools", []),
        "total_candidates":    session_data.get("total_candidates", 0),
        "avg_score":           session_data.get("avg_score"),
        "strong_count":        session_data.get("strong_count", 0),
        "moderate_count":      session_data.get("moderate_count", 0),
        "weak_count":          session_data.get("weak_count", 0),
        "ranking_analysis":    session_data.get("ranking_analysis"),
        "executive_summary":   session_data.get("executive_summary"),
        "ai_enabled":          session_data.get("ai_enabled", False),
    }
    try:
        resp = requests.post(
            f"{url}/rest/v1/analysis_sessions",
            json=row,
            headers=_headers(),
            timeout=10,
            verify=False,
        )
        if resp.status_code in (200, 201):
            logger.info(f"✅ Session saved: {session_id}")
            return True
        logger.error(f"Session insert failed {resp.status_code}: {resp.text}")
        return False
    except Exception as e:
        logger.error(f"save_session error: {e}")
        return False


def get_sessions(user_id: str, limit: int = 50) -> list[dict]:
    url, _ = _cfg()
    if not is_configured():
        return []
    try:
        resp = requests.get(
            f"{url}/rest/v1/analysis_sessions",
            params={
                "user_id": f"eq.{user_id}",
                "order":   "created_at.desc",
                "limit":   limit,
                "select":  "*",
            },
            headers=_headers({"Prefer": "return=representation"}),
            timeout=10,
            verify=False,
        )
        if resp.status_code == 200:
            return resp.json()
        return []
    except Exception as e:
        logger.error(f"get_sessions error: {e}")
        return []


def get_session_candidates(session_id: str, user_id: str) -> list[dict]:
    url, _ = _cfg()
    if not is_configured():
        return []
    try:
        resp = requests.get(
            f"{url}/rest/v1/candidates",
            params={
                "session_id": f"eq.{session_id}",
                "user_id":    f"eq.{user_id}",
                "order":      "score_pct.desc",
                "select":     "*",
            },
            headers=_headers({"Prefer": "return=representation"}),
            timeout=10,
            verify=False,
        )
        if resp.status_code == 200:
            return resp.json()
        return []
    except Exception as e:
        logger.error(f"get_session_candidates error: {e}")
        return []


def delete_session(session_id: str, user_id: str) -> bool:
    url, _ = _cfg()
    if not is_configured():
        return False
    try:
        requests.delete(
            f"{url}/rest/v1/candidates",
            params={"session_id": f"eq.{session_id}", "user_id": f"eq.{user_id}"},
            headers=_headers(),
            timeout=10,
            verify=False,
        )
        resp = requests.delete(
            f"{url}/rest/v1/analysis_sessions",
            params={"id": f"eq.{session_id}", "user_id": f"eq.{user_id}"},
            headers=_headers(),
            timeout=10,
            verify=False,
        )
        return resp.status_code in (200, 204)
    except Exception as e:
        logger.error(f"delete_session error: {e}")
        return False


# ── Candidates ─────────────────────────────────────────────────────────────────

def save_candidate(result: dict, user_id: str, session_id: str,
                   jd_skills: dict | None = None) -> bool:
    url, _ = _cfg()
    if not is_configured():
        return False
    sc = result.get("skills_comparison") or {}
    rs = result.get("resume_skills_data") or {}
    jd = jd_skills or {}
    row = {
        "user_id":             user_id,
        "session_id":          session_id,
        "file_name":           result.get("name", "unknown"),
        "candidate_name":      result.get("candidate_name"),
        "college_name":        result.get("college_name"),
        "score_pct":           result.get("score_pct"),
        "verdict":             result.get("verdict"),
        "keyword_overlap":     result.get("keyword_overlap"),
        "vector_similarity":   result.get("vector_similarity"),
        "skills_match_score":  result.get("skills_match_score"),
        "matched_keywords":    result.get("matched_keywords", []),
        "missing_keywords":    result.get("missing_keywords", []),
        "matching_technical":  sc.get("matching_technical", []),
        "missing_technical":   sc.get("missing_technical", []),
        "matching_soft":       sc.get("matching_soft", []),
        "missing_soft":        sc.get("missing_soft", []),
        "matching_tools":      sc.get("matching_tools", []),
        "missing_tools":       sc.get("missing_tools", []),
        "experience_fit":      sc.get("experience_fit"),
        "overall_assessment":  sc.get("overall_assessment"),
        "resume_technical":    rs.get("technical_skills", []),
        "resume_soft":         rs.get("soft_skills", []),
        "resume_tools":        rs.get("tools_technologies", []),
        "experience_level":    rs.get("experience_level"),
        "ai_summary":          result.get("ai_summary"),
        "jd_experience_level": jd.get("experience_level"),
        "jd_technical_skills": jd.get("technical_skills", []),
        "resume_storage_path": result.get("resume_storage_path"),
    }
    try:
        resp = requests.post(
            f"{url}/rest/v1/candidates",
            json=row,
            headers=_headers(),
            timeout=10,
            verify=False,
        )
        if resp.status_code in (200, 201):
            logger.info(f"✅ Saved: {row.get('candidate_name') or row['file_name']} ({row['score_pct']}%)")
            return True
        logger.error(f"Candidate insert failed {resp.status_code}: {resp.text}")
        return False
    except Exception as e:
        logger.error(f"save_candidate error: {e}")
        return False


def get_candidate_by_id(candidate_id: str, user_id: str) -> dict | None:
    """Fetch a single candidate by ID, scoped to the user."""
    url, _ = _cfg()
    if not is_configured():
        return None
    try:
        resp = requests.get(
            f"{url}/rest/v1/candidates",
            params={
                "id":      f"eq.{candidate_id}",
                "user_id": f"eq.{user_id}",
                "select":  "id,resume_storage_path,file_name",
                "limit":   1,
            },
            headers=_headers({"Prefer": "return=representation"}),
            timeout=10,
            verify=False,
        )
        if resp.status_code == 200:
            rows = resp.json()
            return rows[0] if rows else None
        return None
    except Exception as e:
        logger.error(f"get_candidate_by_id error: {e}")
        return None


def get_candidates(user_id: str, limit: int = 200) -> list[dict]:
    url, _ = _cfg()
    if not is_configured():
        return []
    try:
        resp = requests.get(
            f"{url}/rest/v1/candidates",
            params={
                "user_id": f"eq.{user_id}",
                "order":   "created_at.desc",
                "limit":   limit,
                "select":  "*",
            },
            headers=_headers({"Prefer": "return=representation"}),
            timeout=10,
            verify=False,
        )
        if resp.status_code == 200:
            return resp.json()
        return []
    except Exception as e:
        logger.error(f"get_candidates error: {e}")
        return []


def delete_candidate(candidate_id: str, user_id: str) -> bool:
    url, _ = _cfg()
    if not is_configured():
        return False
    try:
        resp = requests.delete(
            f"{url}/rest/v1/candidates",
            params={"id": f"eq.{candidate_id}", "user_id": f"eq.{user_id}"},
            headers=_headers(),
            timeout=10,
            verify=False,
        )
        return resp.status_code in (200, 204)
    except Exception as e:
        logger.error(f"delete_candidate error: {e}")
        return False