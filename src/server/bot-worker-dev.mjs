// Amorçage du thread IA en développement : active tsx puis charge le module TypeScript.
import { register } from 'tsx/esm/api';

register();
await import('./bot-worker.ts');
