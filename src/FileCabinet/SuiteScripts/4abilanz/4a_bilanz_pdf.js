/**
 * @NApiVersion 2.1
 *
 * BFO-PDF-XML-Rendering der Bilanz HGB. Zwei-spaltiges Layout
 * (Aktiva links, Passiva rechts) auf einer A4-Landscape-Seite.
 *
 * Design-Entscheidungen (uebernommen aus 4aba_pdf — nicht aendern ohne Grund):
 *   - KEIN <macrolist>/<pagenumber>-Footer: triggert in BFO bei datenreichen
 *     Inhalten UNEXPECTED_ERROR. Stattdessen statisches Footer-<p>.
 *   - `align="right"` als HTML4-Attribut auf <td>/<th> — BFO respektiert das
 *     zuverlaessiger als CSS-text-align.
 *   - stripInvalidXml auf allen Text-Inputs: Control-Chars zerstoeren das
 *     BFO-XML-Parsing.
 */
define(['./4a_bilanz_style', './4a_bilanz_config'], (style, config) => {

  const { esc, fmtEur, isZero, stripInvalidXml } = style;

  // BFO crasht bei manchen Konstellationen mit echt leeren <td>-Cells. Wir
  // fuellen jede sonst-leere Zelle mit &#160; (nbsp), damit BFO immer was
  // zum Rendern hat.
  const safeLabel = (label) => {
    const s = esc(stripInvalidXml(label));
    return s ? s : '&#160;';
  };
  const safeNum = (n, blank) => (blank || isZero(n)) ? '&#160;' : fmtEur(n);

  const renderSideTable = (lines, values, blank, valuesPrev, prevColLabel, padToBodyRows) => {
    const hasPrev = !!valuesPrev;
    const colCount = hasPrev ? 3 : 2;
    const rowsBeforeTotal = [];
    let totalRow = '';
    for (const ln of lines) {
      if (ln.type === 'header' || ln.type === 'section') {
        const cls = ln.type === 'section' ? 'section' : 'header';
        rowsBeforeTotal.push(`<tr class="${cls}"><td class="lbl" colspan="${colCount}">${safeLabel(ln.label)}</td></tr>`);
        continue;
      }
      const v = values[ln.id];
      const vPrev = hasPrev ? valuesPrev[ln.id] : 0;
      if (ln.type === 'total') {
        totalRow = `<tr class="total"><td class="lbl">${safeLabel(ln.label)}</td>`
          + `<td class="num" align="right">${safeNum(v, blank)}</td>`
          + (hasPrev ? `<td class="num prev" align="right">${safeNum(vPrev, blank)}</td>` : '')
          + '</tr>';
        continue;
      }
      if (ln.type === 'subtotal') {
        // Skippe komplett leere Subtotal-Rows (kein Label, kein Wert, kein
        // Vorjahres-Wert). Die rendern in BFO als <tr> mit nur Background-
        // Farbe + nbsp-Cells — kann BFO-UNEXPECTED_ERROR ausloesen.
        const labelEmpty = !ln.label || !String(ln.label).trim();
        const valEmpty = blank || isZero(v);
        const prevEmpty = !hasPrev || isZero(vPrev);
        if (labelEmpty && valEmpty && prevEmpty) continue;
        rowsBeforeTotal.push(`<tr class="subtotal"><td class="lbl">${safeLabel(ln.label)}</td>`
          + `<td class="num" align="right">${safeNum(v, blank)}</td>`
          + (hasPrev ? `<td class="num prev" align="right">${safeNum(vPrev, blank)}</td>` : '')
          + '</tr>');
        continue;
      }
      // detail — hide row only if BOTH current and prev are zero
      if (isZero(v) && (!hasPrev || isZero(vPrev))) continue;
      // Single-class "indent" statt Multi-Class "detail indent" — BFO
      // hat Probleme mit Multi-Class-Selectors wie tr.detail.indent.
      const rowCls = ln.level >= 2 ? 'indent' : 'detail';
      rowsBeforeTotal.push(`<tr class="${rowCls}"><td class="lbl">${safeLabel(ln.label)}</td>`
        + `<td class="num" align="right">${safeNum(v, false)}</td>`
        + (hasPrev ? `<td class="num prev" align="right">${safeNum(vPrev, false)}</td>` : '')
        + '</tr>');
    }
    // Padding zum Hoehenausgleich. Filler-Zeilen werden VOR jede Section
    // (ausser der ersten) verteilt, damit der leere Raum wie Spacing
    // zwischen Bloecken aussieht statt wie abgehackt-leer am Ende.
    if (padToBodyRows && rowsBeforeTotal.length < padToBodyRows) {
      const fillerCell = hasPrev
        ? '<td class="lbl">&#160;</td><td class="num">&#160;</td><td class="num prev">&#160;</td>'
        : '<td class="lbl">&#160;</td><td class="num">&#160;</td>';
      const fillerRow = `<tr class="filler">${fillerCell}</tr>`;
      const sectionStarts = [];
      for (let i = 0; i < rowsBeforeTotal.length; i++) {
        if (rowsBeforeTotal[i].indexOf('class="section"') !== -1) sectionStarts.push(i);
      }
      const gaps = sectionStarts.slice(1);
      let need = padToBodyRows - rowsBeforeTotal.length;
      if (gaps.length > 0) {
        const perGap = Math.floor(need / gaps.length);
        const remainder = need - perGap * gaps.length;
        for (let g = gaps.length - 1; g >= 0; g--) {
          const count = perGap + (g >= gaps.length - remainder ? 1 : 0);
          for (let f = 0; f < count; f++) rowsBeforeTotal.splice(gaps[g], 0, fillerRow);
        }
      }
      while (rowsBeforeTotal.length < padToBodyRows) rowsBeforeTotal.push(fillerRow);
    }
    // Explizite Spaltenbreiten via <colgroup>. BFO's Auto-Width-Algorithmus
    // wird unzuverlaessig, wenn Wrapping-Labels (lange HGB-Bezeichner) mit
    // nowrap-Number-Spalten in einer schmalen Side-Spalte (~395pt) zusammen-
    // kommen — hat in der Vergangenheit UNEXPECTED_ERROR ausgeloest.
    const colgroupHtml = hasPrev
      ? '<colgroup><col width="55%"/><col width="22%"/><col width="23%"/></colgroup>'
      : '<colgroup><col width="70%"/><col width="30%"/></colgroup>';
    const html = `<table>
  ${colgroupHtml}
  <thead>
    <tr>
      <th class="lbl">Position</th>
      <th class="num" align="right">EUR</th>
      ${hasPrev ? `<th class="num prev" align="right">${esc(stripInvalidXml(prevColLabel || 'Vorjahr'))}</th>` : ''}
    </tr>
  </thead>
  <tbody>${rowsBeforeTotal.join('')}${totalRow}</tbody>
</table>`;
    return { html, rowsBeforeTotalCount: rowsBeforeTotal.length };
  };

  /**
   * MINIMAL DEBUG VERSION: rendert ein bare-bones BFO-PDF ohne CSS-Klassen,
   * ohne colgroup, ohne Vorjahr, ohne Sections — nur "Label | EUR" pro Line.
   * Damit testen wir, ob BFO ueberhaupt rendert. Wenn ja, bauen wir Features
   * zurueck bis es bricht. Wenn nein, ist BFO/NetSuite-Account-spezifisch tot.
   */
  const renderPdfXmlMinimal = ({ company, periodLabel, aktivaLines, passivaLines, values, aktivaTotal, passivaTotal }) => {
    const rowsHtml = (lines) => lines.map((ln) => {
      if (ln.type === 'section' || ln.type === 'header') {
        return `<tr><td colspan="2"><b>${esc(stripInvalidXml(ln.label))}</b></td></tr>`;
      }
      const v = values[ln.id];
      if (ln.type === 'detail' && isZero(v)) return '';
      const label = ln.label ? esc(stripInvalidXml(ln.label)) : '&#160;';
      const valTxt = isZero(v) ? '&#160;' : fmtEur(v);
      const bold = (ln.type === 'subtotal' || ln.type === 'total') ? ' style="font-weight:bold"' : '';
      return `<tr${bold}><td>${label}</td><td align="right">${valTxt}</td></tr>`;
    }).join('');

    return `<?xml version="1.0"?>
<!DOCTYPE pdf PUBLIC "-//big.faceless.org//report" "report-1.1.dtd">
<pdf>
<head>
<style type="text/css">
body { font-family: Helvetica, sans-serif; font-size: 9pt; }
table { width: 100%; border-collapse: collapse; }
td { padding: 2pt 4pt; }
</style>
</head>
<body size="A4">
<h2>${esc(stripInvalidXml(company))} — Bilanz HGB ${esc(stripInvalidXml(periodLabel))}</h2>
<h3>Aktiva</h3>
<table>${rowsHtml(aktivaLines)}</table>
<h3>Passiva</h3>
<table>${rowsHtml(passivaLines)}</table>
<p>Aktiva = ${esc(fmtEur(aktivaTotal))} · Passiva = ${esc(fmtEur(passivaTotal))}</p>
</body>
</pdf>`;
  };

  /**
   * Fourangle-styled PDF in HGB-T-Form: Aktiva und Passiva nebeneinander in
   * EINER breiten Tabelle (kein nested-table — BFO-safe). 7 Spalten:
   *   [Aktiva: Position | EUR | Vorjahr] [Spacer] [Passiva: Position | EUR | Vorjahr]
   *
   * Alle dekorativen Styles INLINE pro <td> — umgeht BFO-Multi-Class-Issues.
   * Row-Synchronisation: pro Position eine combined Row mit Cells beider
   * Seiten. Kuerzere Seite wird mit leeren Cells gepaddet, damit die
   * Summen-Zeilen am Ende auf derselben Hoehe stehen.
   */
  const renderPdfXml = ({ company, subsidiaryLabel, periodLabel, chartLabel,
                         aktivaLines, passivaLines, values,
                         aktivaTotal, passivaTotal, balanceOk,
                         notmappedAktiva, notmappedPassiva,
                         valuesPrev, prevColLabel }) => {

    // Vorjahres-Spalte nur anzeigen, wenn tatsaechlich Vorjahres-Daten
    // existieren. Bei neuen Mandanten (z.B. GRITSpot, wo Mai-2025 noch keine
    // Postings hat) wuerde die Spalte sonst Header zeigen und alle Zellen
    // leer lassen — frisst Platz, hilft niemandem.
    const prevHasData = valuesPrev && (
      !isZero(valuesPrev['AKT.t']) || !isZero(valuesPrev['PAS.t'])
    );
    const hasPrev = !!prevHasData;
    const cellsPerSide = hasPrev ? 3 : 2;

    // Inline-Styles — siehe Doc-Block-Hinweis warum keine Klassen-Selektoren.
    // text-align: left explizit, damit BFO bei wrapping nicht Block-Satz
    // anwendet (sonst entstehen Riesenluecken zwischen Woertern in den
    // langen HGB-Bezeichnern).
    const STY_LBL       = 'padding: 2pt 4pt; padding-left: 4pt; text-align: left;';
    const STY_LBL_IND   = 'padding: 2pt 4pt; padding-left: 16pt; text-align: left;';
    const STY_NUM       = 'padding: 2pt 4pt; text-align: right; white-space: nowrap;';
    const STY_NUM_PREV  = STY_NUM + ' color: #6B7280;';
    const STY_SECTION   = 'padding: 6pt 4pt 1pt 0pt; font-weight: bold; color: #1F2937; font-size: 7pt; text-align: left;';
    const STY_HEADER    = 'padding: 4pt 4pt 1pt 8pt; font-weight: bold; color: #6B7280; font-size: 6pt; text-align: left;';
    const STY_SUB_LBL   = 'padding: 2pt 4pt; padding-left: 4pt; font-weight: bold; background-color: #FFF4ED; text-align: left;';
    const STY_SUB_NUM   = 'padding: 2pt 4pt; text-align: right; white-space: nowrap; font-weight: bold; background-color: #FFF4ED;';
    const STY_SUB_PREV  = STY_SUB_NUM + ' color: #1F2937;';
    const STY_TOT_LBL   = 'padding: 3pt 4pt; font-weight: bold; background-color: #E85D04; color: #fff; text-align: left;';
    const STY_TOT_NUM   = 'padding: 3pt 4pt; text-align: right; white-space: nowrap; font-weight: bold; background-color: #E85D04; color: #fff;';
    const STY_TOT_PREV  = STY_TOT_NUM;
    const STY_EMPTY     = 'padding: 2pt 4pt;';
    const STY_SPACER    = 'padding: 0 6pt;';

    /**
     * Wandelt eine Variant-Lines-Liste in normalisierte Row-Objekte um.
     * type: 'section'|'header'|'detail'|'subtotal'|'total'|'empty'
     *
     * Detail/Subtotal mit Null-Werten (beide Jahre) werden geskippt.
     * Zusaetzlich werden leere Sections und Header weggefiltert — wenn
     * unter einem Header keine sichtbaren Detail-/Subtotal-Zeilen folgen,
     * ist der Header reine Optik-Schrott und macht die Seite hoch.
     */
    const linesToRows = (lines) => {
      // 1. Pass: Detail-/Subtotal-Werte zu Rows, Sections/Header immer mit.
      // Jede Row traegt ihr ln.level mit, damit Pass 2 die Hierarchie kennt.
      const rows = [];
      for (const ln of lines) {
        if (ln.type === 'section') { rows.push({ type: 'section', level: ln.level, label: ln.label }); continue; }
        if (ln.type === 'header')  { rows.push({ type: 'header',  level: ln.level, label: ln.label }); continue; }
        const v = values[ln.id];
        const vPrev = hasPrev ? valuesPrev[ln.id] : 0;
        if (ln.type === 'total') { rows.push({ type: 'total', level: ln.level, label: ln.label, value: v, valuePrev: vPrev }); continue; }
        if (ln.type === 'subtotal') {
          // Subtotal mit Wert=0 (beide Jahre): immer skippen — egal ob mit
          // oder ohne Label. Labelte Summen wie "ausgegebenes Kapital" mit
          // value=0 sind reine Optik-Leerzeilen und verwirren mehr als sie
          // helfen.
          if (isZero(v) && (!hasPrev || isZero(vPrev))) continue;
          rows.push({ type: 'subtotal', level: ln.level, label: ln.label, value: v, valuePrev: vPrev });
          continue;
        }
        if (isZero(v) && (!hasPrev || isZero(vPrev))) continue;
        rows.push({ type: 'detail', level: ln.level, indent: ln.level >= 2, label: ln.label, value: v, valuePrev: vPrev });
      }

      // 2. Pass: Level-aware Filter. Ein Section/Header "besitzt" nur Rows
      // mit HOEHEREM level (d.h. Kinder im Tree). Eine Geschwister-Row mit
      // gleichem/niedrigerem level beendet die Gruppe.
      //
      // Beispiel lean Passiva: P.A.I (header, level=1) folgt P.A.II (detail,
      // level=1). P.A.II ist Geschwister, nicht Kind → P.A.I hat keine
      // sichtbaren Children und wird entfernt.
      const filtered = [];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (r.type === 'section' || r.type === 'header') {
          let hasContent = false;
          for (let j = i + 1; j < rows.length; j++) {
            const next = rows[j];
            // Naechste Section beendet die aktuelle Gruppe immer.
            if (next.type === 'section') break;
            // Anderer Header auf gleichem/niedrigerem Level beendet auch.
            if (next.type === 'header' && (next.level == null || next.level <= r.level)) break;
            // Detail/Subtotal/Total auf gleichem/niedrigerem Level beendet
            // (das ist ein Geschwister, kein Kind).
            if ((next.type === 'detail' || next.type === 'subtotal' || next.type === 'total')
                && (next.level == null || next.level <= r.level)) break;
            // Alles andere (Children auf hoeherem Level) = Content.
            hasContent = true; break;
          }
          if (hasContent) filtered.push(r);
        } else {
          filtered.push(r);
        }
      }
      return filtered;
    };

    /**
     * Rendert die Cells fuer EINE Seite (cellsPerSide Stueck). Bei colspan-
     * Rows (section/header) gibt's nur EINE <td> mit colspan=cellsPerSide.
     */
    const numCellHtml = (v, style) => {
      const t = isZero(v) ? '&#160;' : fmtEur(v);
      return `<td style="${style}">${t}</td>`;
    };
    // BFO macht Blocksatz (full-justify) in <td> bei Multi-Line-Wraps, egal
    // ob CSS text-align oder HTML align-Attribut. Workaround: Label-Text in
    // <p align="left" style="margin:0">...</p> einwickeln. BFO honoriert
    // align auf <p> zuverlaessig, margin:0 verhindert zusaetzlichen Abstand.
    const wrapP = (text) => `<p align="left" style="margin: 0;">${text}</p>`;
    const renderSideCells = (row) => {
      if (row.type === 'section') return `<td colspan="${cellsPerSide}" style="${STY_SECTION}">${wrapP(esc(stripInvalidXml(row.label)))}</td>`;
      if (row.type === 'header')  return `<td colspan="${cellsPerSide}" style="${STY_HEADER}">${wrapP(esc(stripInvalidXml(row.label)))}</td>`;
      if (row.type === 'total') {
        return `<td style="${STY_TOT_LBL}">${wrapP(esc(stripInvalidXml(row.label)))}</td>`
          + numCellHtml(row.value, STY_TOT_NUM)
          + (hasPrev ? numCellHtml(row.valuePrev, STY_TOT_PREV) : '');
      }
      if (row.type === 'subtotal') {
        const lbl = row.label ? esc(stripInvalidXml(row.label)) : '&#160;';
        return `<td style="${STY_SUB_LBL}">${wrapP(lbl)}</td>`
          + numCellHtml(row.value, STY_SUB_NUM)
          + (hasPrev ? numCellHtml(row.valuePrev, STY_SUB_PREV) : '');
      }
      if (row.type === 'detail') {
        const lblStyle = row.indent ? STY_LBL_IND : STY_LBL;
        return `<td style="${lblStyle}">${wrapP(esc(stripInvalidXml(row.label)))}</td>`
          + numCellHtml(row.value, STY_NUM)
          + (hasPrev ? numCellHtml(row.valuePrev, STY_NUM_PREV) : '');
      }
      // empty
      let html = '';
      for (let i = 0; i < cellsPerSide; i++) html += `<td style="${STY_EMPTY}">&#160;</td>`;
      return html;
    };

    // Jede Seite eine eigene Tabelle (KEIN positions-Pairing zwischen
    // Aktiva und Passiva — dann gibt's auch keine Hoehen-Imbalance-Luecken).
    // Aktiva-Table links, Passiva-Table rechts, dazwischen ein Spacer.
    // Mit valign="top" stacken beide Seiten oben am Rand und fliessen
    // unabhaengig nach unten.
    //
    // ABSOLUTE BREITEN (festverdrahtet, kein %, kein Auto-Layout):
    // A4-landscape = 842pt - 38pt Padding links/rechts = 766pt Nutzbreite.
    // Outer-Table: Aktiva 360pt + Spacer 46pt + Passiva 360pt = 766pt.
    // Inner-Tabellen je 360pt breit:
    //   mit Vorjahr:  Position 220 + EUR 70 + Vorjahr 70 = 360
    //   ohne Vorjahr: Position 260 + EUR 100 = 360
    const sideWidth = 360;
    const spacerWidth = 46;
    const totalWidth = sideWidth * 2 + spacerWidth; // 766pt
    const widthPosition = hasPrev ? 220 : 260;
    const widthNum = hasPrev ? 70 : 100;

    const colHeader = (lbl, align, width) =>
      `<th width="${width}" style="width: ${width}pt; padding: 3pt 4pt; text-align: ${align}; font-size: 6pt; font-weight: bold; color: #6B7280; border-bottom: 1pt solid #C7C7C7;">${esc(lbl)}</th>`;

    const renderInnerTable = (lines) => {
      const rows = linesToRows(lines);
      const rowsHtml = rows.map(renderSideCells).map(cells => `<tr>${cells}</tr>`).join('');
      const headerRow = `<tr>`
        + colHeader('Position', 'left', widthPosition)
        + colHeader('EUR', 'right', widthNum)
        + (hasPrev ? colHeader(prevColLabel || 'Vorjahr', 'right', widthNum) : '')
        + `</tr>`;
      return `<table width="${sideWidth}" style="width: ${sideWidth}pt;">
<thead>${headerRow}</thead>
<tbody>${rowsHtml}</tbody>
</table>`;
    };

    const sideBlock = (sideTitle, lines) => {
      return `<p align="left" style="color: #E85D04; font-size: 9pt; font-weight: bold; border-bottom: 1pt solid #E85D04; padding-bottom: 2pt; margin: 0 0 4pt 0;">${esc(sideTitle)}</p>${renderInnerTable(lines)}`;
    };

    const reportTitle = `Bilanz HGB · ${periodLabel}`;
    const headerMeta = [subsidiaryLabel, `Kontenrahmen: ${chartLabel}`].filter(Boolean).join(' · ');

    const notmappedHtml = (!isZero(notmappedAktiva) || !isZero(notmappedPassiva))
      ? `<p style="color: #8A1F1F; font-size: 6pt; text-align: center; margin: 6pt 0 0 0;">Nicht zugeordnete Salden — Aktiva: ${esc(fmtEur(notmappedAktiva))} EUR, Passiva: ${esc(fmtEur(notmappedPassiva))} EUR. Bitte Kontenrahmen pruefen.</p>`
      : '';

    const balanceStatus = balanceOk
      ? `<p style="color: #2D5E3B; font-size: 7pt; text-align: center; margin: 8pt 0 0 0;">Aktiva = Passiva (${esc(fmtEur(aktivaTotal))} EUR)</p>`
      : `<p style="color: #8A1F1F; font-size: 7pt; text-align: center; margin: 8pt 0 0 0; font-weight: bold;">Aktiva ${esc(fmtEur(aktivaTotal))} ungleich Passiva ${esc(fmtEur(passivaTotal))} (Differenz ${esc(fmtEur(aktivaTotal - passivaTotal))})</p>`;

    const now = new Date();
    const pad = (n) => (n < 10 ? '0' : '') + n;
    const creationStamp = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()} `
      + `${pad(now.getHours())}:${pad(now.getMinutes())}`;

    return `<?xml version="1.0"?>
<!DOCTYPE pdf PUBLIC "-//big.faceless.org//report" "report-1.1.dtd">
<pdf>
<head>
<style type="text/css">
body { font-family: Helvetica, sans-serif; font-size: 7pt; color: #1F2937; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; }
</style>
</head>
<body size="A4-landscape" padding-top="34pt" padding-bottom="34pt" padding-left="38pt" padding-right="38pt">
<p style="text-align: center; font-size: 13pt; font-weight: bold; color: #1F2937; margin: 0 0 2pt 0;">${esc(stripInvalidXml(company))}</p>
<p style="text-align: center; font-size: 10pt; font-weight: bold; color: #E85D04; margin: 0 0 2pt 0;">${esc(stripInvalidXml(reportTitle))}</p>
${headerMeta ? `<p style="text-align: center; font-size: 7pt; color: #6B7280; margin: 0 0 10pt 0;">${esc(stripInvalidXml(headerMeta))}</p>` : ''}
<table width="${totalWidth}" style="width: ${totalWidth}pt;">
<tr>
<td valign="top" width="${sideWidth}" style="width: ${sideWidth}pt; padding: 0;">${sideBlock('Aktiva', aktivaLines)}</td>
<td width="${spacerWidth}" style="width: ${spacerWidth}pt; padding: 0;">&#160;</td>
<td valign="top" width="${sideWidth}" style="width: ${sideWidth}pt; padding: 0;">${sideBlock('Passiva', passivaLines)}</td>
</tr>
</table>
${balanceStatus}
${notmappedHtml}
<p style="text-align: center; font-size: 6pt; color: #6B7280; margin: 12pt 0 0 0;">${esc(stripInvalidXml(company))} · ${esc(stripInvalidXml(reportTitle))} · Erstellt ${esc(creationStamp)}</p>
</body>
</pdf>`;
  };

  return { renderPdfXml };
});
