// Exemple minimal d'utilisation de la partie locale (à copier dans un concept).
import '@fontsource/cinzel/700.css';
import '@fontsource-variable/inter';
import '../../src/client/styles/global.css';
import '../../src/client/styles/cards.css';
import '../../src/client/styles/board.css';
import { createRoot } from 'react-dom/client';
import { Board } from '../../src/client/components/Board';
import { SpellCard } from '../../src/client/components/SpellCard';
import { useLocalGame } from '../_shared/localGame';

function App() {
  const g = useLocalGame({ skin: 'skin:inferno' });
  return (
    <div style={{ display: 'flex', gap: 30, padding: 30, alignItems: 'center' }}>
      <div style={{ width: 560 }}><Board ref={g.boardRef} {...g.boardProps} /></div>
      <div className="stack">
        {g.hand.map((h, i) => h.card && (
          <SpellCard key={i} id={h.card} size="hand" used={h.used} selected={g.selected === i} disabled={!h.used && !g.playable[i]} onClick={() => g.pickCard(i)} />
        ))}
        {g.selectedDef && <div>{g.prompt} {g.selectedDef.targets === 0 && <button className="btn btn-primary" onClick={g.castSelected}>Lancer</button>}</div>}
      </div>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
