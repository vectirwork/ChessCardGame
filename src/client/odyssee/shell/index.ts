// Coque de partie immersive, réutilisable (accueil, page de partie en ligne).
export { GameShell, OracleEye, cardName } from './GameShell';
export { PowersPanel, powerTiming, powerLeft } from './powers';
export { PremoveNote } from './premoveNote';
export { castMessage, castThisTurn, castsThisTurn, handNotes } from './cards';
export type { GameShellProps, ShellAction, ShellPlayer, ShellPrompt, ShellRules } from './GameShell';
export { gameLayout, isMobile, MOBILE_BOARD_TOP, MOBILE_MAX, railTop } from './layout';
export type { GameLayout } from './layout';
export { useGameLayout } from './useGameLayout';
export type { StageLayout } from './useGameLayout';
