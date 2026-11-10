// Textures des sorts (src/client/vfx/textures.ts) et coup de grâce (effects.ts, playFinale), sans navigateur : un
// canevas factice enregistre chaque appel et chaque réglage du contexte 2D.
// - Chaque forme de particule et chaque motif a son peintre (tables indexées par les unions : exhaustives à la
//   compilation), chacun dessine quelque chose, et les skins du catalogue n'emploient que des formes dessinées.
// - Plus de texture provisoire : `shard`, `laurel` et `filigree` ont leur propre dessin.
// - Les 12 textures d'avant les skins n'ont pas changé d'un trait (empreintes du code du commit e5da309).
// - Le coup de grâce tient dans la chute du roi maté (1,25 s), ne lance qu'une gerbe, et ne joue rien avec le
//   mouvement réduit ou sans WebGL.
// Le rendu réel (pixels, captures, banc) est dans test/sorts.mjs.
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { ITEMS, skinStyle } from '../src/shared/catalog';
import type { Flourish, ParticleShape } from '../src/shared/catalog';
import { FINALE_S, flourishColor, playFinale } from '../src/client/vfx/effects';
import type { Fx, VfxStage } from '../src/client/vfx/stage';
import { FLOURISH_PAINTERS, PARTICLE_PAINTERS, flourishTexture, particleTexture } from '../src/client/vfx/textures';

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
});

// ---------------------------------------------------------------------------------------------
// Coup de grâce

/** Scène factice : effets et particules enregistrés, horloge avancée image par image. */
function fakeStage(over: Partial<{ ok: boolean; reduced: boolean }> = {}) {
  const fx: Fx[] = [];
  const emits: { at: number; life: number; z: number }[] = [];
  const board = new THREE.Group();
  let clock = 0;
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
  /** Avance jusqu'à ce que plus aucun effet ne vive ; renvoie l'instant du dernier, et le plus d'objets posés à la fois. */
  const run = (dt = 1 / 60) => {
    let most = 0;
    while (fx.length && clock < 10) {
      clock += dt;
      for (let i = fx.length - 1; i >= 0; i--) {
        if (!fx[i].update(dt, clock)) {
          fx[i].dispose?.();
          fx.splice(i, 1);
        }
      }
      most = Math.max(most, board.children.length);
    }
    return { end: clock, most };
  };
  return { stage, fx, emits, board, run };
}

describe('coup de grâce (playFinale)', () => {
  it('tient dans la chute du roi maté et s’éteint de lui-même', () => {
    expect(FINALE_S).toBe(1.25);
    for (const id of ['skin:arcane', 'skin:inferno', 'skin:laurier', 'skin:ecarlate', 'skin:void']) {
      const { stage, emits, board, run } = fakeStage();
      expect(playFinale(stage, 60, skinStyle(id)), id).toBe(true);
      const dt = 1 / 60;
      const { end, most } = run(dt);
      // Le dernier effet meurt avant la fin de la chute (à une image près) ; plus rien n'est posé sur l'échiquier
      expect(end, id).toBeLessThanOrEqual(FINALE_S + dt);
      expect(board.children.length, id).toBe(0);
      // Motif et onde : deux objets au plus à la fois
      expect(most, id).toBeLessThanOrEqual(2);
      // Une seule gerbe : 64 particules lancées en moins de 0,2 s, quand le roi bascule, toutes éteintes avant 1,25 s
      expect(emits.length, id).toBe(64);
      const first = Math.min(...emits.map(e => e.at)), last = Math.max(...emits.map(e => e.at));
      expect(first, id).toBeGreaterThanOrEqual(0.4);
      expect(last - first, id).toBeLessThan(0.2);
      for (const e of emits) expect(e.at + e.life, id).toBeLessThanOrEqual(FINALE_S);
    }
  });

  it('la couronne de Laurier se referme sur le roi (deux moitiés qui pivotent au nœud)', () => {
    const { stage, fx, board } = fakeStage();
    playFinale(stage, 60, skinStyle('skin:laurier'));
    // Jusqu'à l'apparition du motif (0,18 s), puis un peu après
    const step = (s: number) => {
      for (let t = 0; t < s; t += 1 / 60) for (const f of [...fx]) f.update(1 / 60, 0);
    };
    step(0.24);
    const crown = board.children.find(c => c.children.length === 2)!;
    expect(crown).toBeDefined();
    const [left, right] = crown.children;
    // Encore ouverte : chaque moitié penche vers l'extérieur, en miroir
    expect(left.rotation.z).toBeGreaterThan(0.05);
    expect(right.rotation.z).toBeCloseTo(-left.rotation.z, 6);
    step(0.5);
    expect(Math.abs(left.rotation.z)).toBeLessThan(1e-3);
    expect(Math.abs(right.rotation.z)).toBeLessThan(1e-3);
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
