/**
 * @NApiVersion 2.1
 *
 * Excel-taugliches HTML-Rendering der Bilanz HGB (.xls via HTMLDOC).
 * Aktiva und Passiva nebeneinander als ein zweispaltiges Blatt.
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

  const numVal = (n) => {
    if (n == null || Number.isNaN(n)) return '';
    return Number(n).toFixed(2);
  };
  const numCell = (n, extraStyle) => {
    const v = numVal(n);
    const st = NUM_STYLE + (extraStyle ? ' ' + extraStyle : '');
    if (v === '') return `<td style="${st}"></td>`;
    return `<td x:num="${v}" style="${st}">${esc(v)}</td>`;
  };

  const sideRowsHtml = (lines, values) => {
    return lines.map((ln) => {
      if (ln.type === 'header' || ln.type === 'section') {
        const cls = ln.type === 'section' ? 'section' : 'subhdr';
        return `<tr class="${cls}"><td colspan="2" style="font-weight:bold;">${esc(ln.label)}</td></tr>`;
      }
      if (ln.type === 'total') {
        return `<tr class="total" style="background-color:#E85D04;color:#fff;font-weight:bold;">`
          + `<td>${esc(ln.label)}</td>${numCell(values[ln.id], '')}</tr>`;
      }
      if (ln.type === 'subtotal') {
        return `<tr class="subtotal" style="background-color:#FFF4ED;font-weight:bold;">`
          + `<td>${esc(ln.label)}</td>${numCell(values[ln.id], '')}</tr>`;
      }
      const v = values[ln.id];
      if (isZero(v)) return '';
      const indent = ln.level >= 2 ? ' style="mso-char-indent-count:2;"' : '';
      return `<tr><td${indent}>${esc(ln.label)}</td>${numCell(v, '')}</tr>`;
    }).join('');
  };

  const renderXlsxHtml = ({ company, subsidiaryLabel, periodLabel, chartLabel,
                           aktivaLines, passivaLines, values,
                           aktivaTotal, passivaTotal, balanceOk,
                           notmappedAktiva, notmappedPassiva }) => {

    const aktivaRows = sideRowsHtml(aktivaLines, values);
    const passivaRows = sideRowsHtml(passivaLines, values);

    const reportTitle = `Bilanz HGB · ${periodLabel}`;
    const metaParts = [subsidiaryLabel, `Kontenrahmen: ${chartLabel}`].filter(Boolean);

    const notmappedHtml = (!isZero(notmappedAktiva) || !isZero(notmappedPassiva))
      ? `<tr><td colspan="5" style="color:#C00;font-weight:bold;">Nicht zugeordnet — Aktiva: ${esc(Number(notmappedAktiva).toFixed(2))}, Passiva: ${esc(Number(notmappedPassiva).toFixed(2))}</td></tr>`
      : '';

    const balanceCell = balanceOk
      ? `<tr><td colspan="5" style="color:#2D5E3B;">Aktiva = Passiva (${esc(Number(aktivaTotal).toFixed(2))})</td></tr>`
      : `<tr><td colspan="5" style="color:#8A1F1F;font-weight:bold;">Aktiva ${esc(Number(aktivaTotal).toFixed(2))} ≠ Passiva ${esc(Number(passivaTotal).toFixed(2))} (Differenz ${esc(Number(aktivaTotal - passivaTotal).toFixed(2))})</td></tr>`;

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
    <tr><td colspan="5" class="company">${esc(company)}</td></tr>
    <tr><td colspan="5" class="title">${esc(reportTitle)}</td></tr>
    ${metaParts.length ? `<tr><td colspan="5" class="meta">${esc(metaParts.join(' · '))}</td></tr>` : ''}
    <tr><td colspan="5">&nbsp;</td></tr>
    <tr>
      <td colspan="2" class="sidehdr">AKTIVA</td>
      <td>&nbsp;</td>
      <td colspan="2" class="sidehdr">PASSIVA</td>
    </tr>
    <tr>
      <th>Position</th><th style="text-align:right;">EUR</th>
      <th></th>
      <th>Position</th><th style="text-align:right;">EUR</th>
    </tr>
    ${mergeSideRows(aktivaRows, passivaRows)}
    <tr><td colspan="5">&nbsp;</td></tr>
    ${balanceCell}
    ${notmappedHtml}
  </table>
</body>
</html>`;
  };

  // Merge zwei Listen von <tr>-HTML-Bloecken zu einer Tabelle mit 5 Spalten:
  // links Aktiva-Zeile (Label+Num), Spacer, rechts Passiva-Zeile (Label+Num).
  // Wir parsen die Roh-<tr>-Strings nicht, sondern wickeln sie um — daher
  // werden in die zweispaltige Side-Tabelle jeweils 2 <td>s extrahiert.
  // Da die sideRowsHtml-Outputs unterschiedlich strukturierte Zeilen haben
  // (header colspan=2, detail 2 cols, total 2 cols), normalisieren wir sie
  // beim Mergen zu 2 Spalten pro Seite.
  function mergeSideRows(leftHtml, rightHtml) {
    const left = splitRows(leftHtml);
    const right = splitRows(rightHtml);
    const max = Math.max(left.length, right.length);
    const out = [];
    for (let i = 0; i < max; i++) {
      const l = left[i] || { cells: '<td></td><td></td>', cls: '' };
      const r = right[i] || { cells: '<td></td><td></td>', cls: '' };
      // Der visuelle Effekt der Klassen-Styles geht durch das Auseinander-
      // mergen teils verloren — wir behalten zumindest fett+Hintergrund-
      // Hervorhebungen ueber inline-styles in den Cells.
      out.push(`<tr>${l.cells}<td style="border:none;"></td>${r.cells}</tr>`);
    }
    return out.join('');
  }

  // Erkennt jede einzelne <tr ...> ... </tr> und liefert deren Cell-Inhalte
  // als 2-Spalten-Block. colspan=2 wird in zwei <td>s aufgesplittet — eines
  // mit Label, eines leer mit gleichem Style.
  function splitRows(html) {
    const out = [];
    const rowRegex = /<tr([^>]*)>([\s\S]*?)<\/tr>/g;
    let m;
    while ((m = rowRegex.exec(html)) !== null) {
      const attrs = m[1] || '';
      const body = m[2] || '';
      const clsMatch = /class\s*=\s*"([^"]*)"/.exec(attrs);
      const cls = clsMatch ? clsMatch[1] : '';
      // colspan?
      const colspanMatch = /<td\b[^>]*colspan\s*=\s*"2"[^>]*>([\s\S]*?)<\/td>/i.exec(body);
      if (colspanMatch) {
        // Extrahiere Style aus dem Original-<td>
        const tdOpen = /<td\b([^>]*)>/i.exec(body);
        const styleM = tdOpen ? /style\s*=\s*"([^"]*)"/.exec(tdOpen[1]) : null;
        const inlineStyle = styleM ? styleM[1] : '';
        out.push({
          cells: `<td style="${inlineStyle}">${colspanMatch[1]}</td><td style="${inlineStyle}"></td>`,
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
