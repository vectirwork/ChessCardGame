// Apprendre : leçons interactives sur un vrai échiquier (consigne, coup attendu, réaction, indice).
// Progression conservée dans le navigateur (clé sm:apprendre).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CardEmblem } from '../components/CardArt';
import { BoardStage, lastMoveOf } from '../features/BoardStage';
import type { Arrow } from '../features/BoardStage';
import { CardHand, EffectsLine, useTargeting } from '../features/CardHand';
import { MiniBoard } from '../features/MiniBoard';
import { useStored } from '../features/storage';
import { Check, Crumbs, PageHead, useTitle } from '../features/ui';
import { playSound } from '../sound';
import { CARDS, CATALOGS, CardId, FAMILY_LABEL, Family, cardsOf } from '../../shared/cards';
import { PieceType, sqIndex } from '../../shared/chess';
import { GameState, legalMovesOf, playMove } from '../../shared/game';
import {
  LESSONS, LESSON_GROUPS, Lesson, LessonPanel, LessonStep, freeMove, lessonById, loneKingReply, matedBy, stepStart, studentOf,
} from '../../shared/lessons';
import { parseUci } from '../../shared/pgn';
import { PuzzleAction, applyAction, sameAction, stepOptions } from '../../shared/puzzles';

type Progress = Record<string, { step: number; done?: boolean }>;
const KEY = 'sm:apprendre';

export default function Learn() {
  const { lesson } = useParams();
  const l = lessonById(lesson);
  if (lesson && !l) return <LessonMissing />;
  return l ? <LessonView key={l.id} lesson={l} /> : <LessonIndex />;
}

