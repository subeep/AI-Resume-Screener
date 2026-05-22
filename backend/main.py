"""
main.py  (v4 — sessions + candidate name/college + resume PDF proxy)
"""

import io
import logging
import os
import uuid
from datetime import datetime
from typing import Annotated

import pandas as pd
from fastapi import FastAPI, File, Form, HTTPException, UploadFile, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from pydantic import BaseModel

import llm_service
import resume_analyzer as ra
import supabase_client as supa
import chat_service as chat

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

app = FastAPI(title="Resume Screener API", version="4.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", os.getenv("FRONTEND_URL", "")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

security = HTTPBearer(auto_error=False)


# ── Auth ──────────────────────────────────────────────────────────────────────

def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(security),
) -> dict | None:
    if not creds:
        return None
    return supa.verify_jwt(creds.credentials)


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {
        "status":              "ok",
        "gemini_configured":   llm_service.is_gemini_configured(),
        "model":               os.getenv("GEMINI_MODEL", "gemini-2.0-flash"),
        "supabase_configured": supa.is_configured(),
        "timestamp":           datetime.now().isoformat(),
    }


@app.get("/debug/auth")
def debug_auth(user: dict | None = Depends(get_current_user)):
    return {"user": user, "supabase_configured": supa.is_configured()}


# ── JD skills ─────────────────────────────────────────────────────────────────

@app.post("/jd/skills")
async def extract_jd_skills(jd_file: UploadFile = File(...)):
    content = await jd_file.read()
    jd_text = ra.extract_text_from_bytes(content, jd_file.content_type or "")
    if not jd_text.strip():
        raise HTTPException(400, "Could not extract text from the JD file.")
    return {"jd_text": jd_text, "skills": llm_service.extract_jd_skills(jd_text)}


# ── Main analysis ─────────────────────────────────────────────────────────────

@app.post("/analyze")
async def analyze(
    jd_file:   UploadFile = File(...),
    resumes:   list[UploadFile] = File(...),
    enable_ai: Annotated[bool, Form()] = True,
    user:      dict | None = Depends(get_current_user),
):
    jd_bytes = await jd_file.read()
    jd_text  = ra.extract_text_from_bytes(jd_bytes, jd_file.content_type or "")
    if not jd_text.strip():
        raise HTTPException(400, "Could not extract text from the job description.")

    ai_enabled     = enable_ai and llm_service.is_gemini_configured()
    jd_skills_data = None

    if ai_enabled:
        jd_skills_data = llm_service.extract_jd_skills(jd_text)

    ra.store_document("jd_latest", jd_text, {
        "type": "job_description",
        "upload_date": datetime.now().isoformat(),
        "word_count": len(jd_text.split()),
    })

    session_id = str(uuid.uuid4())
    results: list[dict] = []

    for resume_file in resumes:
        file_bytes   = await resume_file.read()
        content_type = resume_file.content_type or "application/octet-stream"
        resume_text  = ra.extract_text_from_bytes(file_bytes, content_type)

        if not resume_text.strip():
            continue

        try:
            result = ra.analyze_resume(
                name=resume_file.filename or "unknown",
                text=resume_text,
                jd_text=jd_text,
                jd_skills_data=jd_skills_data,
                ai_enabled=ai_enabled,
            )

            if user:
                storage_path = supa.upload_resume_pdf(
                    file_bytes=file_bytes,
                    file_name=resume_file.filename or "resume",
                    user_id=user["id"],
                    session_id=session_id,
                    content_type=content_type,
                )
                result["resume_storage_path"] = storage_path
                logger.info(f"Uploaded {resume_file.filename!r} → {storage_path!r}")
            else:
                result["resume_storage_path"] = None

            results.append(result)

            if user:
                supa.save_candidate(result, user["id"], session_id, jd_skills_data)

        except Exception as exc:
            logger.error(f"Error analysing {resume_file.filename}: {exc}")

    if not results:
        raise HTTPException(422, "No valid resumes could be analysed.")

    results.sort(key=lambda r: r["score_pct"], reverse=True)

    ranking_analysis  = None
    executive_summary = None

    if ai_enabled and results:
        ranking_analysis = llm_service.generate_ranking_analysis(results, jd_text)
        scores_num = [r["score_pct"] for r in results]
        avg      = sum(scores_num) / len(scores_num)
        strong   = sum(1 for s in scores_num if s >= 70)
        moderate = sum(1 for s in scores_num if 45 <= s < 70)
        weak     = sum(1 for s in scores_num if s < 45)
        summary_data = f"""
Total Candidates: {len(results)}
Average Match Score: {avg:.1f}%
Strong Matches (70%+): {strong}
Moderate Matches (45-70%): {moderate}
Weak Matches (<45%): {weak}

Top 3 Candidates:
{chr(10).join([f"{i+1}. {r['name']}: {r['score_pct']}% — {r['verdict']}" for i, r in enumerate(results[:3])])}

Job Requirements:
- Technical Skills: {', '.join((jd_skills_data or {}).get('technical_skills', [])[:5]) or 'Not analysed'}
- Experience Level: {(jd_skills_data or {}).get('experience_level', 'Not specified')}
"""
        executive_summary = llm_service.generate_executive_summary(summary_data)

    scores_num = [r["score_pct"] for r in results]
    if user:
        supa.save_session(session_id, user["id"], {
            "jd_filename":         jd_file.filename or "job_description",
            "jd_experience_level": (jd_skills_data or {}).get("experience_level"),
            "jd_technical_skills": (jd_skills_data or {}).get("technical_skills", []),
            "jd_soft_skills":      (jd_skills_data or {}).get("soft_skills", []),
            "jd_tools":            (jd_skills_data or {}).get("tools_technologies", []),
            "total_candidates":    len(results),
            "avg_score":           round(sum(scores_num) / len(scores_num), 1),
            "strong_count":        sum(1 for s in scores_num if s >= 70),
            "moderate_count":      sum(1 for s in scores_num if 45 <= s < 70),
            "weak_count":          sum(1 for s in scores_num if s < 45),
            "ranking_analysis":    ranking_analysis,
            "executive_summary":   executive_summary,
            "ai_enabled":          ai_enabled,
        })

    jd_keywords = ra.get_keyword_counts(jd_text, tags=("NN", "NNS", "NNP", "NNPS"))

    return {
        "ai_enabled":        ai_enabled,
        "jd_skills":         jd_skills_data,
        "jd_keywords":       jd_keywords[:30],
        "results":           results,
        "ranking_analysis":  ranking_analysis,
        "executive_summary": executive_summary,
        "session_id":        session_id,
        "saved_to_db":       user is not None and supa.is_configured(),
        "stats": {
            "total":    len(results),
            "avg":      round(sum(scores_num) / len(scores_num), 1),
            "strong":   sum(1 for s in scores_num if s >= 70),
            "moderate": sum(1 for s in scores_num if 45 <= s < 70),
            "weak":     sum(1 for s in scores_num if s < 45),
        },
    }


