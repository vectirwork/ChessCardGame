// Problèmes : positions classiques et problèmes à cartes, problème du jour, série et progression locales.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BoardStage, lastMoveOf } from '../features/BoardStage';
import { CardHand, EffectsLine, useTargeting } from '../features/CardHand';
import { MiniBoard } from '../features/MiniBoard';
import { dayKey, useStored } from '../features/storage';
import { Check, Crumbs, Level, PageHead, useTitle } from '../features/ui';
import { playSound } from '../sound';
import type { CardId } from '../../shared/cards';
import type { PieceType } from '../../shared/chess';
import { GameState, legalMovesOf } from '../../shared/game';
import { fenOf } from '../../shared/pgn';
import {
  PUZZLES, Puzzle, PuzzleAction, PuzzleTheme, THEME_LABEL, applyAction, dailyPuzzle, goalOf, puzzleById, puzzleStart,
  sameAction, solverOf, stepOptions,
} from '../../shared/puzzles';

export interface PuzzleProgress {
  /** Problèmes résolus (horodatage de la première réussite). */
  solved: Record<string, number>;
  /** Résolus du premier coup, sans voir la solution. */
  clean: Record<string, true>;
  streak: number;
  best: number;
  /** Jour (AAAA-MM-JJ) → problème du jour résolu. */
  daily: Record<string, string>;
}

const KEY = 'sm:problemes';
const EMPTY: PuzzleProgress = { solved: {}, clean: {}, streak: 0, best: 0, daily: {} };

function useProgress() {
  const [raw, set] = useStored<PuzzleProgress>(KEY, EMPTY);
  const p: PuzzleProgress = { ...EMPTY, ...raw };
  return [p, set] as const;
}

