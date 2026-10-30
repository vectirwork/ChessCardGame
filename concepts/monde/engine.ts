// Caméra CSS 3D du Monde-Échiquier : le défilement fait avancer la caméra rangée après rangée.
// Repère du monde (pixels CSS) : x vers la droite, y vers le bas (le sol est en y = 0, une hauteur h vaut y = -h),
// z vers le spectateur. L'échiquier occupe x ∈ [-4S, 4S] et z ∈ [-8S, 0] : la rangée 1 est devant, la rangée 8 au fond.

export const S = 500;

export interface Cam {
  x: number;
  /** Hauteur au-dessus du sol (positive vers le haut). */
  h: number;
  z: number;
  /** Plongée en degrés (positive = regarde vers le bas). */
  pitch: number;
  /** Lacet en degrés (positif = regarde vers la droite). */
  yaw: number;
}

export interface Key {
  s: number;
  cam: Cam;
}

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (t: number) => t * t * (3 - 2 * t);
export const smoother = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

export function lerpCam(a: Cam, b: Cam, t: number): Cam {
  return {
    x: lerp(a.x, b.x, t),
    h: lerp(a.h, b.h, t),
    z: lerp(a.z, b.z, t),
    pitch: lerp(a.pitch, b.pitch, t),
    yaw: lerp(a.yaw, b.yaw, t),
  };
}

/** Centre d'une case (f : 0 = a, r : 1 à 8). */
export const sqX = (f: number) => -4 * S + S / 2 + f * S;
export const sqZ = (r: number) => -(r - 0.5) * S;

/** Distance focale CSS adaptée à l'écran (champ horizontal stable sur bureau, élargi en portrait). */
export function perspectiveFor(W: number, H: number) {
  return Math.round(Math.max(W * 0.62, H * 0.56));
}

export function camTransform(c: Cam, P: number) {
  return `translate3d(0px, 0px, ${P}px) rotateX(${-c.pitch}deg) rotateY(${c.yaw}deg) translate3d(${-c.x}px, ${c.h}px, ${-c.z}px)`;
}

/** Profondeur d'un point du sol devant la caméra (en tenant compte du lacet). */
export function depthOf(x: number, z: number, c: Cam) {
  const a = (c.yaw * Math.PI) / 180;
  return (x - c.x) * Math.sin(a) - (z - c.z) * Math.cos(a);
}

/** Angle (degrés) pour qu'un monument en (x, z) fasse face à un point. */
export function faceToward(x: number, z: number, tx: number, tz: number) {
  return (Math.atan2(tx - x, tz - z) * 180) / Math.PI;
}

export const isMobile = (W: number) => W < 760;

/** Stations de la caméra, en coordonnée de section (0 = Seuil … 5 = Promotion, 6 = bas de page). */
export function keyframes(W: number, H: number): Key[] {
  if (isMobile(W)) {
    // Portrait : texte en haut et en bas, monuments dans la bande centrale ; les Portes défilent une à une
    const tall = clamp((H / W - 1.6) / 0.6);
    const back = lerp(0, 250, tall);
    return [
      { s: 0, cam: { x: -750, h: 1300, z: 900 + back, pitch: 19, yaw: 0 } },
      { s: 0.5, cam: { x: -750, h: 1250, z: 800 + back, pitch: 18, yaw: 0 } },
      { s: 1.0, cam: { x: -750, h: 1300, z: 900, pitch: -4, yaw: 0 } },
      { s: 1.62, cam: { x: -750, h: 1250, z: 760, pitch: -4, yaw: 0 } },
      { s: 2.02, cam: { x: 0, h: 720, z: -100, pitch: 12, yaw: 0 } },
      { s: 2.9, cam: { x: 0, h: 720, z: -1400, pitch: 12, yaw: 0 } },
      { s: 3.05, cam: { x: 900, h: 600, z: -2150, pitch: 6, yaw: 88 } },
      { s: 3.7, cam: { x: 920, h: 590, z: -2180, pitch: 6, yaw: 89 } },
      { s: 4.05, cam: { x: -820, h: 430, z: -2360, pitch: 0, yaw: 0 } },
      { s: 4.38, cam: { x: 0, h: 430, z: -2360, pitch: 0, yaw: 0 } },
      { s: 4.72, cam: { x: 820, h: 430, z: -2360, pitch: 0, yaw: 0 } },
      { s: 5.05, cam: { x: -250, h: 2250, z: -850, pitch: 31, yaw: 0 } },
      { s: 5.75, cam: { x: -250, h: 2200, z: -930, pitch: 31, yaw: 0 } },
      { s: 6, cam: { x: -250, h: 2450, z: -600, pitch: 31, yaw: 0 } },
    ];
  }
  return [
    { s: 0, cam: { x: -1050, h: 1500, z: 2150, pitch: 22, yaw: -10 } },
    { s: 0.5, cam: { x: -950, h: 1400, z: 1900, pitch: 21, yaw: -9 } },
    { s: 1.0, cam: { x: 200, h: 900, z: 800, pitch: 12, yaw: -4 } },
    { s: 1.62, cam: { x: 200, h: 860, z: 640, pitch: 11, yaw: -4 } },
    { s: 2.02, cam: { x: 0, h: 720, z: -450, pitch: 10, yaw: 0 } },
    { s: 2.9, cam: { x: 0, h: 720, z: -1700, pitch: 10, yaw: 0 } },
    { s: 3.05, cam: { x: 900, h: 600, z: -2150, pitch: 6, yaw: 70 } },
    { s: 3.7, cam: { x: 940, h: 590, z: -2200, pitch: 6, yaw: 72 } },
    { s: 4.05, cam: { x: 0, h: 470, z: -1350, pitch: 2, yaw: 0 } },
    { s: 4.7, cam: { x: 0, h: 460, z: -1450, pitch: 2, yaw: 0 } },
    { s: 5.05, cam: { x: -250, h: 2450, z: 0, pitch: 33, yaw: 0 } },
    { s: 5.75, cam: { x: -250, h: 2400, z: -150, pitch: 33, yaw: 0 } },
    { s: 6, cam: { x: -250, h: 2700, z: 400, pitch: 33, yaw: 0 } },
  ];
}

