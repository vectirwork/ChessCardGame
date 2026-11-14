// Socle du client (lot 6) : appels à l'API et repli réseau en français, limite d'erreur des pages (page blanche),
// rechargement après une nouvelle version (page, et échiquier des lieux de l'accueil), interrupteurs (useFeature,
// menus), typage de emitAck, déconnexion (l'interface ne passe en invité qu'avec l'accord du serveur).
// Sans DOM (Vitest en environnement node) : les composants sont rendus par react-dom/server, `fetch`, `document`,
// `sessionStorage` et `window` sont des doublures.
import { Suspense, createElement } from 'react';
import type { ComponentType, ReactElement } from 'react';
import { renderToStaticMarkup, renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { ApiError, NETWORK_ERROR, api, errMsg } from '../src/client/api';
import { PageBoundary, page } from '../src/client/App';
import { importFailed } from '../src/client/importFailed';
import { Footer, Header } from '../src/client/components/Layout';
import { emitAck, reloadForNewVersion } from '../src/client/socket';
import type { AckEvent, AckPayload, AckReply } from '../src/client/socket';
import { AppProvider, logoutWith, useFeature } from '../src/client/store';
import { FEATURES } from '../src/shared/config/features';
import type { FeatureKey } from '../src/shared/config/features';
import { GAME_RULES, RULES_V1 } from '../src/shared/config/rules';
import { cartesDePouvoir } from '../src/shared/text/regles';
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
    // Événements sans accusé de réception (emit simple) : hors d'emitAck
    expectTypeOf<Extract<AckEvent, 'game:leave' | 'queue:leave' | 'home:hello' | 'game:emote'>>().toEqualTypeOf<never>();
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

  it('chargement rejeté : React garde le rejet (d’où le rechargement par PageBoundary) ; un préchargement ne recharge rien', async () => {
    const store = new Map<string, string>();
    const reload = vi.fn();
    vi.stubGlobal('sessionStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
    vi.stubGlobal('window', { location: { reload } });
    let appels = 0;
    let echec = true;
    const Page = page<object>((): Promise<{ default: ComponentType<object> }> => {
      appels++;
      return echec ? Promise.reject(new TypeError('Failed to fetch dynamically imported module')) : Promise.resolve({ default: () => createElement('b', null, 'page chargée') });
    });
    const el = () => createElement(Suspense, { fallback: createElement('i', null, 'attente') }, createElement(Page));
    // Préchargement en échec (survol d'un lien) : rejeté, sans rechargement du site (une partie en cours continue)
    await expect(Page.preload()).rejects.toThrow('dynamically imported module');
    expect([appels, reload.mock.calls.length, store.size]).toEqual([1, 0, 0]);
    rendu(el());
    await tick();
    expect(appels).toBe(2);
    // Le même composant paresseux, rejeté pour toujours, ne recharge rien (le navigateur garde aussi l'échec de l'import)
    rendu(el());
    await tick();
    expect([appels, reload.mock.calls.length]).toEqual([2, 0]);
    // Un nouvel essai explicite (préchargement au survol d'un lien) : code chargé, la page remontée s'affiche
    echec = false;
    await Page.preload();
    expect(appels).toBe(3);
    expect(rendu(el())).toContain('page chargée');
  });
  it('échec de chargement reconnu (Chromium, Firefox, Safari, feuille de style), pas une autre erreur', () => {
    for (const e of [
      new TypeError('Failed to fetch dynamically imported module: https://x/assets/StageBoard-a1.js'),
      new TypeError('error loading dynamically imported module: https://x/assets/Learn-b2.js'),
      new TypeError('Importing a module script failed.'),
      new Error('Unable to preload CSS for https://x/assets/Learn-b2.css'),
    ]) expect(importFailed(e), e.message).toBe(true);
    for (const e of [new TypeError("Cannot read properties of undefined (reading 'step')"), new Error('Failed to fetch'), null, undefined]) {
      expect(importFailed(e), String(e)).toBe(false);
    }
  });
  it('erreur : écran « Réessayer » à la place de la page, le reste du site intact', () => {
    const b = new PageBoundary({ children: createElement('b', null, 'page'), at: '/apprendre' });
    expect(renderToStaticMarkup(b.render() as ReactElement)).toBe('<b>page</b>');
    b.state = { failure: 'render', at: '/apprendre' };
    const html = renderToStaticMarkup(b.render() as ReactElement);
    expect(html).toContain('role="alert"');
    expect(html).toContain('Impossible d’afficher cette page.');
    expect(html).toContain('>Réessayer</button>');
  });
  it('exception de rendu : « Réessayer » redessine la page, sans rechargement', () => {
    const reload = vi.fn();
    vi.stubGlobal('window', { location: { reload } });
    const erreur = new TypeError("Cannot read properties of undefined (reading 'step')");
    expect(PageBoundary.getDerivedStateFromError(erreur)).toEqual({ failure: 'render' });
    const b = new PageBoundary({ children: null, at: '/apprendre/x' });
    b.state = { failure: 'render', at: '/apprendre/x' };
    b.componentDidCatch(erreur);
    const setState = vi.spyOn(b, 'setState').mockImplementation(() => undefined);
    b.retry();
    expect(setState).toHaveBeenCalledWith({ failure: null });
    expect(reload).not.toHaveBeenCalled();
  });
  it('code introuvable (page, ou composant paresseux d’une page : échiquier de l’accueil) : rechargement automatique, puis « Réessayer » recharge', () => {
    const store = new Map<string, string>();
    const reload = vi.fn();
    vi.stubGlobal('sessionStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
    vi.stubGlobal('window', { location: { reload } });
    const erreur = new TypeError('Failed to fetch dynamically imported module: https://x/assets/StageBoard-a1.js');
    expect(PageBoundary.getDerivedStateFromError(erreur)).toEqual({ failure: 'import' });
    const b = new PageBoundary({ children: null, at: '/' });
    b.state = { failure: 'import', at: '/' };
    // Premier échec : rechargement (garde d'une minute) ; un second dans la minute : l'écran « Réessayer » reste
    b.componentDidCatch(erreur);
    b.componentDidCatch(erreur);
    expect(reload).toHaveBeenCalledTimes(1);
    const setState = vi.spyOn(b, 'setState').mockImplementation(() => undefined);
    b.retry();
    expect(reload).toHaveBeenCalledTimes(2);
    expect(setState).not.toHaveBeenCalled();
  });
  it('l’erreur s’efface quand le chemin change, même vers une page du même module (/apprendre/x → /apprendre)', () => {
    const s = { failure: 'render' as const, at: '/apprendre/x' };
    expect(PageBoundary.getDerivedStateFromProps({ children: null, at: '/apprendre/x' }, s)).toBeNull();
    expect(PageBoundary.getDerivedStateFromProps({ children: null, at: '/apprendre' }, s)).toEqual({ failure: null, at: '/apprendre' });
    // Premier rendu : le chemin est retenu, aucune erreur
    expect(PageBoundary.getDerivedStateFromProps({ children: null, at: '/' }, { failure: null })).toEqual({ failure: null, at: '/' });
  });
});

describe('échiquier des lieux de l’accueil (DecorBoundary, OdysseeHome.tsx)', () => {
  // Relecture finale (lot 9f) : avant la passe, tout import dynamique en échec rechargeait le site (vite:preloadError,
  // main.tsx) ; la limite de l'échiquier, ajoutée au lot 7, le retirait sans recharger. Elle recharge de nouveau.
  it('code introuvable : l’échiquier disparaît et le site est rechargé (au plus une fois par minute) ; autre erreur : il disparaît seulement', async () => {
    const { DecorBoundary } = await import('../src/client/odyssee/OdysseeHome');
    const store = new Map<string, string>();
    const reload = vi.fn();
    vi.stubGlobal('sessionStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
    vi.stubGlobal('window', { location: { reload } });
    const manquant = new TypeError('Failed to fetch dynamically imported module: https://x/assets/StageBoard-a1.js');
    expect(DecorBoundary.getDerivedStateFromError()).toEqual({ failed: true });
    const b = new DecorBoundary({ children: createElement('b', null, 'échiquier') });
    expect(renderToStaticMarkup(b.render() as ReactElement)).toBe('<b>échiquier</b>');
    b.state = { failed: true };
    expect(b.render()).toBeNull();
    // Exception de rendu : retiré, sans rechargement.
    b.componentDidCatch(new TypeError("Cannot read properties of undefined (reading 'step')"));
    expect(reload).not.toHaveBeenCalled();
    // Code introuvable : rechargement, une seule fois dans la minute.
    b.componentDidCatch(manquant);
    b.componentDidCatch(manquant);
    expect(reload).toHaveBeenCalledTimes(1);
    expect([...store.keys()]).toEqual(['spellmate:reload']);
  });
});

describe('déconnexion (store.tsx, logout)', () => {
  it('accord du serveur : l’interface passe en invité, puis « À bientôt ! »', async () => {
    const f = vi.fn(async (_url: string, _init?: RequestInit) => reponse(200, { ok: true }));
    vi.stubGlobal('fetch', f);
    const setMe = vi.fn();
    const toast = vi.fn();
    await logoutWith(setMe, toast);
    expect(f.mock.calls[0][0]).toBe('/api/auth/logout');
    expect(setMe).toHaveBeenCalledWith(null);
    expect(toast).toHaveBeenCalledWith('À bientôt !');
  });
  it('échec (réseau coupé, erreur du serveur) : toujours connecté (le serveur l’est encore), message d’erreur', async () => {
    for (const [fetchImpl, message] of [
      [async () => { throw new TypeError('Failed to fetch'); }, NETWORK_ERROR],
      [async () => reponse(500, { error: 'Erreur interne, réessayez.' }), 'Erreur interne, réessayez.'],
    ] as const) {
      vi.stubGlobal('fetch', vi.fn(fetchImpl));
      const setMe = vi.fn();
      const toast = vi.fn();
      await expect(logoutWith(setMe, toast)).resolves.toBeUndefined();
      expect(setMe).not.toHaveBeenCalled();
      expect(toast).toHaveBeenCalledWith(message, 'error');
      expect(toast).toHaveBeenCalledTimes(1);
    }
  });
});

describe('rechargement après une nouvelle version (code de page introuvable, server:outdated)', () => {
  it('au plus une fois par minute ; jamais sans stockage de session', () => {
    const store = new Map<string, string>();
    const reload = vi.fn();
    vi.stubGlobal('sessionStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
    vi.stubGlobal('window', { location: { reload } });
    reloadForNewVersion();
    expect([...store.keys()]).toEqual(['spellmate:reload']);
    expect(reload).toHaveBeenCalledTimes(1);
    reloadForNewVersion();
    expect(reload).toHaveBeenCalledTimes(1);
    // Plus d'une minute après : nouveau rechargement possible
    store.set('spellmate:reload', String(Date.now() - 61_000));
    reloadForNewVersion();
    expect(reload).toHaveBeenCalledTimes(2);
    vi.stubGlobal('sessionStorage', { getItem: () => { throw new Error('bloqué'); } });
    reloadForNewVersion();
    expect(reload).toHaveBeenCalledTimes(2);
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
  /**
   * Liens à interrupteur (`f` dans SECTIONS et NAV) et leur fonction. Ouverte par FEATURES (tout est ouvert au
   * défaut) : le lien est là ; coupée dans le code : il disparaît (lot 9e : l'attendu suit FEATURES).
   */
  const INTERRUPTEUR: Record<string, FeatureKey> = {
    '/boutique': 'shop', '/problemes': 'puzzles', '/apprendre': 'learn', '/analyse': 'analysis', '/direct': 'live',
    '/classement': 'ranked', '/jouer?mode=quick': 'ranked',
  };
  const ouvert = (l: string) => !INTERRUPTEUR[l] || FEATURES[INTERRUPTEUR[l]];

  it('au défaut : marque, accroche et nombre de cartes tirés des réglages ; tous les liens ; aucun style de grille', () => {
    const html = site(null);
    expect(html).toContain('aria-label="Spellmate, accueil"');
    expect(html).toContain('<span>SPELLMATE</span>');
    // Nombre de cartes de GAME_RULES : « trois cartes de pouvoir » au défaut, la phrase dérivée sinon.
    const cartes = GAME_RULES.cardsPerPlayer === RULES_V1.cardsPerPlayer ? 'trois cartes de pouvoir' : cartesDePouvoir(GAME_RULES);
    expect(html).toContain(`Les échecs que vous aimez, avec ${cartes} pour renverser la partie.`);
    expect(html).toContain(' Spellmate. Tous droits réservés.');
    expect(html).toContain('<span>Les échecs, avec un peu de magie.</span>');
    for (const l of ['/boutique', '/problemes', '/apprendre', '/analyse', '/direct', '/classement', '/jouer?mode=quick']) {
      if (ouvert(l)) expect(liens(html)).toContain(l);
      else expect(liens(html)).not.toContain(l);
    }
    expect(html).not.toContain('--n');
  });
  it('fonctions coupées : leurs liens disparaissent (en-tête, pied de page)', () => {
    const html = site('{"shop":false,"puzzles":false,"ranked":false}');
    for (const l of ['/boutique', '/problemes', '/classement', '/jouer?mode=quick']) expect(liens(html)).not.toContain(l);
    for (const l of ['/jouer', '/apprendre', '/analyse', '/parties', '/cartes']) if (ouvert(l)) expect(liens(html)).toContain(l);
  });
});
