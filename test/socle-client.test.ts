// Socle du client (lot 6) : appels à l'API, interrupteurs (useFeature), meta sm-features du HTML servi.
// Sans DOM (Vitest en environnement node) : les composants sont rendus par react-dom/server, `fetch` et `document`
// sont des doublures.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, errMsg } from '../src/client/api';
import { AppProvider, useFeature } from '../src/client/store';
import type { FeatureKey } from '../src/shared/config/features';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Réponse HTTP minimale (statut, corps JSON). */
const reponse = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

describe('api()', () => {
  it('rend le corps JSON d’une réponse réussie', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reponse(200, { a: 1 })));
    await expect(api('/x')).resolves.toEqual({ a: 1 });
  });
  it('réponse en erreur : ApiError avec le message du serveur, ou un message générique', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reponse(403, { error: 'Accès réservé.' })));
    const e = await api('/x').catch(x => x);
    expect(e).toBeInstanceOf(ApiError);
    expect([e.message, e.status]).toEqual(['Accès réservé.', 403]);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 502, json: async () => { throw new SyntaxError('html'); } })));
    const g = await api('/x').catch(x => x);
    expect([g.message, g.status]).toEqual(['Une erreur est survenue.', 502]);
  });
  it('méthode, en-têtes et corps : GET sans corps, POST avec JSON', async () => {
    const f = vi.fn(async (_url: string, _init: RequestInit) => reponse(200, {}));
    vi.stubGlobal('fetch', f);
    await api('/me');
    await api('/auth/login', { body: { a: 1 } });
    await api('/auth/logout', { method: 'POST', body: {} });
    expect(f.mock.calls.map(([url, init]) => [url, init.method, init.body ?? null, init.credentials])).toEqual([
      ['/api/me', 'GET', null, 'same-origin'],
      ['/api/auth/login', 'POST', '{"a":1}', 'same-origin'],
      ['/api/auth/logout', 'POST', '{}', 'same-origin'],
    ]);
  });
  it('errMsg : le message d’une ApiError', () => {
    expect(errMsg(new ApiError('Pseudo déjà pris.', 409))).toBe('Pseudo déjà pris.');
    expect(errMsg('rien')).toBe('Une erreur est survenue.');
  });
});

/** Valeur de useFeature(k) rendue par un composant dans AppProvider. */
function featureRendue(k: FeatureKey): string {
  function Sonde() {
    return createElement('i', null, String(useFeature(k)));
  }
  return renderToStaticMarkup(createElement(AppProvider, null, createElement(Sonde))).match(/<i>(\w+)<\/i>/)![1];
}

describe('useFeature : interrupteurs lus dans la page', () => {
  it('sans meta sm-features (défaut) : tout est ouvert', () => {
    vi.stubGlobal('document', { querySelector: () => null });
    expect(featureRendue('shop')).toBe('true');
    expect(featureRendue('ranked')).toBe('true');
  });
  it('avec la meta posée par le serveur : la valeur de la page, sans attendre /api/me', () => {
    vi.stubGlobal('document', { querySelector: (s: string) => (s === 'meta[name="sm-features"]' ? { getAttribute: () => '{"shop":false}' } : null) });
    expect(featureRendue('shop')).toBe('false');
    expect(featureRendue('ranked')).toBe('true');
  });
  it('meta illisible : les défauts', () => {
    vi.stubGlobal('document', { querySelector: () => ({ getAttribute: () => '{shop:false' }) });
    expect(featureRendue('shop')).toBe('true');
  });
});
