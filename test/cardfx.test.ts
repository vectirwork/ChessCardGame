// Ce qui distingue une carte à l'écran ou à l'oreille, sans navigateur.
// - Caractérisation (empreintes prises sur le code d'avant le lot 4, commit 0216820) : chaque mise en scène (sort
//   lancé, arrivée d'un Présage, mouvement réduit) est jouée image par image sur une scène factice, hasard semé ; tout
//   ce qu'elle pose sur l'échiquier (objets, couleurs, opacités, positions), chaque particule, l'inclinaison, l'éclair,
//   la secousse, les ambiances (classe, pose et retrait) et l'impact sont relevés et résumés par une empreinte. Même
//   empreinte : même image, et même suite d'appels à Math.random. De même pour le son de chaque carte (Web Audio
//   factice).
// Le rendu réel (pixels) est dans test/sorts.mjs.
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CARD_IDS, CARDS } from '../src/shared/cards';
import type { CardId } from '../src/shared/cards';
import { skinStyle } from '../src/shared/catalog';
import type { SkinStyle } from '../src/shared/catalog';
import type { CardInfo, Effect } from '../src/shared/game';
import type { Fx, VfxStage } from '../src/client/vfx/stage';

// ---------------------------------------------------------------------------------------------
// Environnement factice : canevas (textures), fenêtre (minuteries), hasard semé

/** Contexte 2D qui accepte tout (les textures sont dessinées, rien n'est relevé ici). */
function nullContext(): CanvasRenderingContext2D {
  const grad = { addColorStop: () => undefined };
  return new Proxy({} as Record<string, unknown>, {
    get(t, p) {
      if (typeof p !== 'string') return undefined;
      if (p in t) return t[p];
      if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => grad;
      if (p === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      return () => undefined;
    },
    set(t, p, v) {
      t[p as string] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}
vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: nullContext }) });

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r6 = (v: number) => (Object.is(v, -0) ? 0 : Math.round(v * 1e6) / 1e6);
const v3 = (v: { x: number; y: number; z: number }) => `${r6(v.x)},${r6(v.y)},${r6(v.z)}`;

type Effects = typeof import('../src/client/vfx/effects');
let fx: Effects;

