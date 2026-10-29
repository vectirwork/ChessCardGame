// Banc d'essai des effets (développement) : /test/vfx.html?card=ice_wall&skin=skin:inferno&targets=e4
import '@fontsource/cinzel/700.css';
import '@fontsource-variable/inter';
import '../src/client/styles/global.css';
import '../src/client/styles/cards.css';
import '../src/client/styles/board.css';
import '../src/client/styles/game.css';
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { sqIndex } from '../src/shared/chess';
import { CARD_IDS, CardId } from '../src/shared/cards';
import { skinStyle } from '../src/shared/catalog';
import { GameState, createGameFromFen, playCard, playMove } from '../src/shared/game';
import { Board, BoardHandle } from '../src/client/components/Board';
import { useVfx } from '../src/client/vfx/useVfx';

const q = new URLSearchParams(location.search);
const FEN = q.get('fen') ?? 'r1bq1rk1/pp2bppp/2n1pn2/3p4/2PP4/2N1PN2/PP2BPPP/2BQK2R w K - 0 9';

function Harness() {
  const ref = useRef<BoardHandle>(null);
  const [wrap, setWrap] = useState<HTMLDivElement | null>(null);
  const [s, setS] = useState<GameState>(() => {
    const g = createGameFromFen(FEN, { w: [...CARD_IDS], b: [...CARD_IDS] }, true);
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
    (window as any).cast = (card: CardId, targets: string[], skin: string) => {
      const st = sRef.current;
      const idx = st.hands[st.pos.turn].findIndex(h => h.card === card);
      const r = playCard(st, st.pos.turn, idx, targets.map(sqIndex), skin);
      if (!r.ok) return r.error;
      void vfx.m.playCast(vfx.stage, r.info, skinStyle(skin), {
        impact: () => { setS(r.state); vfx.stage.syncMarkers(r.state.effects, r.state.pos); },
        hide: ids => setHidden(new Set(ids)),
        show: () => setHidden(new Set()),
        victimAtBottom: false,
      });
      return 'ok';
    };
    (window as any).ready = true;
  }, [vfx]);
  return (
    <div style={{ width: 620, margin: '110px auto' }}>
      <Board ref={ref} pos={s.pos} orientation="w" theme={q.get('theme') ?? undefined} effects={s.effects} hidden={hidden} locked />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);
