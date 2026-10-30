// Barre d'évaluation (à côté de l'échiquier) et courbe d'évaluation d'une partie.
import type { Analysis } from '../../shared/bot';
import type { Color } from '../../shared/chess';
import { evalCp, formatEval, whiteShare } from './format';
import type { Flag } from './review';

export function EvalBar({ analysis, orientation, idle }: { analysis: Analysis | null; orientation: Color; idle?: boolean }) {
  const share = analysis ? whiteShare(analysis.scoreWhite, analysis.mate) : 0.5;
  const label = analysis ? formatEval(analysis.scoreWhite, analysis.mate) : '';
  const whiteBottom = orientation === 'w';
  return (
    <div className={`ft-evalbar ${idle ? 'idle' : ''} ${whiteBottom ? '' : 'flip'}`} role="meter" aria-label="Évaluation" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)} aria-valuetext={label || 'inconnue'}>
      <span className="ft-evalbar-w" style={{ transform: `scaleY(${share})` }} />
      {label && <span className={`ft-evalbar-v ${share >= 0.5 ? 'w' : 'b'}`}>{label.replace('+', '')}</span>}
    </div>
  );
}

export function EvalGraph({ evals, current, flags, onPick }: { evals: (Analysis | null | undefined)[]; current: number; flags: Flag[]; onPick: (i: number) => void }) {
  const n = evals.length;
  if (n < 2) return null;
  const W = 600, H = 96;
  const x = (i: number) => (i / (n - 1)) * W;
  const y = (a: Analysis) => (1 - whiteShare(a.scoreWhite, a.mate)) * H;
  let d = '';
  let started = false;
  let lastX = 0;
  evals.forEach((a, i) => {
    if (!a) return;
    d += `${started ? 'L' : 'M'}${x(i).toFixed(1)},${y(a).toFixed(1)}`;
    started = true;
    lastX = x(i);
  });
  const area = started ? `${d}L${lastX.toFixed(1)},${H}L0,${H}Z` : '';
  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left) / r.width) * (n - 1));
    onPick(Math.max(0, Math.min(n - 1, i)));
  };
  return (
    <div className="ft-graph">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" onPointerDown={pick} role="img" aria-label="Courbe d’évaluation : cliquez pour aller à un coup">
        <rect x="0" y="0" width={W} height={H} className="ft-graph-b" />
        {area && <path d={area} className="ft-graph-w" />}
        <line x1="0" x2={W} y1={H / 2} y2={H / 2} className="ft-graph-mid" />
        {started && <path d={d} className="ft-graph-line" />}
        <line x1={x(current)} x2={x(current)} y1="0" y2={H} className="ft-graph-cur" />
        {flags.map(f => {
          const a = evals[f.index];
          if (!a) return null;
          return <circle key={f.index} cx={x(f.index)} cy={y(a)} r={f.judgement === 'gaffe' ? 4.5 : 3.5} className={`ft-graph-dot ${f.judgement}`} />;
        })}
      </svg>
    </div>
  );
}

/** Évaluation lisible d'une position de la courbe (infobulles, liste des erreurs). */
export function evalText(cp: number): string {
  return formatEval(cp, Math.abs(cp) >= 2000 ? (cp > 0 ? 1 : -1) : null).replace(/^#(−?)1$/, '#$1');
}

export { evalCp };
