'use client'

import { useState } from 'react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LEGAL_DOCS, type LegalDoc } from '@/lib/legal'

function LegalBody({ doc }: { doc: LegalDoc }) {
  return (
    <div className="space-y-5 pr-2 text-sm leading-relaxed">
      <p className="rounded-lg border border-border/60 bg-background/40 p-3 text-muted-foreground">
        {doc.intro}
      </p>
      {doc.sections.map((section) => (
        <section key={section.heading}>
          <h3 className="mb-1.5 font-semibold tracking-wide">{section.heading}</h3>
          {section.paragraphs?.map((p, i) => (
            <p key={i} className="mb-2 text-muted-foreground">
              {p}
            </p>
          ))}
          {section.bullets ? (
            <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground">
              {section.bullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}
      <p className="pt-2 text-xs text-dim">
        Version {doc.id === 'terms' ? '1.0' : '1.0'} · last updated {doc.updated}. Template for the
        operator — adapt the bracketed placeholders before running a public instance.
      </p>
    </div>
  )
}

interface LegalViewerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Which document to show first. */
  initial?: 'terms' | 'privacy'
}

/** In-app Terms of Service + Privacy Policy viewer (single-route app). */
export function LegalViewer({ open, onOpenChange, initial = 'terms' }: LegalViewerProps) {
  const [tab, setTab] = useState<'terms' | 'privacy'>(initial)

  // sync the initial tab each time the viewer opens
  const handleOpenChange = (next: boolean) => {
    if (next) setTab(initial)
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="glass-strong nice-scroll flex max-h-[90vh] flex-col rounded-xl sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Legal</DialogTitle>
          <DialogDescription>
            The ground rules and the data promise — both short enough to actually read.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'terms' | 'privacy')} className="flex min-h-0 flex-1 flex-col gap-3">
          <TabsList className="w-full shrink-0">
            <TabsTrigger value="terms" className="flex-1">
              Terms of Service
            </TabsTrigger>
            <TabsTrigger value="privacy" className="flex-1">
              Privacy Policy
            </TabsTrigger>
          </TabsList>

          <TabsContent value="terms" className="min-h-0 flex-1">
            <ScrollArea className="h-full max-h-[52vh] pr-3">
              <LegalBody doc={LEGAL_DOCS.terms} />
            </ScrollArea>
          </TabsContent>

          <TabsContent value="privacy" className="min-h-0 flex-1">
            <ScrollArea className="h-full max-h-[52vh] pr-3">
              <LegalBody doc={LEGAL_DOCS.privacy} />
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
