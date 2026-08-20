import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}', './content/**/*.mdx'],
  safelist: [
    'text-fluid-xs',
    'text-fluid-sm',
    'text-fluid-base',
    'text-fluid-lg',
    'text-fluid-xl',
    'text-fluid-2xl',
    'text-fluid-3xl',
    'text-fluid-4xl',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          50: 'hsl(var(--primary-50))',
          100: 'hsl(var(--primary-100))',
          200: 'hsl(var(--primary-200))',
          300: 'hsl(var(--primary-300))',
          400: 'hsl(var(--primary-400))',
          500: 'hsl(var(--primary-500))',
          600: 'hsl(var(--primary-600))',
          700: 'hsl(var(--primary-700))',
          800: 'hsl(var(--primary-800))',
          900: 'hsl(var(--primary-900))',
          950: 'hsl(var(--primary-950))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
          strong: 'hsl(var(--destructive-strong))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
          strong: 'hsl(var(--success-strong))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
        },
        error: {
          DEFAULT: 'hsl(var(--error))',
          foreground: 'hsl(var(--error-foreground))',
        },
        info: {
          DEFAULT: 'hsl(var(--info))',
          foreground: 'hsl(var(--info-foreground))',
        },
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        overlay: 'hsl(var(--overlay))',
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          1: 'hsl(var(--chart-1))',
          2: 'hsl(var(--chart-2))',
          3: 'hsl(var(--chart-3))',
          4: 'hsl(var(--chart-4))',
          5: 'hsl(var(--chart-5))',
        },
        surface: {
          base: 'hsl(var(--surface-base))',
          raised: 'hsl(var(--surface-raised))',
          sunken: 'hsl(var(--surface-sunken))',
          overlay: 'hsl(var(--surface-overlay))',
          hover: 'hsl(var(--surface-hover))',
          active: 'hsl(var(--surface-active))',
          selected: 'hsl(var(--surface-selected))',
        },
        'border-subtle': 'hsl(var(--border-subtle))',
        'border-strong': 'hsl(var(--border-strong))',
        'border-hover': 'hsl(var(--border-hover))',
        status: {
          neutral: {
            DEFAULT: 'hsl(var(--status-neutral))',
            foreground: 'hsl(var(--status-neutral-foreground))',
          },
          pending: {
            DEFAULT: 'hsl(var(--status-pending))',
            foreground: 'hsl(var(--status-pending-foreground))',
          },
          'in-progress': {
            DEFAULT: 'hsl(var(--status-in-progress))',
            foreground: 'hsl(var(--status-in-progress-foreground))',
          },
          draft: {
            DEFAULT: 'hsl(var(--status-draft))',
            foreground: 'hsl(var(--status-draft-foreground))',
          },
          verified: {
            DEFAULT: 'hsl(var(--status-verified))',
            foreground: 'hsl(var(--status-verified-foreground))',
          },
          archived: {
            DEFAULT: 'hsl(var(--status-archived))',
            foreground: 'hsl(var(--status-archived-foreground))',
          },
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        button: 'var(--radius-button)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        'elevation-0': 'var(--elevation-0)',
        'elevation-1': 'var(--elevation-1)',
        'elevation-2': 'var(--elevation-2)',
        'elevation-3': 'var(--elevation-3)',
        'elevation-4': 'var(--elevation-4)',
        'primary-sm': 'var(--elevation-primary-1)',
        'primary-md': 'var(--elevation-primary-2)',
        'ring-soft': 'var(--ring-soft)',
        'ring-error': 'var(--ring-error)',
        'ring-success': 'var(--ring-success)',
      },
      fontSize: {
        'fluid-xs': 'clamp(0.75rem, 0.7rem + 0.25vw, 0.875rem)',
        'fluid-sm': 'clamp(0.875rem, 0.825rem + 0.25vw, 1rem)',
        'fluid-base': 'clamp(1rem, 0.95rem + 0.25vw, 1.125rem)',
        'fluid-lg': 'clamp(1.125rem, 1.05rem + 0.375vw, 1.25rem)',
        'fluid-xl': 'clamp(1.25rem, 1.15rem + 0.5vw, 1.5rem)',
        'fluid-2xl': 'clamp(1.5rem, 1.35rem + 0.75vw, 1.875rem)',
        'fluid-3xl': 'clamp(1.875rem, 1.65rem + 1.125vw, 2.25rem)',
        'fluid-4xl': 'clamp(2.25rem, 1.95rem + 1.5vw, 3rem)',
        // Tailwind's default 5xl-7xl ship line-height:1, which makes large
        // multi-line display headings collide. Give them tasteful display
        // leading so wrapped headlines breathe (fixes site-wide heading rhythm).
        '5xl': ['3rem', { lineHeight: '1.1' }],
        '6xl': ['3.75rem', { lineHeight: '1.08' }],
        '7xl': ['4.5rem', { lineHeight: '1.05' }],
      },
      fontFamily: {
        sans: ['Inter', 'var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
      backgroundImage: {
        'gradient-brand': 'var(--gradient-brand)',
        'gradient-subtle': 'var(--gradient-subtle)',
        'gradient-hero': 'var(--gradient-hero)',
        'gradient-mesh': 'var(--gradient-mesh)',
        'pattern-dots': 'var(--pattern-dots)',
        'pattern-grid': 'var(--pattern-grid)',
      },
      transitionTimingFunction: {
        'out-expo': 'var(--ease-out-expo)',
        'in-out-expo': 'var(--ease-in-out-expo)',
        spring: 'var(--ease-spring)',
      },
      transitionDuration: {
        instant: 'var(--duration-instant)',
        fast: 'var(--duration-fast)',
        normal: 'var(--duration-normal)',
        slow: 'var(--duration-slow)',
        slower: 'var(--duration-slower)',
      },
      backdropBlur: {
        xs: 'var(--blur-sm)',
      },
      spacing: {
        xs: 'var(--spacing-1)',
        sm: 'var(--spacing-2)',
        md: 'var(--spacing-3)',
        lg: 'var(--spacing-4)',
        xl: 'var(--spacing-6)',
        '2xl': 'var(--spacing-8)',
        '3xl': 'var(--spacing-12)',
        '4xl': 'var(--spacing-16)',
      },
      zIndex: {
        sticky: 'var(--z-sticky)',
        fixed: 'var(--z-fixed)',
        overlay: 'var(--z-overlay)',
        dropdown: 'var(--z-dropdown)',
        modal: 'var(--z-modal)',
        toast: 'var(--z-toast)',
        tooltip: 'var(--z-tooltip)',
      },
      width: {
        'icon-xs': 'var(--icon-xs)',
        'icon-sm': 'var(--icon-sm)',
        icon: 'var(--icon-base)',
        'icon-lg': 'var(--icon-lg)',
        'icon-xl': 'var(--icon-xl)',
        'icon-2xl': 'var(--icon-2xl)',
      },
      height: {
        'icon-xs': 'var(--icon-xs)',
        'icon-sm': 'var(--icon-sm)',
        icon: 'var(--icon-base)',
        'icon-lg': 'var(--icon-lg)',
        'icon-xl': 'var(--icon-xl)',
        'icon-2xl': 'var(--icon-2xl)',
      },
      maxWidth: {
        'container-xs': 'var(--container-xs)',
        'container-sm': 'var(--container-sm)',
        'container-md': 'var(--container-md)',
        'container-lg': 'var(--container-lg)',
        'container-xl': 'var(--container-xl)',
        'container-2xl': 'var(--container-2xl)',
        prose: 'var(--prose-width)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'fade-in-up': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.95)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-in-up': 'fade-in-up 0.3s var(--ease-out-expo)',
        'scale-in': 'scale-in 0.2s var(--ease-out-expo)',
        shimmer: 'shimmer 2s linear infinite',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
}

export default config
