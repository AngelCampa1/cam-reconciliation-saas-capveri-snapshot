import { cn } from '@/lib/utils'

/**
 * Skeleton loading placeholder component.
 *
 * Features:
 * - Animated pulse effect for loading indication
 * - Respects reduced motion preferences
 * - Flexible sizing via className
 * - Pre-built variants for common content types
 *
 * @example
 * ```tsx
 * // Basic skeleton (customize with className)
 * <Skeleton className="h-4 w-[250px]" />
 *
 * // Avatar skeleton
 * <Skeleton className="h-12 w-12 rounded-full" />
 *
 * // Card skeleton
 * <Skeleton className="h-[125px] w-full rounded-xl" />
 *
 * // Pre-built variants
 * <SkeletonText lines={3} />
 * <SkeletonCard />
 * <SkeletonAvatar size="lg" />
 * <SkeletonTableRow columns={5} />
 * ```
 */
function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-muted', className)}
      aria-hidden="true"
      data-testid="skeleton"
      {...props}
    />
  )
}

export interface SkeletonTextProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Number of text lines to display */
  lines?: number
  /** Whether the last line should be shorter (more natural text appearance) */
  lastLineShort?: boolean
}

/**
 * Pre-built skeleton for text content.
 * Renders multiple lines with realistic text-like widths.
 */
function SkeletonText({
  lines = 3,
  lastLineShort = true,
  className,
  ...props
}: SkeletonTextProps) {
  return (
    <div
      className={cn('space-y-2', className)}
      aria-hidden="true"
      data-testid="skeleton-text"
      {...props}
    >
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          className={cn(
            'h-4',
            lastLineShort && index === lines - 1 ? 'w-3/4' : 'w-full'
          )}
        />
      ))}
    </div>
  )
}

export interface SkeletonCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Whether to show an image placeholder at the top */
  showImage?: boolean
  /** Whether to show a header section */
  showHeader?: boolean
  /** Number of text lines in the body */
  bodyLines?: number
}

/**
 * Pre-built skeleton for card content.
 * Renders a card-shaped placeholder with optional image and header sections.
 */
function SkeletonCard({
  showImage = false,
  showHeader = true,
  bodyLines = 2,
  className,
  ...props
}: SkeletonCardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-4 shadow-card space-y-4',
        className
      )}
      aria-hidden="true"
      data-testid="skeleton-card"
      {...props}
    >
      {showImage && (
        <Skeleton
          className="h-32 w-full rounded-md"
          data-testid="skeleton-card-image"
        />
      )}
      {showHeader && (
        <div className="space-y-2">
          <Skeleton className="h-5 w-1/2" data-testid="skeleton-card-title" />
          <Skeleton
            className="h-3 w-1/3"
            data-testid="skeleton-card-subtitle"
          />
        </div>
      )}
      {bodyLines > 0 && <SkeletonText lines={bodyLines} />}
    </div>
  )
}

export type SkeletonAvatarSize = 'sm' | 'md' | 'lg' | 'xl'

export interface SkeletonAvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Size of the avatar skeleton */
  size?: SkeletonAvatarSize
}

const avatarSizeClasses: Record<SkeletonAvatarSize, string> = {
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-12 w-12',
  xl: 'h-16 w-16',
}

/**
 * Pre-built skeleton for avatar/image placeholders.
 * Renders a circular placeholder in various sizes.
 */
function SkeletonAvatar({
  size = 'md',
  className,
  ...props
}: SkeletonAvatarProps) {
  return (
    <Skeleton
      className={cn('rounded-full', avatarSizeClasses[size], className)}
      data-testid="skeleton-avatar"
      {...props}
    />
  )
}

export interface SkeletonTableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  /** Number of columns in the row */
  columns?: number
  /** Whether to show a checkbox column first */
  showCheckbox?: boolean
}

/**
 * Pre-built skeleton for table rows.
 * Renders a table row with skeleton cells.
 */
function SkeletonTableRow({
  columns = 4,
  showCheckbox = false,
  className,
  ...props
}: SkeletonTableRowProps) {
  const totalColumns = showCheckbox ? columns + 1 : columns

  return (
    <tr
      className={cn('border-b', className)}
      aria-hidden="true"
      data-testid="skeleton-table-row"
      {...props}
    >
      {showCheckbox && (
        <td className="px-4 py-3">
          <Skeleton className="h-4 w-4 rounded" />
        </td>
      )}
      {Array.from({ length: columns }).map((_, index) => (
        <td key={index} className="px-4 py-3">
          <Skeleton
            className={cn(
              'h-4',
              // Vary widths for more natural appearance
              index === 0
                ? 'w-24'
                : index === totalColumns - 1
                  ? 'w-16'
                  : 'w-full max-w-[120px]'
            )}
          />
        </td>
      ))}
    </tr>
  )
}

export interface SkeletonImageProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Aspect ratio of the image */
  aspectRatio?: 'square' | 'video' | 'portrait' | 'wide'
}

const aspectRatioClasses: Record<string, string> = {
  square: 'aspect-square',
  video: 'aspect-video',
  portrait: 'aspect-[3/4]',
  wide: 'aspect-[2/1]',
}

/**
 * Pre-built skeleton for image placeholders.
 * Renders a rectangular placeholder with common aspect ratios.
 */
function SkeletonImage({
  aspectRatio = 'video',
  className,
  ...props
}: SkeletonImageProps) {
  return (
    <Skeleton
      className={cn(
        'w-full rounded-md',
        aspectRatioClasses[aspectRatio],
        className
      )}
      data-testid="skeleton-image"
      {...props}
    />
  )
}

export {
  Skeleton,
  SkeletonText,
  SkeletonCard,
  SkeletonAvatar,
  SkeletonTableRow,
  SkeletonImage,
}