beforeAll(async () => {
  fx = await import('../src/client/vfx/effects');
  // Textures dessinées une fois pour toutes avant les relevés (cache du module) : chaque relevé ne dépend pas de l'ordre
  const tex = await import('../src/client/vfx/textures');
  for (const s of Object.keys(tex.PARTICLE_PAINTERS)) tex.particleTexture(s as never);
  for (const f of Object.keys(tex.FLOURISH_PAINTERS)) tex.flourishTexture(f as never);
  tex.bandTexture();
  tex.beamTexture();
  tex.softDiskTexture();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------------------------
// Scène factice : mêmes règles que VfxStage pour les effets (liste filtrée à chaque image, attente par effet), tout le
// reste relevé

/** Pions affichés (cases), pour l'Ère glaciaire : position de départ. */
const PAWNS = [8, 9, 10, 11, 12, 13, 14, 15, 48, 49, 50, 51, 52, 53, 54, 55];

function fakeStage(orientation: 'w' | 'b', reduced: boolean, log: (s: string) => void) {
  let fxs: Fx[] = [];
  let now = 0;
  const classes = new Set<string>();
  const wrap = {
    classList: {
      add: (c: string) => {
        classes.add(c);
        log(`+${c}@${Date.now()}`);
      },
      remove: (c: string) => {
        classes.delete(c);
        log(`-${c}@${Date.now()}`);
      },
      contains: (c: string) => classes.has(c),
      toggle: () => undefined,
    },
    style: { setProperty: () => undefined, translate: '' },
    querySelectorAll: (sel: string) =>
      sel.includes('pawn') ? PAWNS.map(sq => ({ classList: { contains: () => false }, dataset: { at: String(sq) } })) : [],
  };
  const stage = {
    ok: true,
    reduced,
    guard: false,
    family: null,
    orientation,
    tilt: 0,
    zoom: 1,
    time: 0,
    board: new THREE.Group(),
    wrap,
    local(sq: number, z = 0) {
      const f = sq & 7, r = sq >> 3;
      return orientation === 'w' ? new THREE.Vector3(f - 3.5, r - 3.5, z) : new THREE.Vector3(3.5 - f, 3.5 - r, z);
    },
    particles(skin: SkinStyle, shape = skin.particle) {
      return {
        emit(o: Record<string, unknown> & { color: THREE.Color; attract?: { x: number; y: number; z: number; k: number } }) {
          const a = o.attract;
          log(
            `p ${shape} ${['x', 'y', 'z', 'vx', 'vy', 'vz', 'size', 'life', 'gravity', 'drag', 'spin', 'fadeIn'].map(k => (o[k] === undefined ? '-' : r6(o[k] as number))).join(',')}` +
              ` #${o.color.getHexString()}${a ? ` a${v3(a)},${r6(a.k)}` : ''}`,
          );
        },
      };
    },
    add(f: Fx) {
      fxs.push(f);
    },
    tween(duration: number, fn: (k: number) => void, delay = 0, done?: () => void) {
      let t = -delay;
      this.add({
        update: (dt: number) => {
          t += dt;
          if (t < 0) return true;
          const k = Math.min(1, t / duration);
          fn(k);
          if (k >= 1) {
            done?.();
            return false;
          }
          return true;
        },
      });
    },
    wait(seconds: number) {
      log(`wait ${seconds}`);
      return new Promise<void>(resolve => {
        let t = 0;
        this.add({
          update: (dt: number) => {
            t += dt;
            if (t >= seconds) {
              resolve();
              return false;
            }
            return true;
          },
        });
      });
    },
    cinematic(hold: number, tilt = 0.5, zoom = 1.04) {
      log(`cine ${hold} ${tilt} ${zoom}`);
      return reduced ? null : { start: 0, hold, tilt, zoom };
    },
    release: (c: unknown) => log(`release ${c ? 'cine' : 'null'}@${Date.now()}`),
    shake: (amount: number, duration = 0.45) => log(`shake ${r6(amount)} ${duration}`),
    flash: (color: string, intensity: number) => log(`flash ${color} ${r6(intensity)}`),
    later: (fn: () => void, ms: number) => {
      log(`later ${ms}`);
      window.setTimeout(fn, ms);
    },
  };
  /** Une image de `dt` secondes : minuteries, effets (comme VfxStage.step), puis promesses. */
  const frame = async (dt: number) => {
    vi.advanceTimersByTime(dt * 1000);
    now += dt;
    stage.time = now;
    fxs = fxs.filter(f => {
      let alive = false;
      try {
        alive = f.update(dt, now);
      } catch (err) {
        log(`erreur ${String(err)}`);
      }
      if (!alive) f.dispose?.();
      return alive;
    });
    for (let i = 0; i < 6; i++) await Promise.resolve();
  };
  return { stage: stage as unknown as VfxStage, frame, alive: () => fxs.length };
}

/** Relevé des objets posés sur l'échiquier (types, transformations, matériaux), dans l'ordre de la scène. */
function boardState(board: THREE.Object3D): string {
  const out: string[] = [];
  board.traverse(o => {
    if (o === board) return;
    let s = `${o.type}${o.visible ? '' : '!'} ${v3(o.position)} ${v3(o.scale)} ${v3(o.rotation)} ${o.renderOrder}`;
    const mats = (o as THREE.Mesh).material;
    for (const m of mats ? (Array.isArray(mats) ? mats : [mats]) : []) {
      const mm = m as THREE.MeshBasicMaterial & THREE.ShaderMaterial;
      s += ` [${m.type} ${mm.color ? '#' + mm.color.getHexString() : ''} ${r6(m.opacity)} ${m.blending} ${m.side} ${mm.map ? 'map' : ''}`;
      if (mm.uniforms) for (const [k, u] of Object.entries(mm.uniforms)) if (typeof u.value === 'number') s += ` ${k}=${r6(u.value)}`;
      s += ']';
    }
    const g = (o as THREE.Mesh).geometry;
    if (g) s += ` ${g.type} ${g.getAttribute('position')?.count ?? 0}`;
    out.push(s);
  });
  return out.join('\n');
}

const INFO = (card: CardId, skin: string): CardInfo => ({
  card,
  caster: 'w',
  targets: [36, 27],
  pieces: [5, 6],
  skin,
  moves: [
    { from: 8, to: 16 },
    { from: 9, to: 17 },
    { from: 52, to: 44 },
  ],
});
const ARRIVAL = (card: CardId, skin: string): Effect => ({ id: 7, card, caster: 'w', countsOn: 'w', remaining: 6, total: 6, skin, global: true });

type Mode = 'cast' | 'reduit' | 'arrivee';
/** Variantes jouées pour chaque carte : skins aux traits différents (laurier, filigrane, néant), et les Noirs en bas. */
const VARIANTS: [string, 'w' | 'b'][] = [
  ['skin:arcane', 'w'],
  ['skin:laurier', 'w'],
  ['skin:ecarlate', 'b'],
  ['skin:void', 'w'],
  ['skin:sakura', 'w'],
];

/** Joue une mise en scène et renvoie son relevé complet. */
async function trace(card: CardId, mode: Mode, skinId: string, orientation: 'w' | 'b'): Promise<string> {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'], now: 0 });
  vi.stubGlobal('window', { setTimeout: (f: () => void, ms: number) => setTimeout(f, ms), clearTimeout: (id: number) => clearTimeout(id) });
  const rand = mulberry(20261113);
  vi.spyOn(Math, 'random').mockImplementation(rand);
  const lines: string[] = [];
  const log = (s: string) => lines.push(s);
  const { stage, frame, alive } = fakeStage(orientation, mode === 'reduit', log);
  const skin = skinStyle(skinId);
  let done = false;
  if (mode === 'arrivee') fx.playArrival(stage, ARRIVAL(card, skinId), skin);
  else {
    void fx
      .playCast(stage, INFO(card, skinId), skin, {
        impact: () => log(`impact@${Date.now()}`),
        hide: ids => log(`hide ${ids}@${Date.now()}`),
        show: ids => log(`show ${ids}@${Date.now()}`),
        victimAtBottom: true,
      })
      .then(() => {
        done = true;
        log(`fin@${Date.now()}`);
      });
  }
  for (let i = 0; i < 300 && (alive() || !done || i < 220); i++) {
    await frame(0.016);
    log(`#${i}\n${boardState(stage.board)}`);
    if (mode === 'arrivee' && !alive() && i >= 220) break;
  }
  // Minuteries restantes (garde-fou de l'inclinaison, ambiances longues)
  vi.advanceTimersByTime(5000);
  for (let i = 0; i < 6; i++) await Promise.resolve();
  vi.unstubAllGlobals();
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: nullContext }) });
  if (process.env.CARDFX_DUMP === `${card}-${mode}-${skinId}`) (await import('node:fs')).writeFileSync(`${process.env.CARDFX_DUMP_DIR}/${card}-${mode}.txt`, lines.join('\n'));
  return lines.join('\n');
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16);

