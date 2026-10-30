// Pages légales. Les informations de l'éditeur viennent de la configuration du serveur (variables LEGAL_*).
// Ces textes sont des modèles : ils doivent être relus par un professionnel du droit avant l'ouverture.
import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { api } from '../api';
import { PageLoader } from '../components/Layout';
import { PageHead, PlacePage, useTitle } from './PageScene';

interface LegalInfo {
  company: string;
  address: string;
  siren: string;
  vat: string;
  director: string;
  contact: string;
  host: string;
  appName: string;
  url: string;
}

type Page = 'cgu' | 'cgv' | 'privacy' | 'mentions';

const DOCS: { page: Page; to: string; title: string; short: string }[] = [
  { page: 'mentions', to: '/mentions-legales', title: 'Mentions légales', short: 'Mentions légales' },
  { page: 'cgu', to: '/cgu', title: 'Conditions générales d’utilisation', short: 'Conditions d’utilisation' },
  { page: 'cgv', to: '/cgv', title: 'Conditions générales de vente', short: 'Conditions de vente' },
  { page: 'privacy', to: '/confidentialite', title: 'Politique de confidentialité', short: 'Confidentialité' },
];

export default function Legal({ page }: { page: Page }) {
  const doc = DOCS.find(d => d.page === page)!;
  useTitle(doc.short);
  const [l, setL] = useState<LegalInfo | null>(null);
  useEffect(() => {
    api<LegalInfo>('/legal')
      .then(setL)
      .catch(() => undefined);
  }, []);
  if (!l) return <PageLoader />;
  const updated = '29 octobre 2026';
  return (
    <PlacePage place="archives" className="lg">
      <PageHead place="Les Archives" aside="Informations légales" title={doc.title} />
      <div className="lg-grid">
        <nav className="lg-nav" aria-label="Documents légaux">
          {DOCS.map(d => (
            <NavLink key={d.page} to={d.to} className={({ isActive }) => (isActive ? 'on' : '')}>
              {d.short}
            </NavLink>
          ))}
          <p className="lg-contact">
            Une question ? <a href={`mailto:${l.contact}`}>{l.contact}</a>
          </p>
        </nav>
        <article className="prose lg-doc">
          {page === 'mentions' && (
            <>
              <h2>Éditeur du site</h2>
              <p>
                {l.appName} ({l.url}) est édité par {l.company}, {l.address}.<br />
                SIREN : {l.siren}. TVA intracommunautaire : {l.vat}.<br />
                Directeur de la publication : {l.director}.<br />
                Contact : <a href={`mailto:${l.contact}`}>{l.contact}</a>
              </p>
              <h2>Hébergement</h2>
              <p>{l.host}</p>
              <h2>Propriété intellectuelle</h2>
              <p>
                L’ensemble des éléments du site (marque, logo, illustrations des cartes, pièces, effets visuels, textes et code) est la propriété exclusive de
                l’éditeur. Toute reproduction sans autorisation est interdite. Les règles des échecs appartiennent, elles, à tout le monde.
              </p>
              <h2>Paiements</h2>
              <p>Les paiements sont traités par Stripe Payments Europe Ltd. L’éditeur n’a jamais accès à vos données bancaires.</p>
            </>
          )}

          {page === 'cgu' && (
            <>
              <p className="faint">Dernière mise à jour : {updated}</p>
              <h2>1. Objet</h2>
              <p>
                Les présentes conditions encadrent l’utilisation du service {l.appName}, jeu d’échecs en ligne enrichi de cartes de pouvoir, édité par{' '}
                {l.company}.
              </p>
              <h2>2. Accès au service</h2>
              <p>
                Le jeu est gratuit. Il est possible de jouer sans compte (contre l’IA ou via un lien d’invitation) en choisissant un pseudo. La création d’un
                compte est gratuite et ouverte aux personnes âgées d’au moins 15 ans, ou plus jeunes avec l’accord d’un titulaire de l’autorité parentale.
              </p>
              <h2>3. Compte</h2>
              <p>
                Vous êtes responsable de la confidentialité de votre mot de passe et des actions réalisées depuis votre compte. Vous pouvez supprimer votre
                compte à tout moment depuis la page <Link to="/compte">Mon compte</Link>.
              </p>
              <h2>4. Règles de conduite</h2>
              <ul>
                <li>Pseudos injurieux, discriminatoires ou trompeurs interdits.</li>
                <li>Interdiction d’utiliser une assistance extérieure (moteur d’analyse, autre personne) pendant une partie classée.</li>
                <li>Interdiction de manipuler le classement (parties arrangées, comptes multiples) ou de perturber le service.</li>
              </ul>
              <p>En cas de manquement, l’éditeur peut suspendre ou supprimer le compte concerné, après information de l’utilisateur sauf urgence.</p>
              <h2>5. Disponibilité</h2>
              <p>L’éditeur s’efforce d’assurer l’accès au service en continu mais ne peut le garantir. Des interruptions pour maintenance peuvent survenir.</p>
              <h2>6. Achats</h2>
              <p>
                Les achats de contenus numériques sont régis par les <Link to="/cgv">conditions générales de vente</Link>.
              </p>
              <h2>7. Données personnelles</h2>
              <p>
                Voir la <Link to="/confidentialite">politique de confidentialité</Link>.
              </p>
              <h2>8. Droit applicable</h2>
              <p>
                Les présentes conditions sont soumises au droit français. En cas de litige, une solution amiable sera recherchée avant toute action judiciaire.
              </p>
            </>
          )}

          {page === 'cgv' && (
            <>
              <p className="faint">Dernière mise à jour : {updated}</p>
              <h2>1. Vendeur</h2>
              <p>
                {l.company}, {l.address}, SIREN {l.siren}. Contact : <a href={`mailto:${l.contact}`}>{l.contact}</a>.
              </p>
              <h2>2. Produits</h2>
              <p>
                La boutique propose des contenus numériques cosmétiques (skins d’animation des cartes, thèmes de plateau, packs). Ils modifient uniquement
                l’apparence du jeu et ne procurent aucun avantage en partie. Ils sont attachés au compte de l’acheteur et ne sont ni cessibles ni remboursables
                en espèces.
              </p>
              <h2>3. Prix</h2>
              <p>
                Les prix sont indiqués en euros toutes taxes comprises. L’éditeur peut les modifier à tout moment ; le prix applicable est celui affiché lors de
                la commande.
              </p>
              <h2>4. Commande et paiement</h2>
              <p>
                Le paiement s’effectue par carte bancaire ou autres moyens proposés via Stripe, sur une page sécurisée. La commande est définitive après
                confirmation du paiement. Un reçu est envoyé par e-mail.
              </p>
              <h2>5. Livraison</h2>
              <p>Le contenu est ajouté au compte immédiatement après la confirmation du paiement.</p>
              <h2>6. Droit de rétractation</h2>
              <p>
                Conformément à l’article L221-28 13° du Code de la consommation, le droit de rétractation ne peut être exercé pour un contenu numérique fourni
                sur un support immatériel dont l’exécution a commencé avec l’accord préalable exprès du consommateur, qui a renoncé expressément à son droit de
                rétractation. Avant chaque achat, vous donnez cet accord et cette renonciation en cochant la case prévue à cet effet.
              </p>
              <h2>7. Garanties</h2>
              <p>
                Vous bénéficiez de la garantie légale de conformité des contenus numériques (articles L224-25-1 et suivants du Code de la consommation). En cas
                de problème, contactez-nous à {l.contact} : nous livrerons le contenu ou vous rembourserons.
              </p>
              <h2>8. Médiation</h2>
              <p>
                En cas de litige non résolu, vous pouvez recourir gratuitement à un médiateur de la consommation : [nom et coordonnées du médiateur choisi par
                l’éditeur], ou à la plateforme européenne de règlement en ligne des litiges.
              </p>
            </>
          )}

          {page === 'privacy' && (
            <>
              <p className="faint">Dernière mise à jour : {updated}</p>
              <h2>Responsable du traitement</h2>
              <p>
                {l.company}, {l.address}. Contact : <a href={`mailto:${l.contact}`}>{l.contact}</a>.
              </p>
              <h2>Données collectées</h2>
              <ul>
                <li>
                  <b>Compte</b> : adresse e-mail, pseudo, mot de passe (stocké chiffré de façon irréversible), classement, préférences.
                </li>
                <li>
                  <b>Parties</b> : coups joués, cartes utilisées, pseudos des joueurs, dates.
                </li>
                <li>
                  <b>Achats</b> : produit, montant, date, statut. Les données bancaires sont traitées uniquement par Stripe.
                </li>
                <li>
                  <b>Technique</b> : adresse IP et navigateur au moment de la connexion, pour la sécurité du compte.
                </li>
              </ul>
              <h2>Finalités et bases légales</h2>
              <ul>
                <li>Fournir le jeu et le compte : exécution du contrat.</li>
                <li>Encaisser et conserver les preuves d’achat : obligation légale (10 ans pour les pièces comptables).</li>
                <li>Sécuriser le service et prévenir la triche : intérêt légitime.</li>
              </ul>
              <h2>Cookies</h2>
              <p>
                Le site n’utilise que des cookies strictement nécessaires : session de connexion et identifiant d’invité permettant de reprendre une partie.
                Aucun cookie publicitaire ni de mesure d’audience tierce. Ils ne nécessitent donc pas de consentement. Les polices sont hébergées sur nos
                serveurs.
              </p>
              <h2>Destinataires</h2>
              <p>Hébergeur ({l.host}), Stripe (paiements), prestataire d’envoi d’e-mails. Aucune donnée n’est vendue.</p>
              <h2>Durées de conservation</h2>
              <p>Compte : jusqu’à sa suppression. Sessions : 30 jours. Pièces comptables : 10 ans, anonymisées après suppression du compte.</p>
              <h2>Vos droits</h2>
              <p>
                Accès, rectification, effacement, portabilité, opposition et limitation. Exportez ou supprimez vos données depuis{' '}
                <Link to="/compte">Mon compte</Link>, ou écrivez à {l.contact}. Vous pouvez saisir la CNIL (cnil.fr).
              </p>
            </>
          )}
        </article>
      </div>
    </PlacePage>
  );
}
