/**
 * @NApiVersion 2.1
 *
 * Bilanz-HGB Variante "lean": schlanke §266-Struktur ohne irrelevante
 * Positionen (Finanzanlagen, Wertpapiere, latente Steuern). Aufbau folgt
 * direkt der GRITSpot-Vorlage 31.12.2025. Bei weggelassenen Positionen
 * werden die verbleibenden konsekutiv weg-nummeriert — z.B. Kassenbestand
 * wird zu B.III (statt §266-B.IV), weil B.III Wertpapiere entfaellt.
 *
 * Eigenkapital hat ein spezielles Konstrukt:
 *   I. Gezeichnetes Kapital
 *      Gezeichnetes Kapital           +60.102
 *      eigene Anteile (negativ)       -17.277
 *      = ausgegebenes Kapital         +42.825 (Subtotal)
 *
 * scriptids verweisen wo moeglich auf konzeptidentische Eintraege der
 * voll-Variante (z.B. lean-A.I.1 entgeltlich erworbene Konzessionen →
 * scriptid 'val_a_i_2' wie in voll, wo es A.I.2 ist). Damit ueberleben
 * gesetzte Account-Overrides einen Variant-Wechsel.
 *
 * Einzige neue scriptid in lean: 'val_p_a_i_neg' fuer "eigene Anteile" —
 * muss zur customlist_4abilanz_lines hinzugefuegt werden.
 */
