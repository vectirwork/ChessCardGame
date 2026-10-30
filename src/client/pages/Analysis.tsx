// Analyse : échiquier libre, liste de coups avec variantes, moteur dans un Web Worker, import et export FEN ou PGN,
// éditeur de position ; /analyse/:gameId rejoue une partie terminée du site (spectateur) avec sa courbe d'évaluation.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { BoardStage } from '../features/BoardStage';
import type { Arrow } from '../features/BoardStage';
import { EvalBar, EvalGraph, evalText } from '../features/EvalViews';
import { useEngine, reviewStates, REVIEW_DEPTH } from '../features/engine';
import type { Analysis as EngineAnalysis } from '../features/engine';
import { EffectsLine, HandView } from '../features/CardHand';
import { catalogLabel, formatDate, formatEval, frSan, outcomeFor, reasonText, scoreText } from '../features/format';
import { localGame, rememberView } from '../features/history';
import { MoveTree } from '../features/MoveTree';
import { PositionEditor } from '../features/PositionEditor';
import { JUDGEMENT_LABEL, JUDGEMENT_SIGN, judge } from '../features/review';
import type { Judgement } from '../features/review';
import { useStored } from '../features/storage';
import { Switch, useTitle } from '../features/ui';
import { emitAck, getSocket } from '../socket';
import { useApp } from '../store';
import { playSound } from '../sound';
import type { Color, Move, PieceType } from '../../shared/chess';
import { opposite } from '../../shared/chess';
import { isCardId } from '../../shared/cards';
import { GameState, createGame, legalMovesOf, playMove } from '../../shared/game';
import {
  PgnError, START_FEN, TreeNode, fenOf, initialStateOf, mainline, makeRoot, normalizeFen, pgnDate, pgnResult, playFrom,
  readPgn, stateFromFen, treeFromLog, validateFen, writePgn,
} from '../../shared/pgn';
import type { JoinReply } from '../../shared/protocol';

interface GameInfo {
  id: string;
  white: string;
  black: string;
  whiteRating: number | null;
  blackRating: number | null;
  winner: Color | 'draw' | null;
  reason: string | null;
  catalog: string | undefined;
  tc: string;
  date: number;
  you: Color | null;
  complete: boolean;
  local?: boolean;
}

type Tab = 'coups' | 'importer' | 'exporter';

export default function Analysis() {
  const { gameId } = useParams();
  const [search] = useSearchParams();
  const loc = useLocation();
  const fen = search.get('fen');
  const imported = (loc.state as { import?: string } | null)?.import;
  return <AnalysisBoard key={`${gameId ?? ''}|${fen ?? ''}|${loc.key}`} gameId={gameId} fen={fen} imported={imported} />;
}

function freeRoot(fen: string | null): { root: TreeNode; error: string | null } {
  if (fen) {
    const f = normalizeFen(fen);
    const err = validateFen(f);
    if (!err) return { root: makeRoot(stateFromFen(f)), error: null };
    return { root: makeRoot(stateFromFen(START_FEN)), error: `FEN ignoré : ${err}` };
  }
  return { root: makeRoot(stateFromFen(START_FEN)), error: null };
}