# ── Resume proxy ──────────────────────────────────────────────────────────────
#
# Iframes CANNOT send Authorization headers — so the JWT is passed as
# ?token=<jwt>.  The backend validates it, fetches bytes via service-role key
# (bypassing Supabase's X-Frame-Options: DENY), and serves them with
# SAMEORIGIN headers so the <iframe> on localhost:3000 can embed the file.

@app.get("/candidates/{candidate_id}/resume")
def proxy_resume(
    candidate_id: str,
    token: str = Query(..., description="Supabase JWT access token"),
):
    user = supa.verify_jwt(token)
    if not user:
        raise HTTPException(401, "Invalid or expired token.")

    candidate = supa.get_candidate_by_id(candidate_id, user["id"])

    if not candidate:
        raise HTTPException(404, "Candidate not found.")

    storage_path = candidate.get("resume_storage_path")
    logger.info(f"Resume proxy → candidate={candidate_id} path={storage_path!r}")

    if not storage_path:
        raise HTTPException(
            404,
            "No resume file stored for this candidate. "
            "Re-run the analysis while signed in to store the file."
        )

    result = supa.fetch_resume_bytes(storage_path)
    if not result:
        raise HTTPException(500, "Could not retrieve resume from storage.")

    file_bytes, content_type = result
    filename = storage_path.split("/")[-1]

    return Response(
        content=file_bytes,
        media_type=content_type,
        headers={
            "Content-Disposition":     f'inline; filename="{filename}"',
            "X-Frame-Options":         "SAMEORIGIN",
            "Content-Security-Policy": "frame-ancestors 'self' http://localhost:3000",
        },
    )


# ── Sessions endpoints ────────────────────────────────────────────────────────

@app.get("/sessions")
def list_sessions(user: dict | None = Depends(get_current_user)):
    if not user:
        raise HTTPException(401, "Authentication required.")
    return {"sessions": supa.get_sessions(user["id"])}


@app.get("/sessions/{session_id}/candidates")
def get_session_candidates(session_id: str, user: dict | None = Depends(get_current_user)):
    if not user:
        raise HTTPException(401, "Authentication required.")
    return {"candidates": supa.get_session_candidates(session_id, user["id"])}


@app.delete("/sessions/{session_id}")
def delete_session(session_id: str, user: dict | None = Depends(get_current_user)):
    if not user:
        raise HTTPException(401, "Authentication required.")
    ok = supa.delete_session(session_id, user["id"])
    if not ok:
        raise HTTPException(500, "Delete failed.")
    return {"deleted": session_id}


