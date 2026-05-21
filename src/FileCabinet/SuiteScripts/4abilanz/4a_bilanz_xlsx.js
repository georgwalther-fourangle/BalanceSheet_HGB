/**
 * @NApiVersion 2.1
 *
 * Excel-taugliches HTML-Rendering der Bilanz HGB (.xls via HTMLDOC).
 * Aktiva und Passiva nebeneinander als ein zweispaltiges Blatt, optional
 * mit Vorjahres-Spalte je Seite.
 *
 * Design (uebernommen aus 4aba_xlsx):
 *   - `file.Type.EXCEL` akzeptiert keine SpreadsheetML-Strings → wir liefern
 *     Excel-flavored HTML mit `file.Type.HTMLDOC` ab .xls. Excel oeffnet das
 *     mit einmaligem Warn-Dialog.
 *   - Zahlen als US-decimal mit `x:num`-Attribut + `mso-number-format` —
 *     so erkennt Excel den Number-Typ eindeutig.
 *   - Keine CSS-Klassen fuer Number-Zellen, alles inline — Excel hat
 *     Multi-Class-Praezedenz-Quirks.
 */
define(['./4a_bilanz_style', './4a_bilanz_config'], (style, config) => {

  const { esc, isZero } = style;

  const NUM_STYLE = "mso-number-format:'#,##0.00'; text-align:right;";
  const PREV_STYLE = NUM_STYLE + ' color:#6B7280;';

  const numVal = (n) => {
    if (n == null || Number.isNaN(n)) return '';
    return Number(n).toFixed(2);
  };
  const numCell = (n, st) => {
    const v = numVal(n);
    if (v === '') return `<td style="${st}"></td>`;
    return `<td x:num="${v}" style="${st}">${esc(v)}</td>`;
  };

  /**
   * Eine Seite (Aktiva oder Passiva) als 2- (ohne Vorjahr) bzw. 3-spaltige
   * Zellenliste je <tr>. Header/Section: colspan ueber alle Daten-Spalten.
   */
  const sideRowsHtml = (lines, values, valuesPrev) => {
    const hasPrev = !!valuesPrev;
    const colspan = hasPrev ? 3 : 2;
    return lines.map((ln) => {
      if (ln.type === 'header' || ln.type === 'section') {
        const cls = ln.type === 'section' ? 'section' : 'subhdr';
        return `<tr class="${cls}"><td colspan="${colspan}" style="font-weight:bold;">${esc(ln.label)}</td></tr>`;
      }
      const v = values[ln.id];
      const vPrev = hasPrev ? valuesPrev[ln.id] : 0;
      if (ln.type === 'total') {
        return `<tr class="total" style="background-color:#E85D04;color:#fff;font-weight:bold;">`
          + `<td>${esc(ln.label)}</td>${numCell(v, NUM_STYLE + ' color:#fff;')}${hasPrev ? numCell(vPrev, NUM_STYLE + ' color:#fff;') : ''}</tr>`;
      }
      if (ln.type === 'subtotal') {
        return `<tr class="subtotal" style="background-color:#FFF4ED;font-weight:bold;">`
          + `<td>${esc(ln.label)}</td>${numCell(v, NUM_STYLE)}${hasPrev ? numCell(vPrev, NUM_STYLE) : ''}</tr>`;
      }
      // detail — hide row only if BOTH are zero
      if (isZero(v) && (!hasPrev || isZero(vPrev))) return '';
      const indent = ln.level >= 2 ? ' style="mso-char-indent-count:2;"' : '';
      return `<tr><td${indent}>${esc(ln.label)}</td>${numCell(v, NUM_STYLE)}${hasPrev ? numCell(vPrev, PREV_STYLE) : ''}</tr>`;
    }).join('');
  };

  const renderXlsxHtml = ({ company, subsidiaryLabel, periodLabel, chartLabel,
                           aktivaLines, passivaLines, values,
                           aktivaTotal, passivaTotal, balanceOk,
                           notmappedAktiva, notmappedPassiva,
                           valuesPrev, prevColLabel }) => {

    const hasPrev = !!valuesPrev;
    const colsPerSide = hasPrev ? 3 : 2;
    const totalCols = colsPerSide * 2 + 1; // links + spacer + rechts

    const aktivaRows = sideRowsHtml(aktivaLines, values, valuesPrev);
    const passivaRows = sideRowsHtml(passivaLines, values, valuesPrev);

    const reportTitle = `Bilanz HGB · ${periodLabel}`;
    const metaParts = [subsidiaryLabel, `Kontenrahmen: ${chartLabel}`].filter(Boolean);

    const notmappedHtml = (!isZero(notmappedAktiva) || !isZero(notmappedPassiva))
      ? `<tr><td colspan="${totalCols}" style="color:#C00;font-weight:bold;">Nicht zugeordnet — Aktiva: ${esc(Number(notmappedAktiva).toFixed(2))}, Passiva: ${esc(Number(notmappedPassiva).toFixed(2))}</td></tr>`
      : '';

    const balanceCell = balanceOk
      ? `<tr><td colspan="${totalCols}" style="color:#2D5E3B;">Aktiva = Passiva (${esc(Number(aktivaTotal).toFixed(2))})</td></tr>`
      : `<tr><td colspan="${totalCols}" style="color:#8A1F1F;font-weight:bold;">Aktiva ${esc(Number(aktivaTotal).toFixed(2))} ≠ Passiva ${esc(Number(passivaTotal).toFixed(2))} (Differenz ${esc(Number(aktivaTotal - passivaTotal).toFixed(2))})</td></tr>`;

    // Header-Row mit Spaltenueberschriften pro Seite
    const headerCols = hasPrev
      ? `<th>Position</th><th style="text-align:right;">EUR</th><th style="text-align:right;color:#6B7280;">${esc(prevColLabel || 'Vorjahr')}</th>`
      : `<th>Position</th><th style="text-align:right;">EUR</th>`;

    return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:x="urn:schemas-microsoft-com:office:excel"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta http-equiv="Content-Type" content="application/vnd.ms-excel; charset=UTF-8"/>
  <!--[if gte mso 9]>
  <xml>
    <x:ExcelWorkbook>
      <x:ExcelWorksheets>
        <x:ExcelWorksheet>
          <x:Name>Bilanz HGB</x:Name>
          <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
        </x:ExcelWorksheet>
      </x:ExcelWorksheets>
    </x:ExcelWorkbook>
  </xml>
  <![endif]-->
  <style>
    table { border-collapse: collapse; font-family: Helvetica, Arial, sans-serif; font-size: 10pt; }
    th { font-weight: bold; color: #6B7280; text-align: left; padding: 4pt 8pt;
         border-bottom: 1pt solid #C7C7C7; text-transform: uppercase; font-size: 9pt; }
    td { padding: 3pt 8pt; }
    tr.section td { font-weight: bold; color: #1F2937; font-size: 11pt; padding-top: 8pt; }
    tr.subhdr td  { font-weight: bold; color: #6B7280; padding-top: 4pt; }
    tr.subtotal td { border-top: 1pt solid #E85D04; }
    tr.total td    { border-top: 2pt solid #C64E00; }
    .title   { font-weight: bold; font-size: 14pt; color: #E85D04; text-align: center; }
    .company { font-weight: bold; font-size: 12pt; text-align: center; }
    .meta    { color: #6B7280; font-size: 9pt; text-align: center; }
    .sidehdr { color: #E85D04; font-weight: bold; font-size: 11pt; padding-top: 8pt; }
  </style>
</head>
<body>
  <table>
    <tr><td colspan="${totalCols}" class="company">${esc(company)}</td></tr>
    <tr><td colspan="${totalCols}" class="title">${esc(reportTitle)}</td></tr>
    ${metaParts.length ? `<tr><td colspan="${totalCols}" class="meta">${esc(metaParts.join(' · '))}</td></tr>` : ''}
    <tr><td colspan="${totalCols}">&nbsp;</td></tr>
    <tr>
      <td colspan="${colsPerSide}" class="sidehdr">AKTIVA</td>
      <td>&nbsp;</td>
      <td colspan="${colsPerSide}" class="sidehdr">PASSIVA</td>
    </tr>
    <tr>
      ${headerCols}
      <th></th>
      ${headerCols}
    </tr>
    ${mergeSideRows(aktivaRows, passivaRows, colsPerSide)}
    <tr><td colspan="${totalCols}">&nbsp;</td></tr>
    ${balanceCell}
    ${notmappedHtml}
  </table>
</body>
</html>`;
  };

  // Merge zwei Listen von <tr>-HTML-Bloecken zu einer breiten Tabelle:
  // links Aktiva (colsPerSide Spalten), Spacer, rechts Passiva. Wenn eine
  // Seite mehr Zeilen hat als die andere, wird die kuerzere mit leeren
  // Zellen aufgefuellt.
  function mergeSideRows(leftHtml, rightHtml, colsPerSide) {
    const left = splitRows(leftHtml, colsPerSide);
    const right = splitRows(rightHtml, colsPerSide);
    const max = Math.max(left.length, right.length);
    const emptyCells = '<td></td>'.repeat(colsPerSide);
    const out = [];
    for (let i = 0; i < max; i++) {
      const l = left[i] || { cells: emptyCells };
      const r = right[i] || { cells: emptyCells };
      out.push(`<tr>${l.cells}<td style="border:none;"></td>${r.cells}</tr>`);
    }
    return out.join('');
  }

  // Erkennt jede einzelne <tr ...>...</tr> und liefert deren Cell-Inhalte
  // normalisiert auf colsPerSide <td>s. colspan-Zeilen (Header/Section)
  // werden zu einem <td colspan=N> + (N-1) leere Zellen aufgesplittet —
  // wobei der Browser bei mergeSideRows die richtige Anzahl Spalten sehen muss.
  function splitRows(html, colsPerSide) {
    const out = [];
    const rowRegex = /<tr([^>]*)>([\s\S]*?)<\/tr>/g;
    let m;
    while ((m = rowRegex.exec(html)) !== null) {
      const attrs = m[1] || '';
      const body = m[2] || '';
      const clsMatch = /class\s*=\s*"([^"]*)"/.exec(attrs);
      const cls = clsMatch ? clsMatch[1] : '';
      // Suche colspan-Zelle, die ueber alle Daten-Spalten geht (Header/Section).
      const colspanMatch = new RegExp(
        '<td\\b[^>]*colspan\\s*=\\s*"' + colsPerSide + '"[^>]*>([\\s\\S]*?)<\\/td>'
      ).exec(body);
      if (colspanMatch) {
        const tdOpen = /<td\b([^>]*)>/i.exec(body);
        const styleM = tdOpen ? /style\s*=\s*"([^"]*)"/.exec(tdOpen[1]) : null;
        const inlineStyle = styleM ? styleM[1] : '';
        const filler = (`<td style="${inlineStyle}"></td>`).repeat(colsPerSide - 1);
        out.push({
          cells: `<td style="${inlineStyle}">${colspanMatch[1]}</td>${filler}`,
          cls,
        });
      } else {
        out.push({ cells: body, cls });
      }
    }
    return out;
  }

  return { renderXlsxHtml };
});
