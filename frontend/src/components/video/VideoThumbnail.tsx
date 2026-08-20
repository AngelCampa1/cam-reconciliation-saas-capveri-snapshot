/**
 * VideoThumbnail
 *
 * Shows a video's thumbnail image with a circular play-button overlay.
 * Clicking opens a VideoModal lightbox.
 */
import { useState } from 'react'
import { Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Video } from '@/generated/videos'
import { VideoModal } from './VideoModal'

export interface VideoThumbnailProps {
  /** A full Video object from the generated module. */
  video: Video
  className?: string
}

export function VideoThumbnail({ video, className }: VideoThumbnailProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Watch: ${video.title}`}
        className={cn(
          'group relative aspect-video w-full overflow-hidden rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          className
        )}
      >
        <img
          src={video.thumbnailUrl}
          alt={video.title}
          className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
          loading="lazy"
        />
        {/* Play button overlay — pill/circle per design canon */}
        <span
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/60 text-white transition-transform duration-200 group-hover:scale-110 group-focus-visible:scale-110">
            <Play className="h-6 w-6 fill-current" />
          </span>
        </span>
      </button>

      <VideoModal video={video} open={open} onOpenChange={setOpen} />
    </>
  )
}
