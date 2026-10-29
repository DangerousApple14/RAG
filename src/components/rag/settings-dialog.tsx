'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, Cpu, Globe, Loader2, ShieldAlert, Sparkles, UserCircle2, X } from 'lucide-react'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PasswordInput } from '@/components/rag/password-input'
import {
  ApiError,
  deleteAccount,
  getCapabilities,
  getSettings,
  updateSettings,
  type Capabilities,
  type EmbeddingProvider,
  type LlmProvider,
  type OcrEngine,
  type Settings,
} from '@/lib/api-client'
import { cn } from '@/lib/utils'

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Last known settings (used for instant prefill while re-fetching). */
  settings: Settings | null
  onSaved: (settings: Settings) => void
  username: string
  /** Fired after the account has been erased — flips the UI to the auth screen. */
  onAccountDeleted: () => void
}

interface SettingsForm {
  llmProvider: LlmProvider
  apiBaseUrl: string
  apiModel: string
  ollamaBaseUrl: string
  ollamaModel: string
  embeddingProvider: EmbeddingProvider
  embeddingApiBaseUrl: string
  embeddingModel: string
  ocrEnabled: boolean
  ocrEngine: OcrEngine
  glmModel: string
  // new-key entry fields — empty means "keep the stored key"
  newApiKey: string
  newEmbeddingApiKey: string
  // masked info about stored keys
  hasApiKey: boolean
  apiKeyPreview: string
  hasEmbeddingApiKey: boolean
  embeddingApiKeyPreview: string
}

/** Matches the documented backend defaults. */
const DEFAULT_FORM: SettingsForm = {
  llmProvider: 'built-in',
  apiBaseUrl: 'https://integrate.api.nvidia.com/v1',
  apiModel: 'meta/llama-3.3-70b-instruct',
  ollamaBaseUrl: 'http://localhost:11434',
  ollamaModel: 'llama3.1',
  embeddingProvider: 'built-in',
  embeddingApiBaseUrl: '',
  embeddingModel: 'nomic-embed-text',
  ocrEnabled: true,
  ocrEngine: 'glm',
  glmModel: 'glm-ocr',
  newApiKey: '',
  newEmbeddingApiKey: '',
  hasApiKey: false,
  apiKeyPreview: '',
  hasEmbeddingApiKey: false,
  embeddingApiKeyPreview: '',
}

