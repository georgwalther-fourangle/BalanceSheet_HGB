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
          lookupAccount, computeValues, getLineByScriptid } = config;

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
   * Lookup-Reihenfolge je Konto:
   *   1) Override am Konto: custrecord_4abilanz_line → customlist-internal-id
   *      → scriptid → Line aus 4a_bilanz_config.js. Wenn der Wert gesetzt
   *      ist und auf eine bekannte Detail-Zeile zeigt, gewinnt er.
   *   2) Automatischer Lookup: lookupAccount(chartOfAccounts, acctnumber, acctType)
   *      — SKR-Range bzw. NS-acctType-Fallback.
   *   3) Wenn beides leer → "nicht zugeordnet" (notmapped).
   *
   * Eingabe:
   *   accountRows: [{ account_id, acctnumber, acctname, accttype, override_line_id, balance }]
   *   chartOfAccounts: 'skr03' | 'skr04' | 'nstype'
   *   listMap: { idToScriptid, idToName, scriptidToId } — aus queries.getLineListMap()
   *
   * Ausgabe:
   *   detail: { lineId: amount } — Aktiva positiv, Passiva positiv
   *   overridesUsed: Anzahl der Konten, bei denen der Override gegriffen hat
   *   notmapped: { aktiva, passiva, accounts: [...] }
   */
  const aggregate = (accountRows, chartOfAccounts, listMap) => {
    const detail = {};
    const notmapped = { aktiva: 0, passiva: 0, accounts: [] };
    let overridesUsed = 0;

    for (const r of accountRows) {
      const balance = parseFloat(r.balance) || 0;
      if (Math.abs(balance) < 0.005) continue;

      let lookup = null;
      // 1) Override am Account?
      const overrideId = r.override_line_id ? String(r.override_line_id) : '';
      if (overrideId && listMap && listMap.idToScriptid) {
        const sid = listMap.idToScriptid[overrideId];
        if (sid) {
          const line = getLineByScriptid(sid);
          if (line) {
            lookup = { lineId: line.id, side: line.side };
            overridesUsed++;
          }
        }
      }
      // 2) Auto-Lookup als Fallback
      if (!lookup) lookup = lookupAccount(chartOfAccounts, r.acctnumber, r.accttype);

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
    return { detail, notmapped, overridesUsed };
  };

  /**
   * Liefert die finalen Werte fuer ALLE Zeilen (detail + abgeleitet) und
   * traegt das Jahresergebnis in P.A.V (Jahresueberschuss/-fehlbetrag) ein.
   *
   * Berechnung: per doppelter Buchfuehrung gilt Aktiva = Passiva. Sobald
   * die Bilanzkonten aufaddiert sind, ist die verbleibende Differenz
   *   plug = AKTIVA − PASSIVA
   * exakt das in dieser Periode kumulierte Jahresergebnis (Gewinn ⇒ positiv,
   * Verlust ⇒ negativ). Das ist robuster als eine separate GuV-Query, weil
   * es jedes Posting korrekt einbezieht — auch Konten, die der Kunde
   * mit abweichendem acctType oder Custom-Mapping eingerichtet hat.
   *
   * Wird ein Konto im Customer-Kontenplan bereits manuell auf P.A.V gemappt
   * (z.B. SKR04 2980–2989), liegt darauf typischerweise der Vorjahres-
   * Saldo aus dem letzten Jahresabschluss. Der Plug rechnet darauf zusaetzlich
   * das laufende Jahresergebnis drauf.
   *
   * Toleranz: bei |plug| < 0,005 EUR (reine Rundungsdifferenz) wird nichts
   * gebucht — die Bilanz gilt als ausgeglichen.
   */
  const finalizeValues = (detailValues) => {
    const v0 = computeValues(ALL_LINES, detailValues);
    const aktivaT = v0['AKT.t'] || 0;
    const passivaT = v0['PAS.t'] || 0;
    const plug = aktivaT - passivaT;
    if (Math.abs(plug) >= 0.005) {
      detailValues['P.A.V'] = (detailValues['P.A.V'] || 0) + plug;
    }
    return { values: computeValues(ALL_LINES, detailValues), plug };
  };

  // =========================================================================
  // HTML RENDERING
  // =========================================================================

  /**
   * Rendert eine Seite (Aktiva oder Passiva) als Tabelle.
   *
   * Wenn `valuesPrev` uebergeben ist, bekommt jede Zeile zwei Werte-Spalten:
   * "EUR" (aktuelle Periode) und "Vorjahr" (selbe Monatsperiode im Vorjahr).
   * Andernfalls nur eine Spalte.
   *
   * Detail-Zeilen werden ausgeblendet, wenn BEIDE Werte (aktuell + Vorjahr)
   * ~0 sind.
   *
   * `padToBodyRows` (optional): falls gesetzt, wird vor dem Total mit leeren
   * <tr class="filler">-Zeilen aufgefuellt, bis die Tabelle insgesamt mind.
   * so viele Body-Rows hat. Damit lassen sich Aktiva und Passiva visuell
   * gleichlang machen, sodass die "Summe AKTIVA" und "Summe PASSIVA"-Zeilen
   * auf derselben Hoehe sitzen.
   *
   * Returns: { html, bodyRowCount } — der Aufrufer braucht den Count fuer
   *   die zweite Render-Runde mit padToBodyRows.
   */
  const renderSideTable = (lines, values, valuesPrev, prevColLabel, padToBodyRows) => {
    const hasPrev = !!valuesPrev;
    const colCount = hasPrev ? 3 : 2;
    const rowsBeforeTotal = [];
    let totalRow = '';
    for (const ln of lines) {
      if (ln.type === 'section') {
        rowsBeforeTotal.push(`<tr class="lvl-section"><td class="lbl" colspan="${colCount}">${esc(ln.label)}</td></tr>`);
        continue;
      }
      if (ln.type === 'header') {
        rowsBeforeTotal.push(`<tr class="lvl-1"><td class="lbl" colspan="${colCount}"><em style="font-style:normal;color:#6B7280;font-weight:600;">${esc(ln.label)}</em></td></tr>`);
        continue;
      }
      const v = values[ln.id];
      const vPrev = hasPrev ? valuesPrev[ln.id] : 0;
      if (ln.type === 'total') {
        totalRow = `<tr class="total"><td class="lbl">${esc(ln.label)}</td>`
          + `<td class="num">${fmtEur(v)}</td>${hasPrev ? `<td class="num prev">${fmtEur(vPrev)}</td>` : ''}</tr>`;
        continue;
      }
      if (ln.type === 'subtotal') {
        rowsBeforeTotal.push(`<tr class="subtotal"><td class="lbl">${esc(ln.label)}</td>`
          + `<td class="num">${fmtEur(v)}</td>${hasPrev ? `<td class="num prev">${fmtEur(vPrev)}</td>` : ''}</tr>`);
        continue;
      }
      // detail — verstecke nur, wenn BEIDE Werte ~0
      if (isZero(v) && (!hasPrev || isZero(vPrev))) continue;
      const cls = `lvl-${Math.min(ln.level, 3)}`;
      rowsBeforeTotal.push(`<tr class="${cls}"><td class="lbl">${esc(ln.label)}</td>`
        + `<td class="num">${isZero(v) ? '' : fmtEur(v)}</td>`
        + (hasPrev ? `<td class="num prev">${isZero(vPrev) ? '' : fmtEur(vPrev)}</td>` : '')
        + '</tr>');
    }

    // Padding zum Hoehenausgleich. Statt alle Filler-Zeilen ans Ende zu haengen
    // (was wie ein "leerer Block vor dem Total" aussieht), verteilen wir sie
    // VOR jeden Section-Start (ausser dem ersten). So bekommen die Section-
    // Bloecke der kuerzeren Seite mehr Abstand zueinander und der Vacuum-Look
    // verschwindet.
    if (padToBodyRows && rowsBeforeTotal.length < padToBodyRows) {
      const fillerCell = hasPrev
        ? '<td class="lbl">&nbsp;</td><td class="num">&nbsp;</td><td class="num prev">&nbsp;</td>'
        : '<td class="lbl">&nbsp;</td><td class="num">&nbsp;</td>';
      const fillerRow = `<tr class="filler">${fillerCell}</tr>`;
      // Section-Start-Positionen finden (alle Sections nach der ersten).
      const sectionStarts = [];
      for (let i = 0; i < rowsBeforeTotal.length; i++) {
        if (rowsBeforeTotal[i].indexOf('class="lvl-section"') !== -1) sectionStarts.push(i);
      }
      const gaps = sectionStarts.slice(1); // erste Section bleibt am Top-of-Card
      let need = padToBodyRows - rowsBeforeTotal.length;
      if (gaps.length > 0) {
        const perGap = Math.floor(need / gaps.length);
        const remainder = need - perGap * gaps.length;
        // Von hinten nach vorne einfuegen, damit die `gaps`-Indizes stabil
        // bleiben. Den Rest (remainder) packen wir auf die hinteren Sections,
        // damit der visuelle "Schwerpunkt" der Bilanz oben bleibt.
        for (let g = gaps.length - 1; g >= 0; g--) {
          const count = perGap + (g >= gaps.length - remainder ? 1 : 0);
          for (let f = 0; f < count; f++) rowsBeforeTotal.splice(gaps[g], 0, fillerRow);
          need -= count;
        }
      }
      // Restliche Filler (falls nur eine Section existiert) am Ende
      while (rowsBeforeTotal.length < padToBodyRows) rowsBeforeTotal.push(fillerRow);
    }

    const bodyRowCount = rowsBeforeTotal.length + (totalRow ? 1 : 0);
    const html = `<table class="bilanz-table">
  <thead>
    <tr>
      <th class="lbl">Position</th>
      <th class="num">EUR</th>
      ${hasPrev ? `<th class="num prev">${esc(prevColLabel || 'Vorjahr')}</th>` : ''}
    </tr>
  </thead>
  <tbody>${rowsBeforeTotal.join('')}${totalRow}</tbody>
</table>`;
    return { html, bodyRowCount, rowsBeforeTotalCount: rowsBeforeTotal.length };
  };

  const renderResultHtml = ({ values, aktivaTotal, passivaTotal, balanceOk, plug,
                              valuesPrev, prevColLabel,
                              notmappedAktiva, notmappedPassiva, notmappedAccounts,
                              chartLabel, overridesUsed, schemaMissing }) => {
    const balanceClass = balanceOk ? 'ok' : 'fail';
    const plugLabel = isZero(plug)
      ? ''
      : ` · Jahresergebnis aus Bilanzdifferenz: ${fmtEur(plug)} EUR ${plug >= 0 ? '(Gewinn)' : '(Verlust)'}`;
    const balanceText = balanceOk
      ? `<span class="fa-dot fa-dot-orange"></span>Aktiva = Passiva (${fmtEur(aktivaTotal)} EUR)${plugLabel}`
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

    const schemaWarnHtml = schemaMissing
      ? style.renderNotice({
          variant: 'warn',
          iconChar: '!',
          title: 'Konto-Overrides nicht verfügbar in diesem NetSuite-Account',
          body: 'Das Custom Field <code>custrecord_4abilanz_line</code> und/oder die Customlist <code>customlist_4abilanz_lines</code> sind in diesem Account nicht installiert. Die Bilanz arbeitet weiter mit der automatischen SKR/Account-Typ-Zuordnung — manuelle Konto-Overrides sind deaktiviert, bis das Bundle-Update eingespielt ist.',
          steps: [
            '<strong>Setup → Customization → Install Bundle → List Installed Bundles</strong> öffnen.',
            '„4a Bilanz HGB" in der Liste finden und <strong>Update</strong> anklicken.',
            'Nach dem Update diese Seite neu laden — Overrides werden automatisch aktiv.',
          ],
        })
      : '';

    // Zwei-Pass-Render: erst beide Seiten ohne Padding rendern, um zu
    // messen, wie viele Body-Rows jede Seite hat. Dann mit der groesseren
    // Anzahl als padToBodyRows neu rendern → Summe-Zeilen liegen auf
    // gleicher Hoehe.
    const a0 = renderSideTable(AKTIVA_LINES, values, valuesPrev, prevColLabel);
    const p0 = renderSideTable(PASSIVA_LINES, values, valuesPrev, prevColLabel);
    const targetRowsBeforeTotal = Math.max(a0.rowsBeforeTotalCount, p0.rowsBeforeTotalCount);
    const aktivaTbl = renderSideTable(AKTIVA_LINES, values, valuesPrev, prevColLabel, targetRowsBeforeTotal).html;
    const passivaTbl = renderSideTable(PASSIVA_LINES, values, valuesPrev, prevColLabel, targetRowsBeforeTotal).html;

    return `
<div class="bilanz-wrap">
  ${schemaWarnHtml}
  <div class="bilanz-grid">
    <div class="bilanz-side">
      <p class="bilanz-side-title">Aktiva</p>
      ${aktivaTbl}
    </div>
    <div class="bilanz-side">
      <p class="bilanz-side-title">Passiva</p>
      ${passivaTbl}
    </div>
  </div>
  <div class="bilanz-balance-check ${balanceClass}">${balanceText}</div>
  <div class="bilanz-meta"><span class="fa-dot fa-dot-orange"></span>Kontenrahmen: ${esc(chartLabel)} · ${overridesUsed ? `<strong>${overridesUsed}</strong> Konto-Overrides aktiv · ` : ''}Vorzeichen: Aktiva und Passiva als positive Salden. Null-Zeilen werden ausgeblendet. · Jahresergebnis wird aus der Bilanzdifferenz (Aktiva − Passiva) abgeleitet und in P.A.V eingebucht.</div>
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

    // TEMP TEST MODE — License-Gate deaktiviert. Wiederherstellen mit:
    //   if (!licenseOk()) {
    //     response.setHeader({ name: 'Content-Type', value: 'text/html; charset=utf-8' });
    //     response.write(renderLicenseErrorHtml());
    //     return;
    //   }

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
    let plug = 0;
    let notmapped = { aktiva: 0, passiva: 0, accounts: [] };

    let overridesUsed = 0;
    let schemaMissing = false;
    // --- Vorjahresvergleich ---
    // selPrevPeriod ist die Posting-Period mit gleichem Monat in (selYear - 1).
    // Wenn keine existiert (Mandant neu, keine Vorjahres-Buchungen), bleibt es
    // null und die zweite Spalte wird unterdrueckt.
    let selPrevPeriod = null;
    const findPreviousYearPeriod = (curPeriod) => {
      if (!curPeriod) return null;
      const curYear = parseInt(curPeriod.year_str, 10);
      const curMonth = parseInt(curPeriod.month_str, 10);
      if (!curYear || !curMonth) return null;
      for (const p of periods) {
        if (parseInt(p.year_str, 10) === curYear - 1
          && parseInt(p.month_str, 10) === curMonth) return p;
      }
      return null;
    };
    let valuesPrev = null;
    let aktivaTotalPrev = 0;
    let passivaTotalPrev = 0;
    let plugPrev = 0;
    if (selPeriod) {
      const listMap = queries.getLineListMap();
      schemaMissing = !!listMap.schemaMissing;

      const balances = queries.getBalanceSheetBalances(selPeriod.id, effectiveBook, selSub || '');
      const agg = aggregate(balances, chartOfAccounts, listMap);
      notmapped = agg.notmapped;
      overridesUsed = agg.overridesUsed;
      const fin = finalizeValues(agg.detail);
      values = fin.values;
      plug = fin.plug;
      aktivaTotal = values['AKT.t'] || 0;
      passivaTotal = values['PAS.t'] || 0;
      // Nach dem Plug sollten Aktiva und Passiva exakt uebereinstimmen.
      // Eine verbleibende Differenz > 50 Cent wuerde auf einen Bug oder ein
      // SQL-Daten-Problem hindeuten — wir flaggen das in der UI.
      balanceOk = Math.abs(aktivaTotal - passivaTotal) < 0.5;

      // Vorjahr — separate Query, separate Aggregation, separate Plug.
      // Notmapped/overridesUsed der Vorjahres-Aggregation werfen wir bewusst
      // weg, weil sie sich auf den Stand vor 12 Monaten beziehen und wenig
      // diagnostischen Wert haben.
      selPrevPeriod = findPreviousYearPeriod(selPeriod);
      if (selPrevPeriod) {
        try {
          const balancesPrev = queries.getBalanceSheetBalances(selPrevPeriod.id, effectiveBook, selSub || '');
          const aggPrev = aggregate(balancesPrev, chartOfAccounts, listMap);
          const finPrev = finalizeValues(aggPrev.detail);
          valuesPrev = finPrev.values;
          plugPrev = finPrev.plug;
          aktivaTotalPrev = valuesPrev['AKT.t'] || 0;
          passivaTotalPrev = valuesPrev['PAS.t'] || 0;
        } catch (e) {
          log.error({
            title: '4a_bilanz: Vorjahres-Aggregation fehlgeschlagen',
            details: 'period=' + selPrevPeriod.id + ' err=' + (e.message || String(e)),
          });
          valuesPrev = null;
          selPrevPeriod = null;
        }
      }
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
        valuesPrev,
        prevColLabel: selPrevPeriod ? `Vorjahr (${selPrevPeriod.enddate_str})` : 'Vorjahr',
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

    let pdfUrl = '', xlsxUrl = '', mappingUrl = '';
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
    try {
      mappingUrl = url.resolveScript({
        scriptId: 'customscript_4abilanz_mapping_sl',
        deploymentId: 'customdeploy_4abilanz_mapping_sl',
        returnExternalUrl: false,
      });
    } catch (_) { /* Mapping-Suitelet noch nicht deployed — Link wird weggelassen */ }

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
    <button type="submit" class="fa-btn-outline fa-topbar-btn">Reload</button>
    ${mappingUrl ? `<a href="${esc(mappingUrl)}" class="fa-btn-outline fa-topbar-btn">Konten-Mapping</a>` : ''}
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

    // Kein form.addSubmitButton — der "Reload"-Button in der Topbar (type="submit")
    // uebernimmt das Absenden. Spart den doppelten NetSuite-Default-Button.

    const htmlField = form.addField({
      id: 'custpage_bilanz_html',
      type: serverWidget.FieldType.INLINEHTML,
      label: ' ',
    });
    htmlField.defaultValue = selPeriod
      ? renderResultHtml({
          values, aktivaTotal, passivaTotal, balanceOk, plug,
          valuesPrev,
          prevColLabel: selPrevPeriod ? `Vorjahr (${selPrevPeriod.enddate_str})` : 'Vorjahr',
          notmappedAktiva: notmapped.aktiva, notmappedPassiva: notmapped.passiva,
          notmappedAccounts: notmapped.accounts, chartLabel,
          overridesUsed, schemaMissing,
        })
      : '<div class="bilanz-wrap"><div class="fa-card"><p>Bitte Periode auswählen.</p></div></div>';
    htmlField.updateLayoutType({ layoutType: serverWidget.FieldLayoutType.OUTSIDEBELOW });

    response.writePage(form);
  };

  return { onRequest };
});
