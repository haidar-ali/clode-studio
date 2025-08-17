// https://nuxt.com/docs/api/configuration/nuxt-config
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineNuxtConfig({
  compatibilityDate: '2025-05-15',
  devtools: { enabled: false },
  ssr: false, // SPA mode for Electron
  devServer: {
    host: '0.0.0.0', // Listen on all network interfaces
    port: 3000
  },
  nitro: {
    experimental: {
      websocket: true // Enable WebSocket support for Socket.IO integration
    },
    devProxy: {
      '/socket.io': {
        target: 'http://localhost:3789',
        ws: true,
        changeOrigin: true
      }
    },
    routeRules: {
      '/socket.io/**': {
        proxy: 'http://localhost:3789/**'
      }
    }
  },
  experimental: {
    componentIslands: true // Enable server components
  },
  app: {
    head: {
      title: 'Clode Studio',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' }
      ]
    }
  },
  typescript: {
    strict: true,
    typeCheck: false
  },
  modules: [
    '@pinia/nuxt',
    '@vueuse/nuxt'
  ],
  components: [
    { path: '~/components', pathPrefix: false }
  ],
  css: [
    '~/assets/css/main.css',
    '~/assets/css/modal-theme.css',
    '~/assets/css/ghost-text.css',
    '~/assets/css/mobile.css',
    'splitpanes/dist/splitpanes.css'
  ],
  build: {
    transpile: ['naive-ui', 'vueuc', '@css-render/vue3-ssr', '@juggle/resize-observer', 'splitpanes', '@iconify/vue']
  },
  vite: {
    optimizeDeps: {
      include: ['naive-ui', 'vueuc', 'date-fns-tz/formatInTimeZone', '@iconify/vue']
    },
    define: {
      global: 'globalThis'
    },
    worker: {
      format: 'es'
    },
    build: {
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks: {
            'codemirror': ['codemirror', '@codemirror/state', '@codemirror/view'],
            'codemirror-lang': [
              '@codemirror/lang-javascript',
              '@codemirror/lang-python',
              '@codemirror/lang-html',
              '@codemirror/lang-css',
              '@codemirror/lang-json',
              '@codemirror/lang-markdown'
            ],
            'ui-libs': ['naive-ui', 'vue', 'vue-router'],
            'utils': ['lodash', 'date-fns-tz', 'marked']
          }
        }
      }
    },
    server: {
      fs: {
        allow: ['..']
      },
      proxy: {
        '/socket.io': {
          target: 'http://localhost:3789',
          ws: true,
          changeOrigin: true
        }
      }
    },
    plugins: [
      nodePolyfills({
        // Whether to polyfill specific globals.
        globals: {
          Buffer: true,
          global: true,
          process: true
        }
      })
    ]
  }
})
