// https://nuxt.com/docs/api/configuration/nuxt-config
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineNuxtConfig({
  compatibilityDate: '2025-05-15',
  devtools: { enabled: true },
  ssr: false, // SPA mode for Electron
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
    server: {
      fs: {
        allow: ['..']
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
