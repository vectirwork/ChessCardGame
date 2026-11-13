// Génère l'image de partage (1200 × 630) : /test/og.html (serveur de développement de Vite), puis capture.
// Marque et nombre de cartes tirés des réglages (BRAND, GAME_RULES). public/og.jpg n'est pas régénérée (décision Q5 du
// fondateur : elle montre encore des cartes du Duel) ; au réglage par défaut, le texte rendu est celui de l'image.
import '@fontsource/cinzel/700.css';
import '@fontsource/cinzel/800.css';
import '@fontsource-variable/inter';
import '../src/client/styles/global.css';
import '../src/client/styles/cards.css';
import type { CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { LogoMark } from '../src/client/components/Layout';
import { SpellCard } from '../src/client/components/SpellCard';
import { BRAND } from '../src/shared/config/brand';
import { GAME_RULES } from '../src/shared/config/rules';
import { cartesDePouvoir } from '../src/shared/text/regles';

/** Texte en dégradé d'or (ancienne classe .gradient-text de global.css, retirée : plus aucune page ne s'en servait). */
const GOLD_TEXT: CSSProperties = {
  background: 'linear-gradient(100deg, #fff1c4 0%, #f3c969 40%, #e5a24a 70%, #fff1c4 100%)',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
};

function Og() {
  return (
    <div style={{ width: 1200, height: 630, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', padding: '0 70px',
      background: 'radial-gradient(900px 600px at 15% 0%, rgba(120,80,255,.35), transparent 60%), radial-gradient(700px 500px at 100% 100%, rgba(40,200,255,.18), transparent 60%), #0a0b17' }}>
      <div style={{ flex: 1, zIndex: 1 }}>
        <div className="logo" style={{ fontSize: 26 }}><LogoMark size={40} /><span>{BRAND.nameCaps}</span></div>
        <h1 className="display" style={{ fontSize: 66, lineHeight: 1.05, margin: '30px 0 22px', maxWidth: 640 }}>
          Les échecs ont désormais <span style={GOLD_TEXT}>des pouvoirs.</span>
        </h1>
        <p style={{ fontSize: 24, color: '#aeacc9', margin: 0, maxWidth: 560 }}>{`${cartesDePouvoir(GAME_RULES, true)}, une vraie partie d’échecs. Gratuit, en ligne, avec ou sans compte.`}</p>
      </div>
      <div style={{ position: 'relative', width: 420, height: 520 }}>
        {(['ice_wall', 'lightning', 'rewind'] as const).map((id, i) => (
          <div key={id} style={{ position: 'absolute', left: 40 + i * 70, top: 40 + Math.abs(i - 1) * 20, transform: `rotate(${(i - 1) * 12}deg)`, transformOrigin: '50% 120%', zIndex: i === 1 ? 2 : 1 }}>
            <SpellCard id={id} size="full" tilt={false} />
          </div>
        ))}
      </div>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<Og />);
