# Project Worklog — Midnight Garage · RAG

App: local-first RAG chatbot ("eats" PDFs/images with optional OCR, answers via user-chosen LLM).
Stack: Next.js 16 App Router + TypeScript + Prisma/SQLite + LangChain.js + Tailwind 4 + shadcn/ui (New York).
Single user-visible route: `/` (everything is client-side state). NO other pages.

---

## Task 1 — Foundation (DONE by coordinator)

- Prisma schema pushed: User (username+password scrypt hash), Settings, Document, Conversation, Message. SQLite at db/custom.db.
- Deps installed: langchain, @langchain/core, @langchain/openai, @langchain/ollama, @langchain/textsplitters, ollama, jose, pdfjs-dist, @napi-rs/canvas, ppu-paddle-ocr, onnxruntime-node.
- next.config.ts: serverExternalPackages for all native/heavy modules.
- globals.css: full dark palette mapped to shadcn tokens (bg #08090B, surface #15171B, border #292D33, text #F2F4F7/#A5ADB8, accent red #C62828/#E03131) + `.glass` / `.glass-strong` / `.text-dim` / `.bg-overlay` utilities + custom scrollbar class `.nice-scroll` + `.chat-md` markdown styles.
- layout.tsx: `<html className="dark">`, title "Midnight Garage · RAG".
- Backgrounds copied to `public/backgrounds/`: `bmw-moon.webp`, `bmw-fog.webp`.
- Dev server already running on port 3000 (do NOT start another, do NOT run `bun run build`).

## API CONTRACT (backend implementer = coordinator; frontend must match EXACTLY)

All JSON unless noted. Auth via httpOnly cookie `rag_session` (JWT). 401 = not logged in (frontend should show auth screen).

### Auth
- `POST /api/auth/register` `{username, password}` → `200 {user:{id,username}}` | `400/409 {error}`
- `POST /api/auth/login` `{username, password}` → `200 {user:{id,username}}` | `401 {error}`
- `POST /api/auth/logout` → `200 {ok:true}`
- `GET  /api/auth/me` → `200 {user:{id,username}}` | `401 {error}`

### Settings
- `GET /api/settings` → `{settings}` (full object, apiKey visible — local app)
- `PUT /api/settings` body: any subset of:
  `{llmProvider:'api'|'ollama', apiBaseUrl, apiKey, apiModel, ollamaBaseUrl, ollamaModel, embeddingProvider:'api'|'ollama', embeddingApiBaseUrl, embeddingApiKey, embeddingModel, ocrEnabled:boolean, ocrEngine:'glm'|'paddle', glmModel}`
  → `{settings}`. Settings type defaults: apiBaseUrl `https://integrate.api.nvidia.com/v1`, apiModel `meta/llama-3.3-70b-instruct`, ollamaBaseUrl `http://localhost:11434`, ollamaModel `llama3.1`, embeddingModel `nomic-embed-text`, glmModel `glm-ocr`.

### Documents
- `GET /api/documents` → `{documents:[{id,name,size,pages,chunkCount,status:'processing'|'ready'|'error',error,createdAt}]}`
- `POST /api/documents` multipart form, field `files` (repeatable) — pdf/png/jpg/jpeg/webp/bmp/tiff → `{documents:[...]}` created with status `processing`. Processing is async; poll GET while any is `processing`.
- `DELETE /api/documents/{id}` → `{ok:true}` (removes chunks from vector index too)

### Conversations
- `GET /api/conversations` → `{conversations:[{id,title,createdAt,updatedAt}]}`
- `POST /api/conversations` `{title?}` → `{conversation}`
- `GET /api/conversations/{id}` → `{conversation, messages:[{id,role:'user'|'assistant',content,sources,createdAt}]}` (sources = JSON string or null)
- `DELETE /api/conversations/{id}` → `{ok:true}`

### Chat (SSE streaming)
`POST /api/chat` body `{conversationId?: string|null, message: string}` → `text/event-stream`, events as `data: {json}\n\n`:
- `{"type":"meta","conversationId":"...","title":"..."}`
- `{"type":"token","content":"..."}`
- `{"type":"done","sources":[{"docId","docName","page","score"}],"messageId":"..."}`
- `{"type":"error","message":"..."}` then stream closes.
Client must parse the fetch ReadableStream manually (no EventSource for POST).

### Misc
- `GET /api/backgrounds` → `{images:['/backgrounds/bmw-moon.webp','/backgrounds/bmw-fog.webp'], current:'<random one>'}` (client: keep choice in sessionStorage → "random every session")
- `GET /api/capabilities` → `{ollama: boolean (reachable), paddle: boolean (onnx module loadable), ollamaUrl: string}`

## Design spec for frontend (BINDING)

- Full-viewport photo background layer (fixed, cover, from /api/backgrounds, random per session w/ sessionStorage). Above it a black translucent overlay `rgba(0,0,0,0.45)` (use `.bg-overlay`). Content panels use `.glass` / `.glass-strong`.
- Palette: use shadcn tokens (bg-background, text-foreground, bg-primary etc.) — already themed. Accent = red. NO blue/indigo anywhere.
- Layout: desktop = left sidebar (conversations + documents + settings trigger) + main chat column; mobile = sidebar collapses into a Sheet/drawer, hamburger in header. Footer minimal, sticky via flex `min-h-screen flex flex-col` + `mt-auto`.
- Long lists (documents, conversations, messages) need `max-h` + `overflow-y-auto .nice-scroll`.
- Available: all shadcn/ui components in src/components/ui, lucide-react icons, framer-motion (subtle anims), react-markdown for chat rendering, sonner for toasts (Toaster in layout), next-themes NOT needed (forced dark).
- File layout: `src/app/page.tsx` (server component that renders `<AppRoot/>` from `src/components/app-root.tsx` client component) + components in `src/components/rag/*` + optional `src/lib/api-client.ts` typed fetch helpers.
- Do NOT touch src/app/api/** (backend owns it), prisma, next.config.

---

Task ID: 2-a
Agent: full-stack-developer
Task: Frontend UI for Midnight Garage RAG chatbot

Work Log:
- Read worklog.md API contract + design spec; inspected existing globals.css palette, layout.tsx, all shadcn/ui primitives and eslint config.
- Built `src/lib/api-client.ts`: fully typed fetch helpers (register/login/logout/me, getSettings/updateSettings, listDocuments/uploadDocuments/deleteDocument, listConversations/createConversation/getConversation/deleteConversation, getBackgrounds, getCapabilities) + typed `ApiError` with `.status`; `streamChat` POSTs /api/chat, reads the ReadableStream with TextDecoder, normalizes CRLF, buffers on `\n\n`, parses `data: {json}` lines and dispatches meta|token|done|error; HTTP failures throw ApiError (401 → auth screen), in-stream errors go to onError; aborts return silently. Also exports parseSources (JSON string → Source[]), ACCEPT_ATTR, isAcceptedFile.
- Built components in `src/components/rag/`: background-layer (fixed -z-10 photo + .bg-overlay), password-input (Eye/EyeOff reveal), auth-screen (glass card, red accent bar, Login/Register tabs, min-4-char password, inline + sonner errors), settings-dialog (glass-strong Dialog; Model|Embeddings|OCR tabs; RadioGroup provider cards; API key reveal with "stored only in your local SQLite" hint; embedding overrides with "empty = use the Model tab credentials"; OCR switch + glm/paddle engine select + glmModel; /api/capabilities fetched on open → Ollama/PaddleOCR Badge chips with Check/X icons; PUT on save + "Settings saved" toast), sidebar (Chats: new-chat button, active red-left-border items, hover Trash2 delete with confirm; Knowledge base: dashed dropzone with drag-over highlight + hidden multi-file input, doc rows with size/pages/chunks + status badges — processing=secondary+spinner, ready=emerald Check, error=destructive with title; polls refreshDocuments every 2.5s only while any doc is processing; independent nice-scroll max-h sections), chat-panel (auto-scroll only when near bottom, skeleton loading, glass empty-state hero "Feed the beast." with red Car ring + 3 hints + LLM/OCR badges from settings, user bubble bg-primary/90 right-aligned, assistant glass card with red Bot avatar + react-markdown (.chat-md wrapper) + blinking cursor while streaming + source chips `docName p.{page}` on done, destructive error card with retry hint, glass input bar with Enter=send/Shift+Enter=newline Textarea and Send/Square(stop) buttons), app-root (auth check via GET me on mount → AuthScreen gate; background randomized once per session via sessionStorage['mg-bg'] with API current + local /public fallback, Shuffle button picks a different image and persists; parallel initial load of settings/documents/conversations with Skeletons; optimistic user+assistant messages updated token-by-token, sources attached on done, conversations refreshed after meta/done; conversation switching aborts an in-flight stream; header with hamburger→left Sheet on mobile, MIDNIGHT GARAGE title, Shuffle/Settings/username-chip/Logout; sticky glass-strong header, flex min-h-svh shell, mt-auto glass footer "…keys never leave this machine"; sonner Toaster mounted client-side).
- Replaced src/app/page.tsx with a server component that renders `<AppRoot />` only.
- Fixed issues: missing `getSettings` import in app-root (caught by tsc), removed unused eslint-disable directive; verified `bun run lint` (0 errors/warnings), `bunx tsc --noEmit` (no errors in new files), GET / 200 and clean compile in dev.log. /api/* endpoints still 404 (backend agent in progress) — frontend degrades gracefully (auth screen + fallback background).

Stage Summary:
- Files created: src/lib/api-client.ts, src/components/rag/{background-layer,password-input,auth-screen,settings-dialog,sidebar,chat-panel,app-root}.tsx; src/app/page.tsx replaced (renders AppRoot only). Nothing under src/app/api/**, prisma or next.config was touched; layout.tsx untouched (the radix Toaster there is inert — sonner Toaster is mounted inside AppRoot, so `toast` from 'sonner' works everywhere).
- Contract assumptions for the backend/integrator: register/login/me return `{user:{id,username}}` and set the httpOnly cookie; PUT /api/settings accepts the full settings subset and returns `{settings}` with null-able embeddingApiBaseUrl/embeddingApiKey (UI sends null when the override fields are empty); POST /api/documents field name is `files` (repeatable); chat SSE events are exactly `meta|token|done|error` as `data: {json}\n\n`, where meta carries `{conversationId,title}` (UI creates the conversation lazily — "New chat" just clears state, first message with conversationId:null expects the backend to create it and emit meta); done carries `{sources:[{docId,docName,page,score}],messageId}`; GET /api/conversations/{id} returns messages with sources as a JSON string or null; 401 (JSON `{error}`) anywhere flips the UI back to the auth screen. Settings PUT sends all 13 fields every save — backend must accept the full subset. UI never sends absolute URLs and tolerates /api/backgrounds or /api/capabilities being down (fallbacks + disabled-look badges).
- Lint status: `bun run lint` clean (0 errors, 0 warnings); tsc clean for all files created in this task.
Task ID: 2-b
Agent: coordinator (Z.ai)
Task: Backend — auth, settings, documents/ingest/OCR, conversations, SSE chat, misc routes

Work Log:
- lib/auth.ts: scrypt password hashing (node:crypto, timing-safe), jose JWT (HS256) in httpOnly cookie `rag_session` (30d), secret auto-persisted at db/auth-secret.key, getCurrentUser/unauthorized/badRequest helpers.
- lib/settings.ts: get-or-create, whitelisted PUT updates, null→"" clearing for embedding overrides, URL trailing-slash normalization.
- lib/vector-store.ts: per-user JSON vector index (db/vectors/{userId}.json). Learned the hard way that Next route bundles get isolated module instances → rewrote STATELESS (read-on-every-op, atomic tmp+rename writes). cosine similarity, top-k search, per-doc delete, embedMeta tracking for stale-index detection.
- lib/local-embeddings.ts: zero-dep offline hashed bag-of-words embedder (512 dims, FNV hashes ×2 + prefix stem, sublinear TF, L2 norm) powering the "built-in" RAG mode.
- lib/llm.ts: provider factory — ChatOpenAI (any OpenAI-compatible baseURL), ChatOllama, and BuiltInChat adapter (z-ai-web-dev-sdk backend-only, pseudo-streamed replay); embeddings factory for api/ollama/built-in; friendlyLlmError mapper.
- lib/ocr.ts: GLM-OCR via `ollama` npm (host-configurable, 180s abort), PaddleOCR via ppu-paddle-ocr (dynamic import, lazy singleton, init promise); ollamaReachable/paddleAvailable capability probes.
- lib/ingest.ts: per-user serialized ingest queue; pdfjs-dist legacy + @napi-rs/canvas page rendering; per-page text extraction with OCR fallback for scanned pages (<24 chars) when ocrEnabled; image uploads OCR-only; RecursiveCharacterTextSplitter 1200/200; errors land in Document.error.
- Routes: /api/auth/[action] (register/login/logout/me), /api/settings GET/PUT, /api/documents GET/POST (40MB cap, multipart), /api/documents/[id] DELETE, /api/conversations GET/POST, /api/conversations/[id] GET/DELETE, /api/chat POST (SSE: meta/token/done/error; RAG k=6 minScore 0.22; 12-turn history; partial-answer failure handling), /api/backgrounds (random per call), /api/capabilities (ollama/paddle/builtin).
- Schema defaults switched to built-in providers; db pushed.
- Fixes during verification: pdfjs standardFontDataUrl requires trailing slash; RAG_MIN_SCORE 0.3→0.22 for hashed embedder.

Stage Summary:
- Full RAG loop verified via curl: register → upload PDF → ready (1 page/1 chunk) → chat returns grounded answer with [1] + sources {docName, page, score 0.425}; conversation persistence verified.
- Built-in Z.ai chat works in-sandbox; API/Ollama paths ready for the user's own endpoints/keys.

---
Task ID: 3 & 4
Agent: coordinator (Z.ai)
Task: Integration review, browser E2E verification, fixes

Work Log:
- Reviewed agent 2-a output against contract (api-client matches; settings null-clearing patched backend-side; added 'built-in' option to types/settings dialog).
- Browser E2E (agent-browser): auth screen renders over BMW background with rgba(0,0,0,0.45) overlay; login → sidebar (chats+KB), hero, header, footer OK; RAG question answered with [1] citation + "test-manual.pdf p.1" source chip; settings dialog 3 tabs OK, capability badges accurate (PaddleOCR ✓ / Ollama ✗), OCR toggle→save→persist loop verified; background shuffle swaps moon→fog; mobile 390px layout + Sheet drawer OK; image upload without reachable OCR lands in error state with clear message (by design).
- FIXED (agent 2-a bug): on page reload with valid session, loadInitialData never ran (only ran on fresh login) → sidebar stayed empty. Moved auth-check effect below loadInitialData definition (also avoided a TDZ issue) and call it on me() success. Re-verified: refresh hydrates chats/documents; past conversation loads with markdown + sources.
- Final `bun run lint`: 0 errors, 0 warnings. No page errors in browser console.

Stage Summary:
- All golden paths browser-verified. App ready. Test account: testrider / garage123 (demo data).

---
Task ID: fix-1
Agent: main (Z.ai)
Task: Restore missing src/lib/local-embeddings.ts (vanished from sandbox; user's local copy also lacked it)

Work Log:
- Detected src/lib/local-embeddings.ts missing again despite prior fix (no git repo; external cleanup likely)
- Recreated module: hashEmbed (feature hashing, FNV-1a, 256-dim, unigrams+bigrams, L2-normalized) + BUILTIN_EMBED_META
- Verified /api/documents -> 401, /api/auth/me -> 401 (compile OK), lint clean

Stage Summary:
- File: src/lib/local-embeddings.ts (EMBED_DIM=256, model "hashed-ngrams-256-v1")
- User runs locally with npm: provided full file content + env notes (DATABASE_URL relative path gotcha)

---
Task ID: harden-1
Agent: main (Z.ai)
Task: Commercial-readiness hardening — encryption at rest, auth hardening, rate limiting, ToS/Privacy, GDPR erasure, security headers

Work Log:
- crypto.ts: AES-256-GCM (enc:v1.<iv>.<tag>.<ct>), APP_SECRET env or auto-generated db/app-secret.key; legacy plaintext passthrough for migration
- rate-limit.ts: in-memory fixed-window limiter (register 5/10min, login 10/5min, chat 30/min, docs 20/10min, del-acct 5/10min)
- schema: User += sessionEpoch, tosAcceptedAt, tosVersion (db:push OK)
- auth: JWT embeds session epoch (revocable sessions), register min 8 chars + ToS gate, generic login errors, cookie secure in prod
- /api/account DELETE: password-confirmed full erasure (DB cascade + vector file)
- settings: apiKey/embeddingApiKey encrypted at rest; API responses masked (hasApiKey + ••••last4); empty=keep semantics + clear flags
- chat/conversations: message content, sources JSON, conversation titles encrypted at rest
- vector-store: whole-file encryption of per-user index JSON
- legal.ts (ToS v1.0 + Privacy, [PLACEHOLDERS] for operator), legal-viewer.tsx in-app dialog
- auth-screen: ToS checkbox gate + legal links; footer Terms/Privacy buttons
- settings-dialog: 4th Account tab — masked keys, Remove key buttons, danger zone w/ AlertDialog erase flow
- next.config: X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, CSP

Stage Summary:
- Browser E2E verified: register w/ ToS gate, legal viewer tabs, masked key save/keep, chat stream + encrypted round-trip, wrong-password 403, account erase 200 -> auth screen, 429 rate limit live
- DB inspection: message/title/apiKey rows = enc:v1.…; GET responses contain no raw keys
- NOTE: register rate limit 5/10min may 429 during heavy testing — restart dev server to reset buckets

---

## Task ID: deploy-1 — Render/Docker deployment prep (user zip sync + prod hardening)

Date: 2025-10-29

**Synced** user's RAG.zip (authoritative "everything fixed" state: security layer, ToS, standalone output, langchain deps) into the project. Installed 4 missing packages (katex, remark-gfm, remark-math, rehype-katex).

**Deployment fixes:**
- NEW `src/lib/paths.ts` — `DATA_DIR` env override for all mutable data (secret keys, db/vectors). Wired into crypto.ts, auth.ts, vector-store.ts, api/account. On Render: `DATA_DIR=/var/data` keeps keys/indexes on the persistent disk; default stays `<cwd>/db` for local dev.
- REWRITTEN `Dockerfile` — was node:20-alpine (musl breaks onnxruntime-node) + bun-only start + baked-in relative DATABASE_URL + no .dockerignore (would have shipped .env, db secrets, .git to Docker Hub!). Now: multi-stage node:20-bookworm-slim, libgomp1+ca-certificates, standalone output, PORT/HOSTNAME envs, boot step `mkdir -p $DATA_DIR && prisma db push && exec node .next/standalone/server.js`.
- NEW `.dockerignore` (secrets/user data excluded), `.env.example`, `render.yaml` (image runtime, persistent disk /var/data, APP_SECRET generateValue, health check), `DEPLOY.md` (full build/push/Render walkthrough).
- NEW `GET /api/health` — unauthenticated liveness probe for Render.
- package.json: `start` now `node .next/standalone/server.js` (was bun-only; broke the old Dockerfile CMD); bun variant kept as `start:bun`.
- .gitignore: added /db/, /prisma/db/, /data/, *.key (secret keys + SQLite were committable before).

**Verified:** lint clean; / 200, /api/health 200, auth-guarded routes 401 unauth; browser E2E — register with ToS checkbox ✓, chat round-trip (built-in LLM, 200 in 4s, markdown+KaTeX render) ✓, Terms/Privacy dialogs ✓, mobile viewport ✓, footer sticky ✓. No docker daemon in sandbox → Dockerfile validated statically (glibc/libgomp/standalone/prisma boot flow).

**User next steps:** `docker build --platform linux/amd64 -t applepieee/rag_demo:latest .` → `docker login -u applepieee` → `docker push …` → Render "Existing image" + env vars (DATABASE_URL=file:/var/data/custom.db, DATA_DIR=/var/data, APP_SECRET) + 1GB disk at /var/data + health path /api/health. See DEPLOY.md.
