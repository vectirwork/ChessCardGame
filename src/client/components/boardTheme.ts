// Habillage d'un échiquier : classes et variables CSS posées sur .board-wrap, calculées une seule fois par thème
// (objets stables : Board est mémoïsé et ne recrée rien à chaque rendu ; les data URI ne sont construites qu'une fois).
// Les règles communes sont dans board.css, section « Habillage des échiquiers ». Tout est statique : aucune animation,
// rien sur les 64 cases.
//
// Classes et variables (BoardStyle, src/shared/skins/types.ts) :
// - tex-<texture> : texture des cases (inchangé) ;
// - has-fillet, --fillet : liseré de 1,5 px entre le cadre et les cases ;
// - has-inlay : incrustation (SVG 800 × 800) posée une fois sur la grille, sous les pièces et sous les états de jeu
//   (dernier coup, sélection, indices, échec, Mur de glace, Faille, cibles) ;
// - fa-border, --fa-slice : frise du cadre en border-image (bande de 10 px) ;
// - fa-corners, --fa-size, --fa-at : une même image aux quatre coins du cadre ; avec fa-mid, --fa-mid et --fa-mid-at,
//   aussi au milieu de chaque côté ;
// - has-glow, --frame-bg, --frame-shadow : dégradé du cadre (devant var(--frame)) et ombres en tête de liste ;
// - bt-<thème> : porte les images (url) du thème, dans une feuille de style écrite une fois par thème (themeRules).
//
// Pourquoi les images ne passent pas par des variables : Chromium recrée une image url() à chaque recalcul de style
// quand elle vient d'une var(), ou d'une déclaration qui contient une var(), ou d'une liste de fonds qui mêle une url()
// et un dégradé CSS ; il la juge alors « changée » et repeint l'élément. Or le style de l'échiquier est recalculé à
// chaque image pendant un sort (--tilt, stage.ts) et pendant le défilement de l'accueil (--base-tilt, engine.ts) :
// l'échiquier serait repeint en continu. Les url() sont donc écrites en toutes lettres, dans des propriétés détaillées
// (background-image, border-image-source) sans var() ; positions, tailles et tranches viennent d'autres propriétés, et
// le reflet du cadre, qui est un dégradé, devient une image SVG quand il partage la liste avec les images d'angle.
// Vérifié au banc (test/echiquiers.mjs --banc) : aucune repeinte quand le style est recalculé.
//
// Un autre composant (vignettes de la boutique) peut reprendre className et vars sur son propre .board-wrap (avec
// .board et .squares dedans, comme Board) : la feuille du thème est ajoutée au premier appel.
import type { CSSProperties } from 'react';
import { boardStyle, normItem } from '../../shared/catalog';
import type { BoardStyle } from '../../shared/catalog';

export interface BoardTheme {
  /** Classes de .board-wrap, après « board-wrap ». */
  className: string;
  /** Variables CSS des décors (couleurs, tailles, ombres ; jamais d'image), ajoutées au style de .board-wrap. */
  vars: CSSProperties;
}

/** Largeur du cadre (.board::before, inset -10px dans board.css). */
const FRAME = 10;

/** url() d'un SVG en data URI, encodé comme les pièces (pieces.ts). */
export const svgUrl = (svg: string) => `url("data:image/svg+xml;utf8,${encodeURIComponent(svg.replace(/\s+/g, ' '))}")`;

/**
 * Reflet du cadre de board.css (linear-gradient(145deg, rgba(255, 255, 255, 0.14), transparent 40%)) en SVG, pour les
 * cadres à images d'angle : sur un carré, l'axe à 145° va de (0,1 ; -0,07) à (0,9 ; 1,07).
 */
export const SHEEN_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" preserveAspectRatio="none">' +
  '<linearGradient id="g" x1=".1005" y1="-.0705" x2=".8995" y2="1.0705"><stop stop-color="#fff" stop-opacity=".14"/>' +
  '<stop offset=".4" stop-color="#fff" stop-opacity="0"/></linearGradient><rect width="1" height="1" fill="url(#g)"/></svg>';

/**
 * Décalage d'une image de coin depuis le bord extérieur du cadre : centrée à 7,5 px du bord (entre l'arrondi de 14 px
 * et les cases), jamais à moins de 1 px du bord. Fleur du jade (11 px) : 2 px ; étoile du ciel (16 px) : 1 px.
 */
export const cornerOffset = (size: number) => Math.max(1, Math.round((15 - size) / 2));

