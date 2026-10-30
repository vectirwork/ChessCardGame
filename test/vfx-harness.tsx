// Banc d'essai des effets (développement).
// - Sort : /test/vfx.html?card=rift&targets=e4&skin=skin:inferno (lancé au chargement si `card` est donné ;
//   sinon `window.cast('blast', [], 'skin:arcane')`). `window.moves(2)` joue deux coups (arrivée d'un Présage).
// - Galerie des cartes (emblèmes, tailles, état « jouée ») : /test/vfx.html?cards
// - `?live` : animation en temps réel (sinon la scène avance image par image avec `window.__step(ms)`).
// - `?catalog=duel` : cartes historiques (anciennes parties).
import '@fontsource/cinzel/700.css';
import '@fontsource-variable/inter';
import '../src/client/styles/global.css';
import '../src/client/styles/cards.css';
import '../src/client/styles/board.css';
import '../src/client/styles/game.css';
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { sqIndex } from '../src/shared/chess';
import { CardId, Catalog, cardsOf } from '../src/shared/cards';
import { skinStyle } from '../src/shared/catalog';
import { CardInfo, GameState, createGameFromFen, legalMovesOf, playCard, playMove } from '../src/shared/game';
import { Board, BoardHandle } from '../src/client/components/Board';
import { SpellCard } from '../src/client/components/SpellCard';
import { useVfx } from '../src/client/vfx/useVfx';

const q = new URLSearchParams(location.search);
const FEN = q.get('fen') ?? 'r1bq1rk1/pp2bppp/2n1pn2/3p4/2PP4/2N1PN2/PP2BPPP/2BQK2R w K - 0 9';
const CATALOG: Catalog = q.get('catalog') === 'duel' ? 'duel' : 'climats';
const IDS = cardsOf(CATALOG);
const w = window as any;

function Harness() {
  const ref = useRef<BoardHandle>(null);
  const [wrap, setWrap] = useState<HTMLDivElement | null>(null);
  const [s, setS] = useState<GameState>(() => {
    const g = createGameFromFen(FEN, { w: [...IDS], b: [...IDS] }, true, CATALOG);
    g.captured = { w: ['r'], b: ['p'] };
    const pre = q.get('pre');
    let cur = g;
    if (pre) for (const mv of pre.split(',')) {
      const r = playMove(cur, sqIndex(mv.slice(0, 2)), sqIndex(mv.slice(2, 4)));
      if (r.ok) cur = r.state;
    }
    return cur;
  });
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const vfx = useVfx(wrap, 'w');
  const sRef = useRef(s);
  sRef.current = s;
  useEffect(() => setWrap(ref.current?.wrap ?? null), []);
  useEffect(() => {
    if (!vfx) return;
    vfx.stage.guard = q.has('live');
    const apply = (n: GameState) => {
      sRef.current = n;
      setS(n);
      vfx.stage.syncMarkers(n.effects, n.pos);
    };
    w.cast = (card: CardId, targets: string[], skin = 'skin:arcane') => {
      const st = sRef.current;
      const idx = st.hands[st.pos.turn].findIndex(h => h.card === card && !h.used);
      const r = playCard(st, st.pos.turn, idx, targets.map(sqIndex), skin);
      if (!r.ok) return r.error;
      w.castDone = false;
      void vfx.m.playCast(vfx.stage, r.info, skinStyle(skin), {
        impact: () => apply(r.state),
        hide: ids => setHidden(new Set(ids)),
        show: () => setHidden(new Set()),
        victimAtBottom: false,
      }).then(() => (w.castDone = true));
      return 'ok';
    };
    /** Sort brut, sans moteur (carte inconnue comprise) : vérifie que playCast rend toujours la main. */
    w.rawCast = (card: string, targets: string[] = [], skin = 'skin:arcane') => {
      w.rawImpact = false;
      w.rawDone = false;
      const info = { card, caster: 'w', targets: targets.map(sqIndex), pieces: [], skin } as unknown as CardInfo;
      void vfx.m.playCast(vfx.stage, info, skinStyle(skin), { impact: () => (w.rawImpact = true) }).then(() => (w.rawDone = true));
      return 'ok';
    };
    /** Joue `n` coups (le premier coup légal non capturant si possible) : fait arriver un Présage. */
    w.moves = (n = 1) => {
      let st = sRef.current;
      for (let i = 0; i < n; i++) {
        const legal = legalMovesOf(st);
        const m = legal.find(x => !st.pos.board[x.to]) ?? legal[0];
        if (!m) break;
        const r = playMove(st, m.from, m.to, m.promo);
        if (!r.ok) break;
        st = r.state;
      }
      apply(st);
      return st.effects.map(e => `${e.card}${e.pending ? ' (annoncé)' : ''}`).join(', ');
    };
    w.ready = true;
    const card = q.get('card') as CardId | null;
    if (card) w.cast(card, (q.get('targets') ?? '').split(',').filter(Boolean), q.get('skin') ?? 'skin:arcane');
  }, [vfx]);
  return (
    <div style={{ width: 620, margin: '110px auto' }}>
      <Board ref={ref} pos={s.pos} orientation="w" theme={q.get('theme') ?? undefined} effects={s.effects} hidden={hidden} locked />
    </div>
  );
}

/** Galerie : emblèmes et cartes dans toutes leurs tailles, jouées ou non. */
function Gallery() {
  return (
    <div style={{ padding: 24, display: 'grid', gap: 22, color: '#eee' }}>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {IDS.map(id => <SpellCard key={id} id={id} size="full" tilt={false} />)}
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {IDS.map((id, i) => <SpellCard key={id} id={id} size="hand" tilt={false} used={i === 2} />)}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {IDS.map((id, i) => <SpellCard key={id} id={id} size="compact" used={i % 3 === 1} />)}
      </div>
      <div style={{ width: 340, display: 'flex', gap: 6, padding: 8, border: '1px dashed #555' }}>
        {IDS.slice(3, 6).map((id, i) => <SpellCard key={id} id={id} size="compact" used={i === 1} />)}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {IDS.map((id, i) => <SpellCard key={id} id={id} size="mini" tilt={false} used={i === 1} />)}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(q.has('cards') ? <Gallery /> : <Harness />);
