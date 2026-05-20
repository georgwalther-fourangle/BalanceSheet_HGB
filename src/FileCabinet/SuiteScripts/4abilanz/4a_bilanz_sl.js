/**
 * © 2026 fourangle consulting gmbh. All rights reserved.
 *
 * Title: Bilanz HGB — Suitelet
 * Description: Bilanz nach §266 HGB (Kapitalgesellschaft, gross+mittelgross)
 *              auf Basis Posting-Periode + Subsidiary + Accounting Book.
 *              Mapping ueber SKR03 / SKR04 Konto-Nr.-Ranges oder ueber
 *              NetSuite-acctType (Fallback). HTML + XLSX + PDF Export.
 *
 * Script-Parameter:
 *   custscript_4abilanz_chartofaccounts  String  'skr03' | 'skr04' | 'nstype'
 *                                                Default: 'skr04'.
 *
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */
define([
  'N/ui/serverWidget', 'N/query', 'N/url', 'N/runtime', 'N/https', 'N/cache',
  'N/crypto', 'N/encode', 'N/render', 'N/file', 'N/log',
  './4a_bilanz_style', './4a_bilanz_config', './4a_bilanz_queries',
  './4a_bilanz_pdf', './4a_bilanz_xlsx',
], (serverWidget, query, url, runtime, https, cache, crypto, encode, render, file, log,
    style, config, queries, pdfMod, xlsxMod) => {

  // =========================================================================
  // LICENSE CHECK (inlined — Standalone-Bundle, kein Import aus 4astyles)
  // =========================================================================
  const LICENSE_PRODUCT_KEY  = 'BILANZ_HGB';
  const LICENSE_PRODUCT_NAME = 'Bilanz HGB';
  const LICENSE_BUY_URL      = 'https://fourangle.com/plug-ins/bilanz-hgb';
  const LICENSE_SUPPORT_MAIL = 'info@fourangle.com';
  // Zentraler Fourangle-Lizenzserver in NetSuite-Account 11672894.
  const LICENSE_URL          = 'https://11672894.extforms.netsuite.com/app/site/hosting/scriptlet.nl'
    + '?script=435&deploy=1&compid=11672894'
    + '&ns-at=AAEJ7tMQbnasQPFCTFBNm6BhefNUbjYglvJBrzLLRADhg5f4AIY';
  const LICENSE_CACHE_NAME = 'fourangle_license';
  const LICENSE_CACHE_KEY  = '4a_license_v1_' + LICENSE_PRODUCT_KEY;
  const LICENSE_TTL_SECS   = 86400; // 24h, NetSuite-Maximum

  const licenseEsc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

  const licenseHash = (p1, p2) => {
    const h = crypto.createHash({ algorithm: crypto.HashAlg.SHA256 });
    h.update({ input: (p1 || '') + '|' + (p2 || ''), inputEncoding: encode.Encoding.UTF_8 });
    return h.digest({ outputEncoding: encode.Encoding.HEX });
  };

  const licenseLoad = () => {
    try {
      const accountId = runtime.accountId;
      const secretkey = licenseHash(accountId, LICENSE_PRODUCT_KEY);
      const response = https.get({ url: LICENSE_URL });
      const body = response.body || '';
      // Case-insensitiv: NetSuite crypto liefert lowercase hex, Customer-
      // License-Records speichern oft UPPERCASE.
      const ok = body.toUpperCase().indexOf(secretkey.toUpperCase()) !== -1;
      log.audit({
        title: '4a_bilanz license check',
        details: 'product=' + LICENSE_PRODUCT_KEY + ' account=' + accountId
          + ' result=' + (ok ? 'T' : 'F') + ' bodyLen=' + body.length,
      });
      return ok ? 'T' : 'F';
    } catch (e) {
      log.error({ title: '4a_bilanz license check error', details: e.message || String(e) });
      return 'F';
    }
  };

  // Nur positive Antworten cachen (24h TTL). Negative nicht — damit eine
  // Lizenz-Reaktivierung beim naechsten Seitenaufruf direkt greift.
  const licenseOk = () => {
    try {
      const c = cache.getCache({ name: LICENSE_CACHE_NAME, scope: cache.Scope.PROTECTED });
      if (c.get({ key: LICENSE_CACHE_KEY }) === 'T') return true;
      if (licenseLoad() !== 'T') return false;
      c.put({ key: LICENSE_CACHE_KEY, value: 'T', ttl: LICENSE_TTL_SECS });
      return true;
    } catch (e) {
      log.error({ title: '4a_bilanz license cache error', details: e.message || String(e) });
      return false;
    }
  };

  const renderLicenseErrorHtml = () => '<!DOCTYPE html>'
    + '<html lang="de"><head><meta charset="utf-8"/><title>' + licenseEsc(LICENSE_PRODUCT_NAME) + ' — Lizenz fehlt</title>'
    + '<style>'
    + '  body { font-family: Helvetica, Arial, sans-serif; margin: 40px auto; max-width: 960px; padding: 0 20px; color: #1F2937; background: #F7F5F2; }'
    + '  .card { background: #fff; border-radius: 12px; box-shadow: 0 1px 2px rgba(0,0,0,.04), 0 2px 8px rgba(0,0,0,.04); padding: 28px 32px; }'
    + '  h1 { color: #E85D04; font-size: 22px; margin-top: 0; }'
    + '  p { line-height: 1.55; }'
    + '  code { background: #F5F5F5; padding: 2px 6px; border-radius: 3px; font-size: 12px; }'
    + '  a { color: #E85D04; }'
    + '  .buy-btn { display: inline-block; background: #E85D04; color: #fff !important; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: 600; font-size: 15px; }'
    + '  .buy-btn:hover { background: #C64E00; }'
    + '  .meta { color: #6B7280; font-size: 12px; margin-top: 30px; }'
    + '</style></head>'
    + '<body><div class="card">'
    + '<h1>' + licenseEsc(LICENSE_PRODUCT_NAME) + ' — Lizenz fehlt oder ungültig</h1>'
    + '<p>Für dieses NetSuite-Konto wurde keine gültige <strong>' + licenseEsc(LICENSE_PRODUCT_NAME) + '</strong>-Lizenz gefunden.</p>'
    + '<p><a class="buy-btn" href="' + licenseEsc(LICENSE_BUY_URL) + '" target="_blank" rel="noopener">Lizenz erwerben</a></p>'
    + '<p>Support: <a href="mailto:' + licenseEsc(LICENSE_SUPPORT_MAIL) + '">' + licenseEsc(LICENSE_SUPPORT_MAIL) + '</a> — bitte Account-ID angeben:</p>'
    + '<p><code>' + licenseEsc(String(runtime.accountId)) + '</code></p>'
    + '<p class="meta">Die Lizenz wird alle 24 Stunden serverseitig neu geprüft. Nach Aktivierung wird sie beim nächsten Seitenaufruf wirksam.</p>'
    + '</div></body></html>';

  // =========================================================================
  // HELPERS
  // =========================================================================
  const { esc, fmtEur, isZero } = style;
  const { aktiva: AKTIVA_LINES, passiva: PASSIVA_LINES, allLines: ALL_LINES,
          lookupAccount, computeValues } = config;

  const MONTHS_DE = ['','Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];

  const CHART_LABELS = { skr03: 'SKR03', skr04: 'SKR04', nstype: 'NetSuite-Kontotyp' };

  const getChartOfAccounts = () => {
    const v = String(runtime.getCurrentScript().getParameter({ name: 'custscript_4abilanz_chartofaccounts' }) || '').toLowerCase();
    if (v === 'skr03' || v === 'skr04' || v === 'nstype') return v;
    return 'skr04';
  };

  /**
   * Aggregiert Account-Salden zu Bilanz-Detail-Zeilen.
   *
   * Eingabe:
   *   accountRows: [{ account_id, acctnumber, acctname, accttype, balance }]
   *   chartOfAccounts: 'skr03' | 'skr04' | 'nstype'
   *
   * Ausgabe:
   *   detailValues: { lineId: amount } — Aktiva positiv, Passiva positiv
   *                                       (Vorzeichen je nach side gekehrt)
   *   notmapped: { aktiva: amount, passiva: amount, accounts: [...] }
   *
   * Heuristik fuer ungelistete Konten (kein SKR-Match, kein acctType-Match):
   *   - Positive Salden (Soll-Saldo > 0) → __unmapped_aktiva
   *   - Negative Salden (Haben-Saldo) → __unmapped_passiva
   */
  const aggregate = (accountRows, chartOfAccounts) => {
    const detail = {};
    const notmapped = { aktiva: 0, passiva: 0, accounts: [] };

    for (const r of accountRows) {
      const balance = parseFloat(r.balance) || 0;
      if (Math.abs(balance) < 0.005) continue;
      const lookup = lookupAccount(chartOfAccounts, r.acctnumber, r.accttype);
      if (!lookup) {
        if (balance >= 0) notmapped.aktiva += balance;
        else notmapped.passiva += (-balance);
        notmapped.accounts.push({
          acctnumber: r.acctnumber, acctname: r.acctname,
          accttype: r.accttype, balance,
        });
        continue;
      }
      const amount = lookup.side === 'aktiva' ? balance : -balance;
      detail[lookup.lineId] = (detail[lookup.lineId] || 0) + amount;
    }
    return { detail, notmapped };
  };

  /**
   * Liefert die finalen Werte fuer ALLE Zeilen (detail + abgeleitet) und
   * traegt das Jahresergebnis in P.A.V (Jahresueberschuss) ein. Wenn das
   * Konto-Mapping bereits P.A.V-Werte erzeugt hat (z.B. weil das Kunden-
   * Setup ein Konto direkt auf P.A.V mappt), wird der berechnete Wert
   * dazuaddiert — das ist der haeufige Fall, bei dem die GuV noch nicht
   * abgeschlossen ist.
   */
  const finalizeValues = (detailValues, currentFyNet) => {
    const values = computeValues(ALL_LINES, detailValues);
    // Jahresergebnis aufschlagen — wenn nicht schon abgeschlossen ist es das
    // Delta zwischen aktueller Bilanz und Vorjahresueberhang.
    if (Math.abs(currentFyNet) >= 0.005) {
      detailValues['P.A.V'] = (detailValues['P.A.V'] || 0) + currentFyNet;
    }
    return computeValues(ALL_LINES, detailValues);
  };

  // =========================================================================
  // HTML RENDERING
  // =========================================================================

  const renderSideTable = (lines, values) => {
    const rows = lines.map((ln) => {
      if (ln.type === 'section') {
        return `<tr class="lvl-section"><td class="lbl" colspan="2">${esc(ln.label)}</td></tr>`;
      }
      if (ln.type === 'header') {
        return `<tr class="lvl-1"><td class="lbl" colspan="2"><em style="font-style:normal;color:#6B7280;font-weight:600;">${esc(ln.label)}</em></td></tr>`;
      }
      if (ln.type === 'total') {
        return `<tr class="total"><td class="lbl">${esc(ln.label)}</td>`
          + `<td class="num">${fmtEur(values[ln.id])}</td></tr>`;
      }
      if (ln.type === 'subtotal') {
        return `<tr class="subtotal"><td class="lbl">${esc(ln.label)}</td>`
          + `<td class="num">${fmtEur(values[ln.id])}</td></tr>`;
      }
      // detail — verstecke Nullzeilen
      const v = values[ln.id];
      if (isZero(v)) return '';
      const cls = `lvl-${Math.min(ln.level, 3)}`;
      return `<tr class="${cls}"><td class="lbl">${esc(ln.label)}</td>`
        + `<td class="num">${fmtEur(v)}</td></tr>`;
    }).join('');
    return `<table class="bilanz-table">
  <thead>
    <tr><th class="lbl">Position</th><th class="num">EUR</th></tr>
  </thead>
  <tbody>${rows}</tbody>
</table>`;
  };

  const renderResultHtml = ({ values, aktivaTotal, passivaTotal, balanceOk,
                              notmappedAktiva, notmappedPassiva, notmappedAccounts,
                              chartLabel }) => {
    const balanceClass = balanceOk ? 'ok' : 'fail';
    const balanceText = balanceOk
      ? `<span class="fa-dot fa-dot-orange"></span>Aktiva = Passiva (${fmtEur(aktivaTotal)} EUR)`
      : `<strong>Bilanz nicht ausgeglichen</strong> — Aktiva: ${fmtEur(aktivaTotal)} EUR · Passiva: ${fmtEur(passivaTotal)} EUR · Differenz: ${fmtEur(aktivaTotal - passivaTotal)} EUR`;

    let notmappedHtml = '';
    if (!isZero(notmappedAktiva) || !isZero(notmappedPassiva)) {
      const sampleRows = (notmappedAccounts || []).slice(0, 20).map((a) =>
        `<tr><td>${esc(a.acctnumber || '')}</td><td>${esc(a.acctname || '')}</td><td>${esc(a.accttype || '')}</td><td class="num">${fmtEur(a.balance)}</td></tr>`
      ).join('');
      notmappedHtml = `
<div class="fa-card" style="margin-top:14px;border:1.5px solid #F1B0B0;">
  <p style="margin:0 0 8px 0;color:#8A1F1F;font-weight:600;">Nicht zugeordnete Salden</p>
  <p style="margin:0 0 8px 0;color:#6B7280;font-size:12px;">
    Aktiva-Restbetrag: <strong>${fmtEur(notmappedAktiva)}</strong> EUR · Passiva-Restbetrag: <strong>${fmtEur(notmappedPassiva)}</strong> EUR.
    Die folgenden Konten konnten keiner Bilanz-Zeile zugeordnet werden — passe Kontenrahmen-Auswahl an oder pflege die Konten in NetSuite.
  </p>
  <table class="bilanz-table" style="width:auto;">
    <thead><tr><th>Kto-Nr.</th><th>Name</th><th>NS-Typ</th><th class="num">Saldo</th></tr></thead>
    <tbody>${sampleRows || '<tr><td colspan="4" style="color:#6B7280;">—</td></tr>'}</tbody>
  </table>
  ${(notmappedAccounts && notmappedAccounts.length > 20) ? `<p style="color:#6B7280;font-size:12px;margin:8px 0 0 0;">… und ${notmappedAccounts.length - 20} weitere.</p>` : ''}
</div>`;
    }

    return `
<div class="bilanz-wrap">
  <div class="bilanz-grid">
    <div class="bilanz-side">
      <p class="bilanz-side-title">Aktiva</p>
      ${renderSideTable(AKTIVA_LINES, values)}
    </div>
    <div class="bilanz-side">
      <p class="bilanz-side-title">Passiva</p>
      ${renderSideTable(PASSIVA_LINES, values)}
    </div>
  </div>
  <div class="bilanz-balance-check ${balanceClass}">${balanceText}</div>
  <div class="bilanz-meta"><span class="fa-dot fa-dot-orange"></span>Kontenrahmen: ${esc(chartLabel)} · Vorzeichen: Aktiva und Passiva als positive Salden. Null-Zeilen werden ausgeblendet.</div>
  ${notmappedHtml}
</div>`;
  };

  // =========================================================================
  // PERIOD HELPERS
  // =========================================================================
  const formatPeriodLabel = (period) => {
    if (!period) return '—';
    const month = parseInt(period.month_str, 10);
    const year = period.year_str;
    return `Stichtag ${period.enddate_str} (${MONTHS_DE[month] || period.periodname} ${year})`;
  };

  // =========================================================================
  // MAIN
  // =========================================================================
  const onRequest = (context) => {
    const { request, response } = context;

    if (!licenseOk()) {
      response.setHeader({ name: 'Content-Type', value: 'text/html; charset=utf-8' });
      response.write(renderLicenseErrorHtml());
      return;
    }

    const chartOfAccounts = getChartOfAccounts();
    const chartLabel = CHART_LABELS[chartOfAccounts] || chartOfAccounts;

    const p = request.parameters;
    const selSub = p.custpage_sub ?? p.sub ?? '';
    const selBook = p.custpage_book ?? p.book ?? '';
    const reqYear = p.custpage_year ?? p.year ?? '';
    const reqPeriod = p.custpage_period ?? p.period ?? '';

    const subsidiaries = queries.getSubsidiaries();
    const books = queries.getAccountingBooks();
    const periods = queries.getPostingPeriods();

    // Default Book: erstes verfuegbares (typischerweise id=1 Primary Book).
    const defaultBookId = books.length ? String(books[0].id) : '1';
    const effectiveBook = selBook || defaultBookId;

    // Perioden nach Jahr buendeln
    const periodsByYear = {};
    for (const row of periods) {
      const y = row.year_str;
      (periodsByYear[y] = periodsByYear[y] || []).push(row);
    }
    const years = Object.keys(periodsByYear).sort().reverse();

    const now = new Date();
    const currentYear = String(now.getFullYear());
    const currentMonth = now.getMonth() + 1;
    const selYear = reqYear && periodsByYear[reqYear]
      ? reqYear
      : (periodsByYear[currentYear] ? currentYear : (years[0] || currentYear));
    const yearPeriods = periodsByYear[selYear] || [];

    const pickDefaultPeriod = () => {
      if (!yearPeriods.length) return '';
      if (selYear === currentYear) {
        const pCurrent = yearPeriods.find((pp) => parseInt(pp.month_str, 10) === currentMonth);
        if (pCurrent) return String(pCurrent.id);
      }
      return String(yearPeriods[yearPeriods.length - 1].id);
    };
    const selPeriodId = reqPeriod && yearPeriods.some((pp) => String(pp.id) === String(reqPeriod))
      ? reqPeriod
      : pickDefaultPeriod();
    const selPeriod = selPeriodId ? yearPeriods.find((pp) => String(pp.id) === String(selPeriodId)) : null;

    // -----------------------------------------------------------------------
    // Aggregation
    // -----------------------------------------------------------------------
    let values = {};
    let aktivaTotal = 0;
    let passivaTotal = 0;
    let balanceOk = true;
    let notmapped = { aktiva: 0, passiva: 0, accounts: [] };

    if (selPeriod) {
      const balances = queries.getBalanceSheetBalances(selPeriod.id, effectiveBook, selSub || '');
      const currentFyNet = queries.getCurrentFyNetIncome(selPeriod.id, effectiveBook, selSub || '');
      const agg = aggregate(balances, chartOfAccounts);
      notmapped = agg.notmapped;
      values = finalizeValues(agg.detail, currentFyNet);
      aktivaTotal = values['AKT.t'] || 0;
      passivaTotal = values['PAS.t'] || 0;
      balanceOk = Math.abs(aktivaTotal - passivaTotal) < 0.5; // Toleranz 50 Cent fuer Rundungen
    }

    // -----------------------------------------------------------------------
    // Export-Actions (PDF / XLSX)
    // -----------------------------------------------------------------------
    if ((p.action === 'pdf' || p.action === 'xlsx') && selPeriod) {
      const subObj = selSub
        ? subsidiaries.find((s) => String(s.id) === String(selSub))
        : subsidiaries[0];
      const company = (subObj && (subObj.legalname || subObj.name)) || 'NetSuite';
      const subsidiaryLabel = selSub ? (subObj && (subObj.name || subObj.fullname)) || '' : 'Alle Subsidiaries';
      const periodLabel = formatPeriodLabel(selPeriod);

      const exportPayload = {
        company, subsidiaryLabel, periodLabel, chartLabel,
        aktivaLines: AKTIVA_LINES, passivaLines: PASSIVA_LINES, values,
        aktivaTotal, passivaTotal, balanceOk,
        notmappedAktiva: notmapped.aktiva, notmappedPassiva: notmapped.passiva,
      };

      const safeMonth = String(selPeriod.month_str).padStart(2, '0');
      const baseName = `bilanz_${selYear}-${safeMonth}`;

      if (p.action === 'pdf') {
        const xml = pdfMod.renderPdfXml(exportPayload);
        let pdfFile;
        try {
          pdfFile = render.xmlToPdf({ xmlString: xml });
        } catch (e) {
          try {
            log.error({
              title: '4a_bilanz PDF: xmlToPdf failed',
              details: JSON.stringify({
                message: e && e.message, name: e && e.name,
                cause: e && e.cause, stack: e && e.stack, xml_len: xml.length,
              }),
            });
          } catch (_) { /* noop */ }
          const CHUNK = 3000;
          for (let off = 0, i = 1; off < xml.length; off += CHUNK, i++) {
            log.error({
              title: `4a_bilanz PDF: xml chunk ${i}/${Math.ceil(xml.length / CHUNK)}`,
              details: xml.slice(off, off + CHUNK),
            });
          }
          throw e;
        }
        pdfFile.name = baseName + '.pdf';
        response.writeFile({ file: pdfFile, isInline: false });
        return;
      }

      // xlsx
      try {
        const html = xlsxMod.renderXlsxHtml(exportPayload);
        const xlsFile = file.create({
          name: baseName + '.xls',
          fileType: file.Type.HTMLDOC,
          contents: html,
        });
        response.writeFile({ file: xlsFile, isInline: false });
        return;
      } catch (e) {
        log.error({
          title: '4a_bilanz XLSX: failed',
          details: `err=${e.message || String(e)}\nstack=${e.stack || ''}`,
        });
        throw e;
      }
    }

    // -----------------------------------------------------------------------
    // FORM
    // -----------------------------------------------------------------------
    const form = serverWidget.createForm({ title: 'Bilanz HGB' });

    let pdfUrl = '', xlsxUrl = '';
    try {
      pdfUrl = url.resolveScript({
        scriptId: 'customscript_4abilanz_sl',
        deploymentId: 'customdeploy_4abilanz_sl',
        returnExternalUrl: false,
        params: { action: 'pdf', sub: selSub || '', book: effectiveBook,
                  year: selYear || '', period: selPeriodId || '' },
      });
      xlsxUrl = url.resolveScript({
        scriptId: 'customscript_4abilanz_sl',
        deploymentId: 'customdeploy_4abilanz_sl',
        returnExternalUrl: false,
        params: { action: 'xlsx', sub: selSub || '', book: effectiveBook,
                  year: selYear || '', period: selPeriodId || '' },
      });
    } catch (e) { /* Deployment IDs noch nicht aufloesbar — Buttons werden weggelassen */ }

    const subOpts = [
      `<option value=""${!selSub ? ' selected' : ''}>Alle Subsidiaries</option>`,
      ...subsidiaries.map((s) =>
        `<option value="${esc(s.id)}"${String(s.id) === String(selSub) ? ' selected' : ''}>${esc(s.fullname || s.name)}</option>`),
    ].join('');
    const bookOpts = books.map((b) =>
      `<option value="${esc(b.id)}"${String(b.id) === String(effectiveBook) ? ' selected' : ''}>${esc(b.name)}</option>`).join('');
    const yearOpts = years.map((y) =>
      `<option value="${esc(y)}"${y === selYear ? ' selected' : ''}>${esc(y)}</option>`).join('');
    const periodOpts = yearPeriods.map((pp) =>
      `<option value="${esc(pp.id)}"${String(pp.id) === String(selPeriodId) ? ' selected' : ''}>${esc(MONTHS_DE[parseInt(pp.month_str, 10)] || pp.periodname)} ${esc(pp.year_str)}</option>`).join('');

    const topbarHtml = style.BASE_CSS + `
<div class="fa-topbar">
  <div class="fa-topbar-title">
    <h1>Bilanz HGB</h1>
    <span class="fa-subtitle">§266 HGB · ${esc(chartLabel)}</span>
  </div>
  <div class="fa-topbar-actions">
    ${xlsxUrl ? `<a href="${esc(xlsxUrl)}" class="fa-btn fa-topbar-btn" style="background:#21A366;border-color:#1B8C56;">Excel herunterladen</a>` : ''}
    ${pdfUrl ? `<a href="${esc(pdfUrl)}" class="fa-btn fa-topbar-btn">PDF herunterladen</a>` : ''}
  </div>
  <div class="fa-topbar-filters">
    <label class="fa-field">
      <span class="fa-field-label">Subsidiary</span>
      <select name="custpage_sub">${subOpts}</select>
    </label>
    <label class="fa-field">
      <span class="fa-field-label">Accounting Book</span>
      <select name="custpage_book">${bookOpts}</select>
    </label>
    <label class="fa-field">
      <span class="fa-field-label">Jahr</span>
      <select name="custpage_year" onchange="var p=this.form.custpage_period;if(p){p.value='';}this.form.submit();">${yearOpts}</select>
    </label>
    <label class="fa-field">
      <span class="fa-field-label">Periode (Stichtag)</span>
      <select name="custpage_period">${periodOpts}</select>
    </label>
  </div>
</div>`;

    const topbarField = form.addField({
      id: 'custpage_fa_topbar',
      type: serverWidget.FieldType.INLINEHTML,
      label: ' ',
    });
    topbarField.defaultValue = topbarHtml;
    topbarField.updateLayoutType({ layoutType: serverWidget.FieldLayoutType.OUTSIDEABOVE });

    form.addSubmitButton({ label: 'Anzeigen' });

    const htmlField = form.addField({
      id: 'custpage_bilanz_html',
      type: serverWidget.FieldType.INLINEHTML,
      label: ' ',
    });
    htmlField.defaultValue = selPeriod
      ? renderResultHtml({
          values, aktivaTotal, passivaTotal, balanceOk,
          notmappedAktiva: notmapped.aktiva, notmappedPassiva: notmapped.passiva,
          notmappedAccounts: notmapped.accounts, chartLabel,
        })
      : '<div class="bilanz-wrap"><div class="fa-card"><p>Bitte Periode auswählen.</p></div></div>';
    htmlField.updateLayoutType({ layoutType: serverWidget.FieldLayoutType.OUTSIDEBELOW });

    response.writePage(form);
  };

  return { onRequest };
});
