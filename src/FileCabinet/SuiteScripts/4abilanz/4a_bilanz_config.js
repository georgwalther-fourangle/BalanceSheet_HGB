/**
 * @NApiVersion 2.1
 *
 * Bilanz-HGB — Config-Dispatcher.
 *
 * Variant-Trees in eigenen Modulen:
 *   4a_bilanz_config_voll.js  — §266 vollstaendig (default)
 *   4a_bilanz_config_lean.js  — schlanke Variante (z.B. GRITSpot-Layout)
 *
 * Aufruf vom Suitelet:
 *   const variant = config.resolve('lean');  // oder 'voll'
 *   variant.aktiva, variant.passiva, variant.allLines
 *   variant.lookupAccount(chart, acctNumber, acctType)
 *   variant.computeValues(lines, detailValues)
 *   variant.getLineByScriptid(sid)
 *   variant.getDetailLines()
 *   variant.label
 *
 * Mapping-Strategie (pro Variant):
 *   1. Override (custrecord_4abilanz_line am Account) — hat Vorrang.
 *      Resolution via Customlist customlist_4abilanz_lines.
 *      Pro Variant kann die Resolution dieselbe scriptid auf eine andere
 *      LINE-ID abbilden (z.B. val_a_i_2 → A.I.2 in voll, → A.I.1 in lean).
 *   2. SKR03 / SKR04 Konto-Nr.-Range — erster Range-Treffer in der
 *      Definition-Reihenfolge gewinnt.
 *   3. NetSuite-acctType — Fallback wenn weder Override noch SKR-Range matcht.
 *
 * Vorzeichenkonvention:
 *   Aktiva als Soll-Saldo (debit − credit > 0); Passiva als Haben-Saldo.
 *   Die Aggregation in 4a_bilanz_sl.js negiert Passiva-Werte, damit beide
 *   Seiten positive Zahlen zeigen.
 */
define(['./4a_bilanz_config_voll', './4a_bilanz_config_lean'], (vollRaw, leanRaw) => {

  // scriptid-Konvention: "val_" + line-id-lowercased + "." → "_".
  // Detail-Zeilen ohne expliziten scriptid bekommen damit einen Default.
  // Lean kann fuer konzeptidentische Zeilen explizit denselben scriptid wie
  // voll setzen, damit Overrides ueberleben.
  const toScriptid = (lineId) => 'val_' + String(lineId).toLowerCase().replace(/\./g, '_');

  /**
   * Kompiliert eine raw Variant-Definition zu einem ready-to-use Tree mit
   * Index, Helpers und Lookup. Wird beim Modul-Load einmal pro Variant
   * ausgefuehrt; resolve() liefert dann das gecachte kompilierte Objekt.
   */
  const compileVariant = (raw) => {
    // Cloning, damit unsere Default-scriptid-Vergabe nicht das raw Modul
    // mutiert (wichtig fuer Hot-Reloading / Re-Compile).
    const cloneLine = (ln) => Object.assign({}, ln);
    const aktiva = (raw.aktiva || []).map(cloneLine);
    const passiva = (raw.passiva || []).map(cloneLine);
    const allLines = aktiva.concat(passiva);

    // Auto-derive scriptid wenn nicht gesetzt
    for (const ln of allLines) {
      if (ln.type === 'detail' && !ln.scriptid) ln.scriptid = toScriptid(ln.id);
    }

    // Indexe fuer schnellen Lookup
    const skrToLine = { skr03: [], skr04: [] };
    const typeToLine = {};
    const scriptidToLineId = {};
    for (const ln of allLines) {
      if (ln.scriptid) scriptidToLineId[String(ln.scriptid).toLowerCase()] = ln.id;
      if (ln.type !== 'detail') continue;
      for (const range of (ln.skr03 || [])) {
        skrToLine.skr03.push({ lo: range[0], hi: range[1], lineId: ln.id, side: ln.side });
      }
      for (const range of (ln.skr04 || [])) {
        skrToLine.skr04.push({ lo: range[0], hi: range[1], lineId: ln.id, side: ln.side });
      }
      for (const t of (ln.acctTypes || [])) {
        (typeToLine[t] = typeToLine[t] || []).push({ lineId: ln.id, side: ln.side });
      }
    }

    const lookupAccount = (chartOfAccounts, acctNumber, acctType) => {
      if (chartOfAccounts === 'skr03' || chartOfAccounts === 'skr04') {
        const m = String(acctNumber || '').match(/^(\d{3,})/);
        if (m) {
          const digits = m[1];
          const n = parseInt(digits, 10);
          // Candidates fuer padded Konto-Nummern (siehe ausfuehrlicher Kommentar
          // in alter Config-Datei): erst exakt, dann erste 4 Stellen, dann
          // erste 3 Stellen. Erster Range-Hit gewinnt.
          const candidates = [n];
          if (digits.length === 3) candidates.push(n * 10);
          if (digits.length >= 5) candidates.push(parseInt(digits.slice(0, 4), 10));
          if (digits.length >= 4) candidates.push(parseInt(digits.slice(0, 3), 10));
          for (const candidate of candidates) {
            for (const r of skrToLine[chartOfAccounts]) {
              if (candidate >= r.lo && candidate <= r.hi) return { lineId: r.lineId, side: r.side };
            }
          }
        }
      }
      const t = acctType && typeToLine[acctType];
      if (t && t.length) return { lineId: t[0].lineId, side: t[0].side };
      return null;
    };

    const getLineByScriptid = (sid) => {
      if (!sid) return null;
      const lineId = scriptidToLineId[String(sid).toLowerCase()];
      if (!lineId) return null;
      for (const ln of allLines) if (ln.id === lineId) return ln;
      return null;
    };

    const getDetailLines = () => allLines.filter((ln) => ln.type === 'detail');

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
      aktiva, passiva, allLines,
      label: raw.label || '',
      plugLineId: raw.plugLineId || 'P.A.V',
      lookupAccount, getLineByScriptid, getDetailLines, computeValues,
    };
  };

  // Beim Modul-Load einmal kompilieren — danach nur noch Lookup-Pointer
  const compiled = {
    voll: compileVariant(vollRaw),
    lean: compileVariant(leanRaw),
  };

  /**
   * Liefert die kompilierte Variant. Akzeptierte Keys: 'lean' | 'hgb_lean'
   * (Default) | 'voll' | 'hgb_voll'. Unbekannte/leere Werte fallen auf lean —
   * das ist die Variante, die wir aktuell als Standard ausliefern (schlanke
   * §266-Struktur). voll bleibt verfuegbar fuer Kunden, die die volle
   * Gliederung wollen.
   */
  const resolve = (variant) => {
    const key = String(variant || '').toLowerCase();
    if (key === 'voll' || key === 'hgb_voll') return compiled.voll;
    return compiled.lean;
  };

  return { resolve, toScriptid };
});
