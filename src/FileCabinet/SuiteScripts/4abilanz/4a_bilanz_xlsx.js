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
   * Eine Seite (Aktiva oder Passiva) als <tr>-Liste. Total wird separat
   * gehalten, damit der Caller mit Filler-Rows vor dem Total auf gleiche
   * Hoehe wie die andere Seite padden kann.
   *
   * Returns: { rowsBeforeTotal: [<tr>...], totalRow: <tr>..., colspan }
   */
  const sideRowsHtml = (lines, values, valuesPrev) => {
    const hasPrev = !!valuesPrev;
    const colspan = hasPrev ? 3 : 2;
    const rowsBeforeTotal = [];
    let totalRow = '';
    for (const ln of lines) {
      if (ln.type === 'header' || ln.type === 'section') {
        const cls = ln.type === 'section' ? 'section' : 'subhdr';
        rowsBeforeTotal.push(`<tr class="${cls}"><td colspan="${colspan}" style="font-weight:bold;">${esc(ln.label)}</td></tr>`);
        continue;
      }
      const v = values[ln.id];
      const vPrev = hasPrev ? valuesPrev[ln.id] : 0;
      if (ln.type === 'total') {
        totalRow = `<tr class="total" style="background-color:#E85D04;color:#fff;font-weight:bold;">`
          + `<td>${esc(ln.label)}</td>${numCell(v, NUM_STYLE + ' color:#fff;')}${hasPrev ? numCell(vPrev, NUM_STYLE + ' color:#fff;') : ''}</tr>`;
        continue;
      }
      if (ln.type === 'subtotal') {
        rowsBeforeTotal.push(`<tr class="subtotal" style="background-color:#FFF4ED;font-weight:bold;">`
          + `<td>${esc(ln.label)}</td>${numCell(v, NUM_STYLE)}${hasPrev ? numCell(vPrev, NUM_STYLE) : ''}</tr>`);
        continue;
      }
      // detail — hide row only if BOTH are zero
      if (isZero(v) && (!hasPrev || isZero(vPrev))) continue;
      const indent = ln.level >= 2 ? ' style="mso-char-indent-count:2;"' : '';
      rowsBeforeTotal.push(`<tr><td${indent}>${esc(ln.label)}</td>${numCell(v, NUM_STYLE)}${hasPrev ? numCell(vPrev, PREV_STYLE) : ''}</tr>`);
    }
    return { rowsBeforeTotal, totalRow, colspan };
  };

  // Padding-Helfer fuer XLSX: liefert N leere <tr>-Zeilen mit der passenden
  // Anzahl <td>-Zellen.
  const buildFillerRows = (count, colspan) => {
    if (!count || count <= 0) return [];
    // &#160; in jeder Zelle — leere <td>s kollabieren in Excel zu 0-Hoehe,
    // dann waeren die Aktiva/Passiva-Totals trotz Filler nicht auf gleicher Excel-Zeile.
    const cells = '<td>&#160;</td>'.repeat(colspan);
    return new Array(count).fill(`<tr class="filler">${cells}</tr>`);
  };

  // Verteilt Filler-Rows VOR jeder Section (ausser der ersten), damit der
  // leere Raum auf der kuerzeren Seite wie Spacing aussieht und nicht wie
  // ein Block am Ende.
  const distributeFillers = (rowsBeforeTotal, target, colspan) => {
    const need = target - rowsBeforeTotal.length;
    if (need <= 0) return rowsBeforeTotal.slice();
    const fillerRow = `<tr class="filler">${'<td>&#160;</td>'.repeat(colspan)}</tr>`;
    const out = rowsBeforeTotal.slice();
    const sectionStarts = [];
    for (let i = 0; i < out.length; i++) {
      if (out[i].indexOf('class="section"') !== -1) sectionStarts.push(i);
    }
    const gaps = sectionStarts.slice(1);
    if (gaps.length > 0) {
      const perGap = Math.floor(need / gaps.length);
      const remainder = need - perGap * gaps.length;
      for (let g = gaps.length - 1; g >= 0; g--) {
        const count = perGap + (g >= gaps.length - remainder ? 1 : 0);
        for (let f = 0; f < count; f++) out.splice(gaps[g], 0, fillerRow);
      }
    }
    while (out.length < target) out.push(fillerRow);
    return out;
  };

  const renderXlsxHtml = ({ company, subsidiaryLabel, periodLabel, chartLabel,
                           aktivaLines, passivaLines, values,
                           aktivaTotal, passivaTotal, balanceOk,
                           notmappedAktiva, notmappedPassiva,
                           valuesPrev, prevColLabel }) => {

    const hasPrev = !!valuesPrev;
    const colsPerSide = hasPrev ? 3 : 2;
    const totalCols = colsPerSide * 2 + 1; // links + spacer + rechts

    const aktivaSide = sideRowsHtml(aktivaLines, values, valuesPrev);
    const passivaSide = sideRowsHtml(passivaLines, values, valuesPrev);

    // Auf gleiche Hoehe padden, sodass die "Summe AKTIVA"- und
    // "Summe PASSIVA"-Zeilen nach dem Side-by-Side-Merge in derselben
    // Excel-Zeile liegen. Filler werden zwischen die Sections verteilt.
    const target = Math.max(aktivaSide.rowsBeforeTotal.length, passivaSide.rowsBeforeTotal.length);
    const aktivaPadded = distributeFillers(aktivaSide.rowsBeforeTotal, target, colsPerSide);
    const passivaPadded = distributeFillers(passivaSide.rowsBeforeTotal, target, colsPerSide);
    const aktivaRows = aktivaPadded.join('') + aktivaSide.totalRow;
    const passivaRows = passivaPadded.join('') + passivaSide.totalRow;

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
