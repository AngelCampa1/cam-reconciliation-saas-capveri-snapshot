/**
 * VideoCard
 *
 * Combines VideoThumbnail with the video's shortLabel and description.
 * Use in empty-states and help surfaces where a bit more context helps.
 */
import { cn } from '@/lib/utils'
import type { Video } from '@/generated/videos'
import { VideoThumbnail } from './VideoThumbnail'

export interface VideoCardProps {
  video: Video
  className?: string
}

export function VideoCard({ video, className }: VideoCardProps) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <VideoThumbnail video={video} />
      <div>
        <p className="text-sm font-semibold text-foreground">
          {video.shortLabel}
        </p>
        <p className="text-xs text-muted-foreground">{video.description}</p>
      </div>
    </div>
  )
}
