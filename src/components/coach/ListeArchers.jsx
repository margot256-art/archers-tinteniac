import { useEffect, useState, useMemo } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../hooks/useAuth";
import { useAllSeances } from "../../hooks/useAllSeances";
import { callAdminFunction } from "../../utils/adminApi";
import { PRIMARY as PINK } from "../../utils/seances";
import { NouvelArcherModal, DemandesMotDePasse } from "./GestionComptes";

// Onglet Archers, réservé aux coachs : création d'un archer, demandes de nouveau
// mot de passe, et liste des comptes (collection `users`) où l'on nomme un archer
// coach ou lui retire le droit (fonction Netlify admin-coachs), et où l'on supprime
// le compte d'un archer (admin-delete-archer — ses séances sont conservées).
export default function ListeArchers() {
  const { user } = useAuth();
  const { seances } = useAllSeances();
  const [comptes,  setComptes]  = useState(null);  // [{ id, prenom, nom }] ou null pendant le chargement
  const [coachs,   setCoachs]   = useState(null);  // Set d'uid, ou null tant que pas chargé
  const [erreur,   setErreur]   = useState("");
  const [enCours,  setEnCours]  = useState(null);  // uid en cours de modification
  const [ajout,    setAjout]    = useState(false); // fenêtre « Nouvel archer » ouverte

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "users"),
      (snap) => setComptes(snap.docs.map((d) => ({ id: d.id, prenom: d.data().prenom ?? "", nom: d.data().nom ?? "" }))),
      (err) => {
        console.error("[ListeArchers] lecture des comptes :", err);
        setErreur("Impossible de charger la liste des archers.");
      }
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    let actif = true;
    callAdminFunction("admin-coachs").then(
      ({ coachs: ids }) => { if (actif) setCoachs(new Set(ids)); },
      (err) => {
        console.error("[ListeArchers] lecture des coachs :", err);
        if (actif) setErreur("Impossible de savoir qui est coach (disponible uniquement sur le site en ligne).");
      }
    );
    return () => { actif = false; };
  }, []);

  const tries = useMemo(
    () => (comptes ?? []).slice().sort((a, b) =>
      `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, "fr", { sensitivity: "base" })),
    [comptes]
  );

  // Nombre de séances par archer, pour prévenir avant une suppression de compte.
  const nbSeancesPar = useMemo(() => {
    const n = {};
    for (const x of seances) if (x.archerId) n[x.archerId] = (n[x.archerId] ?? 0) + 1;
    return n;
  }, [seances]);

  const supprimerCompte = async (compte) => {
    const nom = `${compte.prenom} ${compte.nom}`;
    const nb  = nbSeancesPar[compte.id] ?? 0;
    const question = `Supprimer le compte de ${nom} ?\n\n`
      + "Cette personne ne pourra plus se connecter. Son compte, ses objectifs et ses demandes de mot de passe seront supprimés définitivement.\n\n"
      + (nb > 0
        ? `Ses ${nb} séance(s) seront conservées dans l'historique du club.`
        : "Cette personne n'a aucune séance enregistrée.");
    if (!window.confirm(question)) return;
    setEnCours(compte.id);
    setErreur("");
    try {
      await callAdminFunction("admin-delete-archer", { uid: compte.id });
    } catch (err) {
      setErreur(err.message || "Erreur lors de la suppression.");
    } finally {
      setEnCours(null);
    }
  };

  const changerDroit = async (compte, coach) => {
    const nom = `${compte.prenom} ${compte.nom}`;
    const question = coach
      ? `Nommer ${nom} coach ? Cette personne aura accès à la partie coach et aux séances de tous les archers.`
      : `Retirer le droit coach à ${nom} ?`;
    if (!window.confirm(question)) return;
    setEnCours(compte.id);
    setErreur("");
    try {
      await callAdminFunction("admin-coachs", { uid: compte.id, coach });
      setCoachs((prev) => {
        const suivant = new Set(prev);
        if (coach) suivant.add(compte.id); else suivant.delete(compte.id);
        return suivant;
      });
    } catch (err) {
      setErreur(err.message || "Erreur lors de la modification.");
    } finally {
      setEnCours(null);
    }
  };

  if (!comptes && !erreur) return <div style={s.info}>Chargement…</div>;

  return (
    <div style={s.page}>
      <div style={s.header}>
        <button style={s.btnAjouter} onClick={() => setAjout(true)}>+ Ajouter un archer</button>
        <span style={s.sousTitre}>
          {tries.length} compte{tries.length > 1 ? "s" : ""}
          {coachs && ` · ${coachs.size} coach${coachs.size > 1 ? "s" : ""}`}
        </span>
      </div>
      {ajout && <NouvelArcherModal onClose={() => setAjout(false)} />}

      <DemandesMotDePasse />

      <h2 style={s.titre}>Utilisateurs</h2>

      <p style={s.aide}>
        Un coach voit la partie coach et les séances de tous les archers. Le changement est pris en
        compte à la prochaine ouverture de l'appli par la personne concernée.
      </p>

      {erreur && <div style={s.erreur}>{erreur}</div>}

      <div style={s.liste}>
        {tries.map((c) => {
          const estCoach = coachs?.has(c.id);
          const estMoi   = c.id === user?.id;
          return (
            <div key={c.id} style={s.ligne}>
              <span style={s.nom}>
                {c.prenom} {c.nom}
                {estMoi && <span style={s.moi}> (vous)</span>}
              </span>
              {estCoach && <span style={s.badgeCoach}>Coach</span>}
              {coachs && !estMoi && (
                <button
                  style={{ ...(estCoach ? s.btnRetirer : s.btnNommer), ...(enCours === c.id ? { opacity: 0.6 } : {}) }}
                  disabled={enCours !== null}
                  onClick={() => changerDroit(c, !estCoach)}
                >
                  {enCours === c.id ? "…" : estCoach ? "Retirer le droit coach" : "Nommer coach"}
                </button>
              )}
              {coachs && !estMoi && !estCoach && (
                <button
                  style={s.btnSupprimer}
                  disabled={enCours !== null}
                  onClick={() => supprimerCompte(c)}
                  title="Supprimer le compte"
                  aria-label={`Supprimer le compte de ${c.prenom} ${c.nom}`}
                >Supprimer</button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const s = {
  page:      { display: "flex", flexDirection: "column", gap: "16px" },
  header:    { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" },
  titre:     { fontFamily: "var(--display)", fontSize: "21px", fontWeight: "600", color: "var(--text)", margin: 0 },
  sousTitre: { fontSize: "13px", color: "var(--text-dim)" },
  aide:      { fontSize: "13px", color: "var(--text-muted)", margin: 0, lineHeight: 1.5 },
  info:      { color: "var(--text-muted)", fontSize: "14px" },
  erreur: {
    color: PINK, fontSize: "13px", padding: "10px 14px",
    backgroundColor: "var(--pink-soft)", borderRadius: "8px", border: `1px solid ${PINK}`,
  },
  liste: {
    display: "flex", flexDirection: "column", gap: "1px", borderRadius: "12px", overflow: "hidden",
    border: "1px solid var(--border)", boxShadow: "var(--shadow-card)",
  },
  ligne: {
    display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap",
    backgroundColor: "var(--surface)", padding: "12px 16px",
  },
  nom:        { fontSize: "14px", fontWeight: "700", color: "var(--text)", flex: "1 1 auto" },
  moi:        { fontWeight: "400", color: "var(--text-dim)" },
  badgeCoach: {
    fontSize: "10px", fontWeight: "700", color: PINK, border: `1px solid ${PINK}`, borderRadius: "4px",
    padding: "1px 6px", textTransform: "uppercase", letterSpacing: "0.08em",
  },
  btnAjouter: {
    backgroundColor: PINK, color: "#fff", border: "none", borderRadius: "8px",
    padding: "8px 18px", fontSize: "13px", fontWeight: "600", cursor: "pointer", fontFamily: "inherit",
  },
  btnSupprimer: {
    background: "none", color: "var(--bad)", border: "1px solid var(--bad)", borderRadius: "7px",
    padding: "7px 12px", fontSize: "12px", fontWeight: "600", cursor: "pointer", fontFamily: "inherit",
  },
  btnNommer: {
    backgroundColor: "transparent", color: "var(--text-2)", border: "1px solid var(--border-3)", borderRadius: "7px",
    padding: "7px 12px", fontSize: "12px", fontWeight: "600", cursor: "pointer", fontFamily: "inherit",
  },
  btnRetirer: {
    backgroundColor: "transparent", color: "var(--text-muted)", border: "1px solid var(--border-3)", borderRadius: "7px",
    padding: "7px 12px", fontSize: "12px", fontWeight: "600", cursor: "pointer", fontFamily: "inherit",
  },
};
