// Textures des sorts (src/client/vfx/textures.ts) et coup de grâce (effects.ts, playFinale), sans navigateur : un
// canevas factice enregistre chaque appel et chaque réglage du contexte 2D.
// - Chaque forme de particule et chaque motif a son peintre (tables indexées par les unions : exhaustives à la
//   compilation), chacun dessine quelque chose, et les skins du catalogue n'emploient que des formes dessinées.
// - Plus de texture provisoire : `shard`, `laurel` et `filigree` ont leur propre dessin.
// - Les 12 textures d'avant les skins n'ont pas changé d'un trait (empreintes du code du commit e5da309).
// - Le filigrane prend la couleur de la carte comme les autres motifs (tinted).
// - Le coup de grâce tient dans la chute du roi maté (MATE_FALL_MS), calé sur ses instants (relus dans board.css), ne
//   lance qu'une gerbe et une onde, rien sur la case du roi, et ne joue rien avec le mouvement réduit ou sans WebGL.
// Le rendu réel (pixels, captures, banc) est dans test/sorts.mjs.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { ITEMS, skinStyle } from '../src/shared/catalog';
import type { Flourish, ParticleShape } from '../src/shared/catalog';
import { MATE_FALL_MS } from '../src/client/components/mate';
import { FALL_AT, FINALE_S, flourishColor, flourishDisk, playFinale, tinted } from '../src/client/vfx/effects';
import type { Fx, VfxStage } from '../src/client/vfx/stage';
import { FLOURISH_PAINTERS, PARTICLE_PAINTERS, PARTICLE_SIZE, flourishTexture, leafPainter, particleTexture } from '../src/client/vfx/textures';

