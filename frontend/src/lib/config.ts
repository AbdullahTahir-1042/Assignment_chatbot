/**
 * Where the API lives.
 *
 * In dev this stays empty and the app calls the same-origin relative path,
 * which Vite proxies to the backend (see vite.config.ts). A deployed frontend
 * sets VITE_API_URL in its .env to the backend's origin -- Vite only exposes
 * VITE_-prefixed vars to client code, and the value is baked in at build time.
 * A trailing slash is stripped so the caller can append "/api/..." freely.
 */
const rawApiUrl = import.meta.env.VITE_API_URL;

export const apiUrl = rawApiUrl ? rawApiUrl.replace(/\/+$/, "") : "";