function Field(props: { label: string; htmlFor?: string; hint?: string; children: React.ReactNode }) {
  const { label, htmlFor, hint, children } = props
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

function applyServerSettings(server: Settings): SettingsForm {
  return {
    ...DEFAULT_FORM,
    llmProvider: server.llmProvider ?? 'built-in',
    apiBaseUrl: server.apiBaseUrl ?? DEFAULT_FORM.apiBaseUrl,
    apiModel: server.apiModel ?? DEFAULT_FORM.apiModel,
    ollamaBaseUrl: server.ollamaBaseUrl ?? DEFAULT_FORM.ollamaBaseUrl,
    ollamaModel: server.ollamaModel ?? DEFAULT_FORM.ollamaModel,
    embeddingProvider: server.embeddingProvider ?? 'built-in',
    embeddingApiBaseUrl: server.embeddingApiBaseUrl ?? '',
    embeddingModel: server.embeddingModel ?? DEFAULT_FORM.embeddingModel,
    ocrEnabled: server.ocrEnabled ?? true,
    ocrEngine: server.ocrEngine ?? 'glm',
    glmModel: server.glmModel ?? DEFAULT_FORM.glmModel,
    hasApiKey: server.hasApiKey ?? false,
    apiKeyPreview: server.apiKeyPreview ?? '',
    hasEmbeddingApiKey: server.hasEmbeddingApiKey ?? false,
    embeddingApiKeyPreview: server.embeddingApiKeyPreview ?? '',
  }
}

/** Settings dialog — Model | Embeddings | OCR | Account tabs. */
export function SettingsDialog({
  open,
  onOpenChange,
  settings,
  onSaved,
  username,
  onAccountDeleted,
}: SettingsDialogProps) {
  const [form, setForm] = useState<SettingsForm>(DEFAULT_FORM)
  const [caps, setCaps] = useState<Capabilities | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // account deletion
  const [confirmPassword, setConfirmPassword] = useState('')
  const [deleting, setDeleting] = useState(false)

  // Load fresh settings + capabilities every time the dialog opens.
  useEffect(() => {
    if (!open) return
    let cancelled = false

    if (settings) setForm(applyServerSettings(settings)) // instant prefill
    setLoading(true)
    setCaps(null)
    setConfirmPassword('')

    getSettings()
      .then((res) => {
        if (!cancelled) setForm(applyServerSettings(res.settings))
      })
      .catch(() => {
        // keep prefill / defaults; save will surface errors if any
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    getCapabilities()
      .then((res) => {
        if (!cancelled) setCaps(res)
      })
      .catch(() => {
        if (!cancelled) setCaps({ ollama: false, paddle: false, builtin: true, ollamaUrl: '' })
      })

    return () => {
      cancelled = true
    }
  }, [open])

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      const res = await updateSettings({
        llmProvider: form.llmProvider,
        apiBaseUrl: form.apiBaseUrl.trim(),
        apiModel: form.apiModel.trim(),
        ollamaBaseUrl: form.ollamaBaseUrl.trim(),
        ollamaModel: form.ollamaModel.trim(),
        embeddingProvider: form.embeddingProvider,
        embeddingApiBaseUrl: form.embeddingApiBaseUrl.trim() || null,
        embeddingModel: form.embeddingModel.trim(),
        ocrEnabled: form.ocrEnabled,
        ocrEngine: form.ocrEngine,
        glmModel: form.glmModel.trim(),
        // non-empty replaces, empty keeps — the server refuses to wipe keys on empty
        apiKey: form.newApiKey.trim() || undefined,
        embeddingApiKey: form.newEmbeddingApiKey.trim() || undefined,
      })
      toast.success('Settings saved')
      onSaved(res.settings)
      setForm(applyServerSettings(res.settings))
      onOpenChange(false)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        toast.error('Session expired — log in again')
      } else {
        toast.error(err instanceof ApiError ? err.message : 'Failed to save settings')
      }
    } finally {
      setSaving(false)
    }
  }, [form, onOpenChange, onSaved])

  const clearStoredKey = useCallback(
    async (which: 'apiKey' | 'embeddingApiKey') => {
      try {
        const res = await updateSettings(
          which === 'apiKey'
            ? { clearApiKey: true }
            : { clearEmbeddingApiKey: true },
        )
        setForm(applyServerSettings(res.settings))
        onSaved(res.settings)
        toast.success('Key removed')
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : 'Failed to remove key')
      }
    },
    [onSaved],
  )

  const handleDeleteAccount = useCallback(async () => {
    if (!confirmPassword) {
      toast.error('Enter your password to confirm')
      return
    }
    setDeleting(true)
    try {
      await deleteAccount(confirmPassword)
      toast('Account deleted — all data erased')
      setConfirmPassword('')
      onAccountDeleted()
      onOpenChange(false)
    } catch (err) {
      // keep the typed password so a retry is one click away
      toast.error(err instanceof ApiError ? err.message : 'Failed to delete account')
    } finally {
      setDeleting(false)
    }
  }, [confirmPassword, onAccountDeleted, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong nice-scroll max-h-[88vh] overflow-y-auto rounded-md sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Garage settings</DialogTitle>
          <DialogDescription>
            Endpoints, keys and OCR — everything stays on this machine.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="model" className="gap-4">
          <TabsList className="w-full">
            <TabsTrigger value="model" className="flex-1">
              Model
            </TabsTrigger>
            <TabsTrigger value="embeddings" className="flex-1">
              Embeddings
            </TabsTrigger>
            <TabsTrigger value="ocr" className="flex-1">
              OCR
            </TabsTrigger>
            <TabsTrigger value="account" className="flex-1">
              Account
            </TabsTrigger>
          </TabsList>

          {/* ── Model ─────────────────────────────────────── */}
          <TabsContent value="model" className="space-y-4">
            <RadioGroup
              value={form.llmProvider}
              onValueChange={(v) => setForm((f) => ({ ...f, llmProvider: v as LlmProvider }))}
              className="grid gap-2 sm:grid-cols-3"
            >
              <Label
                htmlFor="llm-provider-api"
                className={cn(
                  'cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors',
                  form.llmProvider === 'api'
                    ? 'border-primary/70 bg-primary/10'
                    : 'hover:border-primary/40',
                )}
              >
                <RadioGroupItem value="api" id="llm-provider-api" className="mt-0.5" />
                <span className="min-w-0 space-y-0.5">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <Globe className="size-3.5 text-primary" aria-hidden="true" />
                    API endpoint
                  </span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    OpenAI-compatible (NVIDIA, unorouter, …)
                  </span>
                </span>
              </Label>

              <Label
                htmlFor="llm-provider-ollama"
                className={cn(
                  'cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors',
                  form.llmProvider === 'ollama'
                    ? 'border-primary/70 bg-primary/10'
                    : 'hover:border-primary/40',
                )}
              >
                <RadioGroupItem value="ollama" id="llm-provider-ollama" className="mt-0.5" />
                <span className="min-w-0 space-y-0.5">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <Cpu className="size-3.5 text-primary" aria-hidden="true" />
                    Local Ollama
                  </span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    Runs on this machine — fully offline
                  </span>
                </span>
              </Label>
              <Label
                htmlFor="llm-provider-builtin"
                className={cn(
                  'cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors',
                  form.llmProvider === 'built-in'
                    ? 'border-primary/70 bg-primary/10'
                    : 'hover:border-primary/40',
                )}
              >
                <RadioGroupItem value="built-in" id="llm-provider-builtin" className="mt-0.5" />
                <span className="min-w-0 space-y-0.5">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
                    Built-in Z.ai
                  </span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    Zero setup — works instantly
                  </span>
                </span>
              </Label>
            </RadioGroup>

            {form.llmProvider === 'built-in' ? (
              <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                The built-in brain runs through the bundled Z.ai service — no keys, no models to
                pull. Switch to <span className="text-foreground">API endpoint</span> or{' '}
                <span className="text-foreground">Local Ollama</span> above to use your own models.
              </div>
            ) : form.llmProvider === 'api' ? (
              <div className="space-y-4 rounded-xl border p-4">
                <Field label="Base URL" htmlFor="api-base-url" hint="Any OpenAI-compatible /v1 endpoint">
                  <Input
                    id="api-base-url"
                    value={form.apiBaseUrl}
                    onChange={(e) => setForm((f) => ({ ...f, apiBaseUrl: e.target.value }))}
                    placeholder="https://integrate.api.nvidia.com/v1 or your unorouter URL"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </Field>
                <Field
                  label="API key"
                  htmlFor="api-key"
                  hint={
                    form.hasApiKey
                      ? `Saved key ${form.apiKeyPreview} — leave empty to keep it (stored encrypted)`
                      : 'Stored encrypted in your local database — never sent anywhere else'
                  }
                >
                  <div className="flex gap-2">
                    <PasswordInput
                      id="api-key"
                      value={form.newApiKey}
                      onChange={(e) => setForm((f) => ({ ...f, newApiKey: e.target.value }))}
                      placeholder={form.hasApiKey ? 'leave empty to keep current key' : 'nvapi-… or sk-…'}
                      autoComplete="off"
                      spellCheck={false}
                    />
                    {form.hasApiKey ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0 self-stretch"
                        onClick={() => void clearStoredKey('apiKey')}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </div>
                </Field>
                <Field label="Model" htmlFor="api-model">
                  <Input
                    id="api-model"
                    value={form.apiModel}
                    onChange={(e) => setForm((f) => ({ ...f, apiModel: e.target.value }))}
                    placeholder="meta/llama-3.3-70b-instruct"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </Field>
              </div>
            ) : (
              <div className="space-y-4 rounded-xl border p-4">
                <Field label="Ollama base URL" htmlFor="ollama-base-url">
                  <Input
                    id="ollama-base-url"
                    value={form.ollamaBaseUrl}
                    onChange={(e) => setForm((f) => ({ ...f, ollamaBaseUrl: e.target.value }))}
                    placeholder="http://localhost:11434"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </Field>
                <Field label="Model" htmlFor="ollama-model">
                  <Input
                    id="ollama-model"
                    value={form.ollamaModel}
                    onChange={(e) => setForm((f) => ({ ...f, ollamaModel: e.target.value }))}
                    placeholder="llama3.1"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </Field>
              </div>
            )}
          </TabsContent>

          {/* ── Embeddings ────────────────────────────────── */}
          <TabsContent value="embeddings" className="space-y-4">
            <Field label="Embedding provider">
              <Select
                value={form.embeddingProvider}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, embeddingProvider: v as EmbeddingProvider }))
                }
              >
                <SelectTrigger className="w-full" aria-label="Embedding provider">
                  <SelectValue placeholder="Pick a provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="built-in">Built-in (offline, no setup)</SelectItem>
                  <SelectItem value="api">API endpoint (OpenAI-compatible)</SelectItem>
                  <SelectItem value="ollama">Ollama (local)</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            {form.embeddingProvider === 'built-in' ? (
              <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                Uses a fast offline keyword-aware embedder — perfect for trying things out with
                zero keys. For true semantic search pick an API or Ollama embedding model.
                <span className="mt-1 block text-xs text-dim">
                  Changing the embedder after ingesting documents marks the index stale —
                  re-upload to re-index.
                </span>
              </div>
            ) : form.embeddingProvider === 'api' ? (
              <div className="space-y-4 rounded-xl border p-4">
                <Field
                  label="Base URL override"
                  htmlFor="emb-base-url"
                  hint="empty = use the Model tab credentials"
                >
                  <Input
                    id="emb-base-url"
                    value={form.embeddingApiBaseUrl}
                    onChange={(e) => setForm((f) => ({ ...f, embeddingApiBaseUrl: e.target.value }))}
                    placeholder="https://integrate.api.nvidia.com/v1"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </Field>
                <Field
                  label="API key override"
                  htmlFor="emb-api-key"
                  hint={
                    form.hasEmbeddingApiKey
                      ? `Saved key ${form.embeddingApiKeyPreview} — leave empty to keep it`
                      : 'empty = use the Model tab credentials'
                  }
                >
                  <div className="flex gap-2">
                    <PasswordInput
                      id="emb-api-key"
                      value={form.newEmbeddingApiKey}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, newEmbeddingApiKey: e.target.value }))
                      }
                      placeholder={
                        form.hasEmbeddingApiKey ? 'leave empty to keep current key' : 'nvapi-… or sk-…'
                      }
                      autoComplete="off"
                      spellCheck={false}
                    />
                    {form.hasEmbeddingApiKey ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0 self-stretch"
                        onClick={() => void clearStoredKey('embeddingApiKey')}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </div>
                </Field>
                <Field label="Embedding model" htmlFor="emb-model">
                  <Input
                    id="emb-model"
                    value={form.embeddingModel}
                    onChange={(e) => setForm((f) => ({ ...f, embeddingModel: e.target.value }))}
                    placeholder="nvidia/nv-embedqa-e5-v5 or text-embedding-3-small"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </Field>
              </div>
            ) : (
              <div className="rounded-xl border p-4">
                <Field label="Embedding model" htmlFor="emb-model-ollama" hint="e.g. nomic-embed-text">
                  <Input
                    id="emb-model-ollama"
                    value={form.embeddingModel}
                    onChange={(e) => setForm((f) => ({ ...f, embeddingModel: e.target.value }))}
                    placeholder="nomic-embed-text"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </Field>
              </div>
            )}
          </TabsContent>

          {/* ── OCR ───────────────────────────────────────── */}
          <TabsContent value="ocr" className="space-y-4">
            <div className="flex items-center justify-between gap-4 rounded-xl border p-3">
              <div className="min-w-0">
                <Label htmlFor="ocr-enabled">OCR extraction</Label>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Extract text from scanned PDFs &amp; images with OCR
                </p>
              </div>
              <Switch
                id="ocr-enabled"
                checked={form.ocrEnabled}
                onCheckedChange={(v) => setForm((f) => ({ ...f, ocrEnabled: v }))}
              />
            </div>

            <Field label="OCR engine" hint={form.ocrEnabled ? undefined : 'Enable OCR to change the engine'}>
              <Select
                value={form.ocrEngine}
                onValueChange={(v) => setForm((f) => ({ ...f, ocrEngine: v as OcrEngine }))}
                disabled={!form.ocrEnabled}
              >
                <SelectTrigger className="w-full" aria-label="OCR engine">
                  <SelectValue placeholder="Pick an engine" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="glm">GLM-OCR via Ollama</SelectItem>
                  <SelectItem value="paddle">PaddleOCR (local ONNX)</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            {form.ocrEnabled && form.ocrEngine === 'glm' ? (
              <Field label="GLM model" htmlFor="glm-model" hint="Ollama model tag used for OCR">
                <Input
                  id="glm-model"
                  value={form.glmModel}
                  onChange={(e) => setForm((f) => ({ ...f, glmModel: e.target.value }))}
                  placeholder="glm-ocr"
                  autoComplete="off"
                  spellCheck={false}
                />
              </Field>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed p-3">
              <span className="text-xs text-dim">Environment check</span>
              {caps ? (
                <>
                  <Badge variant="outline" className="gap-1 border-emerald-600/50 text-emerald-500">
                    <Check className="size-3" aria-hidden="true" />Built-in AI ready
                  </Badge>
                  <Badge
                    variant="outline"
                    className={cn(
                      'gap-1',
                      caps.ollama
                        ? 'border-emerald-600/50 text-emerald-500'
                        : 'border-destructive/50 text-destructive',
                    )}
                  >
                    {caps.ollama ? (
                      <Check className="size-3" aria-hidden="true" />
                    ) : (
                      <X className="size-3" aria-hidden="true" />
                    )}
                    {caps.ollama ? 'Ollama reachable' : 'Ollama offline'}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={cn(
                      'gap-1',
                      caps.paddle
                        ? 'border-emerald-600/50 text-emerald-500'
                        : 'border-destructive/50 text-destructive',
                    )}
                  >
                    {caps.paddle ? (
                      <Check className="size-3" aria-hidden="true" />
                    ) : (
                      <X className="size-3" aria-hidden="true" />
                    )}
                    {caps.paddle ? 'PaddleOCR available' : 'PaddleOCR unavailable'}
                  </Badge>
                </>
              ) : (
                <>
                  <Skeleton className="h-5 w-32 rounded-full" />
                  <Skeleton className="h-5 w-40 rounded-full" />
                </>
              )}
            </div>
          </TabsContent>

          {/* ── Account ───────────────────────────────────── */}
          <TabsContent value="account" className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl border p-4">
              <UserCircle2 className="size-9 text-primary" aria-hidden="true" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{username}</p>
                <p className="text-xs text-muted-foreground">
                  Keys, chats and the search index live on this machine — encrypted at rest.
                </p>
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-destructive/40 p-4">
              <div className="flex items-start gap-2.5">
                <ShieldAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium text-destructive">Danger zone</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Permanently delete your account — settings, chats, messages, document records
                    and the encrypted search index. This is immediate and cannot be undone.
                  </p>
                </div>
              </div>
              <PasswordInput
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="confirm your password"
                autoComplete="current-password"
                aria-label="Confirm password to delete account"
              />
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" disabled={!confirmPassword}>
                    Delete account forever
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="glass-strong rounded-md">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This erases everything tied to{' '}
                      <span className="font-medium text-foreground">{username}</span> — settings,
                      all chats, document records and the encrypted search index. There is no undo
                      and no backup.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep my account</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-white hover:bg-destructive/90"
                      disabled={deleting}
                      onClick={(e) => {
                        e.preventDefault()
                        void handleDeleteAccount()
                      }}
                    >
                      {deleting ? (
                        <>
                          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                          Erasing…
                        </>
                      ) : (
                        'Yes, erase everything'
                      )}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex items-center justify-between gap-3 border-t pt-4">
          <p className="text-[11px] text-dim">Keys are encrypted at rest — never shown or uploaded.</p>
          <Button onClick={handleSave} disabled={saving || loading} className="min-w-32">
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Saving…
              </>
            ) : (
              'Save settings'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
