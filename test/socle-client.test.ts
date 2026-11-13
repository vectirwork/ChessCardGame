// Socle du client (lot 6) : appels à l'API et repli réseau en français, limite d'erreur des pages (page blanche),
// rechargement après une nouvelle version, interrupteurs (useFeature, menus), typage de emitAck.
// Sans DOM (Vitest en environnement node) : les composants sont rendus par react-dom/server, `fetch`, `document`,
// `sessionStorage` et `window` sont des doublures.
import { Suspense, createElement } from 'react';
import type { ComponentType, ReactElement } from 'react';
import { renderToStaticMarkup, renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { ApiError, NETWORK_ERROR, api, errMsg } from '../src/client/api';
import { PageBoundary, page } from '../src/client/App';
import { Footer, Header } from '../src/client/components/Layout';
import { emitAck, reloadForNewVersion } from '../src/client/socket';
import type { AckPayload, AckReply } from '../src/client/socket';
import { AppProvider, useFeature } from '../src/client/store';
import type { FeatureKey } from '../src/shared/config/features';
import type { Ack, JoinReply } from '../src/shared/protocol';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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
  it('méthode, en-têtes et corps : GET sans corps, POST avec JSON ; délai maximal (AbortSignal)', async () => {
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
    for (const [, init] of f.mock.calls) expect(init.signal).toBeInstanceOf(AbortSignal);
  });
  it('échec réseau ou délai dépassé : message français, jamais celui du navigateur (« Failed to fetch »)', async () => {
    for (const err of [new TypeError('Failed to fetch'), new TypeError('Load failed'), new DOMException('signal timed out', 'TimeoutError')]) {
      vi.stubGlobal('fetch', vi.fn(async () => { throw err; }));
      const e = await api('/x').catch(x => x);
      expect(e).toBeInstanceOf(ApiError);
      expect([e.message, e.status]).toEqual([NETWORK_ERROR, 0]);
      expect(errMsg(e)).toBe('Connexion au serveur impossible. Vérifiez votre réseau.');
    }
  });
  it('errMsg : seulement le message d’une ApiError', () => {
    expect(errMsg(new ApiError('Pseudo déjà pris.', 409))).toBe('Pseudo déjà pris.');
    expect(errMsg(new TypeError('Failed to fetch'))).toBe('Une erreur est survenue.');
    expect(errMsg(new Error('NetworkError when attempting to fetch resource.'))).toBe('Une erreur est survenue.');
    expect(errMsg('rien')).toBe('Une erreur est survenue.');
  });
});

describe('emitAck', () => {
  it('typé par ClientToServer : réponse déduite de l’événement', () => {
    // Fonctions jamais appelées (aucune connexion) : seuls leurs types comptent
    const rejoindre = () => emitAck('game:join', { id: 'p1' });
    const jouer = () => emitAck('game:move', { id: 'p1', from: 12, to: 28 });
    expectTypeOf(rejoindre).returns.toEqualTypeOf<Promise<JoinReply>>();
    expectTypeOf(jouer).returns.toEqualTypeOf<Promise<Ack>>();
    expectTypeOf<AckPayload<'game:join'>>().toEqualTypeOf<{ id: string; name?: string; sit?: boolean }>();
    expectTypeOf<AckReply<'queue:join'>>().toEqualTypeOf<Ack>();
  });
});

