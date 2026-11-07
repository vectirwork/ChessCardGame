// Banc des scènes explicatives : /test/scenes.html (image fixe, puis animée avec ?auto).
import '@fontsource-variable/inter';
import '../src/client/styles/global.css';
import '../src/client/styles/cards.css';
import { createRoot } from 'react-dom/client';
import { CARDS } from '../src/shared/cards';
import type { CardId } from '../src/shared/cards';
import { CardScene } from '../src/client/components/CardScene';

const IDS: CardId[] = ['blood_moon', 'truce', 'ice_age', 'blast', 'ice_wall', 'rift', 'tide', 'hourglass'];
const auto = new URLSearchParams(location.search).has('auto');
createRoot(document.getElementById('root')!).render(
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 200px)', gap: 20, padding: 20 }}>
    {IDS.map(id => (
      <figure key={id} style={{ margin: 0 }}>
        <CardScene id={id} play={auto ? 'auto' : 'hover'} />
        <figcaption style={{ fontSize: 12, marginTop: 6 }}>{CARDS[id].name}</figcaption>
      </figure>
    ))}
  </div>,
);
