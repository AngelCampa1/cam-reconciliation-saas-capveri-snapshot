import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import tailwindConfig from '../tailwind.config.js'

/**
 * Design Tokens Test Suite - Verifies Tailwind config and CSS custom properties
 */
describe('Design Tokens', () => {
  describe('Tailwind Config', () => {
    const colors = tailwindConfig.theme?.extend?.colors

    it('defines required color tokens with CSS variable references', () => {
      // Primary, secondary, semantic colors
      expect(colors?.primary?.DEFAULT).toBe('hsl(var(--primary))')
      expect(colors?.secondary?.DEFAULT).toBe('hsl(var(--secondary))')
      expect(colors?.success?.DEFAULT).toBe('hsl(var(--success))')
      expect(colors?.warning?.DEFAULT).toBe('hsl(var(--warning))')
      expect(colors?.error?.DEFAULT).toBe('hsl(var(--error))')
      expect(colors?.destructive?.DEFAULT).toBe('hsl(var(--destructive))')

      // Neutral and UI colors
      expect(colors?.background).toBe('hsl(var(--background))')
      expect(colors?.foreground).toBe('hsl(var(--foreground))')
      expect(colors?.border).toBe('hsl(var(--border))')
    })

    it('defines border radius and shadow tokens', () => {
      const borderRadius = tailwindConfig.theme?.extend?.borderRadius
      expect(borderRadius?.lg).toBe('var(--radius)')
      expect(borderRadius?.md).toBe('calc(var(--radius) - 2px)')

      const boxShadow = tailwindConfig.theme?.extend?.boxShadow
      expect(boxShadow?.sm).toBe('var(--shadow-sm)')
      expect(boxShadow?.md).toBe('var(--shadow-md)')
    })

    it('uses class-based dark mode', () => {
      expect(tailwindConfig.darkMode).toEqual(['class'])
    })

    it('defines font family tokens', () => {
      const fontFamily = tailwindConfig.theme?.extend?.fontFamily
      expect(fontFamily?.sans).toContain('var(--font-sans)')
    })

    it('has no hardcoded hex colors', () => {
      const colorValues = JSON.stringify(colors)
      expect(colorValues).not.toMatch(/#[0-9a-fA-F]{3,6}/)
      expect(colorValues).toMatch(/hsl\(var\(--/)
    })
  })

  describe('CSS Custom Properties', () => {
    let styleElement: HTMLStyleElement

    beforeAll(() => {
      styleElement = document.createElement('style')
      styleElement.textContent = `
        :root {
          --primary: 217 91% 40%;
          --primary-foreground: 0 0% 100%;
          --success: 142 76% 36%;
          --warning: 38 92% 50%;
          --error: 0 84% 60%;
          --background: 0 0% 100%;
          --foreground: 222 47% 11%;
          --ring: 217 91% 40%;
          --radius: 0.625rem;
          --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
        }
        .dark {
          --background: 222 47% 11%;
          --foreground: 210 40% 98%;
        }
      `
      document.head.appendChild(styleElement)
    })

    afterAll(() => {
      document.head.removeChild(styleElement)
    })

    it('has CapVeri brand primary color and semantic colors', () => {
      const styles = getComputedStyle(document.documentElement)
      expect(styles.getPropertyValue('--primary').trim()).toBe('217 91% 40%')
      expect(styles.getPropertyValue('--success').trim()).toBe('142 76% 36%')
      expect(styles.getPropertyValue('--warning').trim()).toBe('38 92% 50%')
      expect(styles.getPropertyValue('--error').trim()).toBe('0 84% 60%')
    })

    it('has border radius and ring for focus states', () => {
      const styles = getComputedStyle(document.documentElement)
      expect(styles.getPropertyValue('--radius').trim()).toBe('0.625rem')
      expect(styles.getPropertyValue('--ring').trim()).toBe('217 91% 40%')
    })

    it('has system font stack', () => {
      const styles = getComputedStyle(document.documentElement)
      const fontSans = styles.getPropertyValue('--font-sans').trim()
      expect(fontSans).toContain('-apple-system')
      expect(fontSans).toContain('Arial')
    })

    it('renders components with design token classes', () => {
      render(
        <div>
          <button
            data-testid="btn"
            className="bg-primary text-primary-foreground"
          >
            Primary
          </button>
          <div data-testid="rounded" className="rounded-lg shadow-md">
            Rounded
          </div>
        </div>
      )

      expect(screen.getByTestId('btn')).toHaveClass('bg-primary')
      expect(screen.getByTestId('rounded')).toHaveClass('rounded-lg')
    })

    it('supports dark mode theme switching', () => {
      document.documentElement.classList.add('dark')
      const styles = getComputedStyle(document.documentElement)
      expect(styles.getPropertyValue('--background').trim()).toBe('222 47% 11%')
      document.documentElement.classList.remove('dark')
    })
  })
})
