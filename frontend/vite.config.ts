/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { visualizer } from 'rollup-plugin-visualizer'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiUrl = env.VITE_API_URL?.trim() || ''
  const isCi = process.env.CI === 'true'

  if (mode === 'production' && isCi && !env.VITE_API_URL?.trim()) {
    throw new Error(
      'VITE_API_URL is required for production builds (example: https://api.capveri.com).'
    )
  }

  return {
    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify(apiUrl),
    },
    plugins: [
    react(),
    // Bundle size analysis
    visualizer({
      filename: './dist/stats.html',
      gzipSize: true,
      open: false,
      template: 'treemap',
    }) as Plugin,
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'CapVeri',
        short_name: 'CapVeri',
        description: 'CRE FinOps and Compliance Platform',
        theme_color: '#304476',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: '/icons/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          },
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024, // 4 MB
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\./i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 // 24 hours
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      }
    })
  ],
    build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-query': ['@tanstack/react-query', '@tanstack/react-table'],
          'vendor-ui': ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-select', '@radix-ui/react-tabs', '@radix-ui/react-tooltip'],
          'vendor-charts': ['recharts'],
          'vendor-pdf': ['pdfjs-dist'],
        },
      },
    },
  },
    resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
    server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
    test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',

    // Pool configuration for 3000+ tests
    pool: 'threads',
    isolate: true,

    // Increase timeouts for slow tests
    testTimeout: 10000,      // 10s per test (default: 5000)
    hookTimeout: 10000,      // 10s per hook
    teardownTimeout: 10000,  // 10s for cleanup

    exclude: [
      'node_modules',
      'e2e/**/*',
      'tests/e2e/**/*',
      '**/*.spec.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      reportsDirectory: path.resolve(__dirname, 'coverage'),
      reportOnFailure: true,  // Generate coverage even when tests fail
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'node_modules/',
        'src/setupTests.ts',
        '**/*.test.{ts,tsx}',
        '**/*.spec.{ts,tsx}',
        'src/__tests__/**',
        'src/test/**',
        'src/**/*.d.ts',
        'src/vite-env.d.ts',
        'src/api/generated/**',  // Exclude auto-generated API client (11.5K LOC)
      ],

      // V8-specific optimizations
      all: false,       // Only report on imported files (faster)
      skipFull: true,   // Skip files with 100% coverage (smaller reports)

      // Temporarily disabled while building up to 95% (Phase 0-6)
      // Will re-enable in Phase 7
      // thresholds: {
      //   statements: 95,
      //   branches: 95,
      //   functions: 95,
      //   lines: 95
      // }
    }
    }
  }
})