/** Contexte 2D factice : la suite des appels et des réglages, nombres arrondis au millième. */
function fakeContext() {
  const ops: string[] = [];
  let grad = 0;
  const fmt = (v: unknown): string =>
    typeof v === 'number' ? String(Math.round(v * 1000) / 1000)
    : Array.isArray(v) ? `[${v.map(fmt).join(',')}]`
    : v && typeof v === 'object' && 'grad' in v ? `grad#${(v as { grad: number }).grad}`
    : String(v);
  const state: Record<string, unknown> = {};
  const ctx = new Proxy(state, {
    get(_t, p) {
      if (typeof p !== 'string') return undefined;
      if (p === 'createLinearGradient' || p === 'createRadialGradient')
        return (...a: unknown[]) => {
          const id = ++grad;
          ops.push(`${p}#${id}(${a.map(fmt).join(',')})`);
          return { grad: id, addColorStop: (o: number, c: string) => ops.push(`#${id}.stop(${fmt(o)},${c})`) };
        };
      if (p in state) return state[p];
      return (...a: unknown[]) => void ops.push(`${p}(${a.map(fmt).join(',')})`);
    },
    set(_t, p, v) {
      state[p as string] = v;
      ops.push(`${String(p)}=${fmt(v)}`);
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, ops };
}

// Les textures créent leur canevas par document.createElement
vi.stubGlobal('document', {
  createElement: () => {
    const { ctx, ops } = fakeContext();
    return { width: 0, height: 0, getContext: () => ctx, ops };
  },
});

const opsOf = (t: THREE.Texture) => (t.image as { ops: string[] }).ops;
const print = (ops: string[]) => `${createHash('sha256').update(ops.join('\n')).digest('hex')} ${ops.length}`;
/** Appels qui posent de l'encre. */
const INK = /^(fill|stroke|fillRect|strokeRect)\(/;

const SHAPES = ['glow', 'ember', 'pixel', 'star', 'petal', 'void', 'shard'] as const satisfies readonly ParticleShape[];
const FLOURISHES = ['runes', 'flames', 'grid', 'constellation', 'vortex', 'petals', 'laurel', 'filigree'] as const satisfies readonly Flourish[];

/** Empreintes des textures d'avant les skins (code du commit e5da309, avant le lot des sorts). */
const BEFORE: Record<string, string> = {
  'p:glow': '608d9bfa62ec3c84e6e3f30a75fe811e7799c60c3c6edf515f087e909bed8883 7',
  'p:ember': '6bc7fa10e9a4bfc26559fa0543afeb88376cfa51c54c048564f95839576db29b 9',
  'p:pixel': '77394d9cb8c4572a30bf016acbe0265a1defdd84d325385647d26469d7c79533 4',
  'p:star': 'f78c676bc0fc58303f98f1a5d2d65324f83c5c1b37030b3c1f76a73553c737de 17',
  'p:petal': '4320a665b26a878a1525d89f458aca6254645145234ba0f59882b0bd7f6d13c0 12',
  'p:void': '9480e3242b158725041a25ec84ff5e6f2041ecac91ac2d86456754f88691314b 8',
  'f:runes': '0416a3e049fcf9bd729e77551d5c06cf2f50529f6619a84210fe829ff2eb1313 324',
  'f:flames': '1fef9cd1035ffe954f2d79d6f216b207e04bb753db77ca99a4fd8cdbdf664a2a 420',
  'f:grid': '7b06208d5717c0b082503fe0ddf8f640f93d073cb509e47367f38dedac0e106a 58',
  'f:constellation': '3e4ab75d99f7133cb6f3e6d00439857041c2b460efcfb24631e2ba8ccd89dd1b 90',
  'f:vortex': '2957dd718ec332b933dc6355b4eb93e880af6749d3de3979a3d578673a4a8055 528',
  'f:petals': '6aa9f45465b7d036d7a20b9f78c71da40977121f67e7d9279f733437ee1759fa 177',
};

describe('textures des sorts', () => {
  it('une table de peintres exhaustive pour chaque union', () => {
    expectTypeOf<keyof typeof PARTICLE_PAINTERS>().toEqualTypeOf<ParticleShape>();
    expectTypeOf<keyof typeof FLOURISH_PAINTERS>().toEqualTypeOf<Flourish>();
    expectTypeOf<(typeof SHAPES)[number]>().toEqualTypeOf<ParticleShape>();
    expectTypeOf<(typeof FLOURISHES)[number]>().toEqualTypeOf<Flourish>();
    expect(Object.keys(PARTICLE_PAINTERS).sort()).toEqual([...SHAPES].sort());
    expect(Object.keys(FLOURISH_PAINTERS).sort()).toEqual([...FLOURISHES].sort());
  });

  it('chaque forme et chaque motif dessine quelque chose', () => {
    for (const s of SHAPES) expect(opsOf(particleTexture(s)).filter(o => INK.test(o)).length, s).toBeGreaterThan(0);
    for (const f of FLOURISHES) expect(opsOf(flourishTexture(f)).filter(o => INK.test(o)).length, f).toBeGreaterThan(0);
    // Les nouveaux motifs sont riches : couronne de 36 feuilles, filigrane de 72 perles et 24 fleurons
    expect(opsOf(flourishTexture('laurel')).filter(o => o.startsWith('fill(')).length).toBeGreaterThanOrEqual(36);
    expect(opsOf(flourishTexture('filigree')).filter(o => o.startsWith('fill(')).length).toBeGreaterThanOrEqual(72 + 24);
    expect(opsOf(particleTexture('shard')).filter(o => o.startsWith('fill(')).length).toBe(4);
  });

  it('la feuille proposée pour Laurier dessine, sans aucune couleur (la particule la teint seule)', () => {
    const { ctx, ops } = fakeContext();
    leafPainter(ctx, PARTICLE_SIZE);
    expect(ops.filter(o => INK.test(o)).length).toBeGreaterThanOrEqual(3);
    // Rien que des gris : multipliée par la couleur de la particule, elle la garde (le pétale la rosit)
    const colors = ops.filter(o => /^(fill|stroke)Style=/.test(o)).map(o => o.split('=')[1]);
    expect(colors.length).toBeGreaterThan(0);
    for (const c of colors) expect(c, c).toMatch(/^rgb\((\d+),\1,\1\)$/);
  });

  it('plus de texture provisoire : éclat, laurier et filigrane ont leur propre dessin', () => {
    expect(print(opsOf(particleTexture('shard')))).not.toBe(print(opsOf(particleTexture('star'))));
    expect(print(opsOf(flourishTexture('laurel')))).not.toBe(print(opsOf(flourishTexture('petals'))));
    expect(print(opsOf(flourishTexture('filigree')))).not.toBe(print(opsOf(flourishTexture('runes'))));
    const all = [...SHAPES.map(s => print(opsOf(particleTexture(s)))), ...FLOURISHES.map(f => print(opsOf(flourishTexture(f))))];
    expect(new Set(all).size).toBe(all.length);
  });

  it('les textures d’avant les skins n’ont pas changé d’un trait', () => {
    for (const [key, sum] of Object.entries(BEFORE)) {
      const [kind, name] = key.split(':');
      const t = kind === 'p' ? particleTexture(name as ParticleShape) : flourishTexture(name as Flourish);
      expect(print(opsOf(t)), key).toBe(sum);
    }
  });

  it('chaque skin de sorts du catalogue n’emploie que des formes et des motifs dessinés', () => {
    const skins = ITEMS.filter(i => i.kind === 'skin');
    expect(skins.length).toBe(8);
    for (const i of skins) {
      expect(PARTICLE_PAINTERS[i.skin!.particle], i.id).toBeTypeOf('function');
      expect(FLOURISH_PAINTERS[i.skin!.flourish], i.id).toBeTypeOf('function');
    }
    // Les deux nouveaux skins portent leurs vraies textures, plus les remplaçantes du lot 0
    expect(skinStyle('skin:laurier')).toMatchObject({ particle: 'petal', flourish: 'laurel' });
    expect(skinStyle('skin:ecarlate')).toMatchObject({ particle: 'shard', flourish: 'filigree' });
  });

  it('une texture se dessine une seule fois ; une forme inconnue se rabat sur la lueur', () => {
    expect(particleTexture('shard')).toBe(particleTexture('shard'));
    expect(flourishTexture('filigree')).toBe(flourishTexture('filigree'));
    expect(print(opsOf(particleTexture('inconnue' as ParticleShape)))).toBe(BEFORE['p:glow']);
    expect(print(opsOf(flourishTexture('inconnu' as Flourish)))).toBe(BEFORE['f:runes']);
  });

  it('le filigrane d’Écarlate est d’or ; les autres motifs prennent la couleur des effets', () => {
    expect('#' + flourishColor(skinStyle('skin:ecarlate')).getHexString()).toBe('#ffc861');
    expect('#' + flourishColor(skinStyle('skin:laurier')).getHexString()).toBe('#f3d27a');
    expect('#' + flourishColor(skinStyle('skin:inferno')).getHexString()).toBe('#ff7a1a');
    // Néant : particules sombres, motif à la couleur d'éclat
    expect('#' + flourishColor(skinStyle('skin:void')).getHexString()).toBe('#d9b8ff');
  });

  it('teint par une carte, le filigrane prend sa couleur comme les autres motifs', () => {
    const sea = new THREE.Color('#3fe0d0');
    const near = (c: THREE.Color, to: THREE.Color) => Math.hypot(c.r - to.r, c.g - to.g, c.b - to.b);
    // Grande Marée (turquoise, 0,7) : Écarlate n'a plus un anneau d'or pur, il tire vers le turquoise comme Inferno
    const ecarlate = flourishColor(tinted(skinStyle('skin:ecarlate'), '#3fe0d0', 0.7));
    expect('#' + ecarlate.getHexString()).not.toBe('#ffc861');
    expect(near(ecarlate, sea)).toBeLessThan(near(new THREE.Color('#ffc861'), sea) * 0.4);
    expect(near(ecarlate, sea)).toBeLessThan(near(flourishColor(tinted(skinStyle('skin:inferno'), '#3fe0d0', 0.7)), sea) + 0.05);
    // Les autres skins ne bougent pas : seule la couleur secondaire du filigrane est en plus teinte
    for (const id of ['skin:arcane', 'skin:inferno', 'skin:laurier', 'skin:sakura', 'skin:void', 'skin:neon', 'skin:celestial']) {
      const s = skinStyle(id);
      const t = tinted(s, '#3fe0d0', 0.7);
      expect(t.secondary, id).toBe(s.secondary);
      expect('#' + flourishColor(t).getHexString(), id).toBe(s.particle === 'void' ? t.accent : t.primary);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Coup de grâce

/**
 * Scène factice : effets et particules enregistrés, horloge avancée image par image. L'horloge murale
 * (performance.now, que suit le coup de grâce) avance avec elle.
 */
function fakeStage(over: Partial<{ ok: boolean; reduced: boolean }> = {}) {
  const fx: Fx[] = [];
  const emits: { at: number; life: number; z: number }[] = [];
  const board = new THREE.Group();
  let clock = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => clock * 1000);
  const stage = {
    ok: true,
    reduced: false,
    board,
    tilt: 0,
    orientation: 'w',
    local: (sq: number) => new THREE.Vector3((sq & 7) - 3.5, (sq >> 3) - 3.5, 0),
    particles: () => ({ emit: (o: { life: number; z: number }) => emits.push({ at: clock, life: o.life, z: o.z }) }),
    add: (f: Fx) => fx.push(f),
    ...over,
  } as unknown as VfxStage;
  /**
   * Avance jusqu'à ce que plus aucun effet ne vive (images de `dt` secondes, plafonnées à 0,1 s pour les effets comme
   * dans VfxStage) ; renvoie l'instant du dernier, le plus d'objets posés à la fois, et le plus petit rayon de l'onde.
   */
  const run = (dt = 1 / 60) => {
    let most = 0;
    let inner = Infinity;
    while (fx.length && clock < 10) {
      clock += dt;
      for (let i = fx.length - 1; i >= 0; i--) {
        if (!fx[i].update(Math.min(0.1, dt), clock)) {
          fx[i].dispose?.();
          fx.splice(i, 1);
        }
      }
      most = Math.max(most, board.children.length);
      for (const c of board.children) {
        const ring = (c as THREE.Mesh).geometry as THREE.RingGeometry | undefined;
        if (ring?.parameters?.innerRadius !== undefined) inner = Math.min(inner, ring.parameters.innerRadius * c.scale.x);
      }
    }
    return { end: clock, most, inner };
  };
  return { stage, fx, emits, board, run };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('coup de grâce (playFinale)', () => {
  const topple = FALL_AT.topple * FINALE_S;

  it('tient dans la chute du roi maté et s’éteint de lui-même, sans rien poser sur la case du roi', () => {
    expect(FINALE_S).toBe(MATE_FALL_MS / 1000);
    for (const id of ['skin:arcane', 'skin:inferno', 'skin:laurier', 'skin:ecarlate', 'skin:void']) {
      const { stage, emits, board, run } = fakeStage();
      expect(playFinale(stage, 60, skinStyle(id)), id).toBe(true);
      const dt = 1 / 60;
      const { end, most, inner } = run(dt);
      // Le dernier effet meurt avant la fin de la chute (à une image près) ; plus rien n'est posé sur l'échiquier
      expect(end, id).toBeLessThanOrEqual(FINALE_S + dt);
      expect(board.children.length, id).toBe(0);
      // L'onde seule : pas de motif, et elle part du bord de la case (le roi couché va de 7 à 94 % de sa case)
      expect(most, id).toBe(1);
      expect(inner, id).toBeGreaterThanOrEqual(0.45);
      // Une seule gerbe : 64 particules lancées en moins de 0,2 s, quand le roi bascule, toutes éteintes avant la fin
      expect(emits.length, id).toBe(64);
      const first = Math.min(...emits.map(e => e.at)), last = Math.max(...emits.map(e => e.at));
      expect(first, id).toBeGreaterThanOrEqual(topple);
      expect(last - first, id).toBeLessThan(0.2);
      for (const e of emits) expect(e.at + e.life, id).toBeLessThanOrEqual(FINALE_S);
    }
  });

  it('se cale sur la chute déjà commencée (elapsedMs) et sur l’horloge murale, pas sur celle de la scène', () => {
    // Appelé 0,6 s après le début de la chute (module des effets chargé en retard) : la gerbe, en retard, part tout de
    // suite et d'un coup, et tout s'éteint quand la chute finit, 0,65 s plus tard
    {
      const { stage, emits, run } = fakeStage();
      expect(playFinale(stage, 60, skinStyle('skin:ecarlate'), 600)).toBe(true);
      const dt = 1 / 60;
      const { end } = run(dt);
      expect(end).toBeLessThanOrEqual(FINALE_S - 0.6 + dt);
      expect(emits.length).toBe(64);
      expect(Math.max(...emits.map(e => e.at))).toBeLessThanOrEqual(dt + 1e-9);
      for (const e of emits) expect(0.6 + e.at + e.life).toBeLessThanOrEqual(FINALE_S);
    }
    // Images de 0,3 s (la scène, elle, ne compte que 0,1 s par image) : rien ne déborde de la chute
    {
      const { stage, emits, run } = fakeStage();
      playFinale(stage, 60, skinStyle('skin:laurier'));
      const { end } = run(0.3);
      expect(end).toBeLessThanOrEqual(FINALE_S + 0.3);
      expect(emits.length).toBe(64);
      for (const e of emits) expect(e.at).toBeGreaterThanOrEqual(topple);
      for (const e of emits) expect(e.at + e.life).toBeLessThanOrEqual(FINALE_S);
    }
    // Chute presque finie : rien à jouer
    {
      const { stage, fx } = fakeStage();
      expect(playFinale(stage, 60, skinStyle('skin:laurier'), 1100)).toBe(false);
      expect(fx.length).toBe(0);
    }
  });

  it('ne joue rien avec le mouvement réduit, sans WebGL ou hors de l’échiquier', () => {
    for (const [over, sq] of [[{ reduced: true }, 60], [{ ok: false }, 60], [{}, -1], [{}, 64], [{}, 2.5]] as const) {
      const { stage, fx, emits } = fakeStage(over);
      expect(playFinale(stage, sq, skinStyle('skin:ecarlate'))).toBe(false);
      expect(fx.length).toBe(0);
      expect(emits.length).toBe(0);
    }
  });
});

describe('couronne de Laurier', () => {
  it('se referme sous les yeux : visible encore ouverte, deux moitiés qui pivotent au nœud, sans tourner', () => {
    const { stage, fx, board } = fakeStage();
    const life = 1.2;
    flourishDisk(stage, skinStyle('skin:laurier'), new THREE.Vector3(0, 0, 0), 1.3, life);
    const step = (s: number) => {
      for (let t = 0; t < s - 1e-9; t += 1 / 60) for (const f of [...fx]) f.update(1 / 60, 0);
    };
    step(0.12);
    const crown = board.children.find(c => c.children.length === 2)!;
    expect(crown).toBeDefined();
    const [left, right] = crown.children;
    const opacity = () => ((left as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity;
    // À 10 % de sa vie : déjà bien visible, et encore presque grande ouverte (chaque moitié penche vers l'extérieur)
    expect(opacity()).toBeGreaterThan(0.9);
    expect(left.rotation.z).toBeGreaterThan(0.35);
    expect(right.rotation.z).toBeCloseTo(-left.rotation.z, 6);
    expect(crown.rotation.z).toBe(0);
    // Fermée à 40 % de sa vie, et droite
    step(0.4 * life - 0.12);
    expect(Math.abs(left.rotation.z)).toBeLessThan(1e-3);
    expect(Math.abs(right.rotation.z)).toBeLessThan(1e-3);
    expect(crown.rotation.z).toBe(0);
  });
});

describe('la chute du roi (board.css) et le coup de grâce sont calés ensemble', () => {
  const css = readFileSync(new URL('../src/client/styles/board.css', import.meta.url), 'utf8');
  for (const side of ['r', 'l'] as const) {
    it(`@keyframes pi-fall-${side} : durée, bascule et impact`, () => {
      // Durée de l'animation : celle de la chute (MATE_FALL_MS), donc du coup de grâce
      const dur = new RegExp(`animation:\\s*pi-fall-${side}\\s+([\\d.]+)s`).exec(css);
      expect(Number(dur?.[1]) * 1000).toBe(MATE_FALL_MS);
      const body = new RegExp(`@keyframes pi-fall-${side}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(css)![1];
      const frames = [...body.matchAll(/((?:\d+%,?\s*)+)\{([^}]*)\}/g)].flatMap(([, sel, decl]) => {
        const rot = /rotate:\s*(-?[\d.]+)deg/.exec(decl);
        return sel.split(',').map(p => ({ at: parseFloat(p) / 100, rotate: rot ? Number(rot[1]) : null, upright: /translate:\s*0% 0%/.test(decl) }));
      });
      // Le roi bascule à FALL_AT.topple : dernière image encore debout, juste avant la chute
      const i = frames.findIndex(f => f.at === FALL_AT.topple);
      expect(i).toBeGreaterThan(0);
      expect(frames[i].upright).toBe(true);
      expect(Math.abs(frames[i].rotate ?? 99)).toBeLessThan(10);
      // Il touche sa case à FALL_AT.impact : première image couchée (± 90°), celle qui suit la bascule
      const lying = frames.find(f => Math.abs(f.rotate ?? 0) === 90)!;
      expect(lying.at).toBe(FALL_AT.impact);
      expect(frames[i + 1]).toBe(lying);
    });
  }
});
