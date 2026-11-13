// Lot 9a : poids du code de l'accueil et du paquet principal. Ces gardes empêchent un import de revenir là où il
// coûtait (le poids lui-même se mesure au build : fermeture des imports statiques de Home, index, GameRoute).
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import FriendSheet, { INVITE_TC0, INVITE_TCS } from '../src/client/odyssee/FriendSheet';
import { GUEST_NAME } from '../src/shared/config/limits';
import { DEFAULT_QUICK, TIME_CONTROLS } from '../src/shared/protocol';

const src = (f: string) => readFileSync(f, 'utf8');
/** Imports à l'exécution d'un fichier (sans les `import type`). */
const runtimeImports = (f: string) =>
  [...src(f).matchAll(/^import\s+(?!type\b)[^;]*?from\s+'([^']+)';/gms)].map(m => m[1]);

describe('accueil : feuille « Défier un ami » chargée à part', () => {
  it('OdysseeHome n’importe ni protocol.ts ni config/limits.ts ; la feuille est chargée par import() et préchargée au repos', () => {
    const imports = runtimeImports('src/client/odyssee/OdysseeHome.tsx');
    expect(imports.filter(i => /shared\/protocol$|config\/limits$|\/FriendSheet$/.test(i))).toEqual([]);
    const home = src('src/client/odyssee/OdysseeHome.tsx');
    expect(home).toContain("const loadFriendSheet = () => import('./FriendSheet');");
    // Préchargée avec le code des démonstrations (repos après le chargement, ou premier geste) : prête avant le Seuil
    expect(home).toMatch(/void loadStageBoard\(\)\.catch\(\(\) => undefined\);\n\s*void loadFriendSheet\(\)\.catch\(\(\) => undefined\);/);
  });

  it('cadences et pseudo identiques au défaut : 10 + 0 choisie, toutes les cadences d’invitation, pseudo de 20 caractères', () => {
    expect(INVITE_TCS.map(t => t.id)).toEqual(TIME_CONTROLS.filter(t => t.invite && !t.archived).map(t => t.id));
    expect(INVITE_TCS.length).toBeGreaterThan(0);
    expect(INVITE_TC0).toBe(DEFAULT_QUICK);
    const html = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(FriendSheet, { onClose: () => undefined, catalog: 'climats', signedIn: false, kicker: 'Première porte' })),
    );
    expect(html).toContain(`maxLength="${GUEST_NAME.max}"`);
    expect(html).toContain('<p class="o-sheet-kicker">Première porte</p><h2>Défier un ami</h2>');
    const on = [...html.matchAll(/<button type="button" class="on"[^>]*>([^<]+)<\/button>/g)].map(m => m[1]);
    expect(on).toEqual(['Pouvoirs', INVITE_TCS.find(t => t.id === DEFAULT_QUICK)!.short]);
  });
});

describe('paquet principal et morceaux partagés', () => {
  it('store.tsx n’a plus usePref (remplacé par celui de features/storage, même clé KEYS.classicKings)', () => {
    expect(src('src/client/store.tsx')).not.toMatch(/export function usePref/);
    for (const f of ['src/client/game/GamePage.tsx', 'src/client/pages/Account.tsx', 'src/client/pages/Analysis.tsx']) {
      expect(src(f), f).toContain('usePref<boolean>(KEYS.classicKings, false)');
      expect(src(f), f).not.toMatch(/import \{[^}]*usePref[^}]*\} from '\.\.\/store'/);
    }
  });

  it('tables de storageKeys.ts annotées /* @__PURE__ */ : un morceau qui ne lit pas KEY_STORE ne l’emporte pas', () => {
    const s = src('src/client/storageKeys.ts');
    expect(s).toContain('export const KEYS = /* @__PURE__ */ Object.freeze({');
    expect(s).toMatch(/export const KEY_STORE: [^=]+= \/\* @__PURE__ \*\/ Object\.freeze\(\{/);
  });

  it('emitAck sans argument de type dans le client du lot (la réponse se déduit de l’événement)', () => {
    for (const f of ['src/client/game/GamePage.tsx', 'src/client/game/CardDraft.tsx', 'src/client/pages/Analysis.tsx', 'src/client/pages/Play.tsx']) {
      expect(src(f), f).not.toMatch(/emitAck</);
    }
  });
});
