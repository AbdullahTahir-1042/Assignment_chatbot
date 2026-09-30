/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Base origin of the backend API, e.g. "https://api.example.com".
   * Empty or unset means same-origin /api (Vite's dev proxy, or a backend
   * that also serves this built frontend).
   */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}