/** Empreinte d'une carte dans un mode : toutes les variantes, à la suite. */
async function print(card: CardId, mode: Mode): Promise<string> {
  const parts: string[] = [];
  for (const [skin, o] of mode === 'reduit' ? VARIANTS.slice(0, 2) : VARIANTS) parts.push(await trace(card, mode, skin, o));
  return sha(parts.join('\n====\n'));
}

const PRESAGES = CARD_IDS.filter(id => CARDS[id].presage);

/**
 * Empreintes du code d'avant le lot 4 (0216820) : tables IMPACT_AT, TILT, SHAKE, FLASH et SCENES de effects.ts,
 * teintes en dur dans chaque scène, ambiances posées par Scene.mood ou par un setTimeout brut, traits des skins comparés
 * à 'void', 'filigree' et 'laurel'. `cast` : sort lancé (annonce pour un Présage) ; `reduit` : mouvement réduit ;
 * `arrivee` : arrivée d'un Présage (playArrival).
 */
const EXPECTED: Record<Mode, Partial<Record<CardId, string>>> = {
  cast: {
    hourglass: 'ed32befa0b48ead1',
    truce: 'ed2c8fa5b0a424b7',
    blood_moon: '722e2bdeb69a74cf',
    ice_age: '73cd2b107541f0fc',
    blast: '7ab365dc97250558',
    ice_wall: '6f5a2bcfb00632ae',
    rift: '83fc50470870e65d',
    tide: '64e0ae43dce7e8e7',
    time_warp: 'ec33390311c36dce',
    gravity: '45a370b16dbe4063',
    freeze: '44495f601a5f0124',
    shield: '32aa5f36e2b401da',
    swap: 'a45c59e1014622ea',
    rewind: 'd4d51cf15a164b0d',
    revive: 'cb69e88e813be262',
    knight_leap: '9b7a11219bcb165d',
    lightning: '14cd50d815bdc995',
    phase: '9b518eb7546c1b61',
  },
  reduit: {
    hourglass: 'ed680caee43f5900',
    truce: '4f14c5abede00f32',
    blood_moon: '3aa21f34bc9a4daf',
    ice_age: '0d4a4f02057c6e34',
    blast: '3122cd53de120c28',
    ice_wall: '23620f52ea75b203',
    rift: '488e0058cac77829',
    tide: 'c990b8c6186f8e84',
    time_warp: '436bd77465cba559',
    gravity: '064c25a7ba41b43f',
    freeze: 'f8706bdd64c1881b',
    shield: '3f8cf51fdbf4b0ad',
    swap: 'c65bf0c7b3cd8cf9',
    rewind: '8c0a363b5b7dd4b7',
    revive: 'f260323a87580704',
    knight_leap: '7f63d97deee4f30f',
    lightning: 'a4a022363367b4d5',
    phase: '9348da330dd0636c',
  },
  arrivee: {
    hourglass: '8dabd08af739e5a0',
    truce: '04d5c09a3362c034',
    blood_moon: 'b53d8b919937cffe',
    ice_age: '860c7326349c52c1',
    blast: '6ac01e03e6da9261',
  },
};

