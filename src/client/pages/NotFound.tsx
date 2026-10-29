import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="container page center" style={{ paddingTop: 90 }}>
      <div style={{ fontSize: 72 }}>♞</div>
      <h1 className="page-title">Ce coup n’existe pas</h1>
      <p className="muted">La page demandée est introuvable. Même un Retour arrière n’y changera rien.</p>
      <Link to="/" className="btn btn-primary">Revenir à l’accueil</Link>
    </div>
  );
}
