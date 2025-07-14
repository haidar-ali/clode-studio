// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-05-15',
  devtools: { enabled: true },
  ssr: false, // SPA mode for Electron
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
  css: ['~/assets/css/main.css', 'splitpanes/dist/splitpanes.css'],
  build: {
    transpile: ['naive-ui', 'vueuc', '@css-render/vue3-ssr', '@juggle/resize-observer', 'splitpanes', '@iconify/vue']
  },
  vite: {
    optimizeDeps: {
      include: ['naive-ui', 'vueuc', 'date-fns-tz/formatInTimeZone', 'monaco-editor', '@iconify/vue']
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
    }
  }
})
