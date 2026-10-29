'use client'

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import {
  AlertTriangle,
  Car,
  FileText,
  Loader2,
  MessageSquare,
  Send,
  Square,
  Upload,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import type { Settings, Source } from '@/lib/api-client'
import { cn } from '@/lib/utils'

export interface UiMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources: Source[] | null
  createdAt: string
  streaming?: boolean
  error?: string | null
}

interface ChatPanelProps {
  messages: UiMessage[]
  /** True while conversation messages are loading (shows skeletons). */
  loading: boolean
  /** True while an assistant reply is streaming in. */
  streaming: boolean
  settings: Settings | null
  onSend: (text: string) => void
  onStop: () => void
}

const HINTS = [
  { icon: Upload, text: 'Add PDFs and images' },
  { icon: MessageSquare, text: 'Ask a question in plain language' },
  { icon: FileText, text: 'Follow answers back to the source page' },
] as const

function LoadingRows() {
  return (
    <div className="flex flex-col gap-4 py-4" aria-hidden="true">
      <Skeleton className="ml-auto h-10 w-1/3 rounded-2xl" />
      <Skeleton className="h-20 w-3/4 rounded-2xl" />
      <Skeleton className="ml-auto h-10 w-1/4 rounded-2xl" />
      <Skeleton className="h-16 w-2/3 rounded-2xl" />
    </div>
  )
}

function EmptyState({ settings }: { settings: Settings | null }) {
  const model =
    settings?.llmProvider === 'api' ? settings.apiModel : (settings?.ollamaModel ?? null)
  const ocrLabel = settings
    ? settings.ocrEnabled
      ? settings.ocrEngine === 'glm'
        ? settings.glmModel
        : 'PaddleOCR'
      : 'off'
    : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="flex flex-col items-center gap-6 py-12 text-center"
    >
      <div className="flex size-12 items-center justify-center rounded-md border border-border bg-card text-primary">
        <FileText className="size-5" aria-hidden="true" />
      </div>

      <div>
        <p className="mb-2 text-[10px] font-medium tracking-[0.16em] text-primary uppercase">
          Your workspace
        </p>
        <h2 className="text-2xl font-medium tracking-tight">Start with your documents.</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          Add a few files, then ask a question. Answers include references back to the source.
        </p>
      </div>

      <div className="w-full max-w-sm divide-y divide-border border-y border-border text-left">
        {HINTS.map((hint) => (
          <div
            key={hint.text}
            className="flex items-center gap-3 px-2 py-3 text-xs text-muted-foreground"
          >
            <hint.icon className="size-4 shrink-0 text-dim" aria-hidden="true" />
            <span>{hint.text}</span>
          </div>
        ))}
      </div>

      {settings && model ? (
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          <Badge variant="outline" className="max-w-[260px] gap-1.5">
            <Car className="size-3 shrink-0 text-primary" aria-hidden="true" />
            <span className="truncate">{model}</span>
          </Badge>
          {ocrLabel ? (
            <Badge variant="outline" className="gap-1.5">
              <FileText className="size-3 shrink-0 text-primary" aria-hidden="true" />
              OCR: {ocrLabel}
            </Badge>
          ) : null}
        </div>
      ) : null}
    </motion.div>
  )
}