# ── Candidates endpoints ──────────────────────────────────────────────────────

@app.get("/candidates")
def list_candidates(limit: int = 200, user: dict | None = Depends(get_current_user)):
    if not user:
        raise HTTPException(401, "Authentication required.")
    return {"candidates": supa.get_candidates(user["id"], limit), "total": 0}


@app.delete("/candidates/{candidate_id}")
def delete_candidate(candidate_id: str, user: dict | None = Depends(get_current_user)):
    if not user:
        raise HTTPException(401, "Authentication required.")
    ok = supa.delete_candidate(candidate_id, user["id"])
    if not ok:
        raise HTTPException(500, "Delete failed.")
    return {"deleted": candidate_id}


# ── Excel export ──────────────────────────────────────────────────────────────

@app.post("/export")
async def export_excel(
    jd_file:   UploadFile = File(...),
    resumes:   list[UploadFile] = File(...),
    enable_ai: Annotated[bool, Form()] = True,
    user:      dict | None = Depends(get_current_user),
):
    jd_bytes   = await jd_file.read()
    jd_text    = ra.extract_text_from_bytes(jd_bytes, jd_file.content_type or "")
    ai_enabled = enable_ai and llm_service.is_gemini_configured()
    jd_skills  = llm_service.extract_jd_skills(jd_text) if ai_enabled else None

    rows: list[dict] = []
    for rf in resumes:
        fb   = await rf.read()
        text = ra.extract_text_from_bytes(fb, rf.content_type or "")
        if not text.strip():
            continue
        r = ra.analyze_resume(rf.filename or "unknown", text, jd_text, jd_skills, ai_enabled)
        rows.append(r)
    rows.sort(key=lambda x: x["score_pct"], reverse=True)

    buf = io.BytesIO()
    flat = [{
        "Resume":                    r["name"],
        "Candidate Name":            r.get("candidate_name") or "—",
        "College":                   r.get("college_name") or "—",
        "Score (%)":                 r["score_pct"],
        "Verdict":                   r["verdict"],
        "Keyword Overlap (%)":       r["keyword_overlap"],
        "Semantic Similarity (%)":   r["vector_similarity"],
        "Skills Match Score (%)":    r["skills_match_score"],
        "Matching Technical Skills": ", ".join((r.get("skills_comparison") or {}).get("matching_technical", [])),
        "Missing Technical Skills":  ", ".join((r.get("skills_comparison") or {}).get("missing_technical", [])),
        "Matching Soft Skills":      ", ".join((r.get("skills_comparison") or {}).get("matching_soft", [])),
        "Missing Soft Skills":       ", ".join((r.get("skills_comparison") or {}).get("missing_soft", [])),
        "Matching Tools":            ", ".join((r.get("skills_comparison") or {}).get("matching_tools", [])),
        "Missing Tools":             ", ".join((r.get("skills_comparison") or {}).get("missing_tools", [])),
        "Experience Fit":            (r.get("skills_comparison") or {}).get("experience_fit", ""),
        "AI Summary":                r.get("ai_summary") or "",
    } for r in rows]

    with pd.ExcelWriter(buf, engine="xlsxwriter") as writer:
        pd.DataFrame(flat).to_excel(writer, index=False, sheet_name="Resume Scores")
        ws = writer.sheets["Resume Scores"]
        ws.set_column(0, 2, 28)
        ws.set_column(3, 7, 18)
        ws.set_column(8, 15, 35)

    buf.seek(0)
    filename = f"resume_analysis_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── Chat endpoint ─────────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: list[ChatMessage]

@app.post("/chat")
async def chat_endpoint(
    body: ChatRequest,
    user: dict | None = Depends(get_current_user),
):
    candidates: list[dict] = []
    sessions:   list[dict] = []

    if user:
        candidates = supa.get_candidates(user["id"], limit=50)
        sessions   = supa.get_sessions(user["id"],   limit=10)

    system_prompt = chat.build_system_prompt(candidates, sessions)
    messages = [{"role": m.role, "content": m.content} for m in body.messages]

    async def generate():
        async for chunk in chat.stream_chat(messages, system_prompt):
            escaped = chunk.replace("\\", "\\\\").replace("\n", "\\n")
            yield f"data: {escaped}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":               "no-cache",
            "X-Accel-Buffering":           "no",
            "Access-Control-Allow-Origin": "*",
        },
    )


# ── Vector search ─────────────────────────────────────────────────────────────

@app.get("/search")
def search(q: str, n: int = 5):
    results = ra.search_documents(q, n_results=n)
    if results is None:
        raise HTTPException(500, "Vector DB search failed.")
    return {"query": q, "results": results}