// Tableau de bord d'administration.
import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { ITEMS, formatPrice, productById } from '../../shared/catalog';
import { api, errMsg } from '../api';
import { PageLoader } from '../components/Layout';
import { useApp } from '../store';
import { PageHead, PlacePage, useTitle } from './PageScene';

export default function Admin() {
  useTitle('Administration');
  const { me, ready, toast } = useApp();
  const [data, setData] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [q, setQ] = useState('');
  useEffect(() => {
    if (!me?.isAdmin) return;
    api('/admin/overview').then(setData).catch(e => toast(errMsg(e), 'error'));
  }, [me, toast]);
  useEffect(() => {
    if (!me?.isAdmin) return;
    const t = setTimeout(() => api<{ users: any[] }>(`/admin/users?q=${encodeURIComponent(q)}`).then(r => setUsers(r.users)).catch(() => undefined), 250);
    return () => clearTimeout(t);
  }, [q, me]);
  if (!ready) return <PageLoader />;
  if (!me?.isAdmin) return <Navigate to="/" replace />;
  if (!data) return <PageLoader />;
  const c = data.counts;
  const maxRev = Math.max(1, ...data.daily.map((d: any) => d.revenue));
  const maxSign = Math.max(1, ...data.daily.map((d: any) => d.signups));
  const grant = async (userId: string, itemId: string, revoke: boolean) => {
    try {
      await api('/admin/grant', { body: { userId, itemId, revoke } });
      toast(revoke ? 'Objet retiré.' : 'Objet offert.', 'success');
      const r = await api<{ users: any[] }>(`/admin/users?q=${encodeURIComponent(q)}`);
      setUsers(r.users);
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };
  return (
    <PlacePage place="atelier" className="adm">
      <PageHead place="La Salle des comptes" aside="Administration" title={<>Tableau de <em>bord.</em></>} lede="Ventes, inscriptions et joueurs. Les montants sont TTC ; les achats de démonstration sont marqués comme tels." />
      <div className="kpis">
        {[
          ['Chiffre d’affaires', formatPrice(c.revenue)],
          ['30 derniers jours', formatPrice(c.revenue_30d)],
          ['Ventes', c.sales],
          ['Acheteurs', c.buyers],
          ['Joueurs inscrits', c.users],
          ['Nouveaux (7 j)', c.users_7d],
          ['Actifs (24 h)', c.active_24h],
          ['Parties en cours', `${data.live.active} · ${data.live.waiting} en attente`],
        ].map(([l, v]) => (
          <div key={l as string} className="kpi"><span>{l}</span><b>{v}</b></div>
        ))}
      </div>
      <div className="grid-2" style={{ marginTop: 22 }}>
        <div className="panel panel-pad">
          <h3 className="adm-h">Revenus, 30 jours</h3>
          <div className="bars">{data.daily.map((d: any) => <i key={d.day} title={`${d.day} : ${formatPrice(d.revenue)}`} style={{ height: `${(d.revenue / maxRev) * 100}%` }} />)}</div>
        </div>
        <div className="panel panel-pad">
          <h3 className="adm-h">Inscriptions, 30 jours</h3>
          <div className="bars cyan">{data.daily.map((d: any) => <i key={d.day} title={`${d.day} : ${d.signups}`} style={{ height: `${(d.signups / maxSign) * 100}%` }} />)}</div>
        </div>
      </div>
      <div className="grid-2" style={{ marginTop: 22 }}>
        <div className="panel table-wrap">
          <table className="table">
            <thead><tr><th>Produit</th><th>Ventes</th><th>Revenus</th></tr></thead>
            <tbody>{data.products.map((p: any) => <tr key={p.product_id}><td>{productById(p.product_id)?.name ?? p.product_id}</td><td>{p.sales}</td><td>{formatPrice(p.revenue)}</td></tr>)}</tbody>
          </table>
          {!data.products.length && <div className="empty" style={{ margin: 14 }}>Aucune vente.</div>}
        </div>
        <div className="panel table-wrap">
          <table className="table">
            <thead><tr><th>Date</th><th>Joueur</th><th>Produit</th><th>Montant</th></tr></thead>
            <tbody>{data.recent.map((p: any) => <tr key={p.id}><td>{new Date(p.created_at).toLocaleDateString('fr-FR')}</td><td>{p.username ?? '—'}</td><td>{productById(p.product_id)?.name}</td><td>{formatPrice(p.amount_cents)} {p.status !== 'paid' && <span className="badge red">{p.status}</span>}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
      <h2 className="section-title adm-t">Joueurs</h2>
      <input className="input adm-search" type="search" aria-label="Rechercher un joueur" placeholder="Rechercher par pseudo ou e-mail…" value={q} onChange={e => setQ(e.target.value)} />
      <div className="panel table-wrap">
        <table className="table">
          <thead><tr><th>Pseudo</th><th>E-mail</th><th>Elo</th><th>Inscrit</th><th>Objets</th><th>Offrir</th></tr></thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td>{u.username} {u.is_admin && <span className="badge gold">admin</span>}</td>
                <td>{u.email} {!u.email_verified && <span className="badge red">non vérifié</span>}</td>
                <td>{u.rating}</td>
                <td className="faint">{new Date(u.created_at).toLocaleDateString('fr-FR')}</td>
                <td style={{ fontSize: 12.5 }}>{u.items.length ? u.items.map((i: string) => <button key={i} className="badge" style={{ cursor: 'pointer', margin: 2 }} title="Retirer" onClick={() => grant(u.id, i, true)}>{i} ✕</button>) : <span className="faint">—</span>}</td>
                <td>
                  <select className="input adm-select" aria-label={`Offrir un objet à ${u.username}`} value="" onChange={e => e.target.value && grant(u.id, e.target.value, false)}>
                    <option value="">Choisir…</option>
                    {ITEMS.filter(i => !i.free && !u.items.includes(i.id)).map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PlacePage>
  );
}
