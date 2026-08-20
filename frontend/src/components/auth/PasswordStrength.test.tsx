/**
 * Tests for PasswordStrength component
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PasswordStrength } from './PasswordStrength'

describe('PasswordStrength', () => {
  describe('Rendering', () => {
    it('renders nothing for empty password', () => {
      const { container } = render(<PasswordStrength password="" />)
      expect(container.firstChild).toBeNull()
    })

    it('renders strength indicator for non-empty password', () => {
      render(<PasswordStrength password="test" />)
      expect(screen.getByText(/password strength/i)).toBeInTheDocument()
    })

    it('renders three strength bars', () => {
      const { container } = render(<PasswordStrength password="test" />)
      const bars = container.querySelectorAll('[class*="h-1"]')
      expect(bars.length).toBe(3)
    })
  })

  describe('Strength Calculation', () => {
    it('shows weak strength for short lowercase password', () => {
      render(<PasswordStrength password="test" />)
      expect(screen.getByText(/weak/i)).toBeInTheDocument()
    })

    it('shows weak strength for password with only length', () => {
      render(<PasswordStrength password="testtest" />)
      expect(screen.getByText(/weak/i)).toBeInTheDocument()
    })

    it('shows medium strength for password with mixed case and numbers', () => {
      render(<PasswordStrength password="Test1234" />)
      expect(screen.getByText(/medium/i)).toBeInTheDocument()
    })

    it('shows strong strength for long password with mixed case and numbers', () => {
      render(<PasswordStrength password="Test12345678901234" />)
      expect(screen.getByText(/strong/i)).toBeInTheDocument()
    })

    it('shows strong strength for complex password', () => {
      render(<PasswordStrength password="MyS3cur3P@ssw0rd!" />)
      expect(screen.getByText(/strong/i)).toBeInTheDocument()
    })
  })

  describe('Visual Indicators', () => {
    it('shows 1 filled bar for weak password', () => {
      const { container } = render(<PasswordStrength password="test" />)
      // Weak passwords use bg-destructive class
      const bars = container.querySelectorAll('[class*="bg-destructive"]')
      expect(bars.length).toBe(1)
    })

    it('shows 2 filled bars for medium password', () => {
      const { container } = render(<PasswordStrength password="Test1234" />)
      // Medium passwords use semantic warning color
      const bars = container.querySelectorAll('[class*="bg-warning"]')
      expect(bars.length).toBe(2)
    })

    it('shows 3 filled bars for strong password', () => {
      const { container } = render(
        <PasswordStrength password="Test12345678901234" />
      )
      // Strong passwords use semantic success color
      const bars = container.querySelectorAll('[class*="bg-success"]')
      expect(bars.length).toBe(3)
    })
  })

  describe('Real-time Updates', () => {
    it('updates strength when password changes', () => {
      const { rerender } = render(<PasswordStrength password="test" />)
      expect(screen.getByText(/weak/i)).toBeInTheDocument()

      rerender(<PasswordStrength password="Test1234" />)
      expect(screen.getByText(/medium/i)).toBeInTheDocument()

      rerender(<PasswordStrength password="Test12345678901234" />)
      expect(screen.getByText(/strong/i)).toBeInTheDocument()
    })
  })
})
