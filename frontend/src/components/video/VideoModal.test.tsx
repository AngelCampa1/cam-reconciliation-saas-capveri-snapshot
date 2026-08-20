import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { VideoModal } from './VideoModal'
import type { Video } from '@/generated/videos'

const mockVideo: Video = {
  slug: 'cam-reconciliation-validate',
  youtubeId: 'odNNkE1SfLs',
  title: 'CAM Reconciliation: Catch the Error Before Your Tenant Does',
  shortLabel: 'Catch CAM errors first',
  description: 'Check your CAM bill before you send it.',
  stage: 'awareness',
  durationSeconds: 245,
  uploadDate: '2026-06-02',
  thumbnailUrl: 'https://i.ytimg.com/vi/odNNkE1SfLs/hqdefault.jpg',
  placements: ['app-reconciliations-empty'],
}

describe('VideoModal', () => {
  it('does not render an iframe when closed', () => {
    render(<VideoModal video={mockVideo} open={false} onOpenChange={vi.fn()} />)
    expect(screen.queryByTestId('video-iframe')).not.toBeInTheDocument()
  })

  it('renders the iframe with nocookie src when open', () => {
    render(<VideoModal video={mockVideo} open={true} onOpenChange={vi.fn()} />)
    const iframe = screen.getByTestId('video-iframe')
    expect(iframe).toBeInTheDocument()
    expect(iframe).toHaveAttribute(
      'src',
      `https://www.youtube-nocookie.com/embed/${mockVideo.youtubeId}?autoplay=1`
    )
    expect(iframe).toHaveAttribute('allowFullScreen')
  })

  it('uses the video title as the accessible dialog title (sr-only)', () => {
    render(<VideoModal video={mockVideo} open={true} onOpenChange={vi.fn()} />)
    // DialogTitle is rendered (sr-only class) — querying by role "dialog" title
    expect(screen.getByText(mockVideo.title)).toBeInTheDocument()
  })
})
