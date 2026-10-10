// Bibliothèques d'export PDF / Excel : lourdes (≈ 1,7 Mo), elles ne sont chargées
// qu'au premier clic sur un bouton d'export, et ne font pas partie du
// téléchargement initial de l'appli (voir globIgnores dans vite.config.js).
export async function chargerExport() {
  const [{ default: XLSX }, { default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("xlsx-js-style"),
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  return { XLSX, jsPDF, autoTable };
}
