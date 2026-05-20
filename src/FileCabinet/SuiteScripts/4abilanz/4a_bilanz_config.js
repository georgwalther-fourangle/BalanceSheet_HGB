/**
 * @NApiVersion 2.1
 *
 * HGB §266 Bilanz — Zeilenstruktur und Konto-Mapping (Kapitalgesellschaft,
 * grosse + mittelgrosse, ohne §267-Verkleinerungsoption).
 *
 * Die Zeilenliste folgt §266 Abs. 2 (Aktiva) und Abs. 3 (Passiva) HGB.
 *
 * Mapping-Strategie (MVP, ohne customlist + custrecord):
 *   1. SKR03 / SKR04 Konto-Nr.-Range (z.B. 0100–0199 → A.II.2 Technische Anlagen)
 *      Welcher Kontenrahmen aktiv ist, steuert der Suitelet-Skript-Parameter
 *      custscript_4abilanz_chartofaccounts (skr03 | skr04 | nstype).
 *   2. NetSuite-acctType (Bank, AcctRec, FixedAsset, …) als Fallback fuer
 *      Konten ohne deutschen Kontenplan (z.B. lokalisierte US-Tochter).
 *
 * Vorzeichenkonvention:
 *   Aktiva-Zeilen werden als Soll-Saldo (debit − credit > 0) erwartet.
 *   Passiva-Zeilen werden als Haben-Saldo (credit − debit > 0) erwartet —
 *   die Aggregation negiert das Saldo entsprechend. So sehen beide Spalten
 *   positive Zahlen, und Summe Aktiva == Summe Passiva ist die Pruefsumme.
 *
 * Lookup-Reihenfolge bei der Aggregation (siehe 4a_bilanz_sl.js):
 *   a) wenn Kontenrahmen = skr03|skr04: pruefe accountRanges der Detail-Zeile
 *      ueber Konto-Nummer (numerisch). Erster Treffer gewinnt.
 *   b) wenn (a) leer ODER Kontenrahmen = nstype: fallback ueber acctTypes-Liste
 *      der Detail-Zeile (matched gegen a.accttype).
 *   c) Kein Treffer → __notmapped (rote Zeile, mit Hinweis im UI).
 */
