import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  Skeleton,
  SkeletonText,
  SkeletonCard,
  SkeletonAvatar,
  SkeletonTableRow,
  SkeletonImage,
} from './skeleton'

describe('Skeleton', () => {
  describe('Base Component', () => {
    it('should render with default classes', () => {
      render(<Skeleton />)

      const skeleton = screen.getByTestId('skeleton')
      expect(skeleton).toBeInTheDocument()
      expect(skeleton).toHaveClass('animate-pulse')
      expect(skeleton).toHaveClass('rounded-md')
      expect(skeleton).toHaveClass('bg-muted')
    })

    it('should be hidden from screen readers', () => {
      render(<Skeleton />)

      const skeleton = screen.getByTestId('skeleton')
      expect(skeleton).toHaveAttribute('aria-hidden', 'true')
    })

    it('should accept custom className', () => {
      render(<Skeleton className="h-4 w-[250px]" />)

      const skeleton = screen.getByTestId('skeleton')
      expect(skeleton).toHaveClass('h-4')
      expect(skeleton).toHaveClass('w-[250px]')
    })

    it('should accept custom props', () => {
      render(<Skeleton data-custom="test" />)

      const skeleton = screen.getByTestId('skeleton')
      expect(skeleton).toHaveAttribute('data-custom', 'test')
    })

    it('should render text line skeleton', () => {
      render(<Skeleton className="h-4 w-full" />)

      const skeleton = screen.getByTestId('skeleton')
      expect(skeleton).toHaveClass('h-4')
      expect(skeleton).toHaveClass('w-full')
    })

    it('should render avatar skeleton', () => {
      render(<Skeleton className="h-12 w-12 rounded-full" />)

      const skeleton = screen.getByTestId('skeleton')
      expect(skeleton).toHaveClass('h-12')
      expect(skeleton).toHaveClass('w-12')
      expect(skeleton).toHaveClass('rounded-full')
    })

    it('should render card skeleton', () => {
      render(<Skeleton className="h-[125px] w-full rounded-xl" />)

      const skeleton = screen.getByTestId('skeleton')
      expect(skeleton).toHaveClass('h-[125px]')
      expect(skeleton).toHaveClass('rounded-xl')
    })
  })
})

describe('SkeletonText', () => {
  it('should render with default 3 lines', () => {
    render(<SkeletonText />)

    const container = screen.getByTestId('skeleton-text')
    expect(container).toBeInTheDocument()
    expect(container.children).toHaveLength(3)
  })

  it('should render specified number of lines', () => {
    render(<SkeletonText lines={5} />)

    const container = screen.getByTestId('skeleton-text')
    expect(container.children).toHaveLength(5)
  })

  it('should make last line shorter by default', () => {
    render(<SkeletonText lines={3} />)

    const container = screen.getByTestId('skeleton-text')
    const lastLine = container.children[2]
    expect(lastLine).toHaveClass('w-3/4')
  })

  it('should not make last line shorter when lastLineShort is false', () => {
    render(<SkeletonText lines={3} lastLineShort={false} />)

    const container = screen.getByTestId('skeleton-text')
    const lastLine = container.children[2]
    expect(lastLine).toHaveClass('w-full')
  })

  it('should be hidden from screen readers', () => {
    render(<SkeletonText />)

    const container = screen.getByTestId('skeleton-text')
    expect(container).toHaveAttribute('aria-hidden', 'true')
  })

  it('should accept custom className', () => {
    render(<SkeletonText className="my-custom-class" />)

    const container = screen.getByTestId('skeleton-text')
    expect(container).toHaveClass('my-custom-class')
  })
})

