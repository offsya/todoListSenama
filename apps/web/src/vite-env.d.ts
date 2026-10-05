interface ImportMetaEnv {
  /** API base URL, absolute or relative to the web app. Defaults to `/api` (dev proxy). */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
