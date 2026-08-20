/**
 * VideoModal
 *
 * Lightbox that streams a YouTube video via the privacy-friendly
 * youtube-nocookie.com embed.  The iframe is NOT mounted until the
 * dialog is open (click-to-load) so it never makes network requests
 * in the background.
 */
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { getEmbedUrl } from '@/generated/videos'
import type { Video } from '@/generated/videos'

export interface VideoModalProps {
  video: Video
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function VideoModal({ video, open, onOpenChange }: VideoModalProps) {
  const embedBase = getEmbedUrl(video.slug)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden">
        <DialogTitle className="sr-only">{video.title}</DialogTitle>
        {open && embedBase && (
          <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
            <iframe
              src={`${embedBase}?autoplay=1`}
              title={video.title}
              className="absolute inset-0 h-full w-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
              loading="lazy"
              data-testid="video-iframe"
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
