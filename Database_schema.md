# Database Schema

ResumeAI uses two PostgreSQL tables in Supabase, linked by `session_id`. All data is scoped per user via Row Level Security (RLS).

---

## Tables

- [`analysis_sessions`](#analysis_sessions) — one row per complete analysis run
- [`candidates`](#candidates) — one row per resume per run

---

## Relationship

```
analysis_sessions
  id (PK) ──────────────────────────┐
  user_id                           │
  created_at                        │  1 session
  jd_filename                       │  has N candidates
  ...stats                          │
                                    ▼
                             candidates
                               id (PK)
                               session_id  ←── links here
                               user_id
                               file_name
                               candidate_name
                               college_name
                               score_pct
                               ...skills
```

Deleting a session also deletes all its candidates (handled in `supabase_client.py` — candidates are deleted first, then the session row).

---

## Setup

Run `supabase_schema_v2.sql` in your Supabase **SQL Editor → New query → Run**.

If you already ran `supabase_schema.sql` (v1), `supabase_schema_v2.sql` is safe to run again — it uses `CREATE TABLE IF NOT EXISTS` and `ADD COLUMN IF NOT EXISTS` throughout.

---

## `analysis_sessions`

Stores metadata and AI outputs for one complete analysis run (one JD uploaded with one or more resumes).

```sql
create table public.analysis_sessions (
  id                   uuid primary key default uuid_generate_v4(),
  created_at           timestamptz default now(),
  user_id              uuid references auth.users(id) on delete cascade,
  jd_filename          text,
  jd_experience_level  text,
  jd_technical_skills  text[],
  jd_soft_skills       text[],
  jd_tools             text[],
  total_candidates     integer default 0,
  avg_score            numeric(5,1),
  strong_count         integer default 0,
  moderate_count       integer default 0,
  weak_count           integer default 0,
  ranking_analysis     text,
  executive_summary    text,
  ai_enabled           boolean default false
);
```

### Columns

| Column | Type | Nullable | Description |
|---|---|---|---|
| `id` | `uuid` | No | Primary key — also used as the `session_id` in `candidates` |
| `created_at` | `timestamptz` | No | Timestamp of the analysis run, defaults to `now()` |
| `user_id` | `uuid` | No | Foreign key to `auth.users` — used by RLS policies |
| `jd_filename` | `text` | Yes | Original filename of the uploaded job description |
| `jd_experience_level` | `text` | Yes | AI-extracted required experience level (e.g. `3+ years`) |
| `jd_technical_skills` | `text[]` | Yes | AI-extracted list of required technical skills |
| `jd_soft_skills` | `text[]` | Yes | AI-extracted list of required soft skills |
| `jd_tools` | `text[]` | Yes | AI-extracted tools and technologies |
| `total_candidates` | `integer` | No | Number of resumes analysed in this run |
| `avg_score` | `numeric(5,1)` | Yes | Average composite score across all candidates in this session |
| `strong_count` | `integer` | No | Count of candidates scoring ≥ 70% |
| `moderate_count` | `integer` | No | Count of candidates scoring 45–69% |
| `weak_count` | `integer` | No | Count of candidates scoring < 45% |
| `ranking_analysis` | `text` | Yes | AI narrative explaining the ranking and top candidates |
| `executive_summary` | `text` | Yes | AI 4–6 paragraph executive summary of the full run |
| `ai_enabled` | `boolean` | No | Whether Ollama AI was active during this run |

### Indexes

```sql
create index sessions_user_id_idx on public.analysis_sessions(user_id);
create index sessions_created_idx on public.analysis_sessions(created_at desc);
```

### Row Level Security

```sql
-- Users can only read their own sessions
create policy "Users see own sessions"
  on public.analysis_sessions for select
  using (auth.uid() = user_id);

-- Users can only insert rows for themselves
create policy "Users insert own sessions"
  on public.analysis_sessions for insert
  with check (auth.uid() = user_id);

-- Users can only delete their own sessions
create policy "Users delete own sessions"
  on public.analysis_sessions for delete
  using (auth.uid() = user_id);
```

> The backend uses the `service_role` key which bypasses RLS. RLS applies when the frontend accesses the database directly using the user's JWT.

---

## `candidates`

Stores the full analysis result for one resume within one session.

```sql
create table public.candidates (
  id                   uuid primary key default uuid_generate_v4(),
  created_at           timestamptz default now(),
  user_id              uuid references auth.users(id) on delete cascade,
  session_id           uuid,

  -- file and identity
  file_name            text not null,
  candidate_name       text,
  college_name         text,

  -- scores
  score_pct            numeric(5,1),
  verdict              text,
  keyword_overlap      numeric(5,1),
  vector_similarity    numeric(5,1),
  skills_match_score   numeric(5,1),

  -- NLP keywords
  matched_keywords     text[],
  missing_keywords     text[],

  -- AI skills comparison
  matching_technical   text[],
  missing_technical    text[],
  matching_soft        text[],
  missing_soft         text[],
  matching_tools       text[],
  missing_tools        text[],
  experience_fit       text,
  overall_assessment   text,

  -- extracted resume skills
  resume_technical     text[],
  resume_soft          text[],
  resume_tools         text[],
  experience_level     text,

  -- AI output
  ai_summary           text,

  -- job description context
  jd_experience_level  text,
  jd_technical_skills  text[]
);
```

### Columns

#### Identity

| Column | Type | Nullable | Description |
|---|---|---|---|
| `id` | `uuid` | No | Primary key |
| `created_at` | `timestamptz` | No | Row creation timestamp |
| `user_id` | `uuid` | No | Foreign key to `auth.users` |
| `session_id` | `uuid` | Yes | Links to `analysis_sessions.id` |
| `file_name` | `text` | No | Original resume filename (e.g. `john_doe_cv.pdf`) |
| `candidate_name` | `text` | Yes | Full name extracted from resume using spaCy NER + heuristics |
| `college_name` | `text` | Yes | College / university extracted from the education section |

#### Scores

| Column | Type | Nullable | Description |
|---|---|---|---|
| `score_pct` | `numeric(5,1)` | Yes | Composite match score 0–100% |
| `verdict` | `text` | Yes | `Strong Match`, `Moderate Match`, or `Weak Match` |
| `keyword_overlap` | `numeric(5,1)` | Yes | JD keyword overlap percentage |
| `vector_similarity` | `numeric(5,1)` | Yes | spaCy semantic cosine similarity percentage |
| `skills_match_score` | `numeric(5,1)` | Yes | AI skills comparison score — `null` when AI is disabled |

#### NLP Keywords

| Column | Type | Nullable | Description |
|---|---|---|---|
| `matched_keywords` | `text[]` | Yes | JD lemmas that also appear in the resume |
| `missing_keywords` | `text[]` | Yes | JD lemmas absent from the resume (top 20) |

#### AI Skills Comparison

| Column | Type | Nullable | Description |
|---|---|---|---|
| `matching_technical` | `text[]` | Yes | Technical skills from the JD found in the resume |
| `missing_technical` | `text[]` | Yes | Required technical skills not found in the resume |
| `matching_soft` | `text[]` | Yes | Soft skills from the JD found in the resume |
| `missing_soft` | `text[]` | Yes | Required soft skills not found in the resume |
| `matching_tools` | `text[]` | Yes | Tools / technologies from the JD found in the resume |
| `missing_tools` | `text[]` | Yes | Required tools not found in the resume |
| `experience_fit` | `text` | Yes | AI one-sentence assessment of experience match |
| `overall_assessment` | `text` | Yes | AI two-sentence overall candidate assessment |

#### Candidate's Extracted Skills

| Column | Type | Nullable | Description |
|---|---|---|---|
| `resume_technical` | `text[]` | Yes | Technical skills extracted directly from the resume |
| `resume_soft` | `text[]` | Yes | Soft skills extracted directly from the resume |
| `resume_tools` | `text[]` | Yes | Tools and technologies extracted from the resume |
| `experience_level` | `text` | Yes | Candidate's stated experience level (e.g. `5 years`) |

#### AI Output & Context

| Column | Type | Nullable | Description |
|---|---|---|---|
| `ai_summary` | `text` | Yes | AI 3–4 sentence candidate summary against the JD |
| `jd_experience_level` | `text` | Yes | Required experience from the JD (denormalised for quick access) |
| `jd_technical_skills` | `text[]` | Yes | Required technical skills from the JD (denormalised) |

### Indexes

```sql
create index candidates_user_id_idx  on public.candidates(user_id);
create index candidates_score_idx    on public.candidates(score_pct desc);
create index candidates_created_idx  on public.candidates(created_at desc);
create index candidates_session_idx  on public.candidates(session_id);
```

### Row Level Security

```sql
create policy "Users see own candidates"
  on public.candidates for select
  using (auth.uid() = user_id);

create policy "Users insert own candidates"
  on public.candidates for insert
  with check (auth.uid() = user_id);

create policy "Users delete own candidates"
  on public.candidates for delete
  using (auth.uid() = user_id);
```

---

## Score Calculation

The `score_pct` stored in `candidates` is calculated in `resume_analyzer.py` before being saved:

```
Without AI:   score = 0.6 × keyword_overlap + 0.4 × vector_similarity
With AI:      score = 0.4 × keyword_overlap + 0.3 × vector_similarity + 0.3 × ai_skills_match
```

All three component values are also stored separately (`keyword_overlap`, `vector_similarity`, `skills_match_score`) so you can re-weight them in analysis without re-running the screener.

---

## Querying Examples

All of these run in **Supabase SQL Editor**.

**All sessions for a user, newest first:**
```sql
select id, jd_filename, total_candidates, avg_score, created_at
from analysis_sessions
order by created_at desc;
```

**Top candidates across all sessions:**
```sql
select candidate_name, college_name, file_name, score_pct, verdict, created_at
from candidates
order by score_pct desc
limit 20;
```

**All candidates from a specific session:**
```sql
select candidate_name, college_name, score_pct, verdict,
       matching_technical, missing_technical
from candidates
where session_id = 'YOUR_SESSION_UUID'
order by score_pct desc;
```

**Most common missing technical skills across all runs:**
```sql
select unnest(missing_technical) as skill, count(*) as frequency
from candidates
group by skill
order by frequency desc
limit 20;
```

**Sessions with at least one strong match:**
```sql
select id, jd_filename, strong_count, total_candidates, avg_score
from analysis_sessions
where strong_count > 0
order by avg_score desc;
```

**Candidates from a specific college:**
```sql
select candidate_name, college_name, score_pct, verdict, file_name
from candidates
where lower(college_name) like '%iit%'
order by score_pct desc;
```

---

## Migrations

### v1 → v2 (current)

`supabase_schema_v2.sql` makes the following changes to the v1 schema:

- **New table:** `analysis_sessions`
- **New columns on `candidates`:** `candidate_name text`, `college_name text`
- **New index:** `candidates_session_idx` on `candidates(session_id)`
- **New RLS policies** on `analysis_sessions`

All changes use `IF NOT EXISTS` / `IF NOT EXISTS` guards so the script is safe to run on a fresh database or an existing v1 database.