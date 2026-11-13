// Géométrie de la coque de partie (src/client/odyssee/shell/layout.ts) : l'échiquier ne bouge jamais avec le nombre de
// cartes, et les éventails rendent exactement les valeurs d'avant pour 3 cartes (témoin test/fixtures/v1/layout.json,
// relevé sur le code d'avant la polymorphie).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as L from '../src/client/odyssee/shell/layout';

interface Taille {
  vw: number;
  vh: number;
  mobile: boolean;
  gameLayout: { G: number; x: number; y: number; mobile: boolean };
  desktopHandRight: number;
  oppCardWidth: number;
}
const TEMOIN = JSON.parse(readFileSync(new URL('./fixtures/v1/layout.json', import.meta.url), 'utf8')) as {
  constantes: Record<string, unknown>;
  tailles: Taille[];
};

describe('coque : géométrie identique au témoin (code d’avant)', () => {
  it('constantes', () => {
    const c = TEMOIN.constantes;
    expect(L.MOBILE_MAX).toBe(c.MOBILE_MAX);
    expect(L.MOBILE_BOARD_TOP).toBe(c.MOBILE_BOARD_TOP);
    expect(L.MOBILE_BELOW).toBe(c.MOBILE_BELOW);
    expect(L.OPP_FAN_SPAN).toBe(c.OPP_FAN_SPAN);
    expect(L.DESKTOP_OPP_ROOM).toBe(c.DESKTOP_OPP_ROOM);
  });
  for (const t of TEMOIN.tailles) {
    it(`${t.vw} × ${t.vh} : gameLayout et desktopHandRight`, () => {
      expect(L.isMobile(t.vw)).toBe(t.mobile);
      expect(L.gameLayout(t.vw, t.vh)).toEqual(t.gameLayout);
      expect(L.desktopHandRight(t.vw)).toBe(t.desktopHandRight);
    });
  }
});

describe('éventails : main de référence identique à l’existant', () => {
  const FAN = TEMOIN.constantes.FAN as { r: number; y: number }[];
  const ARRIVEE = TEMOIN.constantes.ARRIVEE as number[];
  it('fanPose(i, 3) redonne FAN, fanArrival redonne [-28, 0, 28] (mêmes chaînes CSS)', () => {
    expect(L.REF_HAND).toBe(3);
    for (let i = 0; i < 3; i++) {
      expect(L.fanPose(i, 3)).toEqual(FAN[i]);
      expect(`${L.fanPose(i, 3).r}deg ${L.fanPose(i, 3).y}px`).toBe(`${FAN[i].r}deg ${FAN[i].y}px`);
      expect(L.fanArrival(i, 3)).toBe(ARRIVEE[i]);
    }
  });
  it('oppFanSpan(3) vaut exactement 2,97 (OPP_FAN_SPAN)', () => {
    expect(L.oppFanSpan(3)).toBe(2.97);
    expect(L.oppFanSpan(3)).toBe(L.OPP_FAN_SPAN);
  });
  for (const t of TEMOIN.tailles) {
    it(`${t.vw} × ${t.vh} : oppCardWidth égal au témoin`, () => {
      expect(L.oppCardWidth(L.gameLayout(t.vw, t.vh), t.vw, 3)).toBe(t.oppCardWidth);
      expect(L.oppCardWidth(L.gameLayout(t.vw, t.vh), t.vw)).toBe(t.oppCardWidth);
    });
  }
  it('une carte seule est droite ; l’éventail est symétrique pour tout n', () => {
    expect(L.fanPose(0, 1)).toEqual({ r: 0, y: 0 });
    expect(L.fanArrival(0, 1)).toBe(0);
    for (let n = 2; n <= 6; n++) {
      for (let i = 0; i < n; i++) {
        expect(L.fanPose(i, n).r).toBeCloseTo(-L.fanPose(n - 1 - i, n).r, 10);
        expect(L.fanPose(i, n).y).toBeCloseTo(L.fanPose(n - 1 - i, n).y, 10);
      }
      expect(L.fanPose(0, n)).toEqual({ r: -7, y: 14 });
    }
  });
  it('railTop : 178 px sans cartes, 300 avec (valeurs d’avant)', () => {
    expect(L.railTop(false)).toBe(178);
    expect(L.railTop(true)).toBe(300);
  });
});

