// Appels à l'API du serveur.
export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/** Délai maximal d'une requête (ms) : au-delà, elle est abandonnée et signalée comme un échec réseau. */
export const API_TIMEOUT_MS = 20_000;
/** Message d'un échec réseau (hors ligne, serveur injoignable, délai dépassé), au lieu de celui du navigateur. */
export const NETWORK_ERROR = 'Connexion au serveur impossible. Vérifiez votre réseau.';
const GENERIC_ERROR = 'Une erreur est survenue.';

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
      headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin',
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
  } catch {
    // « Failed to fetch », « Load failed », « NetworkError… » (anglais, propres au navigateur) ou délai dépassé
    throw new ApiError(NETWORK_ERROR, 0);
  }
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // réponse vide
  }
  if (!res.ok) throw new ApiError(data?.error ?? GENERIC_ERROR, res.status);
  return data as T;
}

/**
 * Message à montrer pour une erreur : seulement celui d'une ApiError (réponse du serveur, échec réseau, socket sans
 * réponse), écrit par le site ; jamais celui d'une autre erreur (navigateur, en anglais : TypeError, DOMException).
 */
export const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : GENERIC_ERROR);
