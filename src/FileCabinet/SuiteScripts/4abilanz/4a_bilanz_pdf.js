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

  const renderSideTable = (lines, values, blank, valuesPrev, prevColLabel) => {
    const hasPrev = !!valuesPrev;
    const colCount = hasPrev ? 3 : 2;
    const rows = lines.map((ln) => {
      if (ln.type === 'header' || ln.type === 'section') {
        const cls = ln.type === 'section' ? 'section' : 'header';
        return `<tr class="${cls}"><td class="lbl" colspan="${colCount}">${esc(stripInvalidXml(ln.label))}</td></tr>`;
      }
      const v = values[ln.id];
      const vPrev = hasPrev ? valuesPrev[ln.id] : 0;
      const prevCell = hasPrev
        ? `<td class="num prev" align="right">${blank || isZero(vPrev) ? '' : fmtEur(vPrev)}</td>`
        : '';
      if (ln.type === 'total') {
        return `<tr class="total"><td class="lbl">${esc(stripInvalidXml(ln.label))}</td>`
          + `<td class="num" align="right">${blank ? '' : fmtEur(v)}</td>`
          + (hasPrev ? `<td class="num prev" align="right">${blank ? '' : fmtEur(vPrev)}</td>` : '')
          + '</tr>';
      }
      if (ln.type === 'subtotal') {
        return `<tr class="subtotal"><td class="lbl">${esc(stripInvalidXml(ln.label))}</td>`
          + `<td class="num" align="right">${blank ? '' : fmtEur(v)}</td>`
          + (hasPrev ? `<td class="num prev" align="right">${blank ? '' : fmtEur(vPrev)}</td>` : '')
          + '</tr>';
      }
      // detail — hide row only if BOTH current and prev are zero
      if (isZero(v) && (!hasPrev || isZero(vPrev))) return '';
      const indent = ln.level >= 2 ? ' indent' : '';
      return `<tr class="detail${indent}"><td class="lbl">${esc(stripInvalidXml(ln.label))}</td>`
        + `<td class="num" align="right">${isZero(v) ? '' : fmtEur(v)}</td>`
        + (hasPrev ? `<td class="num prev" align="right">${isZero(vPrev) ? '' : fmtEur(vPrev)}</td>` : '')
        + '</tr>';
    }).join('');
    return `<table>
  <thead>
    <tr>
      <th class="lbl">Position</th>
      <th class="num" align="right">EUR</th>
      ${hasPrev ? `<th class="num prev" align="right">${esc(stripInvalidXml(prevColLabel || 'Vorjahr'))}</th>` : ''}
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>`;
  };

  const renderPdfXml = ({ company, subsidiaryLabel, periodLabel, chartLabel,
                         aktivaLines, passivaLines, values,
                         aktivaTotal, passivaTotal, balanceOk,
                         notmappedAktiva, notmappedPassiva,
                         valuesPrev, prevColLabel }) => {

    const aktivaBlank = isZero(aktivaTotal) && aktivaLines.every((l) => l.type !== 'detail' || isZero(values[l.id]));
    const passivaBlank = isZero(passivaTotal) && passivaLines.every((l) => l.type !== 'detail' || isZero(values[l.id]));

    const aktivaHtml = renderSideTable(aktivaLines, values, aktivaBlank, valuesPrev, prevColLabel);
    const passivaHtml = renderSideTable(passivaLines, values, passivaBlank, valuesPrev, prevColLabel);

    const notmappedHtml = (!isZero(notmappedAktiva) || !isZero(notmappedPassiva))
      ? `<p class="warn">⚠ Nicht zugeordnete Salden — Aktiva: ${esc(fmtEur(notmappedAktiva))} EUR, Passiva: ${esc(fmtEur(notmappedPassiva))} EUR. Bitte Kontenrahmen pruefen.</p>`
      : '';

    const balanceStatus = balanceOk
      ? `<p class="ok">Aktiva = Passiva (${esc(fmtEur(aktivaTotal))} EUR)</p>`
      : `<p class="fail">Aktiva ${esc(fmtEur(aktivaTotal))} ≠ Passiva ${esc(fmtEur(passivaTotal))} (Differenz ${esc(fmtEur(aktivaTotal - passivaTotal))})</p>`;

    const headerMetaParts = [subsidiaryLabel, `Kontenrahmen: ${chartLabel}`].filter(Boolean);
    const headerMeta = headerMetaParts.join(' · ');
    const reportTitle = `Bilanz HGB · ${periodLabel}`;

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
  h1 { color: #1F2937; font-size: 13pt; font-weight: bold; text-align: center; margin: 0 0 2pt 0; }
  h2 { color: #E85D04; font-size: 10pt; font-weight: bold; text-align: center; margin: 0 0 2pt 0; }
  p.meta { color: #6B7280; font-size: 7pt; text-align: center; margin: 0 0 8pt 0; }
  p.ok   { color: #2D5E3B; font-size: 7pt; text-align: center; margin: 6pt 0 0 0; }
  p.fail { color: #8A1F1F; font-size: 7pt; text-align: center; margin: 6pt 0 0 0; font-weight: bold; }
  p.warn { color: #8A1F1F; font-size: 6pt; text-align: center; margin: 4pt 0 0 0; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 6pt; font-weight: bold; text-transform: uppercase;
       color: #6B7280; padding: 3pt 4pt; border-bottom: 1pt solid #C7C7C7; }
  th.num { text-align: right; }
  td { padding: 2pt 4pt; border-bottom: 1pt solid #E5E7EB; }
  td.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  td.lbl { white-space: nowrap; padding-left: 4pt; }
  tr.detail.indent td.lbl { padding-left: 16pt; }
  tr.section td { font-weight: bold; color: #1F2937; text-transform: none;
                  font-size: 7pt; padding: 5pt 4pt 1pt 0pt;
                  border-bottom: none; }
  tr.header td { font-weight: bold; color: #6B7280; text-transform: none;
                 font-size: 6pt; padding: 4pt 4pt 1pt 8pt;
                 border-bottom: none; }
  tr.subtotal td { font-weight: bold; background-color: #FFF4ED;
                   border-top: 1pt solid #E85D04; }
  tr.total td { font-weight: bold; background-color: #E85D04; color: #fff;
                border-top: 2pt solid #C64E00; border-bottom: 2pt solid #C64E00; }
  th.prev, td.prev { color: #6B7280; border-left: 0.5pt solid #C7C7C7; padding-left: 6pt; }
  tr.total td.prev    { color: #fff; }
  tr.subtotal td.prev { color: #1F2937; }
  .side-title { color: #E85D04; font-size: 8pt; font-weight: bold;
                text-transform: uppercase; letter-spacing: 0.05em;
                border-bottom: 1pt solid #E85D04; padding-bottom: 3pt; margin-bottom: 4pt; }
</style>
</head>
<body size="A4-landscape"
      padding-top="12pt" padding-bottom="12pt" padding-left="14pt" padding-right="14pt">
  <h1>${esc(stripInvalidXml(company))}</h1>
  <h2>${esc(stripInvalidXml(reportTitle))}</h2>
  ${headerMeta ? `<p class="meta">${esc(stripInvalidXml(headerMeta))}</p>` : '<p class="meta">&#160;</p>'}
  <table><tr>
    <td valign="top" width="50%" style="padding-right: 6pt; border-bottom: none;">
      <p class="side-title">Aktiva</p>
      ${aktivaHtml}
    </td>
    <td valign="top" width="50%" style="padding-left: 6pt; border-bottom: none;">
      <p class="side-title">Passiva</p>
      ${passivaHtml}
    </td>
  </tr></table>
  ${balanceStatus}
  ${notmappedHtml}
  <p style="font-size: 6pt; color: #6B7280; text-align: center; margin: 10pt 0 0 0;">${esc(stripInvalidXml(company))} · ${esc(stripInvalidXml(reportTitle))} · Erstellt ${esc(creationStamp)} · Seite 1 von 1</p>
</body>
</pdf>`;
  };

  return { renderPdfXml };
});
