'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, FileText, Loader2, Plus, Trash2, Upload, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ACCEPT_ATTR,
  type ConversationSummary,
  type DocumentStatus,
  type RagDocument,
} from '@/lib/api-client'
import { cn } from '@/lib/utils'

interface SidebarProps {
  conversations: ConversationSummary[]
  activeConversationId: string | null
  documents: RagDocument[]
  loadingConversations: boolean
  loadingDocuments: boolean
  onSelectConversation: (id: string) => void
  onNewChat: () => void
  onDeleteConversation: (id: string) => void
  onFilesSelected: (files: File[]) => void
  onDeleteDocument: (id: string) => void
  /** Re-fetch documents — polled every 2.5s while anything is processing. */
  onRefreshDocuments: () => void
  className?: string
}

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function DocStatusBadge({ doc }: { doc: RagDocument }) {
  const status: DocumentStatus = doc.status
  if (status === 'processing') {
    return (
      <Badge variant="secondary" className="shrink-0 gap-1 bg-secondary text-dim">
        <Loader2 className="size-3 animate-spin" aria-hidden="true" />
        processing
      </Badge>
    )
  }
  if (status === 'ready') {
    return (
      <Badge variant="outline" className="shrink-0 gap-1 border-emerald-600/50 text-emerald-500">
        <Check className="size-3" aria-hidden="true" />
        ready
      </Badge>
    )
  }
  return (
    <Badge variant="destructive" className="shrink-0 gap-1" title={doc.error ?? 'Processing failed'}>
      <X className="size-3" aria-hidden="true" />
      error
    </Badge>
  )
}

/**
 * Left rail: Chats (new + list) and Knowledge base (dropzone + documents).
 * Used inline on lg+ screens and inside a Sheet on mobile.
 */
export function Sidebar({
  conversations,
  activeConversationId,
  documents,
  loadingConversations,
  loadingDocuments,
  onSelectConversation,
  onNewChat,
  onDeleteConversation,
  onFilesSelected,
  onDeleteDocument,
  onRefreshDocuments,
  className,
}: SidebarProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [dragOver, setDragOver] = useState(false)

  // Poll every 2.5s while at least one document is still processing.
  const hasProcessing = documents.some((d) => d.status === 'processing')
  useEffect(() => {
    if (!hasProcessing) return
    const timer = window.setInterval(() => onRefreshDocuments(), 2500)
    return () => window.clearInterval(timer)
  }, [hasProcessing, onRefreshDocuments])

  const handleDeleteConversation = (conversation: ConversationSummary) => {
    if (window.confirm(`Delete "${conversation.title}" and all its messages?`)) {
      onDeleteConversation(conversation.id)
    }
  }

  const handleDeleteDocument = (doc: RagDocument) => {
    if (window.confirm(`Remove "${doc.name}" from the knowledge base?`)) {
      onDeleteDocument(doc.id)
    }
  }

  return (
    <aside className={cn('glass flex flex-col overflow-hidden', className)} aria-label="Sidebar">
      {/* ── Chats ──────────────────────────────────────────────────── */}
      <div className="flex shrink-0 flex-col border-b border-border/70">
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h2 className="text-[11px] font-semibold tracking-[0.14em] uppercase text-dim">Chats</h2>
          <span className="text-[10px] text-dim">{conversations.length}</span>
        </div>

        <div className="px-3 pb-1">
          <Button size="sm" className="w-full justify-start gap-2" onClick={onNewChat}>
            <Plus className="size-4" aria-hidden="true" />
            New chat
          </Button>
        </div>

        <nav aria-label="Conversations" className="nice-scroll max-h-[26vh] min-h-20 overflow-y-auto px-2 pt-2 pb-3">
          {loadingConversations ? (
            <div className="space-y-1.5 px-1">
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
          ) : conversations.length === 0 ? (
            <p className="px-3 py-3 text-xs text-dim">No chats yet — hit New chat.</p>
          ) : (
            <ul className="space-y-1">
              {conversations.map((c) => {
                const active = c.id === activeConversationId
                return (
                  <li key={c.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => onSelectConversation(c.id)}
                      aria-current={active ? 'true' : undefined}
                      className={cn(
                        'w-full rounded-lg border-l-2 px-3 py-1.5 pr-9 text-left transition-colors',
                        active
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                      )}
                    >
                      <span className="block truncate text-sm">{c.title}</span>
                      <span className="block text-[10px] text-dim">{formatWhen(c.updatedAt)}</span>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteConversation(c)
                      }}
                      aria-label={`Delete chat ${c.title}`}
                      title="Delete chat"
                      className="absolute top-1/2 right-1 size-7 -translate-y-1/2 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
        </nav>
      </div>

      {/* ── Knowledge base ─────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h2 className="text-[11px] font-semibold tracking-[0.14em] uppercase text-dim">
            Knowledge base
          </h2>
          <span className="text-[10px] text-dim">{documents.length} docs</span>
        </div>

        <div className="px-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              const files = Array.from(e.dataTransfer.files)
              if (files.length > 0) onFilesSelected(files)
            }}
            className={cn(
              'flex w-full flex-col items-center gap-1 rounded-xl border border-dashed px-3 py-4 text-xs transition-colors',
              dragOver
                ? 'border-primary bg-primary/10 text-foreground'
                : 'border-border text-muted-foreground hover:border-primary/60 hover:text-foreground',
            )}
            aria-label="Upload documents: drop files here or click to browse"
          >
            <Upload className="size-4" aria-hidden="true" />
            <span>Drop PDFs or images here</span>
            <span className="text-[10px] text-dim">or click to browse</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPT_ATTR}
            className="hidden"
            aria-label="Upload documents"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? [])
              if (files.length > 0) onFilesSelected(files)
              e.target.value = '' // allow re-selecting the same file
            }}
          />
        </div>

        <div aria-label="Documents" className="nice-scroll max-h-[34vh] min-h-20 flex-1 overflow-y-auto px-2 pt-2 pb-3">
          {loadingDocuments ? (
            <div className="space-y-1.5 px-1">
              <Skeleton className="h-11 w-full rounded-lg" />
              <Skeleton className="h-11 w-full rounded-lg" />
              <Skeleton className="h-11 w-full rounded-lg" />
            </div>
          ) : documents.length === 0 ? (
            <p className="px-3 py-3 text-xs text-dim">The beast is hungry — feed it some PDFs.</p>
          ) : (
            <ul className="space-y-1">
              {documents.map((doc) => (
                <li
                  key={doc.id}
                  className="group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-accent/40"
                >
                  <FileText className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs" title={doc.name}>
                      {doc.name}
                    </p>
                    <p className="truncate text-[10px] text-dim">
                      {[
                        formatSize(doc.size),
                        doc.pages > 0 ? `${doc.pages}p` : null,
                        doc.chunkCount > 0 ? `${doc.chunkCount} chunks` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <DocStatusBadge doc={doc} />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteDocument(doc)}
                    aria-label={`Delete document ${doc.name}`}
                    title="Delete document"
                    className="size-7 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </aside>
  )
}
