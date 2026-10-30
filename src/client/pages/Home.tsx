// Page d'accueil : L'Odyssée (src/client/odyssee). L'échiquier du premier écran est une vraie partie.
import { Suspense, lazy, useState } from 'react';
import { ITEMS } from '../../shared/catalog';
import { Spinner } from '../components/Layout';
import OdysseeHome from '../odyssee/OdysseeHome';

const DemoBoard = lazy(() => import('../components/DemoBoard').then(m => ({ default: m.DemoBoard })));

export function Home() {
  return <OdysseeHome />;
}

/** Aperçu animé d'un skin ou d'un plateau (utilisé par la boutique). */
export function SkinPreview({ skin, theme }: { skin?: string; theme?: string }) {
  const [caption, setCaption] = useState('');
  const item = ITEMS.find(i => i.id === (skin ?? theme));
  return (
    <div>
      <h2>{item?.name}</h2>
      <p className="muted" style={{ marginTop: -4 }}>{item?.description}</p>
      <div className="preview-board">
        <Suspense fallback={<div className="board-skeleton"><Spinner /></div>}>
          <DemoBoard mode="preview" skin={skin ?? 'skin:arcane'} theme={theme} onCaption={setCaption} />
        </Suspense>
      </div>
      <div className="hero-caption" style={{ position: 'static', marginTop: 12 }}>{caption || 'Préparation du sort…'}</div>
    </div>
  );
}