function MessageRow({ message: m }: { message: UiMessage }) {
  if (m.role === 'user') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="flex justify-end"
      >
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary/90 px-4 py-2.5 text-sm break-words whitespace-pre-wrap text-primary-foreground shadow-sm">
          {m.content}
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="flex items-start gap-3"
    >
      <div className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-card text-primary">
      <FileText className="size-3.5" aria-hidden="true" />
      </div>

      <div
        className={cn(
          'glass min-w-0 max-w-[85%] rounded-2xl rounded-tl-md px-4 py-3',
          m.error && 'border-destructive/60 bg-destructive/10',
        )}
      >
        {m.error ? (
          <div className="flex items-start gap-2 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-destructive">{m.error}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Check the Model tab in settings or try sending again.
              </p>
            </div>
          </div>
        ) : (
          <>
            {m.content ? (
              <div className="chat-md min-w-0 break-words text-sm leading-relaxed">
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                  {m.content}
                </ReactMarkdown>
              </div>
            ) : null}

            {m.streaming ? (
              m.content ? (
                <span
                  aria-hidden="true"
                  className="ml-0.5 inline-block h-4 w-[7px] translate-y-[3px] animate-pulse rounded-[2px] bg-foreground/70"
                />
              ) : (
                <div className="flex items-center gap-2 py-1 text-xs text-dim">
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                  <span>Thinking…</span>
                </div>
              )
            ) : null}

            {!m.streaming && m.sources && m.sources.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border/60 pt-2.5">
                {m.sources.map((s, i) => (
                  <span
                    key={`${s.docId}-${s.page}-${i}`}
                    title={`${s.docName} · page ${s.page}`}
                    className="inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-0.5 text-xs text-muted-foreground"
                  >
                    <FileText className="size-3 shrink-0 text-primary" aria-hidden="true" />
                    <span className="max-w-[160px] truncate">{s.docName}</span>
                    {typeof s.page === 'number' ? <span className="text-dim">p.{s.page}</span> : null}
                  </span>
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>
    </motion.div>
  )
}

/** Main chat column: message list + input bar with send/stop. */
export function ChatPanel({
  messages,
  loading,
  streaming,
  settings,
  onSend,
  onStop,
}: ChatPanelProps) {
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const stickRef = useRef(true)

  // Only auto-stick to the bottom when the user is already near it.
  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 140
  }

  useEffect(() => {
    const el = scrollRef.current
    if (el && stickRef.current) el.scrollTop = el.scrollHeight
  }, [messages])

  const canSend = input.trim().length > 0 && !streaming && !loading

  const submit = () => {
    if (!canSend) return
    onSend(input.trim())
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <section aria-label="Chat" className="flex min-w-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        aria-live="polite"
        className="nice-scroll min-h-0 flex-1 overflow-y-auto"
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-3 py-6 sm:px-4">
          {loading ? (
            <LoadingRows />
          ) : messages.length === 0 ? (
            <EmptyState settings={settings} />
          ) : (
            messages.map((m) => <MessageRow key={m.id} message={m} />)
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-border/70">
        <div className="mx-auto w-full max-w-3xl p-3 sm:p-4">
          <div className="glass-strong flex items-end gap-2 rounded-md p-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder="Ask a question about your documents…"
              aria-label="Chat message"
              className="nice-scroll max-h-40 min-h-11 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
            />
            {streaming ? (
              <Button
                type="button"
                variant="destructive"
                size="icon"
                onClick={onStop}
                aria-label="Stop generating"
                title="Stop generating"
                className="size-11 shrink-0 rounded-xl"
              >
                <Square className="size-4" aria-hidden="true" />
              </Button>
            ) : (
              <Button
                type="button"
                size="icon"
                onClick={submit}
                disabled={!canSend}
                aria-label="Send message"
                title="Send message"
                className="size-11 shrink-0 rounded-xl"
              >
                <Send className="size-4" aria-hidden="true" />
              </Button>
            )}
          </div>
          <p className="mt-1.5 hidden px-1 text-[10px] text-dim sm:block">
            <kbd className="rounded border border-border bg-secondary/60 px-1 py-px font-mono">
              Enter
            </kbd>{' '}
            to send ·{' '}
            <kbd className="rounded border border-border bg-secondary/60 px-1 py-px font-mono">
              Shift
            </kbd>
            +
            <kbd className="rounded border border-border bg-secondary/60 px-1 py-px font-mono">
              Enter
            </kbd>{' '}
            for a new line
          </p>
        </div>
      </div>
    </section>
  )
}
