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

    const hasPrev = !!valuesPrev;
    const cellsPerSide = hasPrev ? 3 : 2;

    // Inline-Styles — siehe Doc-Block-Hinweis warum keine Klassen-Selektoren.
    const STY_LBL       = 'padding: 2pt 4pt; padding-left: 4pt;';
    const STY_LBL_IND   = 'padding: 2pt 4pt; padding-left: 16pt;';
    const STY_NUM       = 'padding: 2pt 4pt; text-align: right; white-space: nowrap;';
    const STY_NUM_PREV  = STY_NUM + ' color: #6B7280;';
    const STY_SECTION   = 'padding: 6pt 4pt 1pt 0pt; font-weight: bold; color: #1F2937; font-size: 7pt;';
    const STY_HEADER    = 'padding: 4pt 4pt 1pt 8pt; font-weight: bold; color: #6B7280; font-size: 6pt;';
    const STY_SUB_LBL   = 'padding: 2pt 4pt; padding-left: 4pt; font-weight: bold; background-color: #FFF4ED;';
    const STY_SUB_NUM   = 'padding: 2pt 4pt; text-align: right; white-space: nowrap; font-weight: bold; background-color: #FFF4ED;';
    const STY_SUB_PREV  = STY_SUB_NUM + ' color: #1F2937;';
    const STY_TOT_LBL   = 'padding: 3pt 4pt; font-weight: bold; background-color: #E85D04; color: #fff;';
    const STY_TOT_NUM   = 'padding: 3pt 4pt; text-align: right; white-space: nowrap; font-weight: bold; background-color: #E85D04; color: #fff;';
    const STY_TOT_PREV  = STY_TOT_NUM;
    const STY_EMPTY     = 'padding: 2pt 4pt;';
    const STY_SPACER    = 'padding: 0 6pt;';

    /**
     * Wandelt eine Variant-Lines-Liste in normalisierte Row-Objekte um.
     * type: 'section'|'header'|'detail'|'subtotal'|'total'|'empty'
     * Detail/Subtotal-Rows mit Null-Werten (beide Jahre) werden geskippt.
     */
    const linesToRows = (lines) => {
      const rows = [];
      for (const ln of lines) {
        if (ln.type === 'section') { rows.push({ type: 'section', label: ln.label }); continue; }
        if (ln.type === 'header')  { rows.push({ type: 'header',  label: ln.label }); continue; }
        const v = values[ln.id];
        const vPrev = hasPrev ? valuesPrev[ln.id] : 0;
        if (ln.type === 'total') { rows.push({ type: 'total', label: ln.label, value: v, valuePrev: vPrev }); continue; }
        if (ln.type === 'subtotal') {
          const labelEmpty = !ln.label || !String(ln.label).trim();
          if (labelEmpty && isZero(v) && (!hasPrev || isZero(vPrev))) continue;
          rows.push({ type: 'subtotal', label: ln.label, value: v, valuePrev: vPrev });
          continue;
        }
        if (isZero(v) && (!hasPrev || isZero(vPrev))) continue;
        rows.push({ type: 'detail', indent: ln.level >= 2, label: ln.label, value: v, valuePrev: vPrev });
      }
      return rows;
    };

    /**
     * Rendert die Cells fuer EINE Seite (cellsPerSide Stueck). Bei colspan-
     * Rows (section/header) gibt's nur EINE <td> mit colspan=cellsPerSide.
     */
    const numCellHtml = (v, style) => {
      const t = isZero(v) ? '&#160;' : fmtEur(v);
      return `<td style="${style}">${t}</td>`;
    };
    const renderSideCells = (row) => {
      if (row.type === 'section') return `<td colspan="${cellsPerSide}" style="${STY_SECTION}">${esc(stripInvalidXml(row.label))}</td>`;
      if (row.type === 'header')  return `<td colspan="${cellsPerSide}" style="${STY_HEADER}">${esc(stripInvalidXml(row.label))}</td>`;
      if (row.type === 'total') {
        return `<td style="${STY_TOT_LBL}">${esc(stripInvalidXml(row.label))}</td>`
          + numCellHtml(row.value, STY_TOT_NUM)
          + (hasPrev ? numCellHtml(row.valuePrev, STY_TOT_PREV) : '');
      }
      if (row.type === 'subtotal') {
        const lbl = row.label ? esc(stripInvalidXml(row.label)) : '&#160;';
        return `<td style="${STY_SUB_LBL}">${lbl}</td>`
          + numCellHtml(row.value, STY_SUB_NUM)
          + (hasPrev ? numCellHtml(row.valuePrev, STY_SUB_PREV) : '');
      }
      if (row.type === 'detail') {
        const lblStyle = row.indent ? STY_LBL_IND : STY_LBL;
        return `<td style="${lblStyle}">${esc(stripInvalidXml(row.label))}</td>`
          + numCellHtml(row.value, STY_NUM)
          + (hasPrev ? numCellHtml(row.valuePrev, STY_NUM_PREV) : '');
      }
      // empty
      let html = '';
      for (let i = 0; i < cellsPerSide; i++) html += `<td style="${STY_EMPTY}">&#160;</td>`;
      return html;
    };

    // T-Form-Layout: beide Seiten zu Rows, dann positionsweise zusammen-
    // mergen. Padding mit empty-Rows damit die Summen-Zeilen am Ende
    // dieselbe Tabellenzeile teilen.
    const aRows = linesToRows(aktivaLines);
    const pRows = linesToRows(passivaLines);
    // Wir wollen die TOTAL-Zeile (Summe AKTIVA/PASSIVA) am gleichen Ende.
    // Aktiva und Passiva enden beide mit einer total-Row, das passt von
    // selbst — wir brauchen nur die Laenge davor anzugleichen.
    const aPreTotal = aRows.slice(0, aRows.findIndex(r => r.type === 'total'));
    const aTotal = aRows[aRows.findIndex(r => r.type === 'total')] || null;
    const pPreTotal = pRows.slice(0, pRows.findIndex(r => r.type === 'total'));
    const pTotal = pRows[pRows.findIndex(r => r.type === 'total')] || null;
    const preMax = Math.max(aPreTotal.length, pPreTotal.length);
    while (aPreTotal.length < preMax) aPreTotal.push({ type: 'empty' });
    while (pPreTotal.length < preMax) pPreTotal.push({ type: 'empty' });
    const combinedRows = [];
    for (let i = 0; i < preMax; i++) {
      combinedRows.push(`<tr>${renderSideCells(aPreTotal[i])}<td style="${STY_SPACER}">&#160;</td>${renderSideCells(pPreTotal[i])}</tr>`);
    }
    if (aTotal || pTotal) {
      const aT = aTotal || { type: 'empty' };
      const pT = pTotal || { type: 'empty' };
      combinedRows.push(`<tr>${renderSideCells(aT)}<td style="${STY_SPACER}">&#160;</td>${renderSideCells(pT)}</tr>`);
    }

    // Spaltenbreiten: BFO's DTD (report-1.1.dtd) erlaubt kein <col>-Element,
    // daher Breiten via width-Attribut DIREKT auf den <th>-Cells der ersten
    // Header-Row. table-layout: fixed sorgt im body fuer die Einhaltung.
    const widthPosition = hasPrev ? 30 : 40;
    const widthNum = hasPrev ? 9 : 8;
    const widthSpacer = 4;

    // Spaltenbreiten: BFO respektiert beim Kunden-PDF die CSS-"width: N%"
    // im style-Attribut nicht zuverlaessig. Wir setzen jetzt sowohl das
    // HTML-width-Attribut (deprecated, aber BFO mag das) ALS AUCH inline-CSS-
    // width. Belt-and-suspenders.
    const sideTitleCell = (text) => `<td colspan="${cellsPerSide}" style="color: #E85D04; font-size: 9pt; font-weight: bold; border-bottom: 1pt solid #E85D04; padding: 3pt 4pt 2pt 4pt;">${esc(text)}</td>`;
    const colHeader = (lbl, align, width) =>
      `<th width="${width}%" style="width: ${width}%; padding: 3pt 4pt; text-align: ${align}; font-size: 6pt; font-weight: bold; color: #6B7280;">${esc(lbl)}</th>`;

    const headerRowSideTitles = `<tr>${sideTitleCell('Aktiva')}<td style="${STY_SPACER}">&#160;</td>${sideTitleCell('Passiva')}</tr>`;
    const headerRowCols = `<tr>`
      + colHeader('Position', 'left', widthPosition)
      + colHeader('EUR', 'right', widthNum)
      + (hasPrev ? colHeader(prevColLabel || 'Vorjahr', 'right', widthNum) : '')
      + `<th width="${widthSpacer}%" style="width: ${widthSpacer}%; ${STY_SPACER}">&#160;</th>`
      + colHeader('Position', 'left', widthPosition)
      + colHeader('EUR', 'right', widthNum)
      + (hasPrev ? colHeader(prevColLabel || 'Vorjahr', 'right', widthNum) : '')
      + `</tr>`;

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
<body size="A4-landscape" padding-top="14pt" padding-bottom="14pt" padding-left="18pt" padding-right="18pt">
<p style="text-align: center; font-size: 13pt; font-weight: bold; color: #1F2937; margin: 0 0 2pt 0;">${esc(stripInvalidXml(company))}</p>
<p style="text-align: center; font-size: 10pt; font-weight: bold; color: #E85D04; margin: 0 0 2pt 0;">${esc(stripInvalidXml(reportTitle))}</p>
${headerMeta ? `<p style="text-align: center; font-size: 7pt; color: #6B7280; margin: 0 0 10pt 0;">${esc(stripInvalidXml(headerMeta))}</p>` : ''}
<table>
<thead>${headerRowSideTitles}${headerRowCols}</thead>
<tbody>${combinedRows.join('')}</tbody>
</table>
${balanceStatus}
${notmappedHtml}
<p style="text-align: center; font-size: 6pt; color: #6B7280; margin: 12pt 0 0 0;">${esc(stripInvalidXml(company))} · ${esc(stripInvalidXml(reportTitle))} · Erstellt ${esc(creationStamp)}</p>
</body>
</pdf>`;
  };

  return { renderPdfXml };
});