describe('mises en scène des cartes : identiques au code d’avant (empreintes)', () => {
  for (const mode of ['cast', 'reduit', 'arrivee'] as const) {
    for (const card of mode === 'arrivee' ? PRESAGES : CARD_IDS) {
      it(`${card} (${mode})`, async () => {
        const got = await print(card, mode);
        if (process.env.CARDFX_RELEVE) console.log(`RELEVE ${mode} ${card} ${got}`);
        expect(got).toBe(EXPECTED[mode][card]);
      });
    }
  }
});

// ---------------------------------------------------------------------------------------------
// Sons

/** Web Audio factice : chaque nœud créé, chaque réglage et chaque automatisation, en temps relatif. */
function fakeAudio(log: (s: string) => void) {
  let n = 0;
  const param = (name: string) => {
    const p = { value: 0 } as Record<string, unknown>;
    for (const m of ['setValueAtTime', 'exponentialRampToValueAtTime', 'linearRampToValueAtTime']) {
      p[m] = (v: number, t: number) => {
        log(`${name}.${m}(${r6(v)},${r6(t)})`);
        return p;
      };
    }
    return new Proxy(p, {
      set(t, k, v) {
        t[k as string] = v;
        log(`${name}.${String(k)}=${typeof v === 'number' ? r6(v) : v}`);
        return true;
      },
    });
  };
  const node = (kind: string, params: string[]) => {
    const id = `${kind}${++n}`;
    log(`new ${id}`);
    const o: Record<string, unknown> = {
      connect: (to: { id?: string }) => {
        log(`${id}->${to?.id ?? 'dest'}`);
        return to;
      },
      start: (t = 0) => log(`${id}.start(${r6(t)})`),
      stop: (t = 0) => log(`${id}.stop(${r6(t)})`),
      id,
    };
    for (const p of params) o[p] = param(`${id}.${p}`);
    return new Proxy(o, {
      set(t, k, v) {
        t[k as string] = v;
        log(`${id}.${String(k)}=${typeof v === 'object' ? `${v?.len} ${r6(v?.sum?.() ?? 0)}` : v}`);
        return true;
      },
    });
  };
  class Ctx {
    currentTime = 0;
    sampleRate = 8000;
    state = 'running';
    destination = { id: 'dest' };
    createGain = () => node('gain', ['gain']);
    createOscillator = () => node('osc', ['frequency']);
    createBiquadFilter = () => node('filter', ['frequency', 'Q']);
    createBufferSource = () => node('src', []);
    createBuffer = (_c: number, len: number) => {
      const d = new Float32Array(len);
      log(`buffer ${len}`);
      return { len, getChannelData: () => d, sum: () => d.reduce((a, b) => a + b, 0) };
    };
    resume = () => Promise.resolve();
  }
  return Ctx;
}

