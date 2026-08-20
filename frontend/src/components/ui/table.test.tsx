import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from './table'

describe('Table', () => {
  describe('Table Component', () => {
    it('should render table', () => {
      render(
        <Table>
          <TableBody>
            <TableRow>
              <TableCell>Content</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      )

      expect(screen.getByTestId('table')).toBeInTheDocument()
    })

    it('should have scrollable container', () => {
      render(
        <Table>
          <TableBody>
            <TableRow>
              <TableCell>Content</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      )

      expect(screen.getByTestId('table-container')).toHaveClass('overflow-auto')
    })

    it('should support custom className', () => {
      render(
        <Table className="custom-table">
          <TableBody>
            <TableRow>
              <TableCell>Content</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      )

      expect(screen.getByTestId('table')).toHaveClass('custom-table')
    })
  })

  describe('TableHeader', () => {
    it('should render table header', () => {
      render(
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Header</TableHead>
            </TableRow>
          </TableHeader>
        </Table>
      )

      expect(screen.getByTestId('table-header')).toBeInTheDocument()
    })

    it('should have border styling on rows', () => {
      render(
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Header</TableHead>
            </TableRow>
          </TableHeader>
        </Table>
      )

      expect(screen.getByTestId('table-header')).toHaveClass('[&_tr]:border-b')
    })
  })

  describe('TableBody', () => {
    it('should render table body', () => {
      render(
        <Table>
          <TableBody>
            <TableRow>
              <TableCell>Content</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      )

      expect(screen.getByTestId('table-body')).toBeInTheDocument()
    })
  })

  describe('TableFooter', () => {
    it('should render table footer', () => {
      render(
        <Table>
          <TableBody>
            <TableRow>
              <TableCell>Content</TableCell>
            </TableRow>
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell>Footer</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      )

      expect(screen.getByTestId('table-footer')).toBeInTheDocument()
    })

    it('should have muted background', () => {
      render(
        <Table>
          <TableBody>
            <TableRow>
              <TableCell>Content</TableCell>
            </TableRow>
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell>Footer</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      )

      expect(screen.getByTestId('table-footer')).toHaveClass(
        'bg-[var(--table-footer-bg)]'
      )
    })
  })

  describe('TableRow', () => {
    it('should render table row', () => {
      render(
        <Table>
          <TableBody>
            <TableRow data-testid="test-row">
              <TableCell>Content</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      )

      expect(screen.getByTestId('test-row')).toBeInTheDocument()
    })

    it('should have hover state', () => {
      render(
        <Table>
          <TableBody>
            <TableRow data-testid="test-row">
              <TableCell>Content</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      )

      expect(screen.getByTestId('test-row')).toHaveClass(
        'hover:bg-[var(--table-row-bg-hover)]'
      )
    })

    it('should have selected state styling', () => {
      render(
        <Table>
          <TableBody>
            <TableRow data-testid="test-row" data-state="selected">
              <TableCell>Content</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      )

      expect(screen.getByTestId('test-row')).toHaveClass(
        'data-[state=selected]:bg-[var(--table-row-bg-selected)]'
      )
    })
  })

  describe('TableHead', () => {
    it('should render table head cell', () => {
      render(
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
            </TableRow>
          </TableHeader>
        </Table>
      )

      expect(screen.getByText('Name')).toBeInTheDocument()
    })

    it('should have muted foreground color', () => {
      render(
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead data-testid="table-head">Name</TableHead>
            </TableRow>
          </TableHeader>
        </Table>
      )

      expect(screen.getByTestId('table-head')).toHaveClass(
        'text-[var(--table-header-text)]'
      )
    })

    it('should have proper height', () => {
      render(
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead data-testid="table-head">Name</TableHead>
            </TableRow>
          </TableHeader>
        </Table>
      )

      expect(screen.getByTestId('table-head')).toHaveClass('h-11')
    })
  })

  describe('TableCell', () => {
    it('should render table cell', () => {
      render(
        <Table>
          <TableBody>
            <TableRow>
              <TableCell>Cell content</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      )

      expect(screen.getByText('Cell content')).toBeInTheDocument()
    })

    it('should have padding', () => {
      render(
        <Table>
          <TableBody>
            <TableRow>
              <TableCell data-testid="table-cell">Content</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      )

      expect(screen.getByTestId('table-cell')).toHaveClass('px-4')
      expect(screen.getByTestId('table-cell')).toHaveClass('py-3.5')
    })
  })

  describe('TableCaption', () => {
    it('should render table caption', () => {
      render(
        <Table>
          <TableCaption>A list of items</TableCaption>
          <TableBody>
            <TableRow>
              <TableCell>Content</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      )

      expect(screen.getByTestId('table-caption')).toBeInTheDocument()
      expect(screen.getByText('A list of items')).toBeInTheDocument()
    })

    it('should have muted foreground color', () => {
      render(
        <Table>
          <TableCaption>Caption text</TableCaption>
          <TableBody>
            <TableRow>
              <TableCell>Content</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      )

      expect(screen.getByTestId('table-caption')).toHaveClass(
        'text-muted-foreground'
      )
    })
  })

  describe('Complete Table', () => {
    it('should render complete table structure', () => {
      render(
        <Table>
          <TableCaption>Users list</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>John Doe</TableCell>
              <TableCell>john@example.com</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Jane Doe</TableCell>
              <TableCell>jane@example.com</TableCell>
            </TableRow>
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={2}>Total: 2 users</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      )

      expect(screen.getByTestId('table')).toBeInTheDocument()
      expect(screen.getByTestId('table-header')).toBeInTheDocument()
      expect(screen.getByTestId('table-body')).toBeInTheDocument()
      expect(screen.getByTestId('table-footer')).toBeInTheDocument()
      expect(screen.getByTestId('table-caption')).toBeInTheDocument()
    })
  })

  describe('Visual Enhancements', () => {
    it('applies smooth color transitions to table rows', () => {
      render(
        <Table>
          <TableBody>
            <TableRow data-testid="test-row">
              <TableCell>Content</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      )

      expect(screen.getByTestId('test-row')).toHaveClass(
        'transition-colors',
        'duration-fast'
      )
    })

    it('uses design token for row hover state', () => {
      render(
        <Table>
          <TableBody>
            <TableRow data-testid="test-row">
              <TableCell>Content</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      )

      expect(screen.getByTestId('test-row').className).toContain(
        'hover:bg-[var(--table-row-bg-hover)]'
      )
    })

    it('uses design tokens for header styling', () => {
      render(
        <Table>
          <TableHeader data-testid="test-header">
            <TableRow>
              <TableHead>Header</TableHead>
            </TableRow>
          </TableHeader>
        </Table>
      )

      expect(screen.getByTestId('test-header').className).toContain(
        'bg-[var(--table-header-bg)]'
      )
    })
  })
})
