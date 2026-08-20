/**
 * Shared pagination helper — creates the 7-field paginated envelope that
 * mirrors Python's PaginatedResponse computed fields (total_pages, has_next,
 * has_previous).
 *
 * Used by audit-trail routes and will be reused to retrofit export-history.
 */

export type PaginatedResponse<T> = {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  has_next: boolean;
  has_previous: boolean;
};

export type PaginatedResponseInput<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

/**
 * Build a paginated response envelope.
 *
 * Matches Python's PaginatedResponse computed fields exactly:
 *   total_pages = total === 0 ? 0 : ceil(total / page_size)
 *   has_next    = page < total_pages
 *   has_previous = page > 1
 */
export function createPaginatedResponse<T>(
  input: PaginatedResponseInput<T>,
): PaginatedResponse<T> {
  const { items, total, page, pageSize } = input;
  const total_pages = total === 0 ? 0 : Math.ceil(total / pageSize);
  return {
    items,
    total,
    page,
    page_size: pageSize,
    total_pages,
    has_next: page < total_pages,
    has_previous: page > 1,
  };
}