/**
 * Empreintes des sons du code d'avant le lot 4 (switch de playCardSound, son générique des 7 Pouvoirs autres que le Mur
 * de glace).
 */
const EXPECTED_SOUND: Partial<Record<CardId | 'ui', string>> = {
  ui: '0f1f5422629f26db',
  hourglass: 'a1fe7f5e5705a163',
  truce: 'ddb6267310e968c2',
  blood_moon: '0759251226f00b3f',
  ice_age: 'cb81b9eae9209c66',
  blast: 'b7d8535b42fe7a73',
  ice_wall: '6b9744fc9e97c976',
  rift: '7965ec4102e0ee26',
  tide: '6511825692bc9d3a',
  time_warp: '0c52cbca15130afe',
  gravity: '140f45cdcea36e02',
  freeze: 'e248c28b9b2bfeac',
  shield: '245b77a3e630a50d',
  swap: '43019e1beef7b1db',
  rewind: '405f584c2081722a',
  revive: '71e000f9576885d9',
  knight_leap: '19112c815f3bbf5e',
  lightning: '858999b6bea93399',
  phase: '8155e4050318a8d9',
};

describe('sons des cartes : identiques au code d’avant (empreintes)', () => {
  it('chaque carte, et les sons de l’interface', async () => {
    const lines: string[] = [];
    const log = (s: string) => lines.push(s);
    vi.stubGlobal('window', { AudioContext: fakeAudio(log) });
    vi.spyOn(Math, 'random').mockImplementation(mulberry(7));
    vi.resetModules();
    const sound = await import('../src/client/sound');
    const got: Partial<Record<CardId | 'ui', string>> = {};
    for (const kind of ['move', 'capture', 'check', 'start', 'end', 'notify', 'low', 'select', 'error'] as const) sound.playSound(kind);
    got.ui = sha(lines.splice(0).join('\n'));
    for (const id of CARD_IDS) {
      sound.playCardSound(id);
      got[id] = sha(lines.splice(0).join('\n'));
    }
    if (process.env.CARDFX_RELEVE) console.log(`RELEVE_SON ${JSON.stringify(got)}`);
    expect(got).toEqual(EXPECTED_SOUND);
    vi.unstubAllGlobals();
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: nullContext }) });
  });
});

// ---------------------------------------------------------------------------------------------
// Emblèmes