/** Tailles types : ordinateur et mobile. */
const TAILLES: [number, number][] = [
  [1280, 720], [1366, 768], [1440, 900], [1536, 864], [1920, 1080], [2560, 1440], [1024, 768], [1180, 820],
  [360, 640], [375, 667], [390, 844], [412, 915], [768, 1024],
];
/**
 * Bord droit de votre main sur ordinateur : bord gauche (56 px, 32 de 820 à 1180), n cartes chevauchées, et le
 * débord des cartes extrêmes, inclinées de 7° autour de 50 % 120 % de leur hauteur (≈ 0,204 largeur ; mesuré : 389 px
 * en 1280 pour la main de référence).
 */
function handRight(vw: number, vh: number, n: number): number {
  const l = L.gameLayout(vw, vh);
  const { w, overlap } = L.handCardWidth(n, l, vw, vh);
  const left = vw <= 1180 ? 32 : 56;
  return left + n * w - overlap * (n - 1) + (n > 1 ? 0.204 * w : 0);
}

describe('éventails de 1 à 6 cartes : la main tient dans son enveloppe', () => {
  for (const [vw, vh] of TAILLES) {
    const l = L.gameLayout(vw, vh);
    for (let n = 1; n <= 6; n++) {
      it(`${vw} × ${vh}, ${n} carte(s)`, () => {
        const { w, overlap } = L.handCardWidth(n, l, vw, vh);
        expect(w).toBeGreaterThan(0);
        if (n <= 3) {
          // Jusqu'à la main de référence : les valeurs de shell.css, inchangées
          expect(w).toBe(L.refHandCardWidth(vw, vh));
          expect(overlap).toBe(l.mobile ? 12 : 18);
        }
        if (l.mobile) {
          // Mobile : la main, centrée, tient dans la largeur de l'écran moins 16 px
          const span = n * w - overlap * (n - 1) + (n > 1 ? 0.204 * w : 0);
          expect(span).toBeLessThanOrEqual(vw - 16);
          expect(w).toBeGreaterThanOrEqual(n <= 3 ? 72 : 48);
        } else {
          // Ordinateur : jamais plus large que la main de référence, et à 10 px au moins de l'échiquier
          expect(handRight(vw, vh, n)).toBeLessThanOrEqual(handRight(vw, vh, 3) + 0.01);
          if (vw >= 1180) expect(l.x - l.G / 2 - handRight(vw, vh, n)).toBeGreaterThanOrEqual(10);
          expect(overlap).toBe(18);
        }
      });
    }
  }
  it('valeurs de la conception (1280 × 720 ; mobile)', () => {
    const d = L.gameLayout(1280, 720);
    expect([4, 5, 6].map(n => Math.floor(L.handCardWidth(n, d, 1280, 720).w))).toEqual([91, 77, 67]);
    const m = L.gameLayout(412, 915);
    expect([4, 5, 6].map(n => L.handCardWidth(n, m, 412, 915))).toEqual([
      { w: 69, overlap: 12 },
      { w: 60, overlap: 15 },
      { w: 60, overlap: 24 },
    ]);
    expect([4, 5, 6].map(n => L.oppCardWidth(d, 1280, n))).toEqual([60, 49, 42]);
  });
  it('la main adverse (ordinateur) tient à droite de l’échiquier pour 1 à 6 cartes', () => {
    for (const [vw, vh] of TAILLES) {
      const l = L.gameLayout(vw, vh);
      if (l.mobile) continue;
      for (let n = 1; n <= 6; n++) {
        const w = L.oppCardWidth(l, vw, n);
        expect(w).toBeLessThanOrEqual(76);
        // Largeur de l'éventail (cartes chevauchées, inclinaison comprise) contre la place libre, quand elle suffit
        const side = vw - (l.x + l.G / 2) - 34 - 20;
        if ((side - 8) / L.oppFanSpan(n) >= (n <= 3 ? 44 : 36)) expect(w * L.oppFanSpan(n) + 8).toBeLessThanOrEqual(side + 0.5);
      }
    }
  });
});
