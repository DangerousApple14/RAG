'use client'

interface BackgroundLayerProps {
  /** Resolved background image URL (null while loading — plain dark backdrop). */
  src: string | null
}

/**
 * Full-viewport fixed photo layer sitting behind everything (-z-10),
 * with the mandated black translucent `.bg-overlay` on top of the photo.
 */
export function BackgroundLayer({ src }: BackgroundLayerProps) {
  return (
    <div aria-hidden="true" className="fixed inset-0 -z-10">
      {src ? (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url("${src}")` }}
        />
      ) : (
        <div className="absolute inset-0 bg-background" />
      )}
      <div className="bg-overlay absolute inset-0" />
    </div>
  )
}