/** Empreintes du balisage de chaque emblème (CardEmblem) du code d'avant le lot 4 (switch de CardArt.tsx). */
const EXPECTED_EMBLEMS: Record<string, string> = {
  hourglass: '4df95d119c977d64',
  truce: 'c47ba80cecd12345',
  blood_moon: '4e31c705d5fe41cf',
  ice_age: '6f4696c421e96a06',
  blast: 'e3d182bb1888bebe',
  ice_wall: '32884e402b626466',
  rift: 'aa22ab2e497bfd69',
  tide: 'fb69e3aeac95ea0f',
  time_warp: '063d2cad68118534',
  gravity: '641c1b6a5e143322',
  freeze: '90ddd67f86d75ab5',
  shield: '089f7e624677a415',
  swap: 'f5e47d8f8e5e53c1',
  rewind: '2ea92a270563759d',
  revive: '313f99fb1d8bc500',
  knight_leap: '0e762822c1755650',
  lightning: '3f93c13596caa01f',
  phase: '5ed6875d089cfeeb',
  inconnue: 'c4b227ef4cd03747',
};

describe('emblèmes des cartes : identiques au code d’avant (empreintes)', () => {
  it('chaque carte, et une carte inconnue (cercle)', async () => {
    const { createElement } = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { CardEmblem } = await import('../src/client/components/CardArt');
    const got: Record<string, string> = {};
    for (const id of [...CARD_IDS, 'inconnue']) got[id] = sha(renderToStaticMarkup(createElement(CardEmblem, { id: id as CardId, className: 'em' })));
    if (process.env.CARDFX_RELEVE) console.log(`RELEVE_EMBLEMES ${JSON.stringify(got)}`);
    expect(got).toEqual(EXPECTED_EMBLEMS);
  });
});

// ---------------------------------------------------------------------------------------------
// Registres exhaustifs

