// Spellmate · La Galerie : la « maison » enregistre son propre skin et son propre plateau, pour que
// l'échiquier exposé et la Salle de jeu restent dans la palette (papier, encre, vermillon).
// Les entrées sont ajoutées au catalogue en mémoire, pour cette page seulement ; data.ts les écarte de la boutique.
import { ITEMS } from '../../src/shared/catalog';

export const HOUSE_SKIN = 'skin:maison';
export const HOUSE_BOARD = 'board:maison';

if (!ITEMS.some(i => i.id === HOUSE_SKIN)) {
  ITEMS.push({
    id: HOUSE_SKIN,
    kind: 'skin',
    name: 'Encre & vermillon',
    description: 'Le skin de la maison : éclats vermillon, poussière d’encre.',
    free: true,
    skin: { primary: '#d8391f', secondary: '#16130f', accent: '#ff7a52', particle: 'void', flourish: 'runes', drift: -0.35, flash: 0.3, shake: 0.3 },
  });
}
if (!ITEMS.some(i => i.id === HOUSE_BOARD)) {
  ITEMS.push({
    id: HOUSE_BOARD,
    kind: 'board',
    name: 'Ivoire & taupe',
    description: 'Le plateau de la maison.',
    free: true,
    board: { light: '#efe8dc', dark: '#cdbfaa', frame: '#16130f', texture: 'none', coords: '#8a8276' },
  });
}

export const isHouseItem = (id: string) => id === HOUSE_SKIN || id === HOUSE_BOARD;
