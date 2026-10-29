// Appels à l'API du serveur.
export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // réponse vide
  }
  if (!res.ok) throw new ApiError(data?.error ?? 'Une erreur est survenue.', res.status);
  return data as T;
}

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Une erreur est survenue.');