/** Jours d'affilée où le problème du jour a été résolu (aujourd'hui, ou jusqu'à hier). */
function dailyStreak(daily: Record<string, string>): number {
  const d = new Date();
  if (!daily[dayKey(d)]) d.setDate(d.getDate() - 1);
  let n = 0;
  while (daily[dayKey(d)]) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

const DATE_LONG = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

const FILTERS: { id: 'tous' | PuzzleTheme; label: string }[] = [
  { id: 'tous', label: 'Tous' },
  { id: 'mat1', label: 'Mat en 1' },
  { id: 'mat2', label: 'Mat en 2' },
  { id: 'mat3', label: 'Mat en 3' },
  { id: 'fourchette', label: 'Fourchettes' },
  { id: 'clouage', label: 'Clouages' },
  { id: 'enfilade', label: 'Enfilades' },
  { id: 'deviation', label: 'Déviations' },
  { id: 'decouverte', label: 'Découvertes' },
  { id: 'finale', label: 'Mats élémentaires' },
  { id: 'cartes', label: 'Cartes' },
];

export default function Puzzles() {
  const { puzzle } = useParams();
  const p = puzzleById(puzzle);
  if (puzzle && !p) {
    return (
      <div className="container page ft-page">
        <Crumbs items={[{ to: '/problemes', label: 'Problèmes' }, { label: 'Introuvable' }]} />
        <p className="muted">Ce problème n’existe pas (ou plus).</p>
        <Link className="btn" to="/problemes">Tous les problèmes</Link>
      </div>
    );
  }
  return p ? <PuzzleView key={p.id} puzzle={p} /> : <PuzzleIndex />;
}

function nextUnsolved(after: Puzzle | null, solved: Record<string, number>): Puzzle | undefined {
  const start = after ? PUZZLES.indexOf(after) + 1 : 0;
  for (let k = 0; k < PUZZLES.length; k++) {
    const q = PUZZLES[(start + k) % PUZZLES.length];
    if (!solved[q.id] && q !== after) return q;
  }
  return undefined;
}

// ---------------------------------------------------------------------------------------------
// Sommaire

function PuzzleIndex() {
  useTitle('Problèmes');
  const [progress] = useProgress();
  const [filter, setFilter] = useState<'tous' | PuzzleTheme>('tous');
  const today = new Date();
  const daily = dailyPuzzle(today);
  const dailyDone = progress.daily[dayKey(today)] === daily.id;
  const solvedCount = PUZZLES.filter(q => progress.solved[q.id]).length;
  const cont = nextUnsolved(null, progress.solved);
  const list = PUZZLES.filter(q => filter === 'tous' || q.themes.includes(filter));
  const ds = dailyStreak(progress.daily);
  return (
    <div className="container page ft-page">
      <PageHead
        kicker="Problèmes"
        title={<>Un regard, <em>un coup juste</em></>}
        sub="Des positions choisies à la main : mats en un, deux ou trois coups, fourchettes, clouages, enfilades, déviations, et quelques énigmes où la bonne carte fait la différence."
      />

      <section className="ft-daily panel" aria-labelledby="pdj">
        <Link to={`/problemes/${daily.id}`} className="ft-daily-board" aria-label={`Ouvrir le problème du jour : ${daily.title}`}>
          <MiniBoard fen={daily.fen} orientation={solverOf(daily)} coords label={`Position du problème ${daily.title}`} />
        </Link>
        <div className="ft-daily-body">
          <div className="eyebrow" id="pdj">Problème du jour · {DATE_LONG.format(today)}</div>
          <h2 className="ft-daily-title">{daily.title}</h2>
          <p className="muted">{goalOf(daily)}</p>
          <div className="ft-tags">
            {daily.themes.map(t => <span key={t} className="badge">{THEME_LABEL[t]}</span>)}
            <Level n={daily.level} />
          </div>
          <div className="ft-actions">
            <Link className="btn btn-primary" to={`/problemes/${daily.id}`}>{dailyDone ? 'Revoir' : 'Résoudre'}</Link>
            {cont && cont.id !== daily.id && <Link className="btn" to={`/problemes/${cont.id}`}>Continuer la liste</Link>}
          </div>
          <dl className="ft-stats">
            <div><dt>Résolus</dt><dd>{solvedCount}<small> / {PUZZLES.length}</small></dd></div>
            <div><dt>Série</dt><dd>{progress.streak}<small> · record {progress.best}</small></dd></div>
            <div><dt>Jours d’affilée</dt><dd>{ds}{dailyDone && <small> · aujourd’hui ✓</small>}</dd></div>
          </dl>
        </div>
      </section>

      <section className="ft-group" aria-labelledby="tous-pb">
        <h2 id="tous-pb" className="ft-group-title">Tous les problèmes</h2>
        <div className="segmented ft-filter" role="group" aria-label="Filtrer par thème">
          {FILTERS.map(f => {
            const n = f.id === 'tous' ? PUZZLES.length : PUZZLES.filter(q => q.themes.includes(f.id as PuzzleTheme)).length;
            return (
              <button key={f.id} type="button" className={filter === f.id ? 'on' : ''} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                {f.label} <span className="faint">{n}</span>
              </button>
            );
          })}
        </div>
        <div className="ft-tiles">
          {list.map(q => (
            <Link key={q.id} to={`/problemes/${q.id}`} className={`ft-tile ${progress.solved[q.id] ? 'done' : ''}`}>
              <MiniBoard fen={q.fen} orientation={solverOf(q)} className="ft-tile-board" label={`Position du problème ${q.title}`} />
              <span className="ft-tile-body">
                <b>{q.title}</b>
                <span>{q.themes.map(t => THEME_LABEL[t]).join(' · ')}</span>
                <small><Check on={!!progress.solved[q.id]} /> {progress.solved[q.id] ? 'Résolu' : solverOf(q) === 'w' ? 'Les Blancs jouent' : 'Les Noirs jouent'} <Level n={q.level} /></small>
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Résolution

type Status = 'play' | 'solved' | 'shown';

interface Run {
  s: GameState;
  idx: number;
  status: Status;
  mistakes: number;
  note: string | null;
}

function PuzzleView({ puzzle }: { puzzle: Puzzle }) {
  useTitle(puzzle.title);
  const navigate = useNavigate();
  const [progress, setProgress] = useProgress();
  const solver = solverOf(puzzle);
  const isDaily = dailyPuzzle(new Date()).id === puzzle.id;
  const [run, setRun] = useState<Run>(() => ({ s: puzzleStart(puzzle), idx: 0, status: 'play', mistakes: 0, note: null }));
  const [hint, setHint] = useState(0);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<'ok' | 'bad' | null>(null);
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));
  const clearTimers = () => {
    timers.current.forEach(t => window.clearTimeout(t));
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  const blink = (k: 'ok' | 'bad') => {
    setFlash(k);
    later(() => setFlash(null), 650);
  };

  const restart = () => {
    clearTimers();
    setBusy(false);
    setHint(0);
    // Les erreurs de la visite restent comptées : recommencer ne rend pas une résolution « propre ».
    setRun(r => ({ s: puzzleStart(puzzle), idx: 0, status: 'play', mistakes: r.mistakes, note: null }));
  };

  const recordSolved = useCallback((clean: boolean) => {
    setProgress(prev => {
      const p = { ...EMPTY, ...prev };
      // La série ne compte que les problèmes nouveaux, résolus sans erreur ni solution.
      const streak = clean && !p.solved[puzzle.id] ? p.streak + 1 : p.streak;
      return {
        ...p,
        solved: { ...p.solved, [puzzle.id]: p.solved[puzzle.id] ?? Date.now() },
        clean: clean ? { ...p.clean, [puzzle.id]: true } : p.clean,
        streak,
        best: Math.max(p.best, streak),
        daily: isDaily ? { ...p.daily, [dayKey()]: puzzle.id } : p.daily,
      };
    });
  }, [setProgress, puzzle.id, isDaily]);

  const breakStreak = useCallback(() => {
    setProgress(prev => ({ ...EMPTY, ...prev, streak: 0 }));
  }, [setProgress]);

  const sound = (before: GameState, after: GameState) => {
    if (after.result?.reason === 'checkmate') return playSound('end');
    playSound(after.captured.w.length + after.captured.b.length > before.captured.w.length + before.captured.b.length ? 'capture' : 'move');
  };

  /** Joue les réponses adverses jusqu'au prochain tour du solveur, ou conclut. */
  const advance = (r: Run) => {
    const done = r.idx >= puzzle.solution.length || r.s.result?.reason === 'checkmate';
    if (done) {
      setRun({ ...r, status: 'solved', note: null });
      blink('ok');
      recordSolved(r.mistakes === 0);
      return;
    }
    if (r.s.pos.turn === solver) {
      setRun(r);
      return;
    }
    setRun(r);
    setBusy(true);
    later(() => {
      const opt = stepOptions(puzzle.solution[r.idx])[0];
      const n = opt ? applyAction(r.s, opt) : null;
      setBusy(false);
      if (!n) return;
      sound(r.s, n);
      advance({ ...r, s: n, idx: r.idx + 1 });
    }, 520);
  };

  const act = (a: PuzzleAction) => {
    if (run.status !== 'play' || busy) return;
    const n = applyAction(run.s, a);
    if (!n) return;
    const expected = stepOptions(puzzle.solution[run.idx] ?? '');
    const ok = expected.some(o => sameAction(o, a)) || (n.result?.reason === 'checkmate' && n.result.winner === solver);
    if (!ok) {
      if (run.mistakes === 0) breakStreak();
      setRun({ ...run, mistakes: run.mistakes + 1, note: a.kind === 'card' ? 'Ce n’est pas la bonne carte (ou la bonne case). Réessayez.' : 'Ce n’est pas le meilleur coup. Réessayez.' });
      blink('bad');
      playSound('error');
      return;
    }
    if (a.kind === 'card') playSound('select');
    else sound(run.s, n);
    setHint(0);
    advance({ ...run, s: n, idx: run.idx + 1, note: null });
  };

  const showSolution = () => {
    if (run.status !== 'play') return;
    clearTimers();
    if (run.mistakes === 0) breakStreak();
    // Rejoue la solution depuis le début, coup par coup.
    let s = puzzleStart(puzzle);
    setRun({ s, idx: 0, status: 'shown', mistakes: run.mistakes + 1, note: null });
    setBusy(true);
    puzzle.solution.forEach((step, i) => {
      later(() => {
        const opt = stepOptions(step)[0];
        const n = opt ? applyAction(s, opt) : null;
        if (!n) return;
        sound(s, n);
        s = n;
        setRun(r => ({ ...r, s: n, idx: i + 1 }));
        if (i === puzzle.solution.length - 1) setBusy(false);
      }, 500 + i * 850);
    });
  };

  const onMove = (from: number, to: number, promo?: PieceType) => act({ kind: 'move', from, to, promo });
  const onCard = (card: CardId, _i: number, targets: number[]) => act({ kind: 'card', card, targets });
  const myTurn = run.status === 'play' && !busy && run.s.pos.turn === solver;
  const targeting = useTargeting(run.s, solver, myTurn, onCard);
  const legal = useMemo(() => (myTurn && targeting.index === null ? legalMovesOf(run.s) : []), [myTurn, run.s, targeting.index]);

  const expectedNow = run.status === 'play' ? stepOptions(puzzle.solution[run.idx] ?? '')[0] : undefined;
  const glow = hint >= 2 && expectedNow?.kind === 'move' ? expectedNow.from : null;
  const next = nextUnsolved(puzzle, progress.solved) ?? PUZZLES[(PUZZLES.indexOf(puzzle) + 1) % PUZZLES.length];
  const solvedBefore = !!progress.solved[puzzle.id];
  const hasCards = !!puzzle.hands;

  return (
    <div className="container page ft-page ft-puzzle">
      <Crumbs items={[{ to: '/problemes', label: 'Problèmes' }, { label: puzzle.title }]} />
      <div className="ft-play">
        <div className="ft-play-board">
          <BoardStage
            state={run.s}
            orientation={solver}
            legal={legal}
            onMove={onMove}
            lastMove={run.s.log.length ? lastMoveOf(run.s) : null}
            glow={glow}
            flash={flash}
            locked={!myTurn}
            targets={targeting.options}
            targetHue={targeting.hue}
            chosen={targeting.partial}
            onTarget={targeting.target}
            label={`Échiquier du problème ${puzzle.title}`}
          />
          {hasCards && <CardHand state={run.s} color={solver} targeting={targeting} disabled={!myTurn} />}
          <EffectsLine effects={run.s.effects} />
        </div>

        <aside className="ft-side panel" aria-live="polite">
          <div className="eyebrow">{isDaily ? 'Problème du jour' : puzzle.themes.map(t => THEME_LABEL[t]).join(' · ')}</div>
          <h1 className="ft-side-title">{puzzle.title}</h1>
          <div className="ft-tags">
            {isDaily && puzzle.themes.map(t => <span key={t} className="badge">{THEME_LABEL[t]}</span>)}
            <Level n={puzzle.level} />
            {solvedBefore && run.status === 'play' && <span className="badge gold">Déjà résolu</span>}
          </div>
          <p className={`ft-turn ${solver === 'w' ? 'w' : 'b'}`}><i aria-hidden="true" />{goalOf(puzzle)}</p>

          {run.status === 'play' && run.note && <p className="ft-note bad" role="alert">{run.note}</p>}
          {run.status === 'play' && busy && <p className="ft-meta">L’adversaire répond…</p>}
          {run.status === 'play' && hint >= 1 && <p className="ft-note hint">{puzzle.hint}</p>}
          {run.status === 'solved' && (
            <p className="ft-note ok">
              {run.mistakes === 0 ? 'Résolu du premier coup.' : 'Résolu.'} {puzzle.moral}
            </p>
          )}
          {run.status === 'shown' && <p className="ft-note">Solution : {puzzle.moral}</p>}

          <div className="ft-actions">
            {run.status === 'play' && hint < 2 && (
              <button type="button" className="btn btn-sm" onClick={() => setHint(h => h + 1)} disabled={busy}>
                {hint === 0 ? 'Indice' : 'Montrer la pièce'}
              </button>
            )}
            {run.status === 'play' && (
              <button type="button" className="btn btn-sm btn-ghost" onClick={showSolution} disabled={busy}>Voir la solution</button>
            )}
            {(run.status !== 'play' || run.s.log.length > 0) && (
              <button type="button" className="btn btn-sm btn-ghost" onClick={restart} disabled={busy && run.status === 'shown'}>Recommencer</button>
            )}
            {run.status !== 'play' && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => navigate(`/problemes/${next.id}`)} autoFocus={run.status === 'solved'}>
                Problème suivant
              </button>
            )}
          </div>

          <dl className="ft-stats compact">
            <div><dt>Série</dt><dd>{progress.streak}</dd></div>
            <div><dt>Record</dt><dd>{progress.best}</dd></div>
            <div><dt>Résolus</dt><dd>{PUZZLES.filter(q => progress.solved[q.id]).length}<small> / {PUZZLES.length}</small></dd></div>
          </dl>
          <div className="ft-side-links">
            {!hasCards && <Link to={`/analyse?fen=${encodeURIComponent(fenOf(puzzleStart(puzzle)))}`}>Analyser la position</Link>}
            <Link to="/problemes">Tous les problèmes</Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