describe('SkeletonCard', () => {
  it('should render with default props', () => {
    render(<SkeletonCard />)

    const card = screen.getByTestId('skeleton-card')
    expect(card).toBeInTheDocument()
    expect(card).toHaveClass('rounded-lg')
    expect(card).toHaveClass('border')
  })

  it('should show header by default', () => {
    render(<SkeletonCard />)

    expect(screen.getByTestId('skeleton-card-title')).toBeInTheDocument()
    expect(screen.getByTestId('skeleton-card-subtitle')).toBeInTheDocument()
  })

  it('should hide header when showHeader is false', () => {
    render(<SkeletonCard showHeader={false} />)

    expect(screen.queryByTestId('skeleton-card-title')).not.toBeInTheDocument()
    expect(
      screen.queryByTestId('skeleton-card-subtitle')
    ).not.toBeInTheDocument()
  })

  it('should not show image by default', () => {
    render(<SkeletonCard />)

    expect(screen.queryByTestId('skeleton-card-image')).not.toBeInTheDocument()
  })

  it('should show image when showImage is true', () => {
    render(<SkeletonCard showImage />)

    expect(screen.getByTestId('skeleton-card-image')).toBeInTheDocument()
  })

  it('should render body lines', () => {
    render(<SkeletonCard bodyLines={4} />)

    const textSkeleton = screen.getByTestId('skeleton-text')
    expect(textSkeleton.children).toHaveLength(4)
  })

  it('should hide body when bodyLines is 0', () => {
    render(<SkeletonCard bodyLines={0} />)

    expect(screen.queryByTestId('skeleton-text')).not.toBeInTheDocument()
  })

  it('should be hidden from screen readers', () => {
    render(<SkeletonCard />)

    const card = screen.getByTestId('skeleton-card')
    expect(card).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('SkeletonAvatar', () => {
  it('should render with default medium size', () => {
    render(<SkeletonAvatar />)

    const avatar = screen.getByTestId('skeleton-avatar')
    expect(avatar).toBeInTheDocument()
    expect(avatar).toHaveClass('rounded-full')
    expect(avatar).toHaveClass('h-10')
    expect(avatar).toHaveClass('w-10')
  })

  it('should render small size', () => {
    render(<SkeletonAvatar size="sm" />)

    const avatar = screen.getByTestId('skeleton-avatar')
    expect(avatar).toHaveClass('h-8')
    expect(avatar).toHaveClass('w-8')
  })

  it('should render large size', () => {
    render(<SkeletonAvatar size="lg" />)

    const avatar = screen.getByTestId('skeleton-avatar')
    expect(avatar).toHaveClass('h-12')
    expect(avatar).toHaveClass('w-12')
  })

  it('should render extra large size', () => {
    render(<SkeletonAvatar size="xl" />)

    const avatar = screen.getByTestId('skeleton-avatar')
    expect(avatar).toHaveClass('h-16')
    expect(avatar).toHaveClass('w-16')
  })

  it('should accept custom className', () => {
    render(<SkeletonAvatar className="border-2" />)

    const avatar = screen.getByTestId('skeleton-avatar')
    expect(avatar).toHaveClass('border-2')
  })
})

describe('SkeletonTableRow', () => {
  it('should render with default 4 columns', () => {
    render(
      <table>
        <tbody>
          <SkeletonTableRow />
        </tbody>
      </table>
    )

    const row = screen.getByTestId('skeleton-table-row')
    expect(row).toBeInTheDocument()
    expect(row.querySelectorAll('td')).toHaveLength(4)
  })

  it('should render specified number of columns', () => {
    render(
      <table>
        <tbody>
          <SkeletonTableRow columns={6} />
        </tbody>
      </table>
    )

    const row = screen.getByTestId('skeleton-table-row')
    expect(row.querySelectorAll('td')).toHaveLength(6)
  })

  it('should add checkbox column when showCheckbox is true', () => {
    render(
      <table>
        <tbody>
          <SkeletonTableRow columns={3} showCheckbox />
        </tbody>
      </table>
    )

    const row = screen.getByTestId('skeleton-table-row')
    expect(row.querySelectorAll('td')).toHaveLength(4) // 3 + 1 checkbox
  })

  it('should have border on row', () => {
    render(
      <table>
        <tbody>
          <SkeletonTableRow />
        </tbody>
      </table>
    )

    const row = screen.getByTestId('skeleton-table-row')
    expect(row).toHaveClass('border-b')
  })

  it('should be hidden from screen readers', () => {
    render(
      <table>
        <tbody>
          <SkeletonTableRow />
        </tbody>
      </table>
    )

    const row = screen.getByTestId('skeleton-table-row')
    expect(row).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('SkeletonImage', () => {
  it('should render with default video aspect ratio', () => {
    render(<SkeletonImage />)

    const image = screen.getByTestId('skeleton-image')
    expect(image).toBeInTheDocument()
    expect(image).toHaveClass('aspect-video')
  })

  it('should render square aspect ratio', () => {
    render(<SkeletonImage aspectRatio="square" />)

    const image = screen.getByTestId('skeleton-image')
    expect(image).toHaveClass('aspect-square')
  })

  it('should render portrait aspect ratio', () => {
    render(<SkeletonImage aspectRatio="portrait" />)

    const image = screen.getByTestId('skeleton-image')
    expect(image).toHaveClass('aspect-[3/4]')
  })

  it('should render wide aspect ratio', () => {
    render(<SkeletonImage aspectRatio="wide" />)

    const image = screen.getByTestId('skeleton-image')
    expect(image).toHaveClass('aspect-[2/1]')
  })

  it('should have rounded corners', () => {
    render(<SkeletonImage />)

    const image = screen.getByTestId('skeleton-image')
    expect(image).toHaveClass('rounded-md')
  })

  it('should accept custom className', () => {
    render(<SkeletonImage className="border" />)

    const image = screen.getByTestId('skeleton-image')
    expect(image).toHaveClass('border')
  })
})

describe('Skeleton Accessibility', () => {
  it('base skeleton should be aria-hidden', () => {
    render(<Skeleton />)
    expect(screen.getByTestId('skeleton')).toHaveAttribute(
      'aria-hidden',
      'true'
    )
  })

  it('skeleton text should be aria-hidden', () => {
    render(<SkeletonText />)
    expect(screen.getByTestId('skeleton-text')).toHaveAttribute(
      'aria-hidden',
      'true'
    )
  })

  it('skeleton card should be aria-hidden', () => {
    render(<SkeletonCard />)
    expect(screen.getByTestId('skeleton-card')).toHaveAttribute(
      'aria-hidden',
      'true'
    )
  })

  it('skeleton avatar should be aria-hidden', () => {
    render(<SkeletonAvatar />)
    expect(screen.getByTestId('skeleton-avatar')).toHaveAttribute(
      'aria-hidden',
      'true'
    )
  })

  it('skeleton image should be aria-hidden', () => {
    render(<SkeletonImage />)
    expect(screen.getByTestId('skeleton-image')).toHaveAttribute(
      'aria-hidden',
      'true'
    )
  })
})

describe('Skeleton Animation', () => {
  it('should have pulse animation class', () => {
    render(<Skeleton />)

    const skeleton = screen.getByTestId('skeleton')
    expect(skeleton).toHaveClass('animate-pulse')
  })
})
