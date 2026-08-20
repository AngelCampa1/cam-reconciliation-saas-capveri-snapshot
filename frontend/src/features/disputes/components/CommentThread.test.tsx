/**
 * CommentThread Tests
 *
 * Tests for the comment thread display component.
 */
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { CommentThread, commentAuthorLabel } from './CommentThread'
import type { DisputeCommentDTO } from '@/api/hooks'

const mockComments: DisputeCommentDTO[] = [
  {
    id: 'comment-1',
    dispute_id: 'dispute-1',
    author_id: 'user-1',
    author_name: 'John Tenant',
    content: 'This charge seems incorrect',
    is_internal: false,
    created_at: '2024-01-15T10:00:00Z',
  },
  {
    id: 'comment-2',
    dispute_id: 'dispute-1',
    author_id: 'user-2',
    author_name: 'Admin User',
    content: 'Internal note: need to verify with accounting',
    is_internal: true,
    created_at: '2024-01-15T11:00:00Z',
  },
  {
    id: 'comment-3',
    dispute_id: 'dispute-1',
    author_id: 'user-2',
    author_name: 'Admin User',
    content: 'We have reviewed and found an error',
    is_internal: false,
    created_at: '2024-01-15T12:00:00Z',
  },
]

describe('CommentThread', () => {
  it('renders all comments in chronological order', () => {
    render(<CommentThread comments={mockComments} />)

    const comments = screen.getAllByTestId(/^comment-/)
    expect(comments).toHaveLength(3)

    // First comment should be first (chronological)
    expect(comments[0]).toHaveTextContent('This charge seems incorrect')
    expect(comments[1]).toHaveTextContent('Internal note')
    expect(comments[2]).toHaveTextContent('We have reviewed')
  })

  it('displays author name for each comment', () => {
    render(<CommentThread comments={mockComments} />)

    expect(screen.getByText('John Tenant')).toBeInTheDocument()
    expect(screen.getAllByText('Admin User')).toHaveLength(2)
  })

  it('shows Internal badge for internal comments', () => {
    render(<CommentThread comments={mockComments} />)

    // Only one internal comment
    const internalBadges = screen.getAllByText('Internal')
    expect(internalBadges).toHaveLength(1)
  })

  it('applies different styling to internal comments', () => {
    render(<CommentThread comments={mockComments} />)

    const internalComment = screen.getByTestId('comment-comment-2')
    expect(internalComment).toHaveClass('bg-muted/30')
    expect(internalComment).toHaveClass('border-l-2')
  })

  it('renders empty state when no comments', () => {
    render(<CommentThread comments={[]} />)

    expect(screen.getByText(/no comments yet/i)).toBeInTheDocument()
  })

  it('labels the viewer\'s own comment as "You"', () => {
    render(<CommentThread comments={mockComments} currentUserId="user-1" />)

    expect(screen.getByText('You')).toBeInTheDocument()
    // Other author still shown by name
    expect(screen.getAllByText('Admin User')).toHaveLength(2)
    // The viewer's stored name is replaced by "You"
    expect(screen.queryByText('John Tenant')).not.toBeInTheDocument()
  })

  it('never shows a raw "Unknown" author', () => {
    const nameless: DisputeCommentDTO[] = [
      {
        id: 'comment-x',
        dispute_id: 'dispute-1',
        author_id: 'ghost',
        author_name: undefined,
        content: 'No name on this one',
        is_internal: false,
        created_at: '2024-01-15T10:00:00Z',
      },
    ]
    render(<CommentThread comments={nameless} />)

    expect(screen.getByText('Participant')).toBeInTheDocument()
    expect(screen.queryByText('Unknown')).not.toBeInTheDocument()
  })
})

describe('commentAuthorLabel', () => {
  const base = { author_id: 'user-1', author_name: 'John Tenant' }

  it('returns "You" for the current viewer', () => {
    expect(commentAuthorLabel(base, 'user-1')).toBe('You')
  })

  it('returns the stored name for other authors', () => {
    expect(commentAuthorLabel(base, 'user-2')).toBe('John Tenant')
  })

  it('falls back to "Participant" when no name and not the viewer', () => {
    expect(commentAuthorLabel({ author_id: 'x', author_name: undefined })).toBe(
      'Participant'
    )
    expect(commentAuthorLabel({ author_id: 'x', author_name: '   ' })).toBe(
      'Participant'
    )
  })
})
