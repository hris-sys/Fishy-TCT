import { defineConfig } from 'vite'

export default defineConfig({
  // When this build was made, shown in the small print of error screens.
  define: { __BUILD_TIME__: JSON.stringify(new Date().toISOString()) },
})
