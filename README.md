<div align="center">

# Slotly

**AI-Driven Appointment Booking Platform**

Book an appointment by talking to it. No forms, no date pickers — just plain language.

[![Node](https://img.shields.io/badge/Node-20%2B-339933)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-3178C6)](https://www.typescriptlang.org)
[![React](https://img.shields.io/badge/React-19-61DAFB)](https://react.dev)
[![Express](https://img.shields.io/badge/Express-5-000000)](https://expressjs.com)
[![Postgres](https://img.shields.io/badge/PostgreSQL-4169E1)](https://www.postgresql.org)

</div>

---

## 📖 Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Technology Stack](#-technology-stack)
- [Architecture](#-architecture)
- [UI Walkthrough](#-ui-walkthrough)
- [API Reference](#-api-reference)
- [Chat Engine — how one turn works](#-chat-engine--how-one-turn-works)
- [Database Schema](#-database-schema)
- [System Requirements](#-system-requirements)
- [Installation & Setup](#-installation--setup)
- [Deployment](#-deployment)
- [Testing](#-testing)
- [Project Structure](#-project-structure)
- [Security](#-security)
- [Design Decisions](#-design-decisions)
- [Contribution Guidelines](#-contribution-guidelines)
- [Contact & Team](#-contact--team)

---

## 💡 Overview

Most booking software asks a user to fill in four fields. Slotly asks one question.

You type *"a mens cut friday at 2pm"*. A language model extracts the booking
fields, the assistant confirms what it understood, and on your **yes** the
appointment is written to Postgres — in **your** timezone, converted to a UTC
instant, with the double-booking prevented by the database itself.

The interesting part is what happens when the model is wrong, unavailable, or
malicious. It cannot book anything: the model returns *fields only* — never
prose, never a decision. Every sentence the user reads is composed by the
server, and the transaction that creates the appointment is committed by code
that never asked the model what to do. A prompt injection gets a JSON object and
a shrug.

The platform is multi-tenant by construction (every table carries a
`business_id`, every query is scoped by the JWT, every foreign key is composite
across the tenant), and it degrades honestly — when the AI is down, the user
gets a real form pre-filled with whatever was collected, not a dead end.

---

## 🚀 Features

### 🤖 Conversational Booking (AI-Assisted)

- **Plain-language intake** — "book a haircut for tomorrow morning" is enough.
  No field-by-field form walking.
- **Multi-turn field collection** — the assistant asks for **one** missing field
  at a time, never three at once, so a partial answer is still usable.
- **Explicit confirmation** — nothing is booked until you say **yes**. The
  assistant restates the exact slot it will write before you commit.
- **Dumb-safe yes/no** — `yes`, `yeah`, `book it`, `do it` only book when the
  **entire** message is that word. "ok but shift to Friday" is treated as a
  correction, never a confirmation. The most dangerous misclassification in a
  booking bot simply cannot happen.
- **Mid-flight corrections** — keep talking; each turn re-reads the whole
  conversation and updates the draft. Change the date, change the time, change
  the service.
- **Timezone-aware** — the browser's IANA zone is sent with every message, so
  "2pm" means 2pm *where you are*, not where the server is.
- **Model can only return fields** — a JSON schema (`service`, `date`, `time`,
  `durationMinutes`) is enforced with `response_format: json_object` and
  re-validated with zod. The model has no vocabulary for "confirm" or "create".
- **DST-correct** — a time inside a spring-forward gap is rejected, not silently
  shifted; a fall-back hour resolves to the first occurrence.
- **Zero wasted AI calls** — a confirmation or a decline never reaches the
  model. The two decisions that matter are deterministic.

### 🛟 Graceful Degradation

- **Form fallback on every AI failure** — unparseable output, truncated output,
  401/429/5xx, and network errors each surface the reason and mount a real,
  pre-filled booking form. A dead AI never dead-ends the flow.
- **Re-ask, don't loop** — an impossible date/time clears *both* fields so one
  corrected value can rebuild them, instead of asking the same broken question
  forever.
- **Slot-taken recovery** — a taken slot is answered with another prompt
  ("That time has just been taken. What other time works for you?"), not an
  error code, because from the user's point of view the booking simply isn't
  available yet.

### 📅 Schedule & Calendar UI

- **Three views of one dataset** — Day (one column), Week (seven days), and
  Month (a classic 5×7 grid whose cells list that day's bookings, time-first).
- **Live "now" line** — a rose rule with a clock pill, positioned in the grid
  and ticking every 30 seconds. It auto-scrolls into view on load, once per
  visible window, so the current moment is never off-screen.
- **Next-7-days dialog** — a floating action button, badged with the count of
  upcoming appointments, opens a modal grouped by day. Closes on backdrop click
  or `Esc`.
- **Infinite loading** — the list endpoint is keyset-paginated, but a calendar
  needs everything, so remaining pages are fetched as the view fills.
- **Status everywhere** — `confirmed` (green) and `cancelled` (struck through)
  are legible in the grid, the list, and the profile.

### 👤 Accounts & Profile

- **Signup with real password policy** — 8–72 chars, lowercase, uppercase, and
  a special character, enforced client *and* server.
- **Confirm-password + live mismatch** — validated on blur, re-checked on every
  change.
- **One-click password suggestion** — generates a policy-compliant password and
  fills both fields, so the match rule passes.
- **Show/hide password** — a toggle on every password field.
- **Editable profile** — change your name and email in place. The new email
  immediately becomes your sign-in.
- **Member since** — account age, straight from the record.
- **Booking stats** — total bookings and confirmed count.
- **Recent appointments** — the last five, on the profile itself.
- **Session check on boot** — a full-screen spinner while `GET /auth/me`
  validates the stored token; a clean redirect to `/login` if it is not usable.

### 🔐 Security & Multi-Tenancy

- **BCrypt** password hashing, cost 12 by default.
- **HS256 JWTs** that carry only `sub` + `businessId`, with the algorithm
  pinned — an `alg=none` forgery or an HS512 token is rejected outright.
- **Timing-equalized login** — an unknown email performs the same dummy hash as
  a wrong password, so response time cannot enumerate accounts.
- **Tenant-scoped composite foreign keys** — `appointments.user_id` must
  reference a `users` row *in the same business*, enforced by Postgres, not by
  application code.
- **Database-level double-booking prevention** — a GiST exclusion constraint
  over the actual time range. No `SELECT`-then-`INSERT` race is possible,
  because nothing is checked in application code.
- **Rate limiting with intent** — signup (10/hour, it costs a bcrypt hash),
  login (20 per 15 min, **failures only**, so you cannot lock yourself out by
  logging in correctly), chat (20/min **per authenticated user**, not per IP,
  so a shared office NAT cannot exhaust your AI budget), and a general API
  ceiling.
- **Generic errors** — every failure is a typed envelope; 5xx never leaks
  internals.

### ⚡ Developer Experience

- **One-command verification per side** — `npm run build` typechecks the
  backend, `npm run build` typechecks *and* bundles the frontend.
- **100+ integration tests** against a real Postgres, including concurrency
  races and token-forgery attempts.
- **No mocked database** — the suite runs the actual exclusion constraint, so
  "no double booking" is tested, not asserted.
- **Env validated at boot** — zod parses the process environment at import
  time; a missing secret kills the process immediately with a readable report,
  not three requests later.
- **Graceful shutdown** — `SIGTERM`/`SIGINT` close the listener, drain the
  connection pool, and force-exit after 10s. Hostile to a rolling deploy, kind
  to a Neon blip.

---

## 🛠️ Technology Stack

| Layer | Technology |
| --- | --- |
| **Frontend** | React 19, Vite 8, TypeScript, Tailwind CSS 4, React Router 8 |
| **State & Data** | TanStack Query 5 (server cache), Zustand 5 (auth session) |
| **Forms** | React Hook Form 7 + `@hookform/resolvers` + Zod 4 |
| **Icons / Lint** | Hand-rolled inline SVG, oxlint |
| **Backend** | Node 20+, Express 5, TypeScript (ESM, run with `tsx`) |
| **Database** | PostgreSQL (Neon), `pg` with a pooled + direct URL split, raw SQL migrations |
| **Auth** | `jsonwebtoken` (HS256), `bcrypt` |
| **Validation** | Zod 4, shared shape philosophy across both sides |
| **AI** | Groq (`openai/gpt-oss-120b`), OpenAI-compatible endpoint over `fetch` |
| **Dates** | Luxon 3 (server), `Intl.DateTimeFormat` (browser) |
| **Hardening** | helmet, cors, `express-rate-limit`, pino + pino-http |
| **Testing** | Vitest 5, supertest, real Neon test database |
| **Fonts** | Plus Jakarta Sans Variable (self-hosted via `@fontsource-variable`) |

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Browser  (React 19 SPA)                                     │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ TanStack   │  │ Zustand      │  │ Intl.DateTimeFormat  │  │
│  │ Query      │  │ (session)    │  │ (IANA zone)          │  │
│  └────────────┘  └──────────────┘  └──────────────────────┘  │
└────────────────────────────┬─────────────────────────────────┘
                             │  fetch  +  Bearer JWT
                             │  {VITE_API_URL}/api/*  or  /api/* (proxy)
┌────────────────────────────▼─────────────────────────────────┐
│  Express 5                                                      │
│  helmet → cors → json(100kb) → requestLogger → apiLimiter      │
│                                      │                         │
│   /api/health          /api/health/ready                      │
│   /api/auth/*          → signupLimiter / authLimiter          │
│   /api/appointments/*  → authenticate (tenant from token)      │
│   /api/chat/*          → authenticate → chatLimiter            │
│                                      │                         │
│  notFound → errorHandler (typed { error: { code, message } }) │
└──────┬────────────────────────────┬───────────────────────────┘
       │                            │
┌──────▼──────────────┐   ┌─────────▼─────────────────────────┐
│ PostgreSQL (Neon)   │   │ Groq  openai/gpt-oss-120b          │
│ ─────────────────── │   │ ─────────────────────────────────  │
│ exclusion constraint│   │ JSON out: service/date/time/dur    │
│ stops double-booking│   │ 20s timeout, temperature 0         │
└─────────────────────┘   └───────────────────────────────────┘
```

**The request path.** Every protected route resolves its tenant from the
verified token (`sub` + `businessId`), never from the request body or query
string. `source` on a booking (`chat` vs `form`) is stamped by the **server**,
so a client cannot forge a claim about where a booking came from. Migrations run
against `DATABASE_URL_DIRECT` because PgBouncer's transaction pooling cannot run
DDL; the app itself uses the pooled URL.

**Feature boundaries (frontend).** `features/` never import each other; the
`pages/` layer composes them and owns the cross-feature wiring. For example,
`DashboardPage` receives the chat's "an appointment was booked" signal and uses
it to invalidate the appointments query — the chat feature knows nothing about
the appointments cache.

---

## 🖥️ UI Walkthrough

### Authentication — split-screen branded layout

Login and Signup render inside `AuthLayout`: a soft indigo→sky gradient wash
with blurred decorative glows, a white card on the left, and the Slotly logo
with the tagline *"Appointments, booked in plain language."* on the right. On
mobile it collapses to a single column with a compact logo above the card.

| Field | Behavior |
| --- | --- |
| **Name** | 1–120 chars, trimmed |
| **Email** | Validated on blur, re-checked as you type; padded/upper-case input is normalized |
| **Password** | 8–72 chars + lowercase + uppercase + special character; show/hide toggle |
| **Suggest a password** | One click fills both fields with a compliant password |
| **Confirm password** | Live "Passwords do not match" hint before you even submit |
| **Error banner** | Server messages (e.g. `EMAIL_TAKEN`) render above the submit button |

<img width="910" height="426" alt="image" src="https://github.com/user-attachments/assets/3f1449e0-e149-4597-9071-90c0c83d4ea0" />


### Dashboard — chat beside calendar

The signed-in home is a two-pane split: a WhatsApp-style chat on the left
(20rem) and the full-height calendar on the right. Below ~1024px the panes stack.
The header carries the Slotly logo on the left and the **user menu** on the
right.

**Chat pane**

- **Header** — gradient avatar tile with a sparkle glyph, "Slotly assistant",
  and a live status line with a colored dot: amber while *"Waiting for your
  confirmation"*, emerald while *"Nothing is booked until you confirm"*, grey
  when the session is finished.
- **Transcript** — the assistant's turns left on white with a soft shadow; your
  turns right on an indigo→violet gradient. A three-dot typing indicator appears
  in the assistant's column while a request is in flight.
- **Input** — auto-growing textarea (WhatsApp-style: grows to 120px, then
  scrolls internally, no visible scrollbar), `Enter` sends, `Shift+Enter` makes
  a newline.
- **Confirmation bar** — while a slot is pending, `Yes, book it` / `No, thanks`
  appear above the input *alongside* the text box, with the hint *"Or tell me
  what to change."*
- **"No, thanks" keeps you in the conversation** — the decline is routed through
  the normal message path, so the assistant answers in the same session and the
  input comes straight back for a different booking. The hard stop is the
  explicit `POST /api/chat/:id/cancel` endpoint.
- **Fallback form** — when the assistant cannot continue, a notice explains why
  and the booking form is pre-filled with whatever was collected.

**Calendar pane**

- Segmented **Day / Week / Month** switch, `‹` `›` navigation, a clickable date
  title that returns to today, and a live clock pill.
- **Week view** (default): seven columns, sticky day headers and a sticky hour
  rail, 3.5rem rows, each booking rendered as a time + service chip.
- **Month view**: 5×7 grid; out-of-month days dimmed, today outlined, up to three
  bookings per cell and `+N more` beyond that. Cancelled bookings are struck
  through. Clicking a day drops into Day view for it.
- **Next-7-days FAB**: bottom-right, badged with the number of upcoming
  appointments; opens a modal grouped by day with full `AppointmentItem` cards.

**Appointment item** — a gradient time chip on the left (e.g. `2:00 PM` over
`Oct 07`), the service name, a status badge, the duration, a `· booked via chat`
marker for AI-created bookings, and a **Cancel** action while confirmed.

<img width="940" height="431" alt="image" src="https://github.com/user-attachments/assets/61d0cbde-c082-44bd-b0f2-942f4f17b320" />


### Profile

An "Account" eyebrow, an identity card with a gradient initial avatar, name,
email and *Member since*, two stat tiles (**Total bookings**, **Confirmed**),
an **Account details** card, and the five most recent appointments.

Editing is in place: `Edit` swaps the read-only detail list for a two-field
form with `Cancel` / `Save changes`, and a green **Saved** confirmation with a
check glyph appears for 2.5s afterwards. A server-side email conflict is
rendered on the email field itself, not as a generic banner.

<img width="936" height="429" alt="image" src="https://github.com/user-attachments/assets/4da2d597-0cc0-4e13-aeec-0172e9828dbd" />


### User menu

The avatar button (initial + name on wider screens) opens a menu with the
identity block, **View profile**, and **Logout**. It closes on outside click or
`Esc`, and the chevron rotates.

### Loading & error states

| State | What you see |
| --- | --- |
| Session check | Full-screen centered spinner with a rotating refresh arrow, *"Checking your session"* |
| Calendar loading | Inline spinner, *"Loading schedule"* |
| Any list empty | `EmptyState` with a title and a one-line explanation |
| API failure | Red `ErrorMessage` with the server's message |

---

## 📡 API Reference

All routes are prefixed with `/api`. Every error uses one envelope:

```jsonc
{
  "error": {
    "code": "SLOT_TAKEN",          // stable, switchable
    "message": "That time slot is no longer available",
    "details": { "fields": [{ "path": "email", "message": "..." }] }  // validation only
  }
}
```

### Health

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/health` | — | Liveness. Never touches the DB, so a Neon blip can't get the process killed and restarted in a loop. |
| `GET` | `/api/health/ready` | — | Readiness. Runs `SELECT 1`; returns `503` with `{"status":"degraded"}` if the DB is unreachable. Point the platform's *readiness* probe here. |

### Auth — `/api/auth`

| Method | Path | Auth | Body | Response |
| --- | --- | --- | --- | --- |
| `POST` | `/signup` | — | `{ name, email, password }` | `201` `{ token, user }` |
| `POST` | `/login` | — | `{ email, password }` | `200` `{ token, user }` |
| `GET` | `/me` | ✔ | — | `200` `{ user }` |
| `PATCH` | `/me` | ✔ | `{ name, email }` | `200` `{ user }` |

`user` is always `{ id, businessId, email, name, createdAt }` — `password_hash`
is never serialised. A client-supplied `businessId` on signup is ignored. PATCH
`/me` returns `409 EMAIL_TAKEN` for a duplicate email and keeps the existing
token valid.

### Appointments — `/api/appointments` (all authenticated)

| Method | Path | Body / Query | Response |
| --- | --- | --- | --- |
| `POST` | `/` | `{ service, startsAt, durationMinutes?, notes? }` | `201` `{ appointment }` |
| `GET` | `/` | `?pageSize=20&cursor=…&includeCancelled=false` | `200` `{ appointments, nextCursor }` |
| `POST` | `/:id/cancel` | — | `200` `{ appointment }` |

- `startsAt` **must** carry an explicit offset (`2026-10-01T15:00:00+05:00`) and
  must be in the future. A bare local timestamp is rejected rather than assumed
  to be UTC.
- `durationMinutes` is 5–480, default 30. `pageSize` is 1–100, default 20.
- `cursor` is opaque keyset pagination (`startsAt|id`) — stable under
  concurrent inserts, unlike `OFFSET`.
- An overlapping slot → `409 SLOT_TAKEN`. Another user's appointment → `404`
  (never `403`, which would confirm it exists).

### Chat — `/api/chat` (all authenticated)

| Method | Path | Body | Response |
| --- | --- | --- | --- |
| `POST` | `/` | `{ text, sessionId?, timezone? }` | `200` `ChatReply` |
| `GET` | `/:id` | — | `200` `{ session, messages }` |
| `POST` | `/:id/cancel` | — | `200` `ChatReply` (status `abandoned`) |

`ChatReply`:

```jsonc
{
  "sessionId": "uuid",
  "status": "active" | "completed" | "abandoned",
  "reply": "Shall I book Mens cut on Fri, Oct 9 at 2:00 PM?",
  "draft": { "service": "...", "date": "2026-10-09", "time": "14:00",
             "durationMinutes": 30, "startsAtUtc": "...", "timezone": "..." },
  "needsForm": false,
  "needsFormReason": null,        // ai_unavailable | ai_unparseable | ai_truncated | invalid_time | unclear
  "awaitingConfirmation": true,
  "appointment": null             // populated on the turn that books
}
```

`timezone` is the browser's IANA zone; an invalid one is a `400`, never a silent
fallback to the server's zone.

---

## 🧠 Chat Engine — how one turn works

`chatService.message` is a strict four-step decision tree. Steps 2 and 3 never
call the model — the decisions that matter are not left to a probabilistic call.

```
                     ┌─────────────────────────────┐
   incoming message ─┤ 1. session real & active?   │── no ──▶ "already finished"
                     └──────────────┬──────────────┘
                                    │ yes
                     ┌──────────────▼──────────────┐
      confirming?    │ 2. whole-message YES?       │── yes ─▶ confirm()  → book or SLOT_TAKEN
     (draft has      └──────────────┬──────────────┘
      startsAtUtc)                   │ no
                     ┌──────────────▼──────────────┐
                     │ 3. whole-message DECLINE?   │── yes ─▶ clear draft, stay active,
                     └──────────────┬──────────────┘          reply "No problem. Let me
                                    │ no                      know when you're ready."
                     ┌──────────────▼──────────────┐
                     │ 4. extract (Groq)           │
                     └──────────────┬──────────────┘
       ┌────────────────────────────┼────────────────────────────┐
   AI failure              fields missing              all fields present
       │                        │                            │
       ▼                        ▼                            ▼
 needsForm=true        ask for the FIRST             resolve local→UTC
 prefill the form      missing field only             (DST-aware)
        │                        │                            │
        └────────────────────────┴──────────┬─────────────────┘
                                           ▼
                              "Shall I book …?"  → awaitingConfirmation
```

**The extractor's contract.** The system prompt demands a single JSON object
and nothing else, listing only the fields already collected, the recent
transcript, and the newest message explicitly — history is read *before* the
current message is persisted, so without that the model would helpfully extract
from a conversation that never contained what the user said. `null` means "not
stated yet" and therefore **never erases** an already-collected field; that one
rule is what keeps a two-turn booking from losing its first field.

**Confirming is transactional.** Saving the user's "yes", inserting the
appointment, saving the assistant's confirmation, and completing the session all
happen in a single transaction, so a crash can never leave an appointment
without a conversation record. A taken slot is caught and answered in chat,
leaving the draft intact minus the confirmed instant.

---

## 🗄️ Database Schema

| Migration | What it does |
| --- | --- |
| `001_users` | `businesses`, `users` (FK to business) |
| `002_appointments` | `appointments` (FK to user, cascade delete) |
| `003_chat` | `chat_sessions`, `chat_messages` |
| `004_indexes` | Case-insensitive unique email, list/session/message indexes |
| `005_updated_at_and_overlap` | `set_updated_at()` trigger on three tables; `btree_gist` + **exclusion constraint** on overlapping ranges per business |
| `006_tenant_consistent_fks` | Composite `UNIQUE (id, business_id)` on users; composite FK from appointments |
| `007_chat_sessions_tenant_fk` | Same composite FK for chat sessions |
| `008_chat_message_created_at` | `clock_timestamp()` default so two messages in one transaction don't share `created_at` |

**The double-booking constraint** is the important one:

```sql
EXCLUDE USING gist (
  business_id WITH =,
  tstzrange(starts_at, starts_at + duration_minutes * interval '1 minute') WITH &&
)
```

It rejects any *partial* overlap (not just identical starts), allows
back-to-back bookings, frees the slot again on cancellation, and is scoped per
business. Concurrent inserts resolve win-takes-all: one `201`, one `409`. No
application code checks availability — a `SELECT`-then-`INSERT` would race, and
only the constraint is atomic.

---

## 📋 System Requirements

| | Version | Notes |
| --- | --- | --- |
| **Node.js** | 20.11+ (22 LTS recommended) | `tsx` and `import.meta.dirname` set the floor |
| **npm** | 10+ | Ships with Node 20 |
| **PostgreSQL** | 14+ | Any hosted instance; [Neon](https://neon.tech) free tier works (PgBouncer pooling included) |
| **Groq API key** | — | Free tier; get one at [console.groq.com](https://console.groq.com) |
| **Docker** | *not required* | There is no container in this repo |

The backend and frontend pin **different** TypeScript and `@types/node` majors on
purpose — install and verify each side from its own directory. They are
independent npm projects, not workspaces.

---

## 🔧 Installation & Setup

### 🪟 Windows

1. Install **Node.js 20.11+** from <https://nodejs.org> (LTS installer).
2. Clone and enter the repo:

   ```powershell
   git clone https://github.com/AbdullahTahir-1042/Assignment_chatbot.git
   cd Assignment_chatbot
   ```

### 🐧 Linux / 🍎 macOS

```bash
git clone https://github.com/AbdullahTahir-1042/Assignment_chatbot.git
cd Assignment_chatbot
```

### Common backend instructions

```bash
cd backend
npm install
```

Create `backend/.env` (it is gitignored; nothing secret is ever committed):

```ini
# --- Database ---
DATABASE_URL=postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/db?sslmode=require
# Migrations and seed only: PgBouncer's transaction pool cannot run DDL.
DATABASE_URL_DIRECT=postgresql://user:pass@ep-xxx.region.aws.neon.tech/db?sslmode=require

# --- Auth ---
# Must be at least 32 characters.
JWT_SECRET=replace-me-with-a-long-random-string-32+chars

# --- AI ---
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxxxxx
AI_MODEL=openai/gpt-oss-120b

# --- App ---
# Must match the business id you seed (00000000-0000-0000-0000-000000000001).
DEFAULT_BUSINESS_ID=00000000-0000-0000-0000-000000000001
PORT=4000
CORS_ORIGIN=http://localhost:5173
```

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `DATABASE_URL` | ✅ | — | Pooled connection string |
| `DATABASE_URL_DIRECT` | migrations | — | Direct, non-pooled |
| `JWT_SECRET` | ✅ | — | Min 32 chars, validated at boot |
| `GROQ_API_KEY` | ✅ | — | AI provider is Groq |
| `DEFAULT_BUSINESS_ID` | ✅ | — | Postgres-style uuid (not RFC-9562-strict) |
| `AI_MODEL` | — | `openai/gpt-oss-120b` | `llama-3.3-70b-versatile` is retired on Groq's self-serve tier |
| `PORT` | — | `4000` | |
| `CORS_ORIGIN` | — | `http://localhost:5173` | Add your deployed frontend origin |
| `BCRYPT_COST` | — | `12` | Tests use `4` to keep the suite fast |
| `NODE_ENV` | — | `development` | |

Then initialize and run:

```bash
npm run migrate     # apply db/migrations/*.sql in order, in a transaction each
npm run seed        # demo business + demo@example.com / Password123!
npm run dev         # http://localhost:4000
```

Verify:

```bash
curl http://localhost:4000/api/health
# {"status":"ok"}
```

### 👑 Common frontend instructions

```bash
cd ../frontend
npm install
npm run dev         # http://localhost:5173
```

Vite proxies `/api` to `http://localhost:4000`, so no configuration is needed
for local development. The browser opens on `/login`; sign in with
`demo@example.com` / `Password123!`, or create a new account.

### 📋 All commands

| Backend | | Frontend | |
| --- | --- | --- | --- |
| `npm run dev` | tsx watch | `npm run dev` | Vite dev server |
| `npm start` | run the API | `npm run build` | typecheck + production build |
| `npm run build` | typecheck only | `npm run preview` | serve `dist/` |
| `npm run migrate` | apply migrations | `npm run lint` | oxlint |
| `npm run seed` | demo data | | |
| `npm test` | vitest (full suite) | | |
| `npm run test:watch` | vitest (watch) | | |

---

## 🚀 Deployment

### Backend

The API is a long-running Node process, so any host that runs a container or a
Node service works (Render, Railway, Fly.io, or your own VM).

- **Build command:** `npm install`
- **Start command:** `npm start`
- **Health check path:** `/api/health` (liveness) — use `/api/health/ready` as
  the readiness probe
- **Environment:** set the variables from the table above in the host's
  dashboard. Run `npm run migrate` **once** (a shell/one-off job) against
  `DATABASE_URL_DIRECT` before serving traffic.
- `trust proxy` is already enabled, so the rate limiter sees real client IPs
  behind the platform's proxy hop.

### Frontend

`frontend/.env` (gitignored; copy from `frontend/.env.example`):

```ini
# Base ORIGIN of the backend — no trailing /api.
# Leave empty to call /api on the same origin.
VITE_API_URL=https://your-backend.onrender.com
```

Then build:

```bash
cd frontend
npm run build      # -> dist/, a static bundle for any static host
```

Vite bakes `VITE_*` values in at build time, so **set the variable before
building**, and rebuild whenever the backend URL changes. `dist/` works on any
static host (Netlify, Vercel, Cloudflare Pages, S3).

If the two live on different hosts, also set the backend's `CORS_ORIGIN` to your
frontend's origin and rebuild the backend.

---

## 🧪 Testing

```bash
cd backend
npm test
```

The suite runs against a **real** PostgreSQL database (a separate one, named in
`backend/.env.test`), not a mock, and imports the Express app directly with
supertest — no port is bound.

| File | Coverage |
| --- | --- |
| `auth.signup.test.ts` | Signup/login, password policy, `password_hash` never returned, email normalization, timing equalization, both auth limiters |
| `auth.me.test.ts` | `GET /me`, plus 10 token attacks: tampered payload, `alg=none`, HS512, wrong secret, expired, missing/mistyped `businessId`, empty and non-bearer headers, deleted user |
| `auth.update.test.ts` | `PATCH /me`: auth, validation, email normalization, `EMAIL_TAKEN`, token stays valid, no hash leak |
| `auth.ratelimit.test.ts` | 15 successful logins never trip; the 21st consecutive failure 429s; lockout holds even for a correct password |
| `appointments.test.ts` | Create/list/cancel, server-set `source`, offset enforcement, **concurrent double-booking race**, overlap vs back-to-back, slot freed on cancel, tenant isolation |
| `chat.test.ts` | Happy path, one-missing-field asking, every AI failure → form, whole-message yes/no anchoring, client timezone, **prompt injection**, taken slot, decline-keeps-session, session authorization |
| `ai.extractor.test.ts` | Local→UTC resolution, per-timezone "tomorrow", DST spring gap and fall-back hour, past times, prompt-time formatting |
| `errorMapping.test.ts` | 404 envelope, malformed JSON, oversized body (distinct code), per-field zod issues, no 5xx leakage |
| `overlap.test.ts` | The exclusion constraint directly: partial/contained/wrapping overlaps, touching ranges allowed, per-business scoping, `updated_at` trigger |
| `validate.test.ts` | body/query/params isolation, coerced values, 400 leaves slots empty |

The AI dependency is a single injectable function, so every failure mode is a
canned return value in a test — the suite never touches the network or burns
free-tier quota.

---

## 📁 Project Structure

```
.
├── backend/
│   ├── db/
│   │   ├── migrations/            001…008, applied in order
│   │   └── seed.sql               re-runnable demo data
│   ├── src/
│   │   ├── config/                env (zod), db pool, migrate, seed
│   │   ├── middleware/            authenticate, validate, rateLimiter,
│   │   │                          errorHandler, notFound, requestLogger
│   │   ├── modules/
│   │   │   ├── auth/              routes, service, repository, schema
│   │   │   ├── appointments/      routes, service, repository, schema
│   │   │   └── chat/              routes, service, repository, schema,
│   │   │                          ai.client, ai.extractor
│   │   ├── shared/                AppError, pino logger
│   │   ├── app.ts                 middleware + route mounting (no listen)
│   │   └── server.ts              the socket, graceful shutdown
│   └── tests/
│
└── frontend/
    ├── src/
    │   ├── app/                   routes, guards
    │   ├── features/              auth · chat · appointments
    │   │                           (features never import each other)
    │   ├── layout/                AppShell, Header, UserMenu, AuthLayout
    │   ├── pages/                 Login, Signup, Dashboard, Profile, NotFound
    │   ├── ui/                    Button, Card, Input, FormField, Badge,
    │   │                          PasswordInput, PageContainer, Spinner, …
    │   ├── lib/                   http, config, datetime, timezone, password,
    │   │                          documentTitle, queryKeys, cn
    │   └── main.tsx               providers + router
    └── vite.config.ts             React plugin, /api dev proxy
```

---

## 🔒 Security

- Passwords are bcrypt cost 12 and **never** leave the database.
- JWTs are HS256 with the algorithm pinned in verification; `sub` and
  `businessId` are the only claims.
- Login failures are timing-equalized so accounts cannot be enumerated.
- Tenant isolation is enforced by composite foreign keys in the database, not by
  application discipline.
- `helmet` sets the usual headers; JSON bodies are capped at 100kb.
- 5xx responses never contain internal messages — the detail goes to the log.
- Secrets live only in untracked `.env` files; `.env` and `.env.*` are
  gitignored.
- `source` on an appointment is server-assigned, and `/api/health` never
  touches the database.

---

## 💡 Design Decisions

**The model returns fields, never prose.** Every sentence a user reads is
composed by the server from those fields. This is why the confirmation is
guaranteed to describe exactly what gets written, and why a prompt injection has
no vocabulary with which to act.

**Yes/no are anchored to the whole message.** `^(yes|yeah|…)$` means "no, make
it 5pm" is a correction, not a decline, and "ok but shift to Friday" cannot book
the wrong time. A `no` outside the confirming state is just input.

**Declining doesn't kill the conversation.** A user who says "no thanks" usually
wants to rebook, not to be logged out of a thread. The draft clears, the session
stays active, and the explicit cancel endpoint remains the hard stop.

**Availability is the database's job.** A `SELECT`-then-`INSERT` race is not a
narrow window, it's a correctness bug. Only the exclusion constraint is atomic,
so no availability check is written in application code at all.

**An error the user can act on beats a correct status code.** A taken slot is
answered in the chat; a failed extraction opens a form. The status code stays
`200` because from the user's side, the flow is still alive.

**An unresolvable time clears both fields.** Keeping them would strand the
session re-asking the same impossible question forever.

**Rate limits are keyed to the cost they protect.** Signup burns CPU, so it's
tight. Login counts failures only. Chat is per user, not per IP, so a shared
office NAT can't exhaust your AI budget.

---

## 🤝 Contribution Guidelines

Contributions are welcome — new calendar views, richer extractors, better
fallbacks.

1. **Fork** the repository.
2. **Branch:** `git checkout -b <feature-name>`.
3. **Verify both sides before you commit** — this is not optional:

   ```bash
   cd backend  && npm run build && npm test
   cd ../frontend && npm run lint && npm run build
   ```

4. **Commit** with a conventional message:

   ```bash
   git commit -m "feat(chat): remember the last confirmed slot"
   ```

5. **Push** and open a **Pull Request** describing the behaviour change.

**House rules**

- `features/` never import each other; wire cross-feature behaviour in `pages/`.
- A change to a booking rule needs a test. The AI dependency is one injectable
  function — mock it, don't call it.
- Never commit a `.env`. `JWT_SECRET` and `GROQ_API_KEY` stay local.
- Keep the two npm projects independent; don't hoist or share dependencies
  across the boundary.

---

## 📧 Contact & Team

For questions, bug reports, or collaboration:

| | |
| --- | --- |
| **Project** | Slotly — AI-Driven Appointment Booking Platform |
| **Repository** | `github.com/AbdullahTahir-1042/Assignment_chatbot` |

---

<div align="center">
  <sub>Built with Express 5, React 19, PostgreSQL and Groq.</sub>
</div>
