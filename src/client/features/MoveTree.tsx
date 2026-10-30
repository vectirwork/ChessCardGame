// Liste des coups avec variantes : la suite principale en ligne, chaque variante entre parenthèses, en retrait.
// Les cartes jouées apparaissent à leur place, avant le coup qu'elles précèdent.
import { useEffect, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { CardEmblem } from '../components/CardArt';
import { CARDS, isCardId } from '../../shared/cards';
import { describeCardPlay } from '../../shared/game';
import type { TreeNode } from '../../shared/pgn';
import { frSan } from './format';
import type { Judgement } from './review';
import { JUDGEMENT_SIGN } from './review';

interface Props {
  root: TreeNode;
  cur: TreeNode;
  onSelect: (n: TreeNode) => void;
  marks?: Map<number, Judgement>;
  /** Change quand l'arbre est modifié en place (variantes ajoutées, supprimées). */
  version: number;
  empty?: ReactNode;
}

export function MoveTree({ root, cur, onSelect, marks, version, empty }: Props) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current?.querySelector<HTMLElement>('.ft-mv.on');
    if (!el || !box.current) return;
    const b = box.current.getBoundingClientRect(), r = el.getBoundingClientRect();
    if (r.top < b.top || r.bottom > b.bottom) box.current.scrollTop += r.top - b.top - b.height / 2 + r.height / 2;
  }, [cur, version]);

  const token = (parent: TreeNode, node: TreeNode, forceNumber: boolean): ReactNode => {
    const e = node.entry!;
    const s = parent.state;
    const on = node === cur;
    if (e.k === 'card') {
      // Une carte retirée du jeu (ancienne partie) n'a ni teinte ni emblème : son identifiant suffit.
      const def = isCardId(e.card) ? CARDS[e.card] : null;
      return (
        <button
          key={node.id}
          type="button"
          className={`ft-mv card ${on ? 'on' : ''} ${e.undone ? 'undone' : ''}`}
          style={def ? ({ '--h': def.hue } as CSSProperties) : undefined}
          onClick={() => onSelect(node)}
          title={def?.description ?? 'Carte retirée du jeu'}
        >
          {def && <span className="ft-mv-em"><CardEmblem id={e.card} /></span>}
          {describeCardPlay(e.card, e.targets)}
        </button>
      );
    }
    const white = s.pos.turn === 'w';
    const num = white ? `${s.pos.fullmove}.` : forceNumber ? `${s.pos.fullmove}…` : '';
    const j = marks?.get(node.id);
    return (
      <span key={node.id} className="ft-mv-wrap">
        {num && <span className="ft-mv-n">{num}</span>}
        <button type="button" className={`ft-mv ${on ? 'on' : ''} ${j ?? ''} ${e.undone ? 'undone' : ''}`} onClick={() => onSelect(node)} aria-current={on ? 'true' : undefined}>
          {frSan(e.san)}
          {j && <sup>{JUDGEMENT_SIGN[j]}</sup>}
        </button>
        {node.comment && <span className="ft-mv-comment">{node.comment}</span>}
      </span>
    );
  };

  /** Une ligne à partir de `first` (enfant de `parent`), variantes imbriquées comprises. */
  const line = (parent: TreeNode, first: TreeNode, depth: number): ReactNode[] => {
    const out: ReactNode[] = [];
    let p = parent;
    let n: TreeNode | undefined = first;
    let force = true;
    while (n) {
      out.push(token(p, n, force));
      force = n.entry?.k === 'card' || !!n.comment;
      if (p.children[0] === n && p.children.length > 1) {
        for (const v of p.children.slice(1)) {
          out.push(
            <span key={`v${v.id}`} className={`ft-var d${Math.min(depth, 3)}`}>
              {line(p, v, depth + 1)}
            </span>,
          );
        }
        force = true;
      }
      p = n;
      n = n.children[0];
    }
    return out;
  };

  return (
    <div className="ft-moves" ref={box} aria-label="Liste des coups">
      {root.comment && <p className="ft-mv-comment intro">{root.comment}</p>}
      {root.children.length ? line(root, root.children[0], 1) : <p className="ft-moves-empty">{empty ?? 'Jouez un coup sur l’échiquier.'}</p>}
    </div>
  );
}
