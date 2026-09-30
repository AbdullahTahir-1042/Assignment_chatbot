/**
 * The backend's error envelope, mirrored so the UI can switch on `code` rather
 * than parse messages.
 */
export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    details?: { fields?: { path: string; message: string }[] } | undefined;
  };
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: { path: string; message: string }[];

  constructor(status: number, code: string, message: string, fields: { path: string; message: string }[] = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }

  /** True when the failure is the caller's credentials, not the request. */
  get isAuthError(): boolean {
    return this.status === 401 || this.status === 403;
  }

  get isRateLimited(): boolean {
    return this.code === "RATE_LIMITED";
  }

  /** Field-level message for react-hook-form, if the server sent one. */
  fieldError(path: string): string | undefined {
    return this.fields.find((f) => f.path === path)?.message;
  }
}

const TOKEN_KEY = "assessment.token";

export const tokenStore = {
  get: (): string | null => localStorage.getItem(TOKEN_KEY),
  set: (token: string): void => localStorage.setItem(TOKEN_KEY, token),
  clear: (): void => localStorage.removeItem(TOKEN_KEY),
};

type RequestOptions = {
  method?: "GET" | "POST";
  body?: unknown;
  signal?: AbortSignal;
  /** Skip the bearer header, for signup and login. */
  anonymous?: boolean;
};

const parseBody = async (res: Response): Promise<unknown> => {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
};

export const request = async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
  const { method = "GET", body, signal, anonymous = false } = options;
  const token = anonymous ? null : tokenStore.get();

  const headers: Record<string, string> = { accept: "application/json" };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (token) headers.authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      ...(signal ? { signal } : {}),
    });
  } catch (err) {
    // Network failure and abort are different problems and the user should not
    // be told "server error" for their own cancelled request.
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError(0, "NETWORK_ERROR", "Could not reach the server. Check your connection.");
  }

  const payload = await parseBody(res);
  if (!res.ok) {
    const envelope = payload as Partial<ApiErrorBody> | null;
    const error = envelope?.error;
    throw new ApiError(
      res.status,
      error?.code ?? "UNKNOWN",
      error?.message ?? `Request failed (${res.status})`,
      error?.details?.fields ?? [],
    );
  }
  return payload as T;
};

/** Turns anything thrown by a hook into something renderable. */
export const toMessage = (err: unknown): string => {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
};
