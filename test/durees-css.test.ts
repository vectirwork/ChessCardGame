// Durées d'animation écrites deux fois, en JS (minuterie qui retire un élément ou une classe, attente d'une fin) et en
// CSS (durée de l'animation) : relues dans les feuilles de style et comparées, sans navigateur.
// - Éclair plein écran (VfxStage.flash ; board.css, .vfx-flash) : l'élément est retiré 100 ms après la fin de son
//   animation.
// - Retour arrière (carte du Duel ; board.css, .vfx-rewind) : la classe est retirée 100 ms après la fin de ses deux
//   animations, qui durent autant l'une que l'autre.
// - Chute du roi maté (mate.ts, MATE_FALL_MS ; board.css, pi-fall-*) et coup de grâce (effects.ts, FINALE_S).
// - Bandeau de sort (game.css, .gp-cast ; GamePage) : retiré à la fin de son animation.
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { skinStyle } from '../src/shared/catalog';
import { MATE_FALL_MS } from '../src/client/components/mate';
import type { VfxStage } from '../src/client/vfx/stage';

const css = (f: string) => readFileSync(new URL(`../src/client/styles/${f}`, import.meta.url), 'utf8');
const BOARD_CSS = css('board.css');

/** Durée (ms) de l'animation `name` posée par une règle de la feuille (`animation: <name> <durée>s`). */
function animationMs(sheet: string, name: string): number[] {
  return [...sheet.matchAll(new RegExp(`animation:\\s*${name}\\s+([\\d.]+)s`, 'g'))].map(m => Math.round(Number(m[1]) * 1000));
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Élément factice : classes, style, retrait daté. */
function fakeEl() {
  const removedAt: number[] = [];
  return {
    removedAt,
    className: '',
    style: { setProperty: () => undefined } as Record<string, unknown>,
    classList: new Set<string>(),
    appendChild: () => undefined,
    remove: () => removedAt.push(Date.now()),
    getContext: () => null,
    addEventListener: () => undefined,
  };
}

describe('éclair plein écran (board.css, .vfx-flash)', () => {
  it('retiré 100 ms après la fin de son animation', async () => {
    const [ms] = animationMs(BOARD_CSS, 'vfx-flash');
    expect(ms).toBe(800);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'], now: 0 });
    const made: ReturnType<typeof fakeEl>[] = [];
    vi.stubGlobal('document', {
      createElement: () => {
        const el = fakeEl();
        made.push(el);
        return el;
      },
      body: { appendChild: () => undefined },
    });
    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: false, addEventListener: () => undefined }),
      setTimeout: (f: () => void, t: number) => setTimeout(f, t),
      clearTimeout: (id: number) => clearTimeout(id),
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      devicePixelRatio: 1,
    });
    vi.stubGlobal('navigator', { hardwareConcurrency: 8 });
    vi.stubGlobal('getComputedStyle', () => ({ perspective: '1400px' }));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { VfxStage } = await import('../src/client/vfx/stage');
    const wrap = fakeEl();
    const stage = new VfxStage(wrap as unknown as HTMLElement, 'w');
    made.length = 0;
    stage.flash('#ffffff', 0.5);
    expect(made.length).toBe(1);
    const [el] = made;
    expect(el.className).toBe('vfx-flash');
    vi.advanceTimersByTime(ms + 99);
    expect(el.removedAt).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(el.removedAt).toEqual([ms + 100]);
  });
});

describe('Retour arrière (board.css, .vfx-rewind)', () => {
  it('ses deux animations durent autant ; la classe est retirée 100 ms après', async () => {
    const glitch = animationMs(BOARD_CSS, 'rewind-glitch');
    const fade = animationMs(BOARD_CSS, 'fade-out');
    expect(glitch).toEqual([1400]);
    expect(fade).toEqual([1400]);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'], now: 0 });
    vi.stubGlobal('window', { setTimeout: (f: () => void, t: number) => setTimeout(f, t), clearTimeout: (id: number) => clearTimeout(id) });
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => new Proxy({}, { get: () => () => ({ addColorStop: () => undefined }) }) }) });
    const { playCast } = await import('../src/client/vfx/effects');
    const events: string[] = [];
    const stage = {
      ok: true,
      reduced: false,
      guard: false,
      family: null,
      orientation: 'w',
      tilt: 0,
      board: new THREE.Group(),
      wrap: {
        classList: { add: (c: string) => events.push(`+${c}@${Date.now()}`), remove: (c: string) => events.push(`-${c}@${Date.now()}`) },
        querySelectorAll: () => [],
      },
      local: (sq: number) => new THREE.Vector3((sq & 7) - 3.5, (sq >> 3) - 3.5, 0),
      particles: () => ({ emit: () => undefined }),
      add: () => undefined,
      wait: () => new Promise(() => undefined),
      cinematic: () => null,
      release: () => undefined,
      shake: () => undefined,
      flash: () => undefined,
      later: (f: () => void, t: number) => window.setTimeout(f, t),
    } as unknown as VfxStage;
    void playCast(stage, { card: 'rewind', caster: 'w', targets: [12, 28], pieces: [], skin: 'skin:arcane' }, skinStyle('skin:arcane'), { impact: () => undefined });
    vi.advanceTimersByTime(5000);
    expect(events).toEqual(['+vfx-rewind@0', `-vfx-rewind@${glitch[0] + 100}`]);
  });
});

describe('chute du roi maté (board.css, pi-fall-*) et coup de grâce', () => {
  it('même durée en JS et en CSS', async () => {
    expect(animationMs(BOARD_CSS, 'pi-fall-r')).toEqual([MATE_FALL_MS]);
    expect(animationMs(BOARD_CSS, 'pi-fall-l')).toEqual([MATE_FALL_MS]);
    const { FINALE_S } = await import('../src/client/vfx/effects');
    expect(Math.round(FINALE_S * 1000)).toBe(MATE_FALL_MS);
  });
});

describe('bandeau de sort (game.css, .gp-cast)', () => {
  it('GamePage le retire à la fin de son animation', () => {
    const [ms] = animationMs(css('game.css'), 'gp-cast');
    expect(ms).toBe(1600);
    // GamePage (lot de la partie) : la minuterie qui retire le bandeau, et le seuil d'âge qu'elle vérifie (un bandeau
    // plus récent, d'un sort suivant, reste)
    const src = readFileSync(new URL('../src/client/game/GamePage.tsx', import.meta.url), 'utf8');
    const m = /setCasting\(c => \(c && Date\.now\(\) - c\.key > (\d+) \? null : c\)\), (\d+)\)/.exec(src);
    expect(m, 'minuterie du bandeau dans GamePage').not.toBeNull();
    expect(Number(m![2])).toBe(ms);
    expect(Number(m![1])).toBeLessThan(ms);
  });
});
