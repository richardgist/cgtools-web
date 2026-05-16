// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: process.env.NUXT_DEVTOOLS === '1' },
  nitro: {
    experimental: {
      websocket: true
    }
  },
  // 开启 sourcemap，让断点能映射到 .vue 源码
  sourcemap: {
    client: true,
  },
  vite: {
    build: {
      sourcemap: true,
    },
  },
})