/** Identifiant du thème réellement affiché (absent, inconnu ou d'un autre emplacement : Nuit arcane). */
const themeId = (theme: string | undefined) => normItem('board', theme);
/** Classe des images d'un thème : bt-<id sans préfixe>. */
const imageClass = (id: string) => `bt-${id.replace(/^board:/, '').replace(/[^a-z0-9-]/gi, '-')}`;

/**
 * Règles CSS des images d'un thème (url() en toutes lettres, sans var()), aucune s'il n'en a pas. Sélecteurs en
 * .board-wrap.bt-<id> : plus précis que board.css, quel que soit l'ordre des feuilles.
 */
export function themeRules(theme: string | undefined): string[] {
  const id = themeId(theme);
  const bs: BoardStyle = boardStyle(id);
  const w = `.board-wrap.${imageClass(id)}`;
  const rules: string[] = [];
  if (bs.inlay) rules.push(`${w} .squares::before{background-image:${svgUrl(bs.inlay)}}`);
  const fa = bs.frameArt;
  if (fa?.kind === 'border') rules.push(`${w} .board::before{border-image-source:${svgUrl(fa.svg)}}`);
  if (fa?.kind === 'corners') {
    const art = svgUrl(fa.svg);
    const layers = Array.from({ length: fa.mid ? 8 : 4 }, () => art);
    rules.push(`${w} .board::before{background-image:${[...layers, svgUrl(SHEEN_SVG)].join(',')}}`);
  }
  return rules;
}

/** Les mêmes règles en une feuille de style (chaîne vide pour un thème sans image). */
export const themeCss = (theme: string | undefined) => themeRules(theme).join('\n');

/**
 * Feuille des images des thèmes, créée au premier thème décoré ; chaque thème n'y est écrit qu'une fois, par
 * insertRule (la feuille n'est pas relue en entier à chaque thème, comme elle le serait en ajoutant du texte). Appelé
 * pendant le rendu de Board : un effet idempotent, au plus une fois par thème.
 */
let sheet: HTMLStyleElement | null = null;
const written = new Set<string>();
function writeThemeCss(id: string) {
  if (written.has(id) || typeof document === 'undefined') return;
  written.add(id);
  const rules = themeRules(id);
  if (!rules.length) return;
  if (!sheet) {
    sheet = document.createElement('style');
    sheet.setAttribute('data-board-themes', '');
    document.head.appendChild(sheet);
  }
  const css = sheet.sheet!;
  for (const rule of rules) css.insertRule(rule, css.cssRules.length);
}

const cache = new Map<string, { theme: BoardTheme; id: string }>();

/** Habillage d'un thème (objet board:*) ; absent ou inconnu : Nuit arcane, comme boardStyle. */
export function boardTheme(theme: string | undefined): BoardTheme {
  const key = theme ?? '';
  let entry = cache.get(key);
  if (!entry) {
    const id = themeId(theme);
    const bs = boardStyle(id);
    const cls = [`tex-${bs.texture}`];
    const vars: Record<string, string> = {};
    if (bs.fillet) {
      cls.push('has-fillet');
      vars['--fillet'] = bs.fillet;
    }
    if (bs.inlay) cls.push('has-inlay');
    const fa = bs.frameArt;
    if (fa?.kind === 'border') {
      cls.push('fa-border');
      vars['--fa-slice'] = String(fa.slice);
    } else if (fa?.kind === 'corners') {
      cls.push('fa-corners');
      vars['--fa-size'] = `${fa.size}px`;
      vars['--fa-at'] = `${cornerOffset(fa.size)}px`;
      if (fa.mid) {
        cls.push('fa-mid');
        vars['--fa-mid'] = `${fa.mid}px`;
        vars['--fa-mid-at'] = `${Math.max(0, (FRAME - fa.mid) / 2)}px`;
      }
    }
    if (bs.frameGlow) {
      cls.push('has-glow');
      if (bs.frameGlow.background) vars['--frame-bg'] = bs.frameGlow.background;
      if (bs.frameGlow.shadow) vars['--frame-shadow'] = bs.frameGlow.shadow;
    }
    if (bs.inlay || fa) cls.push(imageClass(id));
    entry = { theme: { className: cls.join(' '), vars: vars as CSSProperties }, id };
    cache.set(key, entry);
  }
  // Une fois par thème ; vérifié à chaque appel (et non à la seule création de l'entrée) : hors navigateur, rien n'est
  // écrit, et un appel suivant dans le navigateur l'écrira
  if (!written.has(entry.id)) writeThemeCss(entry.id);
  return entry.theme;
}