function LessonMissing() {
  useTitle('Apprendre');
  return (
    <div className="container page ft-page">
      <Crumbs items={[{ to: '/apprendre', label: 'Apprendre' }, { label: 'Leçon introuvable' }]} />
      <p className="muted">Cette leçon n’existe pas (ou plus).</p>
      <Link className="btn" to="/apprendre">Toutes les leçons</Link>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Sommaire

function previewFen(l: Lesson): string {
  return l.steps[0].fen;
}

function LessonIndex() {
  useTitle('Apprendre');
  const [progress] = useStored<Progress>(KEY, {});
  const done = LESSONS.filter(l => progress[l.id]?.done).length;
  const next = LESSONS.find(l => !progress[l.id]?.done);
  const started = LESSONS.some(l => progress[l.id]);
  return (
    <div className="container page ft-page">
      <PageHead
        kicker="Apprendre"
        title={<>Les échecs, <em>pas à pas</em></>}
        sub="De la marche des pièces aux mats élémentaires, puis les cartes de Spellmate. Chaque leçon se joue sur l’échiquier, à votre rythme ; votre progression reste dans ce navigateur."
      >
        <div className="ft-head-row">
          <div className="ft-meter" aria-label={`${done} leçons terminées sur ${LESSONS.length}`}>
            <span style={{ width: `${(done / LESSONS.length) * 100}%` }} />
          </div>
          <span className="faint">{done} / {LESSONS.length} leçons</span>
          {next && (
            <Link className="btn btn-primary btn-sm" to={`/apprendre/${next.id}`}>
              {started ? 'Reprendre' : 'Commencer'} : {next.title}
            </Link>
          )}
        </div>
      </PageHead>
      {LESSON_GROUPS.map((g, gi) => (
        <section key={g} className="ft-group" aria-labelledby={`g${gi}`}>
          <h2 id={`g${gi}`} className="ft-group-title"><span className="ft-num">{['I', 'II', 'III', 'IV', 'V'][gi]}</span>{g}</h2>
          <div className="ft-tiles">
            {LESSONS.filter(l => l.group === g).map(l => {
              const p = progress[l.id];
              const state = p?.done ? 'Terminée' : p ? `Étape ${Math.min(p.step + 1, l.steps.length)} sur ${l.steps.length}` : `${l.steps.length} étapes`;
              return (
                <Link key={l.id} to={`/apprendre/${l.id}`} className={`ft-tile ${p?.done ? 'done' : ''}`}>
                  <MiniBoard fen={previewFen(l)} className="ft-tile-board" label={`Position de la leçon ${l.title}`} />
                  <span className="ft-tile-body">
                    <b>{l.title}</b>
                    <span>{l.summary}</span>
                    <small><Check on={!!p?.done} /> {state}</small>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Leçon

type Status = 'play' | 'success' | 'fail';

interface Run {
  s: GameState;
  /** Étape de la suite imposée. */
  idx: number;
  stars: number[];
  moves: number;
  status: Status;
  note: string | null;
}

function freshRun(step: LessonStep): Run {
  return {
    s: stepStart(step),
    idx: 0,
    stars: step.goal.kind === 'stars' ? step.goal.stars.map(sqIndex) : [],
    moves: 0,
    status: step.goal.kind === 'info' ? 'success' : 'play',
    note: null,
  };
}

function LessonView({ lesson }: { lesson: Lesson }) {
  useTitle(lesson.title);
  const navigate = useNavigate();
  const [progress, setProgress] = useStored<Progress>(KEY, {});
  const saved = progress[lesson.id];
  const [stepIdx, setStepIdx] = useState(() => (saved && !saved.done ? Math.min(saved.step, lesson.steps.length - 1) : 0));
  const step = lesson.steps[stepIdx];
  const student = studentOf(step);
  const [run, setRun] = useState<Run>(() => freshRun(step));
  const [hint, setHint] = useState(false);
  const [flash, setFlash] = useState<'ok' | 'bad' | null>(null);
  const [busy, setBusy] = useState(false);
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));
  const clearTimers = () => {
    timers.current.forEach(t => window.clearTimeout(t));
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  const reset = useCallback(() => {
    clearTimers();
    setRun(freshRun(step));
    setHint(false);
    setFlash(null);
    setBusy(false);
  }, [step]);
  useEffect(() => {
    reset();
  }, [reset]);

  const blink = (k: 'ok' | 'bad') => {
    setFlash(k);
    later(() => setFlash(null), 650);
  };

  const markDone = useCallback(() => {
    setProgress(p => {
      const cur = p[lesson.id] ?? { step: 0 };
      const last = stepIdx === lesson.steps.length - 1;
      return { ...p, [lesson.id]: { step: Math.max(cur.step, stepIdx + 1), done: cur.done || last } };
    });
  }, [setProgress, lesson, stepIdx]);

  // Une étape « Lecture » compte comme vue dès qu'on passe à la suivante.
  const succeed = useCallback((r: Run, note?: string) => {
    setRun({ ...r, status: 'success', note: note ?? null });
    blink('ok');
    playSound('notify');
    markDone();
  }, [markDone]);

  const fail = (r: Run, note: string) => {
    setRun({ ...r, status: 'fail', note });
    blink('bad');
    playSound('error');
  };

  const wrong = (note: string) => {
    setRun(r => ({ ...r, note }));
    blink('bad');
    playSound('error');
  };

  const sound = (before: GameState, after: GameState) => {
    playSound(after.captured.w.length + after.captured.b.length > before.captured.w.length + before.captured.b.length ? 'capture' : 'move');
  };

  /** Suite imposée : joue les réponses de l'adversaire jusqu'au prochain tour de l'élève. */
  const continueLine = useCallback((r: Run) => {
    const g = step.goal;
    if (g.kind !== 'line') return;
    if (r.idx >= g.line.length || r.s.result) {
      succeed(r);
      return;
    }
    if (r.s.pos.turn === student) {
      setRun(r);
      return;
    }
    setRun(r);
    setBusy(true);
    later(() => {
      const opt = stepOptions(g.line[r.idx])[0];
      const n = opt ? applyAction(r.s, opt) : null;
      setBusy(false);
      if (!n) {
        succeed(r);
        return;
      }
      sound(r.s, n);
      continueLine({ ...r, s: n, idx: r.idx + 1, note: null });
    }, 620);
  }, [step, student, succeed]);

  const act = (a: PuzzleAction) => {
    const r = run;
    if (r.status !== 'play' || busy) return;
    const g = step.goal;
    const s = r.s;
    if (a.kind === 'card') {
      if (g.kind !== 'line') return;
      const ok = stepOptions(g.line[r.idx] ?? '').some(o => sameAction(o, a));
      if (!ok) return wrong('Ce n’est pas la carte (ou la case) attendue. Relisez la consigne.');
      const n = applyAction(s, a);
      if (!n) return wrong('Cette carte ne peut pas être jouée ici.');
      playSound('select');
      continueLine({ ...r, s: n, idx: r.idx + 1, note: null });
      return;
    }
    const { from, to, promo } = a;
    if (g.kind === 'stars') {
      const n = freeMove(s, from, to, promo);
      if (!n) return;
      sound(s, n);
      const stars = r.stars.filter(t => t !== to);
      const next = { ...r, s: n, stars, moves: r.moves + 1, note: null };
      if (!stars.length) succeed(next);
      else setRun(next);
      return;
    }
    const res = playMove(s, from, to, promo);
    if (!res.ok) return;
    const n = res.state;
    if (g.kind === 'any') {
      sound(s, n);
      succeed({ ...r, s: n });
      return;
    }
    if (g.kind === 'mate') {
      if (n.result?.reason === 'checkmate') {
        sound(s, n);
        succeed({ ...r, s: n });
      } else if (n.result?.reason === 'stalemate') {
        wrong('Pat ! Le roi adverse n’est pas en échec et n’a plus de coup : la partie serait nulle. Cherchez un échec.');
      } else wrong('Ce coup ne donne pas le mat. Cherchez encore.');
      return;
    }
    if (g.kind === 'line') {
      const expected = g.line[r.idx] ?? '';
      const lastStep = r.idx === g.line.length - 1;
      const ok = expected === '*'
        || stepOptions(expected).some(o => sameAction(o, a))
        || (!!g.mate && lastStep && n.result?.reason === 'checkmate');
      if (!ok) return wrong('Ce n’est pas le coup attendu. Relisez la consigne, ou demandez un indice.');
      sound(s, n);
      continueLine({ ...r, s: n, idx: r.idx + 1, note: null });
      return;
    }
    if (g.kind === 'hunt') {
      sound(s, n);
      const moves = r.moves + 1;
      if (matedBy(n, student)) return succeed({ ...r, s: n, moves }, `Mat en ${moves} coup${moves > 1 ? 's' : ''}.`);
      if (n.result?.reason === 'stalemate') return fail({ ...r, s: n, moves }, 'Pat : le roi noir n’a plus de coup sans être en échec. Partie nulle ! Laissez-lui toujours une case tant que vous ne donnez pas le mat.');
      if (n.result) return fail({ ...r, s: n, moves }, 'La partie est terminée sans mat. Recommencez.');
      if (moves >= g.maxMoves) return fail({ ...r, s: n, moves }, `Les ${g.maxMoves} coups sont écoulés. Recommencez : coupez le roi, puis resserrez l’étau.`);
      setRun({ ...r, s: n, moves, note: null });
      setBusy(true);
      later(() => {
        const m = loneKingReply(n);
        setBusy(false);
        if (!m) return;
        const rr = playMove(n, m.from, m.to, m.promo);
        if (!rr.ok) return;
        sound(n, rr.state);
        if (rr.state.result) return fail({ ...r, s: rr.state, moves }, 'Le roi noir a pris une pièce : il ne reste plus assez de matériel pour mater. Recommencez en protégeant vos pièces.');
        setRun(cur => ({ ...cur, s: rr.state }));
      }, 450);
    }
  };

  const onMove = (from: number, to: number, promo?: PieceType) => act({ kind: 'move', from, to, promo });
  const onCard = (card: CardId, _i: number, targets: number[]) => act({ kind: 'card', card, targets });

  const myTurn = run.status === 'play' && !busy && run.s.pos.turn === student;
  const targeting = useTargeting(run.s, student, myTurn, onCard);
  const legal = useMemo(() => (myTurn && targeting.index === null ? legalMovesOf(run.s) : []), [myTurn, run.s, targeting.index]);

  const arrows: Arrow[] = (step.arrows ?? []).map(u => parseUci(u)).filter((x): x is NonNullable<typeof x> => !!x).map(m => ({ from: m.from, to: m.to }));
  const marks = (step.marks ?? []).map(sqIndex);
  const lastMove = run.s.log.length ? lastMoveOf(run.s) : step.last ? (() => { const m = parseUci(step.last!); return m ? { from: m.from, to: m.to } : null; })() : null;

  // Indice : le texte, puis la case de départ du coup attendu (suites imposées).
  const glow = (() => {
    if (!hint || run.status !== 'play' || step.goal.kind !== 'line') return null;
    const opt = stepOptions(step.goal.line[run.idx] ?? '')[0];
    if (!opt) return null;
    return opt.kind === 'move' ? opt.from : null;
  })();

  const isLast = stepIdx === lesson.steps.length - 1;
  const li = LESSONS.indexOf(lesson);
  const nextLesson = LESSONS[li + 1];
  const goNext = () => {
    if (step.goal.kind === 'info') markDone();
    if (!isLast) setStepIdx(stepIdx + 1);
  };

  const status = run.status === 'success'
    ? step.goal.kind === 'info' ? null : step.success ?? 'Bravo !'
    : run.status === 'fail' ? run.note : null;

  return (
    <div className="container page ft-page ft-lesson">
      <Crumbs items={[{ to: '/apprendre', label: 'Apprendre' }, { label: lesson.group }, { label: lesson.title }]} />
      <div className="ft-play">
        <div className="ft-play-board">
          <BoardStage
            state={run.s}
            orientation={student}
            legal={legal}
            onMove={onMove}
            lastMove={lastMove}
            arrows={arrows}
            stars={run.stars}
            marks={run.status === 'play' || step.goal.kind === 'info' ? marks : []}
            glow={glow}
            flash={flash}
            locked={!myTurn}
            targets={targeting.options}
            targetHue={targeting.hue}
            chosen={targeting.partial}
            onTarget={targeting.target}
            label={`Échiquier de la leçon ${lesson.title}`}
          />
          <CardHand state={run.s} color={student} targeting={targeting} disabled={!myTurn} />
          <EffectsLine effects={run.s.effects} />
        </div>

        <aside className="ft-side panel" aria-live="polite">
          <div className="eyebrow">{lesson.group}</div>
          <h1 className="ft-side-title">{lesson.title}</h1>
          <ol className="ft-steps" aria-label="Étapes de la leçon">
            {lesson.steps.map((_, i) => (
              <li key={i}>
                <button
                  type="button"
                  className={`${i === stepIdx ? 'on' : ''} ${i < (progress[lesson.id]?.step ?? 0) ? 'seen' : ''}`}
                  aria-current={i === stepIdx ? 'step' : undefined}
                  aria-label={`Étape ${i + 1}`}
                  onClick={() => setStepIdx(i)}
                >
                  {i + 1}
                </button>
              </li>
            ))}
          </ol>
          <p className="ft-instr">{step.text}</p>
          {step.panel && <LessonPanelView panel={step.panel} />}
          {step.goal.kind === 'stars' && run.status === 'play' && (
            <p className="ft-meta">Étoiles restantes : {run.stars.length} · {run.moves} coup{run.moves > 1 ? 's' : ''}</p>
          )}
          {step.goal.kind === 'hunt' && (
            <p className="ft-meta">Coups joués : {run.moves} / {step.goal.maxMoves}</p>
          )}
          {run.status === 'play' && run.note && <p className="ft-note bad" role="alert">{run.note}</p>}
          {status && <p className={`ft-note ${run.status === 'success' ? 'ok' : 'bad'}`}>{status}{run.status === 'success' && run.note ? ` ${run.note}` : ''}</p>}
          {hint && step.hint && run.status === 'play' && <p className="ft-note hint">{step.hint}</p>}

          <div className="ft-actions">
            {run.status === 'play' && step.hint && !hint && (
              <button type="button" className="btn btn-sm" onClick={() => setHint(true)}>Indice</button>
            )}
            {step.goal.kind !== 'info' && (run.status !== 'play' || run.s.log.length > 0 || run.moves > 0) && (
              <button type="button" className="btn btn-sm btn-ghost" onClick={reset}>Recommencer l’étape</button>
            )}
            {run.status === 'success' && !isLast && (
              <button type="button" className="btn btn-primary btn-sm" onClick={goNext} autoFocus>Continuer</button>
            )}
            {run.status === 'success' && isLast && step.goal.kind === 'info' && !progress[lesson.id]?.done && (
              <button type="button" className="btn btn-primary btn-sm" onClick={markDone}>Terminer la leçon</button>
            )}
          </div>
          {isLast && run.status === 'success' && (step.goal.kind !== 'info' || progress[lesson.id]?.done) && (
            <div className="ft-finish">
              <p><Check on /> Leçon terminée.</p>
              <div className="ft-actions">
                {nextLesson ? (
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => navigate(`/apprendre/${nextLesson.id}`)}>
                    Leçon suivante : {nextLesson.title}
                  </button>
                ) : (
                  <Link className="btn btn-primary btn-sm" to="/problemes">Passer aux problèmes</Link>
                )}
                <Link className="btn btn-sm btn-ghost" to="/apprendre">Toutes les leçons</Link>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Encarts des leçons sur les cartes

function CardChip({ id }: { id: CardId }) {
  const def = CARDS[id];
  return (
    <li className="ft-chip" style={{ '--h': def.hue } as CSSProperties} title={def.description}>
      <span className="ft-card-em sm"><CardEmblem id={id} /></span>
      <span><b>{def.name}</b><small>{def.tagline}</small></span>
    </li>
  );
}

function LessonPanelView({ panel }: { panel: LessonPanel }) {
  if (panel === 'catalogs') {
    return (
      <dl className="ft-defs">
        {CATALOGS.map(c => (
          <div key={c.id}>
            <dt>{c.label}{c.id !== 'aucune' && <small> · {cardsOf(c.id).length} cartes</small>}</dt>
            <dd>{c.description}</dd>
          </div>
        ))}
      </dl>
    );
  }
  if (panel === 'families') {
    const fams: Family[] = ['climat', 'terrain', 'evenement'];
    const climats = cardsOf('climats');
    return (
      <div className="ft-fams">
        {fams.map(f => (
          <div key={f}>
            <h3>{FAMILY_LABEL[f]}</h3>
            <ul className="ft-chips">{climats.filter(id => CARDS[id].family === f).map(id => <CardChip key={id} id={id} />)}</ul>
          </div>
        ))}
      </div>
    );
  }
  const list = cardsOf('climats').filter(id => (panel === 'presage' ? CARDS[id].presage : CARDS[id].ritual));
  return (
    <div className="ft-fams">
      <h3>{panel === 'presage' ? 'Cartes à Présage' : 'Cartes à Rituel'}</h3>
      <ul className="ft-chips">{list.map(id => <CardChip key={id} id={id} />)}</ul>
    </div>
  );
}