describe('limite d’erreur des pages (page blanche)', () => {
  /** Rendu côté serveur sans le journal d'erreurs de React (rejets attendus). */
  const rendu = (el: ReactElement) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      return renderToString(el);
    } catch {
      return '';
    }
  };
  const tick = () => new Promise(r => setTimeout(r, 0));

  it('chargement rejeté : React garde le rejet (d’où le rechargement de « Réessayer ») ; failed() le signale', async () => {
    let appels = 0;
    let echec = true;
    const Page = page<object>((): Promise<{ default: ComponentType<object> }> => {
      appels++;
      return echec ? Promise.reject(new TypeError('Failed to fetch dynamically imported module')) : Promise.resolve({ default: () => createElement('b', null, 'page chargée') });
    });
    const el = () => createElement(Suspense, { fallback: createElement('i', null, 'attente') }, createElement(Page));
    expect(Page.failed()).toBe(false);
    rendu(el());
    await tick();
    expect([appels, Page.failed()]).toEqual([1, true]);
    // Le même composant paresseux, rejeté pour toujours, ne recharge rien (le navigateur garde aussi l'échec de l'import)
    rendu(el());
    await tick();
    expect(appels).toBe(1);
    // Un nouvel essai explicite (préchargement au survol d'un lien) : code chargé, la page remontée s'affiche
    echec = false;
    await Page.preload();
    expect([appels, Page.failed()]).toEqual([2, false]);
    expect(rendu(el())).toContain('page chargée');
  });
  it('erreur de chargement ou de rendu : écran « Réessayer » à la place de la page, le reste du site intact', () => {
    expect(PageBoundary.getDerivedStateFromError()).toEqual({ error: true });
    const b = new PageBoundary({ children: createElement('b', null, 'page') });
    expect(renderToStaticMarkup(b.render() as ReactElement)).toBe('<b>page</b>');
    b.state = { error: true };
    const html = renderToStaticMarkup(b.render() as ReactElement);
    expect(html).toContain('role="alert"');
    expect(html).toContain('Impossible d’afficher cette page.');
    expect(html).toContain('>Réessayer</button>');
    // Exception de rendu (aucun code de page en échec) : la page est redessinée, sans rechargement
    const reload = vi.fn();
    vi.stubGlobal('window', { location: { reload } });
    const setState = vi.spyOn(b, 'setState').mockImplementation(() => undefined);
    b.retry();
    expect(setState).toHaveBeenCalledWith({ error: false });
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('rechargement après une nouvelle version (code de page introuvable, server:outdated)', () => {
  it('au plus une fois par minute ; jamais sans stockage de session', () => {
    const store = new Map<string, string>();
    const reload = vi.fn();
    vi.stubGlobal('sessionStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
    vi.stubGlobal('window', { location: { reload } });
    expect(reloadForNewVersion()).toBe(true);
    expect([...store.keys()]).toEqual(['spellmate:reload']);
    expect(reloadForNewVersion()).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
    vi.stubGlobal('sessionStorage', { getItem: () => { throw new Error('bloqué'); } });
    expect(reloadForNewVersion()).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

/** Document dont la meta sm-features vaut `content` (null : absente). */
const pageAvec = (content: string | null) => ({
  querySelector: (s: string) => (s === 'meta[name="sm-features"]' && content !== null ? { getAttribute: () => content } : null),
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
    vi.stubGlobal('document', pageAvec(null));
    expect(featureRendue('shop')).toBe('true');
    expect(featureRendue('ranked')).toBe('true');
  });
  it('avec la meta posée par le serveur : la valeur de la page, sans attendre /api/me', () => {
    vi.stubGlobal('document', pageAvec('{"shop":false}'));
    expect(featureRendue('shop')).toBe('false');
    expect(featureRendue('ranked')).toBe('true');
  });
  it('meta illisible : les défauts', () => {
    vi.stubGlobal('document', pageAvec('{shop:false'));
    expect(featureRendue('shop')).toBe('true');
  });
});

describe('en-tête et pied de page : marque et liens selon les interrupteurs', () => {
  const site = (content: string | null) => {
    vi.stubGlobal('document', pageAvec(content));
    return renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(AppProvider, null, createElement(Header), createElement(Footer))),
    );
  };
  const liens = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map(m => m[1]);

  it('au défaut : marque, accroche et nombre de cartes tirés des réglages ; tous les liens ; aucun style de grille', () => {
    const html = site(null);
    expect(html).toContain('aria-label="Spellmate, accueil"');
    expect(html).toContain('<span>SPELLMATE</span>');
    expect(html).toContain('Les échecs que vous aimez, avec trois cartes de pouvoir pour renverser la partie.');
    expect(html).toContain(' Spellmate. Tous droits réservés.');
    expect(html).toContain('<span>Les échecs, avec un peu de magie.</span>');
    for (const l of ['/boutique', '/problemes', '/apprendre', '/analyse', '/direct', '/classement', '/jouer?mode=quick']) expect(liens(html)).toContain(l);
    expect(html).not.toContain('--n');
  });
  it('fonctions coupées : leurs liens disparaissent (en-tête, pied de page)', () => {
    const html = site('{"shop":false,"puzzles":false,"ranked":false}');
    for (const l of ['/boutique', '/problemes', '/classement', '/jouer?mode=quick']) expect(liens(html)).not.toContain(l);
    for (const l of ['/jouer', '/apprendre', '/analyse', '/parties', '/cartes']) expect(liens(html)).toContain(l);
  });
});
