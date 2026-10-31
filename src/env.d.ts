interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** Set by Vercel at build time: "production", "preview" or "development". */
  readonly VITE_VERCEL_ENV?: string
  readonly VITE_VERCEL_GIT_COMMIT_SHA?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare const __BUILD_TIME__: string