define([], () => {

  // ===========================================================================
  // AKTIVA — GRITSpot-Layout
  // ===========================================================================
  const aktiva = [
    { id: 'A', side: 'aktiva', type: 'section', level: 0, label: 'A. Anlagevermögen',
      components: ['A.t'] },

    { id: 'A.I', side: 'aktiva', type: 'header', level: 1, label: 'I. Immaterielle Vermögensgegenstände' },
    { id: 'A.I.1', side: 'aktiva', type: 'detail', level: 2,
      label: '1. entgeltlich erworbene Konzessionen, gewerbliche Schutzrechte und ähnliche Rechte und Werte sowie Lizenzen an solchen Rechten und Werten',
      scriptid: 'val_a_i_2', // Konzept "entgeltlich erworbene Konzessionen" — in voll A.I.2
      skr03: [[25, 26], [28, 29]], skr04: [[100, 105], [109, 130]], acctTypes: [] },
    { id: 'A.I.2', side: 'aktiva', type: 'detail', level: 2,
      label: '2. selbst geschaffene gewerbliche Schutzrechte und ähnliche Rechte und Werte',
      scriptid: 'val_a_i_1', // Konzept "selbst geschaffene" — in voll A.I.1
      skr03: [[27, 27]], skr04: [[91, 91]], acctTypes: [] },
    { id: 'A.I.t', side: 'aktiva', type: 'subtotal', level: 1, label: '',
      components: ['A.I.1', 'A.I.2'] },

    { id: 'A.II', side: 'aktiva', type: 'header', level: 1, label: 'II. Sachanlagen' },
    { id: 'A.II.1', side: 'aktiva', type: 'detail', level: 2,
      label: '1. Grundstücke, grundstücksgleiche Rechte und Bauten einschließlich der Bauten auf fremden Grundstücken',
      scriptid: 'val_a_ii_1',
      skr03: [[50, 79]], skr04: [[200, 239]], acctTypes: [] },
    { id: 'A.II.2', side: 'aktiva', type: 'detail', level: 2,
      label: '2. technische Anlagen und Maschinen',
      scriptid: 'val_a_ii_2',
      skr03: [[210, 229]], skr04: [[240, 259]], acctTypes: [] },
    { id: 'A.II.3', side: 'aktiva', type: 'detail', level: 2,
      label: '3. andere Anlagen, Betriebs- und Geschäftsausstattung',
      scriptid: 'val_a_ii_3',
      // Erweiterung der voll-Range: lean hat keine separate Position fuer
      // Anzahlungen Anlagen / Anlagen im Bau → 700–729 fliessen in BGA.
      skr03: [[300, 499], [700, 729]], skr04: [[260, 499], [180, 199]],
      acctTypes: ['FixedAsset'] },
    { id: 'A.II.t', side: 'aktiva', type: 'subtotal', level: 1, label: '',
      components: ['A.II.1', 'A.II.2', 'A.II.3'] },

    { id: 'A.t', side: 'aktiva', type: 'subtotal', level: 0, label: 'Summe Anlagevermögen',
      components: ['A.I.t', 'A.II.t'] },

    { id: 'B', side: 'aktiva', type: 'section', level: 0, label: 'B. Umlaufvermögen',
      components: ['B.t'] },

    { id: 'B.I', side: 'aktiva', type: 'header', level: 1, label: 'I. Vorräte' },
    { id: 'B.I.1', side: 'aktiva', type: 'detail', level: 2,
      label: '1. fertige Erzeugnisse und Waren',
      scriptid: 'val_b_i_3',
      skr03: [[1140, 1199]], skr04: [[1090, 1139]], acctTypes: ['Inventory', 'InvtPart'] },
    { id: 'B.I.2', side: 'aktiva', type: 'detail', level: 2,
      label: '2. geleistete Anzahlungen',
      scriptid: 'val_b_i_4',
      skr03: [[1190, 1199]], skr04: [[1180, 1189]], acctTypes: [] },
    { id: 'B.I.t', side: 'aktiva', type: 'subtotal', level: 1, label: '',
      components: ['B.I.1', 'B.I.2'] },

    { id: 'B.II', side: 'aktiva', type: 'header', level: 1,
      label: 'II. Forderungen und sonstige Vermögensgegenstände' },
    { id: 'B.II.1', side: 'aktiva', type: 'detail', level: 2,
      label: '1. Forderungen aus Lieferungen und Leistungen',
      scriptid: 'val_b_ii_1',
      skr03: [[1400, 1499]], skr04: [[1200, 1209], [1400, 1499]],
      acctTypes: ['AcctRec', 'Unbilled'] },
    { id: 'B.II.2', side: 'aktiva', type: 'detail', level: 2,
      label: '2. sonstige Vermögensgegenstände',
      scriptid: 'val_b_ii_4',
      // lean buendelt verbundene/Beteiligungs-Forderungen + sonstige VG in einer
      // Position. Range erweitert.
      skr03: [[1300, 1399], [1410, 1599]], skr04: [[1300, 1399], [1500, 1599]],
      acctTypes: ['OthCurrAsset', 'DeferExpense', 'OthAsset'] },
    { id: 'B.II.t', side: 'aktiva', type: 'subtotal', level: 1, label: '',
      components: ['B.II.1', 'B.II.2'] },

    // Achtung: in lean ist Kassenbestand B.III (nicht B.IV wie in voll),
    // weil B.III Wertpapiere entfaellt.
    { id: 'B.III', side: 'aktiva', type: 'detail', level: 1,
      label: 'III. Kassenbestand, Bundesbankguthaben, Guthaben bei Kreditinstituten und Schecks',
      scriptid: 'val_b_iv', // Konzept Kasse/Bank — in voll B.IV
      skr03: [[1000, 1009], [1100, 1199], [1200, 1299]],
      skr04: [[1600, 1699], [1700, 1799], [1800, 1899]],
      acctTypes: ['Bank'] },

    { id: 'B.t', side: 'aktiva', type: 'subtotal', level: 0, label: 'Summe Umlaufvermögen',
      components: ['B.I.t', 'B.II.t', 'B.III'] },

    { id: 'C', side: 'aktiva', type: 'detail', level: 0, label: 'C. Rechnungsabgrenzungsposten',
      scriptid: 'val_c_d',
      skr03: [[980, 989]], skr04: [[1900, 1949]], acctTypes: [] },

    { id: 'AKT.t', side: 'aktiva', type: 'total', level: 0, label: 'Summe AKTIVA',
      components: ['A', 'B', 'C'] },
  ];

  // ===========================================================================
  // PASSIVA — GRITSpot-Layout
  // ===========================================================================
  const passiva = [
    { id: 'P.A', side: 'passiva', type: 'section', level: 0, label: 'A. Eigenkapital',
      components: ['P.A.t'] },

    // I. Gezeichnetes Kapital — mit Sub-Konstrukt "ausgegebenes Kapital"
    { id: 'P.A.I', side: 'passiva', type: 'header', level: 1, label: 'I. Gezeichnetes Kapital' },
    { id: 'P.A.I.1', side: 'passiva', type: 'detail', level: 2, label: 'Gezeichnetes Kapital',
      scriptid: 'val_p_a_i', // Konzept "Stammkapital" — in voll P.A.I
      skr03: [[800, 819]], skr04: [[2900, 2909]], acctTypes: [] },
    { id: 'P.A.I.2', side: 'passiva', type: 'detail', level: 2, label: 'eigene Anteile',
      scriptid: 'val_p_a_i_neg', // NEU: muss in customlist erfasst werden
      skr03: [[2940, 2949]], skr04: [[2950, 2959]], acctTypes: [] },
    { id: 'P.A.I.t', side: 'passiva', type: 'subtotal', level: 1, label: 'ausgegebenes Kapital',
      components: ['P.A.I.1', 'P.A.I.2'] },

    { id: 'P.A.II', side: 'passiva', type: 'detail', level: 1, label: 'II. Kapitalrücklage',
      scriptid: 'val_p_a_ii',
      skr03: [[820, 839]], skr04: [[2910, 2919]], acctTypes: [] },

    // Achtung: in lean ist Verlustvortrag P.A.III (nicht P.A.IV wie in voll),
    // weil P.A.III Gewinnrücklagen entfaellt.
    { id: 'P.A.III', side: 'passiva', type: 'detail', level: 1, label: 'III. Verlustvortrag',
      scriptid: 'val_p_a_iv', // Konzept "Gewinn-/Verlustvortrag" — in voll P.A.IV
      skr03: [[860, 869]], skr04: [[2970, 2979]], acctTypes: ['Equity'] },
    { id: 'P.A.IV', side: 'passiva', type: 'detail', level: 1, label: 'IV. Jahresüberschuss',
      scriptid: 'val_p_a_v', // Konzept "Jahresueberschuss" — in voll P.A.V
      skr03: [[870, 879]], skr04: [[2980, 2989]], acctTypes: [] },

    { id: 'P.A.t', side: 'passiva', type: 'subtotal', level: 0, label: 'Summe Eigenkapital',
      components: ['P.A.I.t', 'P.A.II', 'P.A.III', 'P.A.IV'] },

    { id: 'P.B', side: 'passiva', type: 'section', level: 0, label: 'B. Rückstellungen',
      components: ['P.B.t'] },
    { id: 'P.B.1', side: 'passiva', type: 'detail', level: 1, label: '1. Steuerrückstellungen',
      scriptid: 'val_p_b_2', // Konzept "Steuerrueckstellung" — in voll P.B.2
      skr03: [[960, 969]], skr04: [[3020, 3029]], acctTypes: [] },
    { id: 'P.B.2', side: 'passiva', type: 'detail', level: 1, label: '2. sonstige Rückstellungen',
      scriptid: 'val_p_b_3', // Konzept "sonstige Rueckstellung" — in voll P.B.3
      // lean buendelt Pensionsrueckstellungen mit ein, da keine separate Position.
      skr03: [[950, 959], [970, 979]], skr04: [[3000, 3019], [3030, 3099]],
      acctTypes: [] },
    { id: 'P.B.t', side: 'passiva', type: 'subtotal', level: 1, label: '',
      components: ['P.B.1', 'P.B.2'] },

    { id: 'P.C', side: 'passiva', type: 'section', level: 0, label: 'C. Verbindlichkeiten',
      components: ['P.C.t'] },
    { id: 'P.C.1', side: 'passiva', type: 'detail', level: 1, label: '1. Verbindlichkeiten gegenüber Kreditinstituten',
      scriptid: 'val_p_c_2', // Konzept "Kreditinstitute" — in voll P.C.2
      // lean absorbiert Anleihen (1700-1709) und Wechsel (1500-1509) in
      // diese Position, da keine separaten lean-Lines dafuer existieren.
      skr03: [[1700, 1709], [1720, 1799]], skr04: [[3100, 3199]], acctTypes: [] },
    { id: 'P.C.2', side: 'passiva', type: 'detail', level: 1, label: '2. erhaltene Anzahlungen auf Bestellungen',
      scriptid: 'val_p_c_3', // Konzept "erhaltene Anzahlungen" — in voll P.C.3
      skr03: [[1710, 1719]], skr04: [[3200, 3269]], acctTypes: [] },
    { id: 'P.C.3', side: 'passiva', type: 'detail', level: 1, label: '3. Verbindlichkeiten aus Lieferungen und Leistungen',
      scriptid: 'val_p_c_4', // Konzept "Verbindlichkeiten aL+L" — in voll P.C.4
      skr03: [[1600, 1699]], skr04: [[3300, 3399]], acctTypes: ['AcctPay', 'CreditCard'] },
    { id: 'P.C.4', side: 'passiva', type: 'detail', level: 1, label: '4. sonstige Verbindlichkeiten',
      scriptid: 'val_p_c_8', // Konzept "sonstige Verbindlichkeiten" — in voll P.C.8
      // lean absorbiert hier auch verbundene/Beteiligungs-Verbindlichkeiten.
      skr03: [[1500, 1599]], skr04: [[3500, 3699], [3700, 3799]],
      acctTypes: ['OthCurrLiab', 'LongTermLiab', 'DeferRevenue'] },
    { id: 'P.C.t', side: 'passiva', type: 'subtotal', level: 1, label: '',
      components: ['P.C.1', 'P.C.2', 'P.C.3', 'P.C.4'] },

    { id: 'P.D', side: 'passiva', type: 'detail', level: 0, label: 'D. Rechnungsabgrenzungsposten',
      scriptid: 'val_p_d_d',
      skr03: [[1990, 1999]], skr04: [[3900, 3949]], acctTypes: [] },

    { id: 'PAS.t', side: 'passiva', type: 'total', level: 0, label: 'Summe PASSIVA',
      components: ['P.A', 'P.B', 'P.C', 'P.D'] },
  ];

  return {
    aktiva, passiva,
    label: 'HGB §266 schlank (GRITSpot-Layout)',
    // Bilanzdifferenz wird in lean auf P.A.IV gebucht (Jahresueberschuss).
    // In voll waere das P.A.V — lean nummeriert hier um, weil keine
    // Gewinnruecklagen-Position vorhanden ist.
    plugLineId: 'P.A.IV',
  };
});
