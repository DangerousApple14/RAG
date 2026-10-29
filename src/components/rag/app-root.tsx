'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Car,
  Loader2,
  LogOut,
  Menu,
  Settings as SettingsIcon,
  Shuffle,
  User as UserIcon,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Toaster as SonnerToaster } from '@/components/ui/sonner'
import { AuthScreen } from '@/components/rag/auth-screen'
import { BackgroundLayer } from '@/components/rag/background-layer'
import { ChatPanel, type UiMessage } from '@/components/rag/chat-panel'
import { SettingsDialog } from '@/components/rag/settings-dialog'
import { Sidebar } from '@/components/rag/sidebar'
import {
  ApiError,
  deleteConversation,
  deleteDocument,
  getBackgrounds,
  getConversation,
  getSettings,
  isAcceptedFile,
  listConversations,
  listDocuments,
  logout,
  me,
  parseSources,
  streamChat,
  uploadDocuments,
  type BackgroundsResponse,
  type ConversationSummary,
  type RagDocument,
  type Settings,
  type User,
} from '@/lib/api-client'

const BG_STORAGE_KEY = 'mg-bg'

/** Local fallbacks if /api/backgrounds is unavailable (files exist in /public). */
const FALLBACK_BG: BackgroundsResponse = {
  images: ['/backgrounds/bmw-moon.webp', '/backgrounds/bmw-fog.webp'],
  current: '/backgrounds/bmw-moon.webp',
}

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function BootScreen() {
  return (
    <div className="flex min-h-svh items-center justify-center">
      <Loader2 className="size-8 animate-spin text-primary" aria-label="Loading" role="status" />
    </div>
  )
}

