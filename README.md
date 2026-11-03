# Midnight Garage

A self-hostable RAG (Retrieval-Augmented Generation) chatbot with document search, OCR and source references.
Upload your documents, ask questions, and get answers grounded in your files — with citations pointing back to the exact document and page.

> Made with love, I think, by ApplePie/DangerousApple/SR

The Docker image targets **Node.js 22**. `pdfjs-dist` 6 requires Node 22.13 or
newer, and the image includes its PDF worker and font assets for standalone
deployment.

---

## Features

- **Chat with your documents** — PDFs and images (up to 40 MB each) are parsed or OCR-processed, chunked, embedded and indexed per user; the chat answers from retrieved chunks and cites `document · page` for every source.
- **Three LLM backends** (switchable in Settings):
  - **API mode** — any OpenAI-compatible endpoint (custom Base URL + API key + model).
  - **Ollama** — fully local models (`ollama serve`, no data leaves your machine).
  - **Built-in** — zero-config adapter (primarily useful in the original sandbox environment).
- **Three embedding backends**:
  - **Built-in** — dependency-free hashed n-gram embeddings (256-dim, deterministic, zero configuration).
  - **API** — OpenAI-compatible embeddings (separate Base URL/key/model supported).
  - **Ollama** — local embedding models.
- **OCR toggle** for scanned PDFs:
  - **GLM-OCR** — vision model via Ollama.
  - **PaddleOCR** — local ONNX inference (`onnxruntime-node`), no external calls.
- **Accounts** — username/password registration & login, scrypt password hashing, JWT session cookies (30 days, revocable via session epoch).
- **Encryption at rest** — chats, attachments, vector indexes and API keys are encrypted with AES-256-GCM before touching disk.
- **Rate limiting** on auth endpoints; API keys are never returned to the client (masked previews only).

## Tech Stack

| Layer      | Choice                                                            |
| ---------- | ----------------------------------------------------------------- |
| Framework  | Next.js 16 (App Router, standalone output) + TypeScript           |
| UI         | Tailwind CSS 4 + shadcn/ui + Lucide icons, dark theme             |
| Database   | SQLite via Prisma ORM                                             |
| RAG        | LangChain.js (chat models, embeddings, text splitters)            |
| Vectors    | Per-user encrypted JSON index with cosine search (no external DB) |
| OCR        | PaddleOCR (ONNX, local) or GLM vision model (Ollama)              |
| Auth       | Custom: scrypt + JWT (jose) + HttpOnly cookies                    |

## Quick Start (local, npm)

```bash
npm install

# create .env in the project root (use Node.js 22.13+):
#   DATABASE_URL="file:./db/custom.db"
npm run db:push

npm run dev
# → http://localhost:3000
```

Production build locally:

```bash
npm run build
npm start        # serves the standalone build on :3000
```

## Environment Variables

| Variable       | Required | Default (Docker)            | Purpose                                                                                                                            |
| -------------- | -------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL` | yes      | `file:/app/data/custom.db`  | SQLite file location. On Render: `file:/var/data/custom.db` (persistent disk).                                                     |
| `DATA_DIR`     | no       | `/app/data`                 | Mutable data dir: auto-generated secret keys + `vectors/` indexes. Local default: `./db`. On Render: `/var/data`.                   |
| `APP_SECRET`   | rec.     | auto-generated key file     | Master key for AES-256-GCM at-rest encryption. Set it in production, otherwise a key file is generated inside `DATA_DIR`.           |
| `PORT`         | no       | `3000`                      | HTTP port.                                                                                                                          |

> If `APP_SECRET` is not set, an `app-secret.key` file is auto-created in `DATA_DIR` on first boot. Losing both the variable and the key file makes stored data undecryptable — keep at least one stable.

## Docker

The multi-stage `Dockerfile` uses Node.js 22 on Debian bookworm-slim (required
for the PDF.js runtime and glibc-based OCR dependencies). It generates Prisma
clients for the native and Debian OpenSSL 3 targets, copies the PDF.js worker
and font assets into the standalone app, and runs `prisma db push` at boot.

```bash
docker build --platform linux/amd64 -t rag_demo:latest .

docker run --rm -p 3000:3000 \
  -e APP_SECRET="change-me-to-something-long-and-random" \
  rag_demo:latest
```

Data lives inside the container unless you mount a volume for `DATA_DIR` / `DATABASE_URL`:

```bash
docker run --rm -p 3000:3000 \
  -v rag-data:/app/data \
  -e DATABASE_URL="file:/app/data/custom.db" \
  -e APP_SECRET="change-me" \
  rag_demo:latest
```

## Deploy on Render

This project’s Render setup uses a Docker image published to a registry:

```bat
docker build --platform linux/amd64 -t applepieee/rag_demo:latest .
docker push applepieee/rag_demo:latest
```

In Render, create a **Web Service → Existing image** using
`docker.io/applepieee/rag_demo:latest`, or use the included `render.yaml`
Blueprint. After pushing an updated image, choose **Manual Deploy → Deploy
latest image** unless automatic deploys have been configured.

Configure the service with:

- `DATABASE_URL=file:/var/data/custom.db`
- `DATA_DIR=/var/data`
- A stable, private `APP_SECRET` (Render can generate one through the Blueprint)
- A persistent disk mounted at `/var/data`
- Health check path `/api/health`

The persistent disk is required to preserve the SQLite database, encryption
keys, and vector indexes across restarts. Render’s free plan does not support
persistent disks. For the complete instructions, including Docker Hub setup,
see [`DEPLOY.md`](./DEPLOY.md).

### Notes for hosted deployments

- **Ollama features need a reachable Ollama server** — there is no Ollama
  service on Render by default; use an API provider or the built-in embedding.
- The SQLite file and vector indexes live on the mounted disk. Back it up = copy `/var/data`.

## Security Model (short version)

- Passwords: scrypt with per-user salt — never stored in plaintext.
- Sessions: signed JWT in an HttpOnly cookie, invalidated by a per-user `sessionEpoch` on demand.
- At rest: chats, attachments, vector indexes and API keys are AES-256-GCM encrypted with a key based on `APP_SECRET`.
- API keys are write-only from the client's perspective: responses contain masked previews (`••••1234`) only.
- Auth endpoints are rate-limited (register: 5 / 10 min, login: 10 / 5 min per IP).
- Secrets never end up in the Git repo or the Docker image (`.gitignore` + `.dockerignore`).

## Project Structure (essentials)

```
prisma/schema.prisma          # User + Settings models (SQLite)
src/lib/db.ts                 # Prisma client
src/lib/auth.ts               # scrypt hashing, JWT sessions
src/lib/crypto.ts             # AES-256-GCM at-rest encryption
src/lib/paths.ts              # DATA_DIR / VECTORS_DIR resolution
src/lib/local-embeddings.ts   # built-in hashed n-gram embeddings
src/lib/vector-store.ts       # per-user encrypted vector index + search
src/lib/llm.ts                # LLM/embedding provider factories
src/lib/ocr.ts                # GLM / PaddleOCR engines
src/app/api/…                 # auth, chat, documents, settings, health
src/components/rag/…          # UI (auth screen, chat, docs, settings)
Dockerfile                    # multi-stage production image
render.yaml                   # Render blueprint (optional)
```