/** Stations des lieux (coordonnée de section) : la caméra y est arrêtée, le panneau de texte y est affiché. */
export function stations(W: number): [number, number][] {
  return [
    [-9, 0.5],
    [1.0, 1.62],
    [2.02, 2.9],
    [3.05, 3.7],
    [4.05, isMobile(W) ? 4.72 : 4.7],
    [5.05, 99],
  ];
}

/** Présence d'une station (1 dedans, rampe de largeur `ramp` de part et d'autre) et sens d'entrée ou de sortie. */
export function stationPresence(s: number, st: [number, number], ramp = 0.12, rampOut = ramp) {
  const before = st[0] - s;
  const after = s - st[1];
  const p = before > 0 ? clamp(1 - before / ramp) : after > 0 ? clamp(1 - after / rampOut) : 1;
  return { p, dir: before > 0 ? 1 : after > 0 ? -1 : 0 };
}

/** Rampes d'entrée et de sortie de chaque station : jamais deux panneaux à la fois, même quand deux lieux sont proches. */
export function stationRamps(sts: [number, number][], ramp = 0.12): [number, number][] {
  return sts.map((st, i) => [
    i > 0 ? Math.min(ramp, (st[0] - sts[i - 1][1]) * 0.45) : ramp,
    i < sts.length - 1 ? Math.min(ramp, (sts[i + 1][0] - st[1]) * 0.45) : ramp,
  ]);
}

/** Lieu le plus proche (station contenant s, sinon la plus proche). */
export function nearestStation(s: number, sts: [number, number][]) {
  let best = 0;
  let bd = Infinity;
  sts.forEach((st, i) => {
    const d = Math.max(st[0] - s, s - st[1], 0);
    if (d < bd - 1e-6) {
      bd = d;
      best = i;
    }
  });
  return best;
}

/** Projection à l'écran d'un point du monde (hauteur positive vers le haut). */
export function project(x: number, up: number, z: number, c: Cam, P: number, W: number, H: number) {
  const yaw = (c.yaw * Math.PI) / 180;
  const ph = (-c.pitch * Math.PI) / 180;
  const qx = x - c.x;
  const qy = -up + c.h;
  const qz = z - c.z;
  const rx = qx * Math.cos(yaw) + qz * Math.sin(yaw);
  const rz = -qx * Math.sin(yaw) + qz * Math.cos(yaw);
  const ty = qy * Math.cos(ph) - rz * Math.sin(ph);
  const tz = qy * Math.sin(ph) + rz * Math.cos(ph);
  const dist = -tz;
  const k = P / Math.max(1, dist);
  return { x: W / 2 + rx * k, y: H / 2 + ty * k, k, dist };
}

/** Caméra au point s du voyage : immobile (ou presque) dans un lieu, en mouvement entre deux lieux. */
export function camAt(s: number, keys: Key[]): Cam {
  if (s <= keys[0].s) return keys[0].cam;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (s <= b.s) return lerpCam(a.cam, b.cam, smoother((s - a.s) / (b.s - a.s)));
  }
  return keys[keys.length - 1].cam;
}

/** Caméra d'ouverture : haut dans le ciel, au-dessus de la rangée 4. */
export function introCam(W: number): Cam {
  return isMobile(W)
    ? { x: -750, h: 5200, z: -900, pitch: 62, yaw: 0 }
    : { x: -600, h: 4200, z: -800, pitch: 58, yaw: 0 };
}

export interface Rect {
  x: number;
  y: number;
  size: number;
}

/** Emplacement de l'échiquier jouable en plein écran (le HUD des cartes est à gauche sur bureau, en bas sur mobile). */
export function gameRect(W: number, H: number): Rect {
  if (isMobile(W)) {
    const size = Math.min(W - 20, H - 330);
    return { x: (W - size) / 2, y: 112, size };
  }
  const hud = clamp(W * 0.3, 360, 470);
  const size = Math.min(H - 76, W - hud - 90);
  return { x: hud + (W - hud - size) / 2 - 10, y: (H - size) / 2, size };
}

/** Caméra verticale qui projette exactement l'échiquier du sol sur le rectangle de jeu. */
export function gameCam(W: number, H: number, P: number, r: Rect, lift = 1): Cam {
  const h = ((8 * S * P) / r.size) * lift;
  const tx = r.x + r.size / 2 - W / 2;
  const ty = r.y + r.size / 2 - H / 2;
  return { x: -tx * (h / P), h, z: -4 * S - ty * (h / P), pitch: 90, yaw: 0 };
}

/** Ligne d'horizon à l'écran (px depuis le haut). */
export function horizonY(c: Cam, P: number, H: number) {
  const a = Math.min(80, c.pitch) * (Math.PI / 180);
  return H / 2 - P * Math.tan(a);
}
