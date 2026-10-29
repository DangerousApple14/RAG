# Deploying RAG to Render (Docker image)

Two-part flow: build & push the image locally → wire it up on Render.

---

## Part 1 — Build & push from your project dir (CMD)

```bat
:: 1. BUILD — the --platform flag is NOT optional on Apple Silicon:
::    Render runs amd64; without it an M-series Mac produces an arm64 image that won't boot there.
docker build --platform linux/amd64 -t applepieee/rag_demo:latest .

:: 2. smoke-test it locally first (Ctrl+C to stop; data lives inside the container)
docker run --rm -p 3000:3000 applepieee/rag_demo:latest

:: 3. LOGIN (password, or a Docker Hub access token — Hub → Account Settings → Security)
docker login -u applepieee

:: 4. PUSH
docker push applepieee/rag_demo:latest
```

> Your original command list was missing step 1 — `docker push` only pushes a
> previously built/tagged image, it doesn't build anything.

**Docker Hub repo:** create `applepieee/rag_demo` on hub.docker.com before the
first push (or the push auto-creates it as **public**). Free accounts include 1
private repo — make it private unless you want the source visible. If the repo
is private, Render will ask for registry credentials (Docker Hub username +
access token) when you create the service.

---

## Part 2 — Create the service on Render

1. https://dashboard.render.com → **New +** → **Web Service**
2. **Existing image** → Image URL: `docker.io/applepieee/rag_demo:latest`
   (private repo? enter your Docker Hub credentials when prompted)
3. Region: **Frankfurt** (EU — closest to you) · Instance: see cost notes below
4. **Environment variables** (the important part):

   | Key | Value | Why |
   |---|---|---|
   | `DATABASE_URL` | `file:/var/data/custom.db` | SQLite lives on the persistent disk, not the ephemeral container FS |
   | `DATA_DIR` | `/var/data` | secret keys + vector indexes also live on the disk |
   | `APP_SECRET` | 32+ random chars (e.g. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) | AES-256-GCM key for API keys / chats / attachments at rest — survives redeploys |
   | `ALLOW_INSECURE_COOKIES` | *(leave unset)* | Render is HTTPS, so cookies get the Secure flag automatically |

5. **Advanced → Add a Persistent Disk**: mount path `/var/data`, size 1 GB.
   **Without this, every deploy/restart wipes all accounts, chats and documents.**
6. **Health Check Path**: `/api/health`
7. Create Web Service → watch the deploy log; you should see
   `prisma db push` run, then the server listening on Render's `PORT`.

### Updating later

```bat
docker build --platform linux/amd64 -t applepieee/rag_demo:latest .
docker push applepieee/rag_demo:latest
```
then Render dashboard → your service → **Manual Deploy → Deploy latest image**.
(Or set the Blueprint `autoDeploy: true` / add a Docker Hub webhook for auto-redeploys.)

### Even less clicking (optional)

Commit `render.yaml` + the repo to GitHub → Render → **New + → Blueprint** → it
creates the whole service (env vars, disk, health check) from the file. You still
build/push images yourself; `autoDeploy: false` means you redeploy manually.

---

## Costs & what breaks on the Free plan

| Plan | Disk? | Reality |
|---|---|---|
| Free | ❌ not allowed | Service sleeps after ~15 min idle (cold starts 30–60 s), storage is ephemeral → **all data (accounts, chats, docs, uploads) is wiped on every restart/redeploy**. OK for a screenshot demo, useless as an actual product. |
| Starter (~$7/mo) | ✅ 1 GB included-ish (disks billed separately, ~$0.25/GB/mo) | Data persists, no sleeping. This is the minimum "commercially sane" setup. |

## Feature notes on Render

- **API-mode LLMs (unorouter / build.nvidia.com / …)**: ✅ works — users paste their own base URL + key in Settings (stored encrypted with `APP_SECRET`).
- **PaddleOCR (local ONNX)**: ✅ works in the container (linux amd64 + `libgomp1` installed). OCR models are downloaded once per container boot when first used.
- **Ollama (GLM-OCR or local LLMs)**: ❌ there is no Ollama on Render. The UI's Ollama options are for local use. (You could point `ollamaBaseUrl` at a hosted Ollama/compat endpoint, but that's out of scope.)
- **`z-ai` fallback provider**: sandbox-only; it simply won't be usable on Render unless that SDK has public credentials — API mode covers everything.
- **SQLite at "commercial" scale**: fine for a demo/small user base (single writer). If it ever needs to scale, swap to Postgres (Neon/Supabase) — schema change is small, but that's a separate project.

## Secrets checklist (don't leak)

- `.env`, `db/`, `prisma/db/`, `*.key` are excluded from the image via `.dockerignore` and from git via `.gitignore` ✅
- The `db/app-secret.key` + `db/auth-secret.key` from your machine never leave it — Render generates fresh ones (or uses `APP_SECRET`).
- If your Docker Hub repo ends up public, remember the image contains your compiled source code (that's normal, but know it).