function AnalysisBoard({ gameId, fen, imported }: { gameId?: string; fen: string | null; imported?: string }) {
  const navigate = useNavigate();
  const { toast } = useApp();
  const init = useMemo(() => freeRoot(fen), [fen]);
  const [root, setRoot] = useState<TreeNode>(init.root);
  const [cur, setCur] = useState<TreeNode>(init.root);
  const [version, setVersion] = useState(0);
  const [headers, setHeaders] = useState<Record<string, string>>({});
  const [orientation, setOrientation] = useState<Color>('w');
  const [mode, setMode] = useState<'analyse' | 'edit'>('analyse');
  const [tab, setTab] = useState<Tab>('coups');
  const [engineOn, setEngineOn] = useStored<boolean>('sm:analyse:moteur', true);
  const [game, setGame] = useState<GameInfo | null>(null);
  const [loading, setLoading] = useState(!!gameId);
  const [problem, setProblem] = useState<ReactNode>(init.error);
  const [evals, setEvals] = useState<Map<number, EngineAnalysis>>(new Map());
  const [review, setReview] = useState<{ done: number; total: number; running: boolean } | null>(null);
  const stopReview = useRef<(() => void) | null>(null);
  useTitle(game ? `${game.white} – ${game.black}` : 'Analyse');

  const replaceTree = useCallback((r: TreeNode, h: Record<string, string> = {}) => {
    stopReview.current?.();
    stopReview.current = null;
    setRoot(r);
    setCur(r);
    setHeaders(h);
    setEvals(new Map());
    setReview(null);
    setVersion(v => v + 1);
  }, []);

  useEffect(() => () => stopReview.current?.(), []);

  const startReview = useCallback((r: TreeNode) => {
    stopReview.current?.();
    const line = mainline(r);
    if (line.length < 2) return;
    setEvals(new Map());
    setReview({ done: 0, total: line.length, running: true });
    stopReview.current = reviewStates(
      line.map(n => n.state),
      (i, a) => {
        setEvals(m => new Map(m).set(line[i].id, a));
        setReview(rv => (rv ? { ...rv, done: rv.done + 1 } : rv));
      },
      () => setReview(rv => (rv ? { ...rv, running: false } : rv)),
    );
  }, []);

  // Partie du site (spectateur) ou partie locale enregistrée sur cet appareil
  useEffect(() => {
    if (!gameId) return;
    if (gameId.startsWith('local-')) {
      const g = localGame(gameId);
      setLoading(false);
      if (!g?.local) {
        setProblem('Cette partie locale n’est plus enregistrée sur cet appareil.');
        return;
      }
      // Une carte retirée du jeu depuis (ancienne partie) est écartée de la main : la relecture s'arrête à son tour.
      const hands = { w: (g.local.hands?.w ?? []).filter(isCardId), b: (g.local.hands?.b ?? []).filter(isCardId) };
      const start = createGame(hands, !!g.local.timed, g.local.catalog ?? 'duel');
      const { root: r, complete } = treeFromLog(start, g.local.log);
      const final = mainline(r).at(-1)!.state;
      replaceTree(r, {
        Event: 'Partie Spellmate (locale)', Site: 'Spellmate', Date: pgnDate(new Date(g.at)), White: g.white, Black: g.black,
        Result: g.winner === 'w' ? '1-0' : g.winner === 'b' ? '0-1' : g.winner === 'draw' ? '1/2-1/2' : pgnResult(final),
      });
      setGame({
        id: g.id, white: g.white, black: g.black, whiteRating: null, blackRating: null, winner: g.winner ?? null, reason: g.reason ?? null,
        catalog: g.catalog, tc: 'Sans limite', date: g.at, you: g.you, complete, local: true,
      });
      setOrientation(g.you ?? 'w');
      startReview(r);
      return;
    }
    let alive = true;
    setLoading(true);
    emitAck<JoinReply>('game:join', { id: gameId, sit: false }, 10000)
      .then(rep => {
        if (!alive) return;
        setLoading(false);
        if (!rep.ok || !rep.view) {
          setProblem(rep.error ?? 'Cette partie est introuvable.');
          return;
        }
        const v = rep.view;
        if (v.status !== 'ended') {
          setProblem(
            <>Cette partie n’est pas terminée : l’analyse s’ouvrira à la fin. <Link to={`/partie/${v.id}`}>La regarder en direct</Link></>,
          );
          return;
        }
        const start = initialStateOf(v.state);
        const { root: r, complete } = treeFromLog(start, v.state.log);
        const w = v.seats.w, b = v.seats.b;
        const tc = v.clock ? `${Math.round(v.clock.initial / 60)}+${v.clock.increment}` : 'Sans limite';
        const h: Record<string, string> = {
          Event: v.rated ? 'Partie classée Spellmate' : 'Partie Spellmate',
          Site: `${window.location.origin}/partie/${v.id}`,
          Date: pgnDate(new Date(v.createdAt)),
          White: w?.name ?? '?',
          Black: b?.name ?? '?',
          Result: pgnResult(v.state),
        };
        if (w?.rating) h.WhiteElo = String(w.rating);
        if (b?.rating) h.BlackElo = String(b.rating);
        if (v.clock) h.TimeControl = `${v.clock.initial}+${v.clock.increment}`;
        if (v.state.result) h.Termination = reasonText(v.state.result.reason);
        replaceTree(r, h);
        setGame({
          id: v.id, white: w?.name ?? 'Blancs', black: b?.name ?? 'Noirs', whiteRating: w?.rating ?? null, blackRating: b?.rating ?? null,
          winner: v.state.result ? v.state.result.winner ?? 'draw' : null, reason: v.state.result?.reason ?? null,
          catalog: v.state.catalog ?? 'duel', tc, date: v.createdAt, you: v.you, complete,
        });
        setOrientation(v.you ?? 'w');
        if (v.you) rememberView(v);
        startReview(r);
      })
      .catch(() => {
        if (!alive) return;
        setLoading(false);
        setProblem('Le serveur ne répond pas. Réessayez dans un instant.');
      });
    return () => {
      alive = false;
      try {
        getSocket().emit('game:leave', { id: gameId });
      } catch {
        // socket indisponible
      }
    };
  }, [gameId, replaceTree, startReview]);

  // Import transmis par la navigation (depuis une partie, l'import remplace la relecture)
  useEffect(() => {
    if (imported) importText(imported);
  }, []);

  const line = useMemo(() => mainline(root), [root, version]);
  const evalList = useMemo(() => line.map(n => evals.get(n.id)), [line, evals]);
  const flags = useMemo(() => (review ? judge(line, evalList) : []), [review, line, evalList]);
  const marks = useMemo(() => new Map<number, Judgement>(flags.map(f => [f.node.id, f.judgement])), [flags]);
  const curIndex = line.indexOf(cur);

  const live = useEngine(mode === 'analyse' ? cur.state : null, engineOn && mode === 'analyse');
  const shown: EngineAnalysis | null = live.analysis ?? (evals.get(cur.id) ?? null);

  // Navigation
  const go = useCallback((n: TreeNode | null | undefined) => {
    if (n) setCur(n);
  }, []);
  const prev = () => go(cur.parent);
  const next = () => go(cur.children[0]);
  const first = () => go(root);
  const last = () => go(mainline(cur).at(-1));
  const flip = () => setOrientation(o => opposite(o));

  useEffect(() => {
    if (mode !== 'analyse') return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.closest('input, textarea, select, [contenteditable="true"]'))) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); setCur(c => c.parent ?? c); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); setCur(c => c.children[0] ?? c); }
      else if (e.key === 'ArrowUp' || e.key === 'Home') { e.preventDefault(); setCur(root); }
      else if (e.key === 'ArrowDown' || e.key === 'End') { e.preventDefault(); setCur(c => mainline(c).at(-1) ?? c); }
      else if (e.key === 'f' || e.key === 'F') flip();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, root]);

  const onMove = (from: number, to: number, promo?: PieceType) => {
    const before = cur.state;
    const n = playFrom(cur, from, to, promo);
    if (!n) return;
    const capture = n.state.captured.w.length + n.state.captured.b.length > before.captured.w.length + before.captured.b.length;
    playSound(n.state.result ? 'end' : capture ? 'capture' : 'move');
    setCur(n);
    setVersion(v => v + 1);
  };

  const playBest = (m: Move) => onMove(m.from, m.to, m.promo);

  const inVariation = (() => {
    for (let n: TreeNode | null = cur; n?.parent; n = n.parent) if (n.parent.children[0] !== n) return n;
    return null;
  })();
  const deleteFromHere = () => {
    const p = cur.parent;
    if (!p) return;
    p.children = p.children.filter(c => c !== cur);
    setCur(p);
    setVersion(v => v + 1);
  };
  const promote = () => {
    const n = inVariation;
    if (!n?.parent) return;
    const p = n.parent;
    p.children = [n, ...p.children.filter(c => c !== n)];
    setVersion(v => v + 1);
  };

  // Import / export
  const [importValue, setImportValue] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  function importText(text: string) {
    const t = text.trim();
    setImportError(null);
    if (!t) return;
    if (gameId) {
      navigate('/analyse', { state: { import: t } });
      return;
    }
    const looksFen = /^[pnbrqkPNBRQK1-8]+(\/[pnbrqkPNBRQK1-8]+){7}(\s|$)/.test(t);
    if (looksFen) {
      const f = normalizeFen(t);
      const err = validateFen(f);
      if (err) return setImportError(err);
      replaceTree(makeRoot(stateFromFen(f)));
      setProblem(null);
      setTab('coups');
      return;
    }
    try {
      const g = readPgn(t);
      replaceTree(g.root, { ...g.headers, Result: g.result });
      setProblem(null);
      setTab('coups');
      if (g.headers.White || g.headers.Black) setGame(null);
    } catch (e) {
      setImportError(e instanceof PgnError ? e.message : 'Texte illisible : collez un FEN ou un PGN.');
    }
  }
  const onFile = (f: File | undefined) => {
    if (!f) return;
    if (f.size > 2_000_000) return setImportError('Fichier trop volumineux.');
    void f.text().then(t => {
      setImportValue(t);
      importText(t);
    });
  };

  const fenNow = fenOf(cur.state);
  const pgn = useMemo(() => {
    const h = { Event: 'Analyse', Site: 'Spellmate', Date: pgnDate(new Date()), ...headers };
    return writePgn(h, root, headers.Result ?? '*');
  }, [root, headers, version]);

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${what} copié.`, 'success');
    } catch {
      toast('Copie impossible : sélectionnez le texte et copiez-le.', 'error');
    }
  };
  const download = () => {
    const blob = new Blob([pgn], { type: 'application/x-chess-pgn' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const base = game ? `spellmate-${game.id}` : 'spellmate-analyse';
    a.download = `${base}.pgn`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const onEditorDone = (f: string) => {
    setMode('analyse');
    if (gameId) {
      navigate(`/analyse?fen=${encodeURIComponent(f)}`);
      return;
    }
    replaceTree(makeRoot(stateFromFen(f)));
    setProblem(null);
  };

  // Meilleure suite en notation française
  const pv = useMemo(() => pvLine(cur.state, live.analysis?.pv ?? []), [cur.state, live.analysis]);
  const legal = useMemo(() => (mode === 'analyse' ? legalMovesOf(cur.state) : []), [cur.state, mode]);
  const arrows: Arrow[] = engineOn && live.analysis?.best ? [{ from: live.analysis.best.from, to: live.analysis.best.to, tone: 'cyan' }] : [];
  const lastEntry = cur.entry;
  const lastMove = lastEntry?.k === 'move' && lastEntry.from >= 0 ? { from: lastEntry.from, to: lastEntry.to } : null;

  if (mode === 'edit') {
    return (
      <div className="container page ft-page ft-analysis">
        <AnalysisHead game={null} title="Éditeur de position" />
        <PositionEditor initialFen={fenNow} onDone={onEditorDone} onCancel={() => setMode('analyse')} />
      </div>
    );
  }

  return (
    <div className="container page ft-page ft-analysis">
      <AnalysisHead game={game} title="Échiquier d’analyse" />
      {loading && <p className="ft-note">Chargement de la partie…</p>}
      {problem && <p className="ft-note bad" role="alert">{problem}</p>}
      {game && !game.complete && <p className="ft-note">La relecture s’arrête avant la fin : un coup du journal n’a pas pu être rejoué.</p>}

      <div className="ft-play">
        <div className="ft-play-board">
          <BoardStage
            state={cur.state}
            orientation={orientation}
            legal={legal}
            onMove={onMove}
            lastMove={lastMove}
            arrows={arrows}
            aside={<EvalBar analysis={engineOn || review ? shown : null} orientation={orientation} idle={!engineOn} />}
            label="Échiquier d’analyse"
          />
          <div className="ft-nav" role="toolbar" aria-label="Navigation dans la partie">
            <IconBtn label="Début (↑)" onClick={first} disabled={!cur.parent}><path d="M5 4v12M15 4l-7 6 7 6" /></IconBtn>
            <IconBtn label="Coup précédent (←)" onClick={prev} disabled={!cur.parent}><path d="M13 4l-7 6 7 6" /></IconBtn>
            <IconBtn label="Coup suivant (→)" onClick={next} disabled={!cur.children.length}><path d="M7 4l7 6-7 6" /></IconBtn>
            <IconBtn label="Fin (↓)" onClick={last} disabled={!cur.children.length}><path d="M15 4v12M5 4l7 6-7 6" /></IconBtn>
            <span className="ft-nav-sep" />
            <IconBtn label="Retourner l’échiquier (F)" onClick={flip}><path d="M6 3v12M3 12l3 3 3-3M14 17V5M11 8l3-3 3 3" /></IconBtn>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setMode('edit')}>Éditer la position</button>
          </div>
          <EffectsLine effects={cur.state.effects} />
          {(cur.state.hands.w.length > 0 || cur.state.hands.b.length > 0) && (
            <div className="ft-an-hands">
              <HandView state={cur.state} color={opposite(orientation)} compact />
              <HandView state={cur.state} color={orientation} compact />
            </div>
          )}
          {review && (
            <section className="ft-review" aria-label="Relecture de la partie">
              <EvalGraph evals={evalList} current={Math.max(0, curIndex)} flags={flags} onPick={i => go(line[i])} />
              <div className="ft-review-meta">
                {review.running ? (
                  <span>Analyse de la partie… {review.done} / {review.total} positions (profondeur {REVIEW_DEPTH})</span>
                ) : (
                  <span>Partie analysée à profondeur {REVIEW_DEPTH}. {flags.length ? '' : 'Aucune erreur grave relevée.'}</span>
                )}
              </div>
              {flags.length > 0 && <ErrorList flags={flags} onPick={n => go(n)} cur={cur} />}
            </section>
          )}
        </div>

        <aside className="ft-side panel ft-an-side">
          <div className="ft-engine">
            <div className="ft-engine-top">
              <Switch on={engineOn} onChange={setEngineOn} label="Moteur" />
              {engineOn && (
                <span className="ft-engine-eval" aria-live="polite">
                  {cur.state.result ? scoreText(cur.state.result.winner ?? 'draw') : live.analysis ? formatEval(live.analysis.scoreWhite, live.analysis.mate) : '…'}
                </span>
              )}
            </div>
            {engineOn && (
              <div className="ft-engine-body">
                {cur.state.result ? (
                  <p className="ft-meta">Partie terminée : {reasonText(cur.state.result.reason).toLowerCase()}.</p>
                ) : (
                  <>
                    <p className="ft-meta">
                      {live.analysis ? `Profondeur ${live.analysis.depth}` : 'Calcul…'}
                      {live.running && live.analysis ? ' · calcul en cours' : ''}
                      {live.analysis ? ` · ${live.analysis.nodes.toLocaleString('fr-FR')} positions` : ''}
                    </p>
                    {pv.length > 0 && (
                      <p className="ft-pv">
                        {pv.map((p, i) => (
                          <span key={i}>
                            {p.num && <span className="ft-mv-n">{p.num}</span>}
                            {i === 0 && live.analysis?.best ? (
                              <button type="button" className="ft-mv best" onClick={() => playBest(live.analysis!.best!)} title="Jouer ce coup">{p.san}</button>
                            ) : (
                              <span className="ft-pv-mv">{p.san}</span>
                            )}{' '}
                          </span>
                        ))}
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          <div className="tabs ft-tabs" role="tablist" aria-label="Panneaux de l’analyse">
            {(['coups', 'importer', 'exporter'] as Tab[]).map(t => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
                {t === 'coups' ? 'Coups' : t === 'importer' ? 'Importer' : 'Exporter'}
              </button>
            ))}
          </div>

          {tab === 'coups' && (
            <div role="tabpanel" aria-label="Coups">
              <MoveTree root={root} cur={cur} onSelect={go} marks={marks} version={version} />
              <div className="ft-actions">
                {inVariation && <button type="button" className="btn btn-sm" onClick={promote}>Promouvoir la variante</button>}
                {cur.parent && <button type="button" className="btn btn-sm btn-ghost" onClick={deleteFromHere}>Supprimer à partir d’ici</button>}
                {!review && line.length > 2 && (
                  <button type="button" className="btn btn-sm" onClick={() => startReview(root)}>Analyser toute la partie</button>
                )}
                {review && !review.running && (
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => startReview(root)}>Relancer l’analyse</button>
                )}
              </div>
              <p className="ft-meta ft-keys">Flèches du clavier : <kbd>←</kbd> <kbd>→</kbd> pour avancer ou reculer, <kbd>↑</kbd> <kbd>↓</kbd> début et fin, <kbd>F</kbd> retourner.</p>
            </div>
          )}

          {tab === 'importer' && (
            <div role="tabpanel" aria-label="Importer" className="ft-io">
              <label className="ft-field">
                <span className="label">FEN ou PGN</span>
                <textarea
                  className="input ft-mono"
                  rows={7}
                  value={importValue}
                  onChange={e => setImportValue(e.target.value)}
                  placeholder={'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1\n\nou\n\n1. e4 e5 2. Cf3 Cc6 3. Fb5 a6'}
                  spellCheck={false}
                />
              </label>
              {importError && <p className="ft-note bad" role="alert">{importError}</p>}
              <div className="ft-actions">
                <button type="button" className="btn btn-primary btn-sm" onClick={() => importText(importValue)} disabled={!importValue.trim()}>Charger</button>
                <label className="btn btn-sm btn-ghost ft-file">
                  Ouvrir un fichier .pgn
                  <input type="file" accept=".pgn,.txt,application/x-chess-pgn,text/plain" onChange={e => onFile(e.target.files?.[0])} />
                </label>
              </div>
              <p className="ft-meta">Notation anglaise (K, Q, R, B, N) ou française (R, D, T, F, C). Les cartes s’écrivent en commentaire : {'{[%spell freeze f6]}'}.</p>
            </div>
          )}

          {tab === 'exporter' && (
            <div role="tabpanel" aria-label="Exporter" className="ft-io">
              <label className="ft-field">
                <span className="label">FEN de la position affichée</span>
                <span className="ft-copyrow">
                  <input className="input ft-mono" value={fenNow} readOnly onFocus={e => e.currentTarget.select()} />
                  <button type="button" className="btn btn-sm" onClick={() => copy(fenNow, 'FEN')}>Copier</button>
                </span>
              </label>
              <label className="ft-field">
                <span className="label">PGN (coups, variantes et cartes)</span>
                <textarea className="input ft-mono" rows={8} value={pgn} readOnly onFocus={e => e.currentTarget.select()} spellCheck={false} />
              </label>
              <div className="ft-actions">
                <button type="button" className="btn btn-sm" onClick={() => copy(pgn, 'PGN')}>Copier le PGN</button>
                <button type="button" className="btn btn-sm" onClick={download}>Télécharger</button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => copy(`${window.location.origin}/analyse?fen=${encodeURIComponent(fenNow)}`, 'Lien')}>Copier le lien de la position</button>
              </div>
            </div>
          )}

          <div className="ft-side-links">
            {(gameId || root.children.length > 0 || fenOf(root.state) !== START_FEN) && (
              <Link to="/analyse" onClick={() => { if (!gameId && !fen) replaceTree(makeRoot(stateFromFen(START_FEN))); }}>Nouvelle analyse</Link>
            )}
            {game && !game.local && <Link to={`/partie/${game.id}`}>Page de la partie</Link>}
            <Link to="/parties">Mes parties</Link>
          </div>
        </aside>
      </div>
    </div>
  );
}

function pvLine(s: GameState, moves: Move[]): { num: string; san: string }[] {
  const out: { num: string; san: string }[] = [];
  let st = s;
  for (const m of moves.slice(0, 10)) {
    const r = playMove(st, m.from, m.to, m.promo);
    if (!r.ok) break;
    const e = r.state.log[r.state.log.length - 1];
    const white = st.pos.turn === 'w';
    out.push({ num: white ? `${st.pos.fullmove}.` : out.length === 0 ? `${st.pos.fullmove}…` : '', san: e.k === 'move' ? frSan(e.san) : '?' });
    st = r.state;
  }
  return out;
}

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" className="ft-icon" onClick={onClick} disabled={disabled} aria-label={label} title={label}>
      <svg viewBox="0 0 20 20" aria-hidden="true">{children}</svg>
    </button>
  );
}

function AnalysisHead({ game, title }: { game: GameInfo | null; title: string }) {
  if (!game) {
    return (
      <header className="ft-an-head">
        <div className="eyebrow">Analyse</div>
        <h1 className="ft-an-title">{title}</h1>
      </header>
    );
  }
  const o = outcomeFor(game.winner, game.you);
  return (
    <header className="ft-an-head">
      <div className="eyebrow">{game.local ? 'Partie sur cet appareil' : 'Relecture'} · {formatDate(game.date)}</div>
      <h1 className="ft-an-title">
        <span className="ft-pl w"><i aria-hidden="true" />{game.white}{game.whiteRating ? <small> {game.whiteRating}</small> : null}</span>
        <span className="ft-an-score">{scoreText(game.winner)}</span>
        <span className="ft-pl b"><i aria-hidden="true" />{game.black}{game.blackRating ? <small> {game.blackRating}</small> : null}</span>
      </h1>
      <p className="ft-meta">
        {game.you && <span className={`ft-outcome ${o.tone}`}>{o.text}</span>}
        {game.reason ? `${reasonText(game.reason)} · ` : ''}Cartes : {catalogLabel(game.catalog as never)} · Cadence : {game.tc}
      </p>
    </header>
  );
}

function ErrorList({ flags, onPick, cur }: { flags: ReturnType<typeof judge>; onPick: (n: TreeNode) => void; cur: TreeNode }) {
  const count = (c: Color, j: Judgement) => flags.filter(f => f.color === c && f.judgement === j).length;
  const sum = (c: Color) => {
    const g = count(c, 'gaffe'), e = count(c, 'erreur');
    const parts = [];
    if (g) parts.push(`${g} gaffe${g > 1 ? 's' : ''}`);
    if (e) parts.push(`${e} erreur${e > 1 ? 's' : ''}`);
    return parts.join(', ') || 'aucune erreur grave';
  };
  return (
    <div className="ft-errors">
      <p className="ft-meta">Blancs : {sum('w')} · Noirs : {sum('b')}</p>
      <ul>
        {flags.map(f => {
          const e = f.node.entry!;
          const s = f.node.parent!.state;
          const label = e.k === 'move' ? frSan(e.san) : '';
          return (
            <li key={f.node.id}>
              <button type="button" className={`ft-err ${f.judgement} ${cur === f.node ? 'on' : ''}`} onClick={() => onPick(f.node)}>
                <span className="ft-mv-n">{s.pos.fullmove}{s.pos.turn === 'w' ? '.' : '…'}</span>
                <b>{label}{JUDGEMENT_SIGN[f.judgement]}</b>
                <span>{JUDGEMENT_LABEL[f.judgement]} · {evalText(f.before)} → {evalText(f.after)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