/** Client orchestrator: auth gate, data loading, streaming chat, layout shell. */
export function AppRoot() {
  /* ── state ──────────────────────────────────────────────────── */
  const [user, setUser] = useState<User | null>(null)
  const [authChecking, setAuthChecking] = useState(true)

  const [bg, setBg] = useState<BackgroundsResponse>({ images: [], current: '' })

  const [settings, setSettings] = useState<Settings | null>(null)
  const [documents, setDocuments] = useState<RagDocument[]>([])
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [initialLoading, setInitialLoading] = useState(false)

  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<UiMessage[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [streaming, setStreaming] = useState(false)

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)

  const abortRef = useRef<AbortController | null>(null)

  // Randomize once per browser session: sessionStorage wins, else API `current`.
  useEffect(() => {
    let cancelled = false
    const stored = window.sessionStorage.getItem(BG_STORAGE_KEY)
    getBackgrounds()
      .then((res) => {
        if (cancelled) return
        const images = res.images.length > 0 ? res.images : FALLBACK_BG.images
        const current =
          stored && images.includes(stored) ? stored : res.current || images[0] || FALLBACK_BG.current
        if (!stored) window.sessionStorage.setItem(BG_STORAGE_KEY, current)
        setBg({ images, current })
      })
      .catch(() => {
        if (cancelled) return
        const current = stored ?? FALLBACK_BG.current
        setBg({ images: FALLBACK_BG.images, current })
      })
    return () => {
      cancelled = true
    }
  }, [])

  const shuffleBackground = useCallback(() => {
    setBg((prev) => {
      const pool = prev.images.length > 0 ? prev.images : FALLBACK_BG.images
      if (pool.length < 2) return prev
      const others = pool.filter((img) => img !== prev.current)
      const next = others[Math.floor(Math.random() * others.length)]
      window.sessionStorage.setItem(BG_STORAGE_KEY, next)
      return { images: pool, current: next }
    })
  }, [])

  /* ── data loading ───────────────────────────────────────────── */
  const stopStream = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setStreaming(false)
  }, [])

  const handleAuthLoss = useCallback(() => {
    stopStream()
    setUser(null)
    setSettings(null)
    setDocuments([])
    setConversations([])
    setActiveId(null)
    setMessages([])
  }, [stopStream])

  const loadInitialData = useCallback(async () => {
    setInitialLoading(true)
    const [settingsRes, docsRes, convRes] = await Promise.allSettled([
      getSettings(),
      listDocuments(),
      listConversations(),
    ])
    if (settingsRes.status === 'fulfilled') setSettings(settingsRes.value.settings)
    if (docsRes.status === 'fulfilled') setDocuments(docsRes.value.documents)
    if (convRes.status === 'fulfilled') setConversations(convRes.value.conversations)

    for (const result of [settingsRes, docsRes, convRes]) {
      if (result.status !== 'rejected') continue
      const err = result.reason
      if (err instanceof ApiError && err.status === 401) {
        handleAuthLoss()
        break
      }
      toast.error(err instanceof ApiError ? err.message : 'Failed to load initial data')
    }
    setInitialLoading(false)
  }, [handleAuthLoss])

  const handleAuthed = useCallback(
    (authenticated: User) => {
      setUser(authenticated)
      void loadInitialData()
    },
    [loadInitialData],
  )

  /* ── auth check on mount: hydrate data for returning visitors ── */
  useEffect(() => {
    let cancelled = false
    me()
      .then((res) => {
        if (cancelled) return
        setUser(res.user)
        // returning visitor with a valid cookie: hydrate everything now
        void loadInitialData()
      })
      .catch(() => {
        // 401 / network — stay on the auth screen
      })
      .finally(() => {
        if (!cancelled) setAuthChecking(false)
      })
    return () => {
      cancelled = true
    }
  }, [loadInitialData])

  const refreshDocuments = useCallback(async () => {
    try {
      const res = await listDocuments()
      setDocuments(res.documents)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleAuthLoss()
        return
      }
      // silent for background polling; surface real messages only
      if (err instanceof ApiError && err.status !== 0) {
        toast.error(err.message)
      }
    }
  }, [handleAuthLoss])

  const refreshConversations = useCallback(async () => {
    try {
      const res = await listConversations()
      setConversations(res.conversations)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleAuthLoss()
        return
      }
      if (err instanceof ApiError && err.status !== 0) {
        toast.error(err.message)
      }
    }
  }, [handleAuthLoss])

  /* ── conversations ──────────────────────────────────────────── */
  const selectConversation = useCallback(
    async (id: string) => {
      stopStream()
      setActiveId(id)
      setSheetOpen(false)
      setLoadingMessages(true)
      try {
        const res = await getConversation(id)
        setMessages(
          res.messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            sources: parseSources(m.sources),
            createdAt: m.createdAt,
          })),
        )
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          handleAuthLoss()
          return
        }
        toast.error(err instanceof ApiError ? err.message : 'Failed to load conversation')
        setMessages([])
        setActiveId(null)
      } finally {
        setLoadingMessages(false)
      }
    },
    [handleAuthLoss, stopStream],
  )

  const handleNewChat = useCallback(() => {
    stopStream()
    setActiveId(null)
    setMessages([])
    setSheetOpen(false)
  }, [stopStream])

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      try {
        await deleteConversation(id)
        toast('Chat deleted')
        setConversations((prev) => prev.filter((c) => c.id !== id))
        if (activeId === id) {
          setActiveId(null)
          setMessages([])
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          handleAuthLoss()
          return
        }
        toast.error(err instanceof ApiError ? err.message : 'Failed to delete chat')
      }
    },
    [activeId, handleAuthLoss],
  )

  /* ── chat streaming ─────────────────────────────────────────── */
  const sendMessage = useCallback(
    async (text: string) => {
      if (streaming) return
      const assistantId = `assistant-${uid()}`

      setMessages((prev) => [
        ...prev,
        {
          id: `user-${uid()}`,
          role: 'user',
          content: text,
          sources: null,
          createdAt: new Date().toISOString(),
        },
        {
          id: assistantId,
          role: 'assistant',
          content: '',
          sources: null,
          createdAt: new Date().toISOString(),
          streaming: true,
        },
      ])
      setStreaming(true)

      const controller = new AbortController()
      abortRef.current = controller

      try {
        await streamChat({
          conversationId: activeId,
          message: text,
          signal: controller.signal,
          onMeta: (meta) => {
            setActiveId((current) => current ?? meta.conversationId)
            setConversations((prev) =>
              prev.some((c) => c.id === meta.conversationId)
                ? prev.map((c) =>
                    c.id === meta.conversationId ? { ...c, title: meta.title } : c,
                  )
                : [
                    {
                      id: meta.conversationId,
                      title: meta.title,
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                    },
                    ...prev,
                  ],
            )
          },
          onToken: (token) => {
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + token } : m)),
            )
          },
          onDone: (done) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, streaming: false, sources: done.sources } : m,
              ),
            )
          },
          onError: (message) => {
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, streaming: false, error: message } : m)),
            )
            toast.error(`Chat error: ${message}`)
          },
        })
      } catch (err) {
        const message = err instanceof ApiError ? err.message : 'Chat failed — try again'
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, streaming: false, error: message } : m)),
        )
        if (err instanceof ApiError && err.status === 401) {
          handleAuthLoss()
          return
        }
        toast.error(`Chat error: ${message}`)
      } finally {
        // clear the streaming flag even on abort / silent stream end
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId && m.streaming ? { ...m, streaming: false } : m)),
        )
        setStreaming(false)
        abortRef.current = null
        void refreshConversations()
      }
    },
    [activeId, handleAuthLoss, refreshConversations, streaming],
  )

  const handleStop = useCallback(() => {
    stopStream()
    setMessages((prev) => prev.map((m) => (m.streaming ? { ...m, streaming: false } : m)))
  }, [stopStream])

  /* ── documents ──────────────────────────────────────────────── */
  const handleFilesSelected = useCallback(
    async (files: File[]) => {
      const accepted = files.filter(isAcceptedFile)
      if (accepted.length === 0) {
        toast.error('Unsupported file type — use PDF, PNG, JPG, WEBP, BMP or TIFF')
        return
      }
      if (accepted.length < files.length) {
        toast(`Skipped ${files.length - accepted.length} unsupported file(s)`)
      }
      toast('Upload started', {
        description: `${accepted.length} file(s) queued for processing`,
      })
      try {
        await uploadDocuments(accepted)
        await refreshDocuments()
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          handleAuthLoss()
          return
        }
        toast.error(err instanceof ApiError ? err.message : 'Upload failed')
      }
    },
    [handleAuthLoss, refreshDocuments],
  )

  const handleDeleteDocument = useCallback(
    async (id: string) => {
      try {
        await deleteDocument(id)
        toast('Document deleted')
        setDocuments((prev) => prev.filter((d) => d.id !== id))
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          handleAuthLoss()
          return
        }
        toast.error(err instanceof ApiError ? err.message : 'Failed to delete document')
      }
    },
    [handleAuthLoss],
  )

  /* ── settings / logout ──────────────────────────────────────── */
  const handleSettingsSaved = useCallback((saved: Settings) => {
    setSettings(saved)
  }, [])

  const handleLogout = useCallback(async () => {
    stopStream()
    try {
      await logout()
    } catch {
      // clearing local state is enough even if the call fails
    }
    setUser(null)
    setSettings(null)
    setDocuments([])
    setConversations([])
    setActiveId(null)
    setMessages([])
  }, [stopStream])

  /** After account erasure the session is already gone server-side. */
  const handleAccountDeleted = useCallback(() => {
    stopStream()
    setUser(null)
    setSettings(null)
    setDocuments([])
    setConversations([])
    setActiveId(null)
    setMessages([])
  }, [stopStream])

  /* ── render ─────────────────────────────────────────────────── */
  const sidebar = (
    <Sidebar
      conversations={conversations}
      activeConversationId={activeId}
      documents={documents}
      loadingConversations={initialLoading}
      loadingDocuments={initialLoading}
      onSelectConversation={(id) => void selectConversation(id)}
      onNewChat={handleNewChat}
      onDeleteConversation={(id) => void handleDeleteConversation(id)}
      onFilesSelected={(files) => void handleFilesSelected(files)}
      onDeleteDocument={(id) => void handleDeleteDocument(id)}
      onRefreshDocuments={() => void refreshDocuments()}
      className="hidden w-80 shrink-0 border-r border-border/70 lg:flex"
    />
  )

  return (
    <>
      <BackgroundLayer src={bg.current || null} />

      {!user ? (
        authChecking ? (
          <BootScreen />
        ) : (
          <AuthScreen onAuthed={handleAuthed} />
        )
      ) : (
        <div className="flex min-h-svh flex-col">
          <header className="glass-strong sticky top-0 z-20 flex h-16 shrink-0 items-center gap-2 border-x-0 border-t-0 px-3 sm:px-5">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setSheetOpen(true)}
              aria-label="Open sidebar"
              title="Sidebar"
            >
              <Menu className="size-5" aria-hidden="true" />
            </Button>

            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Car className="size-4" aria-hidden="true" />
              </div>
              <div className="min-w-0 leading-tight">
                <p className="truncate text-[13px] font-semibold tracking-[0.1em]">
                  MIDNIGHT <span className="text-primary">GARAGE</span>
                </p>
                <p className="truncate text-[10px] text-dim">Private document workspace</p>
              </div>
            </div>

            <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
              <Button
                variant="ghost"
                size="icon"
                onClick={shuffleBackground}
                aria-label="Shuffle background"
                title="Shuffle background"
              >
                <Shuffle className="size-4" aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSettingsOpen(true)}
                aria-label="Open settings"
                title="Settings"
              >
                <SettingsIcon className="size-4" aria-hidden="true" />
              </Button>
              <span className="ml-1 hidden items-center gap-1.5 border-l border-border pl-3 text-xs text-dim sm:inline-flex">
                <UserIcon className="size-3.5" aria-hidden="true" />
                {user.username}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void handleLogout()}
                aria-label="Log out"
                title="Log out"
              >
                <LogOut className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </header>

          <main className="flex min-h-0 flex-1">
            {sidebar}
            <ChatPanel
              messages={messages}
              loading={initialLoading || loadingMessages}
              streaming={streaming}
              settings={settings}
              onSend={(text) => void sendMessage(text)}
              onStop={handleStop}
            />
          </main>

          <footer className="glass-strong mt-auto shrink-0 border-x-0 border-b-0 px-4 py-2 text-center text-[11px] text-dim">
            <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5">
              <span>
                Midnight Garage · document search, OCR &amp; source references
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Made with love, I think, by ApplePie/DangerousApple/SR
              </span>
            </div>
          </footer>

          {/* Mobile sidebar drawer */}
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetContent side="left" className="glass-strong w-80 gap-0 rounded-none border-y-0 border-l-0 p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <SheetDescription className="sr-only">Chats and knowledge base</SheetDescription>
              <Sidebar
                conversations={conversations}
                activeConversationId={activeId}
                documents={documents}
                loadingConversations={initialLoading}
                loadingDocuments={initialLoading}
                onSelectConversation={(id) => void selectConversation(id)}
                onNewChat={handleNewChat}
                onDeleteConversation={(id) => void handleDeleteConversation(id)}
                onFilesSelected={(files) => void handleFilesSelected(files)}
                onDeleteDocument={(id) => void handleDeleteDocument(id)}
                onRefreshDocuments={() => void refreshDocuments()}
                className="h-full w-full border-r-0"
              />
            </SheetContent>
          </Sheet>

          <SettingsDialog
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            settings={settings}
            onSaved={handleSettingsSaved}
            username={user.username}
            onAccountDeleted={handleAccountDeleted}
          />
        </div>
      )}

      <SonnerToaster theme="dark" position="bottom-right" richColors closeButton />
    </>
  )
}
