import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect } from 'vitest'
import { VideoThumbnail } from './VideoThumbnail'
import type { Video } from '@/generated/videos'

const mockVideo: Video = {
  slug: 'walkthrough-yardi-csv',
  youtubeId: 'kCMogQ3ZJck',
  title: 'CAM Reconciliation Demo: Upload a Yardi CSV and Catch the Errors',
  shortLabel: 'Watch a quick demo',
  description: 'Watch us upload a Yardi file and find CAM errors fast.',
  stage: 'demo',
  durationSeconds: 212,
  uploadDate: '2026-06-02',
  thumbnailUrl: 'https://i.ytimg.com/vi/kCMogQ3ZJck/hqdefault.jpg',
  placements: ['app-first-import', 'app-onboarding-welcome'],
}

describe('VideoThumbnail', () => {
  it('renders the thumbnail image and play button', () => {
    render(<VideoThumbnail video={mockVideo} />)
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('src', mockVideo.thumbnailUrl)
    expect(img).toHaveAttribute('alt', mockVideo.title)
    expect(screen.getByRole('button', { name: /watch:/i })).toBeInTheDocument()
  })

  it('does not render an iframe before the button is clicked', () => {
    render(<VideoThumbnail video={mockVideo} />)
    expect(screen.queryByTestId('video-iframe')).not.toBeInTheDocument()
  })

  it('opens the modal with an iframe after clicking the thumbnail', async () => {
    const user = userEvent.setup()
    render(<VideoThumbnail video={mockVideo} />)

    await user.click(screen.getByRole('button', { name: /watch:/i }))

    const iframe = screen.getByTestId('video-iframe')
    expect(iframe).toBeInTheDocument()
    expect(iframe).toHaveAttribute(
      'src',
      expect.stringContaining('youtube-nocookie.com')
    )
    expect(iframe).toHaveAttribute('src', expect.stringContaining('autoplay=1'))
    expect(iframe).toHaveAttribute(
      'src',
      expect.stringContaining(mockVideo.youtubeId)
    )
  })
})