describe('registres par carte : exhaustifs', () => {
  it('chaque Pouvoir (et chaque carte connue) a sa fiche d’effet, sa marque d’échiquier, son son, son emblème ; chaque Pouvoir a sa scène explicative', async () => {
    const { CARD_FX, GENERIC_FX } = await import('../src/client/vfx/cardFx');
    const { BOARD_MARKS } = await import('../src/client/vfx/boardMarks');
    const { CARD_SOUND } = await import('../src/client/sound');
    const { CARD_ART } = await import('../src/client/components/CardArt');
    const { CARD_SCENES } = await import('../src/client/components/cardScenes');
    const { cardsOf } = await import('../src/shared/cards');
    const powers = cardsOf('climats');
    expect(powers.length).toBeGreaterThan(0);
    for (const id of powers) {
      expect(CARD_FX[id], id).toBeDefined();
      expect(id in BOARD_MARKS, id).toBe(true);
      expect(typeof CARD_SOUND[id], id).toBe('function');
      expect(typeof CARD_ART[id], id).toBe('function');
      expect(CARD_SCENES[id], id).toBeDefined();
    }
    // Toutes les cartes du moteur (Duel compris, pour relire les anciennes parties), et rien d'autre
    for (const reg of [CARD_FX, BOARD_MARKS, CARD_SOUND, CARD_ART]) expect(Object.keys(reg).sort()).toEqual([...CARD_IDS].sort());
    // Scènes connues de effects.ts (SCENES) ; carte inconnue : la scène générique
    const scenes = ['generique', 'duel', 'hourglass', 'truce', 'blood_moon', 'ice_age', 'blast', 'rift', 'tide'];
    for (const id of CARD_IDS) expect(scenes, id).toContain(CARD_FX[id].scene);
    expect(GENERIC_FX).toEqual({ scene: 'generique', impactAt: 0.85, tilt: 0.52, shake: 0.7, flash: 0.6 });
  });

  it('fiches d’effet : les valeurs d’avant le registre (tables IMPACT_AT, TILT, SHAKE, FLASH, ambiances et teintes des scènes)', async () => {
    const { CARD_FX } = await import('../src/client/vfx/cardFx');
    const IMPACT_AT: Partial<Record<CardId, number>> = { time_warp: 1.15, hourglass: 1.05, blood_moon: 1.05, blast: 1, tide: 1, ice_age: 0.95, truce: 0.95 };
    const TILT: Partial<Record<CardId, number>> = { time_warp: 0.62, gravity: 0.62, hourglass: 0.6, blast: 0.6, blood_moon: 0.58 };
    const SHAKE: Partial<Record<CardId, number>> = { lightning: 1.4, ice_wall: 1.4, gravity: 1.4, blast: 1.8, rift: 1.5, tide: 0.9, truce: 0.25, hourglass: 0.5 };
    const FLASH: Partial<Record<CardId, number>> = { lightning: 1, blast: 1.1, blood_moon: 0.9, truce: 0.45, tide: 0.5 };
    for (const id of CARD_IDS) {
      const f = CARD_FX[id];
      expect([f.impactAt, f.tilt, f.shake, f.flash], id).toEqual([IMPACT_AT[id] ?? 0.85, TILT[id] ?? 0.52, SHAKE[id] ?? 0.7, FLASH[id] ?? 0.6]);
    }
    const moods = Object.fromEntries(CARD_IDS.filter(id => CARD_FX[id].mood).map(id => [id, CARD_FX[id].mood]));
    expect(moods).toEqual({
      truce: { cls: 'vfx-calm', afterImpactS: 1.4 },
      blood_moon: { cls: 'vfx-blood', afterImpactS: 1.5 },
      ice_age: { cls: 'vfx-frost', afterImpactS: 1.6 },
      blast: { cls: 'vfx-blast', afterImpactS: 1.2 },
      tide: { cls: 'vfx-tide', afterImpactS: 1.2 },
      rewind: { cls: 'vfx-rewind', ms: 1500 },
      lightning: { cls: 'vfx-storm', ms: 1700 },
    });
    const tints = Object.fromEntries(CARD_IDS.filter(id => CARD_FX[id].tint).map(id => [id, CARD_FX[id].tint]));
    expect(tints).toEqual({
      truce: { color: '#f4f1dc', mix: 0.45 },
      blood_moon: { color: '#ff2a3d', mix: 0.7 },
      ice_age: { color: '#cfefff', mix: 0.6 },
      blast: { color: '#ff8a2a', mix: 0.5 },
      rift: { color: '#b46bff', mix: 0.35 },
      tide: { color: '#3fe0d0', mix: 0.7 },
    });
  });

  it('marques d’échiquier : celles d’avant le registre (Board.tsx comparait les identifiants)', async () => {
    const { BOARD_MARKS } = await import('../src/client/vfx/boardMarks');
    const marked = Object.fromEntries(CARD_IDS.filter(id => BOARD_MARKS[id]).map(id => [id, BOARD_MARKS[id]]));
    expect(marked).toEqual({
      ice_wall: { on: 'square', cls: 'iced' },
      rift: { on: 'squares', cls: 'rift' },
      gravity: { on: 'sliders', cls: 'weighted' },
      freeze: { on: 'piece', cls: 'frozen' },
      shield: { on: 'piece', cls: 'shielded' },
      knight_leap: { on: 'piece', cls: 'leaping' },
      phase: { on: 'piece', cls: 'phasing' },
    });
  });

  it('traits des skins : ceux qu’on lisait dans leurs noms (void, petal, filigree, laurel)', async () => {
    const { FLOURISH_TRAITS, PARTICLE_TRAITS } = await import('../src/client/vfx/textures');
    const pick = <T extends object>(t: Record<string, T>, k: keyof T, v: unknown) => Object.keys(t).filter(n => t[n][k] === v).sort();
    expect(pick(PARTICLE_TRAITS, 'blending', 'normal')).toEqual(['petal', 'void']);
    expect(pick(PARTICLE_TRAITS, 'glow', 'accent')).toEqual(['void']);
    expect(pick(FLOURISH_TRAITS, 'motion', 'close')).toEqual(['laurel']);
    expect(pick(FLOURISH_TRAITS, 'color', 'secondary')).toEqual(['filigree']);
  });
});
