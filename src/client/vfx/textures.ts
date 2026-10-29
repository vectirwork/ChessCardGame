// Textures procédurales (aucune image externe) : particules et ornements des skins.
import * as THREE from 'three';
import type { Flourish, ParticleShape } from '../../shared/catalog';

const cache = new Map<string, THREE.Texture>();

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!];
}

function finish(c: HTMLCanvasElement): THREE.Texture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

export function particleTexture(shape: ParticleShape): THREE.Texture {
  const key = 'p:' + shape;
  const hit = cache.get(key);
  if (hit) return hit;
  const S = 64;
  const [c, g] = canvas(S);
  const m = S / 2;
  switch (shape) {
    case 'glow': {
      const gr = g.createRadialGradient(m, m, 0, m, m, m);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.18, 'rgba(255,255,255,0.85)');
      gr.addColorStop(0.45, 'rgba(255,255,255,0.25)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, S, S);
      break;
    }
    case 'ember': {
      const gr = g.createRadialGradient(m, m, 0, m, m, m);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.12, 'rgba(255,250,220,1)');
      gr.addColorStop(0.3, 'rgba(255,255,255,0.45)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.ellipse(m, m, m * 0.55, m, 0, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'pixel': {
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fillRect(m - 22, m - 22, 44, 44);
      g.fillStyle = 'rgba(255,255,255,1)';
      g.fillRect(m - 12, m - 12, 24, 24);
      break;
    }
    case 'star': {
      const gr = g.createRadialGradient(m, m, 0, m, m, m * 0.6);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, S, S);
      g.fillStyle = 'rgba(255,255,255,0.95)';
      g.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const r = i % 2 === 0 ? m * 0.98 : m * 0.12;
        g.lineTo(m + Math.cos(a) * r, m + Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
      break;
    }
    case 'petal': {
      g.translate(m, m);
      const gr = g.createLinearGradient(0, -m, 0, m);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(1, 'rgba(255,200,225,1)');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(0, m * 0.9);
      g.bezierCurveTo(m * 0.85, m * 0.3, m * 0.6, -m * 0.75, m * 0.12, -m * 0.82);
      g.lineTo(0, -m * 0.6);
      g.lineTo(-m * 0.12, -m * 0.82);
      g.bezierCurveTo(-m * 0.6, -m * 0.75, -m * 0.85, m * 0.3, 0, m * 0.9);
      g.fill();
      break;
    }
    case 'void': {
      const gr = g.createRadialGradient(m, m, 0, m, m, m);
      gr.addColorStop(0, 'rgba(10,0,20,1)');
      gr.addColorStop(0.35, 'rgba(25,0,45,0.95)');
      gr.addColorStop(0.55, 'rgba(255,255,255,0.55)');
      gr.addColorStop(0.7, 'rgba(255,255,255,0.15)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, S, S);
      break;
    }
  }
  const t = finish(c);
  cache.set(key, t);
  return t;
}

/** Cercle d'ornement tracé en blanc, teinté par le matériau. */
export function flourishTexture(kind: Flourish): THREE.Texture {
  const key = 'f:' + kind;
  const hit = cache.get(key);
  if (hit) return hit;
  const S = 512;
  const [c, g] = canvas(S);
  const m = S / 2;
  g.strokeStyle = '#fff';
  g.fillStyle = '#fff';
  g.lineCap = 'round';
  g.shadowColor = '#fff';
  g.shadowBlur = 10;
  const ring = (r: number, w: number, dash?: number[]) => {
    g.lineWidth = w;
    g.setLineDash(dash ?? []);
    g.beginPath();
    g.arc(m, m, r, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
  };
  const rand = mulberry(kind.length * 97);
  switch (kind) {
    case 'runes': {
      ring(240, 5);
      ring(222, 2);
      ring(160, 3);
      ring(150, 1.5, [6, 10]);
      g.lineWidth = 3;
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        g.save();
        g.translate(m + Math.cos(a) * 191, m + Math.sin(a) * 191);
        g.rotate(a + Math.PI / 2);
        g.beginPath();
        const h = 13;
        const k = Math.floor(rand() * 4);
        g.moveTo(-6, -h);
        g.lineTo(-6, h);
        if (k === 0) { g.moveTo(-6, -h); g.lineTo(7, 0); g.lineTo(-6, h); }
        if (k === 1) { g.moveTo(-6, -2); g.lineTo(8, -h); g.moveTo(-6, 4); g.lineTo(8, h); }
        if (k === 2) { g.moveTo(6, -h); g.lineTo(6, h); g.moveTo(-6, 0); g.lineTo(6, 0); }
        if (k === 3) { g.moveTo(-6, -h); g.lineTo(8, -4); g.lineTo(-6, 4); }
        g.stroke();
        g.restore();
      }
      // étoile à six branches
      g.lineWidth = 2.5;
      g.beginPath();
      for (let i = 0; i <= 6; i++) {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
        const b = a + Math.PI / 3 * 2;
        g.moveTo(m + Math.cos(a) * 150, m + Math.sin(a) * 150);
        g.lineTo(m + Math.cos(b) * 150, m + Math.sin(b) * 150);
      }
      g.stroke();
      break;
    }
    case 'flames': {
      ring(236, 6);
      ring(210, 2, [3, 9]);
      for (let i = 0; i < 36; i++) {
        const a = (i / 36) * Math.PI * 2;
        const len = 30 + rand() * 30;
        g.save();
        g.translate(m + Math.cos(a) * 205, m + Math.sin(a) * 205);
        g.rotate(a + Math.PI / 2);
        g.beginPath();
        g.moveTo(-9, 0);
        g.quadraticCurveTo(-6, len * 0.6, 0, len);
        g.quadraticCurveTo(6, len * 0.6, 9, 0);
        g.closePath();
        g.globalAlpha = 0.85;
        g.fill();
        g.restore();
      }
      g.globalAlpha = 1;
      ring(120, 3);
      break;
    }
    case 'grid': {
      g.lineWidth = 3;
      g.strokeRect(24, 24, S - 48, S - 48);
      g.lineWidth = 1.5;
      for (let i = 1; i < 8; i++) {
        const p = 24 + ((S - 48) / 8) * i;
        g.beginPath();
        g.moveTo(p, 24);
        g.lineTo(p, S - 24);
        g.moveTo(24, p);
        g.lineTo(S - 24, p);
        g.stroke();
      }
      g.lineWidth = 4;
      g.strokeRect(m - 60, m - 60, 120, 120);
      ring(100, 2, [4, 8]);
      break;
    }
    case 'constellation': {
      const pts: [number, number][] = [];
      for (let i = 0; i < 14; i++) {
        const a = rand() * Math.PI * 2;
        const r = 60 + rand() * 170;
        pts.push([m + Math.cos(a) * r, m + Math.sin(a) * r]);
      }
      g.lineWidth = 1.6;
      g.globalAlpha = 0.7;
      g.beginPath();
      for (let i = 0; i < pts.length - 1; i++) {
        g.moveTo(...pts[i]);
        g.lineTo(...pts[(i + 1 + Math.floor(rand() * 2)) % pts.length]);
      }
      g.stroke();
      g.globalAlpha = 1;
      for (const [x, y] of pts) {
        g.beginPath();
        g.arc(x, y, 4 + rand() * 4, 0, Math.PI * 2);
        g.fill();
      }
      ring(244, 2.5);
      ring(232, 1, [2, 6]);
      break;
    }
    case 'vortex': {
      g.lineWidth = 5;
      for (let arm = 0; arm < 5; arm++) {
        g.beginPath();
        for (let t = 0; t < 1; t += 0.01) {
          const a = arm * ((Math.PI * 2) / 5) + t * Math.PI * 2.4;
          const r = 30 + t * 210;
          const x = m + Math.cos(a) * r;
          const y = m + Math.sin(a) * r;
          if (t === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.globalAlpha = 0.8;
        g.stroke();
      }
      g.globalAlpha = 1;
      ring(244, 3);
      break;
    }
    case 'petals': {
      for (let ringIdx = 0; ringIdx < 2; ringIdx++) {
        const n = ringIdx ? 12 : 8;
        const r = ringIdx ? 170 : 95;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + ringIdx * 0.2;
          g.save();
          g.translate(m + Math.cos(a) * r, m + Math.sin(a) * r);
          g.rotate(a + Math.PI / 2);
          g.lineWidth = 3;
          g.beginPath();
          g.ellipse(0, 0, 18, 42, 0, 0, Math.PI * 2);
          g.stroke();
          g.restore();
        }
      }
      ring(238, 3);
      ring(40, 3);
      break;
    }
  }
  const t = finish(c);
  cache.set(key, t);
  return t;
}

/** Dégradé vertical pour les colonnes de lumière. */
export function beamTexture(): THREE.Texture {
  const hit = cache.get('beam');
  if (hit) return hit;
  const [c, g] = canvas(64);
  const gr = g.createLinearGradient(0, 0, 0, 64);
  gr.addColorStop(0, 'rgba(255,255,255,0)');
  gr.addColorStop(0.55, 'rgba(255,255,255,0.55)');
  gr.addColorStop(1, 'rgba(255,255,255,1)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const h = g.createLinearGradient(0, 0, 64, 0);
  h.addColorStop(0, 'rgba(0,0,0,0.6)');
  h.addColorStop(0.5, 'rgba(0,0,0,0)');
  h.addColorStop(1, 'rgba(0,0,0,0.6)');
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = h;
  g.fillRect(0, 0, 64, 64);
  const t = finish(c);
  cache.set('beam', t);
  return t;
}

export function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