define([], () => {

  // ===========================================================================
  // AKTIVA (§266 Abs. 2 HGB)
  // ===========================================================================
  const aktiva = [
    { id: 'A',     side: 'aktiva', type: 'section', level: 0, label: 'A. Anlagevermögen',
      components: ['A.I.t', 'A.II.t', 'A.III.t'] },

    { id: 'A.I',   side: 'aktiva', type: 'header',  level: 1, label: 'I. Immaterielle Vermögensgegenstände' },
    { id: 'A.I.1', side: 'aktiva', type: 'detail',  level: 2,
      label: '1. Selbst geschaffene gewerbliche Schutzrechte und ähnliche Rechte und Werte',
      skr03: [[27, 27]], skr04: [[91, 91]],
      acctTypes: [] },
    { id: 'A.I.2', side: 'aktiva', type: 'detail',  level: 2,
      label: '2. Entgeltlich erworbene Konzessionen, Schutzrechte, Lizenzen u.ä.',
      skr03: [[25, 26], [28, 29]], skr04: [[100, 105], [109, 130]],
      acctTypes: [] },
    { id: 'A.I.3', side: 'aktiva', type: 'detail',  level: 2,
      label: '3. Geschäfts- oder Firmenwert',
      skr03: [[20, 24]], skr04: [[131, 134]],
      acctTypes: [] },
    { id: 'A.I.4', side: 'aktiva', type: 'detail',  level: 2,
      label: '4. Geleistete Anzahlungen',
      skr03: [[30, 39]], skr04: [[135, 139]],
      acctTypes: [] },
    { id: 'A.I.t', side: 'aktiva', type: 'subtotal', level: 1, label: 'Summe Immaterielle Vermögensgegenstände',
      components: ['A.I.1', 'A.I.2', 'A.I.3', 'A.I.4'] },

    { id: 'A.II',  side: 'aktiva', type: 'header',  level: 1, label: 'II. Sachanlagen' },
    { id: 'A.II.1', side: 'aktiva', type: 'detail', level: 2,
      label: '1. Grundstücke, grundstücksgleiche Rechte und Bauten',
      skr03: [[50, 79]], skr04: [[200, 239]],
      acctTypes: [] },
    { id: 'A.II.2', side: 'aktiva', type: 'detail', level: 2,
      label: '2. Technische Anlagen und Maschinen',
      skr03: [[210, 229]], skr04: [[240, 259]],
      acctTypes: [] },
    { id: 'A.II.3', side: 'aktiva', type: 'detail', level: 2,
      label: '3. Andere Anlagen, Betriebs- und Geschäftsausstattung',
      skr03: [[300, 399], [400, 499]], skr04: [[260, 299], [300, 399], [400, 499]],
      acctTypes: ['FixedAsset'] },
    { id: 'A.II.4', side: 'aktiva', type: 'detail', level: 2,
      label: '4. Geleistete Anzahlungen und Anlagen im Bau',
      skr03: [[700, 729]], skr04: [[180, 199]],
      acctTypes: [] },
    { id: 'A.II.t', side: 'aktiva', type: 'subtotal', level: 1, label: 'Summe Sachanlagen',
      components: ['A.II.1', 'A.II.2', 'A.II.3', 'A.II.4'] },

    { id: 'A.III', side: 'aktiva', type: 'header',  level: 1, label: 'III. Finanzanlagen' },
    { id: 'A.III.1', side: 'aktiva', type: 'detail', level: 2,
      label: '1. Anteile an verbundenen Unternehmen',
      skr03: [[800, 819]], skr04: [[140, 144]],
      acctTypes: [] },
    { id: 'A.III.2', side: 'aktiva', type: 'detail', level: 2,
      label: '2. Ausleihungen an verbundene Unternehmen',
      skr03: [[820, 829]], skr04: [[145, 149]],
      acctTypes: [] },
    { id: 'A.III.3', side: 'aktiva', type: 'detail', level: 2,
      label: '3. Beteiligungen',
      skr03: [[830, 839]], skr04: [[150, 159]],
      acctTypes: [] },
    { id: 'A.III.4', side: 'aktiva', type: 'detail', level: 2,
      label: '4. Ausleihungen an Unternehmen mit Beteiligungsverhältnis',
      skr03: [[840, 849]], skr04: [[160, 169]],
      acctTypes: [] },
    { id: 'A.III.5', side: 'aktiva', type: 'detail', level: 2,
      label: '5. Wertpapiere des Anlagevermögens',
      skr03: [[850, 859]], skr04: [[170, 174]],
      acctTypes: [] },
    { id: 'A.III.6', side: 'aktiva', type: 'detail', level: 2,
      label: '6. Sonstige Ausleihungen',
      skr03: [[860, 899]], skr04: [[175, 179]],
      acctTypes: [] },
    { id: 'A.III.t', side: 'aktiva', type: 'subtotal', level: 1, label: 'Summe Finanzanlagen',
      components: ['A.III.1','A.III.2','A.III.3','A.III.4','A.III.5','A.III.6'] },

    // -----------------------------------------------------------------------
    { id: 'B',     side: 'aktiva', type: 'section', level: 0, label: 'B. Umlaufvermögen',
      components: ['B.I.t', 'B.II.t', 'B.III.t', 'B.IV'] },

    { id: 'B.I',   side: 'aktiva', type: 'header', level: 1, label: 'I. Vorräte' },
    { id: 'B.I.1', side: 'aktiva', type: 'detail', level: 2,
      label: '1. Roh-, Hilfs- und Betriebsstoffe',
      skr03: [[1000, 1099]], skr04: [[1000, 1049]],
      acctTypes: [] },
    { id: 'B.I.2', side: 'aktiva', type: 'detail', level: 2,
      label: '2. Unfertige Erzeugnisse, unfertige Leistungen',
      skr03: [[1100, 1129]], skr04: [[1050, 1089]],
      acctTypes: [] },
    { id: 'B.I.3', side: 'aktiva', type: 'detail', level: 2,
      label: '3. Fertige Erzeugnisse und Waren',
      skr03: [[1140, 1199]], skr04: [[1090, 1139]],
      acctTypes: ['Inventory', 'InvtPart'] },
    { id: 'B.I.4', side: 'aktiva', type: 'detail', level: 2,
      label: '4. Geleistete Anzahlungen',
      skr03: [[1190, 1199]], skr04: [[1180, 1189]],
      acctTypes: [] },
    { id: 'B.I.t', side: 'aktiva', type: 'subtotal', level: 1, label: 'Summe Vorräte',
      components: ['B.I.1', 'B.I.2', 'B.I.3', 'B.I.4'] },

    { id: 'B.II',  side: 'aktiva', type: 'header', level: 1,
      label: 'II. Forderungen und sonstige Vermögensgegenstände' },
    { id: 'B.II.1', side: 'aktiva', type: 'detail', level: 2,
      label: '1. Forderungen aus Lieferungen und Leistungen',
      skr03: [[1200, 1379], [1400, 1409]], skr04: [[1200, 1209], [1400, 1499]],
      acctTypes: ['AcctRec', 'Unbilled'] },
    { id: 'B.II.2', side: 'aktiva', type: 'detail', level: 2,
      label: '2. Forderungen gegen verbundene Unternehmen',
      skr03: [[1410, 1429]], skr04: [[1500, 1529]],
      acctTypes: [] },
    { id: 'B.II.3', side: 'aktiva', type: 'detail', level: 2,
      label: '3. Forderungen gegen Unternehmen mit Beteiligungsverhältnis',
      skr03: [[1430, 1449]], skr04: [[1530, 1549]],
      acctTypes: [] },
    { id: 'B.II.4', side: 'aktiva', type: 'detail', level: 2,
      label: '4. Sonstige Vermögensgegenstände',
      skr03: [[1500, 1599]], skr04: [[1550, 1599]],
      acctTypes: ['OthCurrAsset', 'DeferExpense', 'OthAsset'] },
    { id: 'B.II.t', side: 'aktiva', type: 'subtotal', level: 1, label: 'Summe Forderungen',
      components: ['B.II.1', 'B.II.2', 'B.II.3', 'B.II.4'] },

    { id: 'B.III', side: 'aktiva', type: 'header', level: 1, label: 'III. Wertpapiere' },
    { id: 'B.III.1', side: 'aktiva', type: 'detail', level: 2,
      label: '1. Anteile an verbundenen Unternehmen',
      skr03: [[1340, 1349]], skr04: [[1340, 1349]],
      acctTypes: [] },
    { id: 'B.III.2', side: 'aktiva', type: 'detail', level: 2,
      label: '2. Sonstige Wertpapiere',
      skr03: [[1350, 1389]], skr04: [[1350, 1389]],
      acctTypes: [] },
    { id: 'B.III.t', side: 'aktiva', type: 'subtotal', level: 1, label: 'Summe Wertpapiere',
      components: ['B.III.1', 'B.III.2'] },

    { id: 'B.IV',  side: 'aktiva', type: 'detail', level: 1,
      label: 'IV. Kassenbestand, Bundesbankguthaben, Guthaben bei Kreditinstituten und Schecks',
      skr03: [[1000, 1009], [1100, 1199], [1200, 1299]], skr04: [[1600, 1699], [1700, 1799], [1800, 1899]],
      acctTypes: ['Bank'] },

    // -----------------------------------------------------------------------
    { id: 'C',     side: 'aktiva', type: 'section', level: 0, label: 'C. Rechnungsabgrenzungsposten',
      components: ['C.d'] },
    { id: 'C.d',   side: 'aktiva', type: 'detail', level: 1, label: 'Aktive Rechnungsabgrenzung',
      skr03: [[980, 989]], skr04: [[1900, 1949]],
      acctTypes: [] },

    { id: 'D',     side: 'aktiva', type: 'section', level: 0, label: 'D. Aktive latente Steuern',
      components: ['D.d'] },
    { id: 'D.d',   side: 'aktiva', type: 'detail', level: 1, label: 'Aktive latente Steuern',
      skr03: [[990, 994]], skr04: [[1950, 1954]],
      acctTypes: [] },

    { id: 'E',     side: 'aktiva', type: 'section', level: 0, label: 'E. Aktiver Unterschiedsbetrag aus der Vermögensverrechnung',
      components: ['E.d'] },
    { id: 'E.d',   side: 'aktiva', type: 'detail', level: 1, label: 'Aktiver Unterschiedsbetrag',
      skr03: [[995, 999]], skr04: [[1955, 1959]],
      acctTypes: [] },

    { id: 'AKT.t', side: 'aktiva', type: 'total',   level: 0, label: 'Summe AKTIVA',
      components: ['A', 'B', 'C', 'D', 'E'] },
  ];

  // ===========================================================================
  // PASSIVA (§266 Abs. 3 HGB)
  // ===========================================================================
  const passiva = [
    { id: 'P.A',    side: 'passiva', type: 'section', level: 0, label: 'A. Eigenkapital',
      components: ['P.A.I', 'P.A.II', 'P.A.III.t', 'P.A.IV', 'P.A.V'] },
    { id: 'P.A.I',  side: 'passiva', type: 'detail', level: 1, label: 'I. Gezeichnetes Kapital',
      skr03: [[800, 819]], skr04: [[2900, 2909]],
      acctTypes: [] },
    { id: 'P.A.II', side: 'passiva', type: 'detail', level: 1, label: 'II. Kapitalrücklage',
      skr03: [[830, 839]], skr04: [[2910, 2919]],
      acctTypes: [] },

    { id: 'P.A.III', side: 'passiva', type: 'header', level: 1, label: 'III. Gewinnrücklagen' },
    { id: 'P.A.III.1', side: 'passiva', type: 'detail', level: 2,
      label: '1. Gesetzliche Rücklage',
      skr03: [[840, 841]], skr04: [[2920, 2924]],
      acctTypes: [] },
    { id: 'P.A.III.2', side: 'passiva', type: 'detail', level: 2,
      label: '2. Rücklage für Anteile an einem herrschenden oder mehrheitlich beteiligten Unternehmen',
      skr03: [[842, 843]], skr04: [[2925, 2929]],
      acctTypes: [] },
    { id: 'P.A.III.3', side: 'passiva', type: 'detail', level: 2,
      label: '3. Satzungsmäßige Rücklagen',
      skr03: [[844, 845]], skr04: [[2930, 2939]],
      acctTypes: [] },
    { id: 'P.A.III.4', side: 'passiva', type: 'detail', level: 2,
      label: '4. Andere Gewinnrücklagen',
      skr03: [[846, 859]], skr04: [[2940, 2969]],
      acctTypes: [] },
    { id: 'P.A.III.t', side: 'passiva', type: 'subtotal', level: 1, label: 'Summe Gewinnrücklagen',
      components: ['P.A.III.1', 'P.A.III.2', 'P.A.III.3', 'P.A.III.4'] },

    { id: 'P.A.IV', side: 'passiva', type: 'detail', level: 1,
      label: 'IV. Gewinnvortrag / Verlustvortrag',
      skr03: [[860, 869]], skr04: [[2970, 2979]],
      acctTypes: ['Equity'] },
    { id: 'P.A.V', side: 'passiva', type: 'detail', level: 1,
      label: 'V. Jahresüberschuss / Jahresfehlbetrag',
      skr03: [[870, 879]], skr04: [[2980, 2989]],
      acctTypes: [] },

    // -----------------------------------------------------------------------
    { id: 'P.B', side: 'passiva', type: 'section', level: 0, label: 'B. Rückstellungen',
      components: ['P.B.1', 'P.B.2', 'P.B.3'] },
    { id: 'P.B.1', side: 'passiva', type: 'detail', level: 1,
      label: '1. Rückstellungen für Pensionen und ähnliche Verpflichtungen',
      skr03: [[950, 959]], skr04: [[3000, 3019]],
      acctTypes: [] },
    { id: 'P.B.2', side: 'passiva', type: 'detail', level: 1,
      label: '2. Steuerrückstellungen',
      skr03: [[960, 969]], skr04: [[3020, 3029]],
      acctTypes: [] },
    { id: 'P.B.3', side: 'passiva', type: 'detail', level: 1,
      label: '3. Sonstige Rückstellungen',
      skr03: [[970, 979]], skr04: [[3030, 3099]],
      acctTypes: [] },

    // -----------------------------------------------------------------------
    { id: 'P.C', side: 'passiva', type: 'section', level: 0, label: 'C. Verbindlichkeiten',
      components: ['P.C.1','P.C.2','P.C.3','P.C.4','P.C.5','P.C.6','P.C.7','P.C.8'] },
    { id: 'P.C.1', side: 'passiva', type: 'detail', level: 1,
      label: '1. Anleihen, davon konvertibel',
      skr03: [[1700, 1709]], skr04: [[3100, 3109]],
      acctTypes: [] },
    { id: 'P.C.2', side: 'passiva', type: 'detail', level: 1,
      label: '2. Verbindlichkeiten gegenüber Kreditinstituten',
      skr03: [[1710, 1799]], skr04: [[3110, 3199]],
      acctTypes: [] },
    { id: 'P.C.3', side: 'passiva', type: 'detail', level: 1,
      label: '3. Erhaltene Anzahlungen auf Bestellungen',
      skr03: [[1700, 1709]], skr04: [[3200, 3269]],
      acctTypes: [] },
    { id: 'P.C.4', side: 'passiva', type: 'detail', level: 1,
      label: '4. Verbindlichkeiten aus Lieferungen und Leistungen',
      skr03: [[1600, 1699]], skr04: [[3300, 3399]],
      acctTypes: ['AcctPay', 'CreditCard'] },
    { id: 'P.C.5', side: 'passiva', type: 'detail', level: 1,
      label: '5. Verbindlichkeiten aus Wechseln',
      skr03: [[1500, 1509]], skr04: [[3500, 3509]],
      acctTypes: [] },
    { id: 'P.C.6', side: 'passiva', type: 'detail', level: 1,
      label: '6. Verbindlichkeiten gegenüber verbundenen Unternehmen',
      skr03: [[1510, 1549]], skr04: [[3510, 3549]],
      acctTypes: [] },
    { id: 'P.C.7', side: 'passiva', type: 'detail', level: 1,
      label: '7. Verbindlichkeiten gegenüber Unternehmen mit Beteiligungsverhältnis',
      skr03: [[1550, 1559]], skr04: [[3550, 3559]],
      acctTypes: [] },
    { id: 'P.C.8', side: 'passiva', type: 'detail', level: 1,
      label: '8. Sonstige Verbindlichkeiten',
      skr03: [[1560, 1799]], skr04: [[3560, 3699], [3700, 3799]],
      acctTypes: ['OthCurrLiab', 'LongTermLiab', 'DeferRevenue'] },

    // -----------------------------------------------------------------------
    { id: 'P.D', side: 'passiva', type: 'section', level: 0, label: 'D. Rechnungsabgrenzungsposten',
      components: ['P.D.d'] },
    { id: 'P.D.d', side: 'passiva', type: 'detail', level: 1, label: 'Passive Rechnungsabgrenzung',
      skr03: [[990, 994]], skr04: [[3900, 3949]],
      acctTypes: [] },

    { id: 'P.E', side: 'passiva', type: 'section', level: 0, label: 'E. Passive latente Steuern',
      components: ['P.E.d'] },
    { id: 'P.E.d', side: 'passiva', type: 'detail', level: 1, label: 'Passive latente Steuern',
      skr03: [[995, 999]], skr04: [[3950, 3999]],
      acctTypes: [] },

    { id: 'PAS.t', side: 'passiva', type: 'total', level: 0, label: 'Summe PASSIVA',
      components: ['P.A', 'P.B', 'P.C', 'P.D', 'P.E'] },
  ];

  // ---------------------------------------------------------------------------
  // Index der detail-Zeilen fuer Account-Lookup:
  //   - skrToLine:  { 'skr03' | 'skr04': [{ lo, hi, lineId, side }] }
  //   - typeToLine: { acctType: [{ lineId, side }] }
  //   Mehrere Lines koennen denselben Typ deklarieren — die erste Detail-Zeile
  //   in Definition-Reihenfolge gewinnt. Damit gehen z.B. spezifischere SKR-
  //   Range-Treffer vor dem generischen acctType-Fallback.
  // ---------------------------------------------------------------------------
  const buildIndex = (lines) => {
    const skrToLine = { skr03: [], skr04: [] };
    const typeToLine = {};
    for (const ln of lines) {
      if (ln.type !== 'detail') continue;
      for (const [lo, hi] of (ln.skr03 || [])) skrToLine.skr03.push({ lo, hi, lineId: ln.id, side: ln.side });
      for (const [lo, hi] of (ln.skr04 || [])) skrToLine.skr04.push({ lo, hi, lineId: ln.id, side: ln.side });
      for (const t of (ln.acctTypes || [])) {
        (typeToLine[t] = typeToLine[t] || []).push({ lineId: ln.id, side: ln.side });
      }
    }
    return { skrToLine, typeToLine };
  };

  const allLines = aktiva.concat(passiva);
  const index = buildIndex(allLines);

  /**
   * Findet die Bilanz-Zeile fuer ein einzelnes Konto.
   *   chartOfAccounts: 'skr03' | 'skr04' | 'nstype'
   *   acctNumber:      String oder null (frei in NetSuite)
   *   acctType:        String wie 'Bank', 'AcctRec', …
   * Returns: { lineId, side } oder null.
   */
  const lookupAccount = (chartOfAccounts, acctNumber, acctType) => {
    // 1) SKR-Range-Lookup (nur wenn Konto-Nr. vorhanden und CoA = skr03|skr04)
    if (chartOfAccounts === 'skr03' || chartOfAccounts === 'skr04') {
      // Versuche eine fuehrende Nummer aus acctNumber zu lesen (Praefix vor
      // dem ersten Nicht-Digit). 4-stellige Konten sind Standard, 3-stellige
      // werden mit *10 normalisiert (klassisches DATEV-Schema).
      const m = String(acctNumber || '').match(/^(\d{3,})/);
      if (m) {
        let n = parseInt(m[1], 10);
        // Manche Kunden fuehren SKR03 dreistellig — diese Heuristik mappt
        // 3-stellige Nummern auf den 4-stelligen Bereich (z.B. 800 → 8000).
        // Wir fragen beide ab und nehmen den ersten Treffer.
        for (const candidate of (m[1].length === 3 ? [n, n * 10] : [n])) {
          for (const r of index.skrToLine[chartOfAccounts]) {
            if (candidate >= r.lo && candidate <= r.hi) return { lineId: r.lineId, side: r.side };
          }
        }
      }
    }
    // 2) Fallback ueber NetSuite-acctType
    const t = acctType && index.typeToLine[acctType];
    if (t && t.length) return { lineId: t[0].lineId, side: t[0].side };
    return null;
  };

  /**
   * Berechnet pro section/subtotal/total die Summe ihrer components rekursiv.
   * detailValues: { lineId: amount } — bereits aggregierte Detail-Salden.
   * Returns: { lineId: amount } fuer ALLE lines (detail + abgeleitet).
   */
  const computeValues = (lines, detailValues) => {
    const byId = {};
    for (const ln of lines) byId[ln.id] = ln;
    const out = {};
    const compute = (id) => {
      if (Object.prototype.hasOwnProperty.call(out, id)) return out[id];
      const ln = byId[id];
      if (!ln) return 0;
      if (ln.type === 'detail') {
        out[id] = detailValues[id] || 0;
        return out[id];
      }
      let sum = 0;
      for (const c of (ln.components || [])) sum += compute(c);
      out[id] = sum;
      return sum;
    };
    for (const ln of lines) compute(ln.id);
    return out;
  };

  return {
    aktiva,
    passiva,
    allLines,
    lookupAccount,
    computeValues,
  };
});
