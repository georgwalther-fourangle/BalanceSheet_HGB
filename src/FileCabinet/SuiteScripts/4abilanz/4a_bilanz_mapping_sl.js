/**
 * © 2026 fourangle consulting gmbh. All rights reserved.
 *
 * Title: Bilanz HGB — Konten-Mapping (Edit-Modus)
 * Description: Editierbare Ansicht der Konto-Zu-Bilanzzeile-Zuordnung.
 *              Pro BS-Konto zeigt die Tabelle die automatische Zuordnung
 *              (aus dem aktiven Kontenrahmen) und das aktuell gesetzte
 *              Override (Custom Field `custrecord_4abilanz_line` am Account
 *              → Customlist `customlist_4abilanz_lines`).
 *
 *              Submit speichert nur Konten, deren Override sich seit dem
 *              GET geaendert hat — via `record.submitFields` direkt auf
 *              die Account-Records. Nach dem Save Redirect zum GET mit
 *              `saved=N`-Param fuer das Erfolgs-Banner.
 *
 * URL-Parameter:
 *   chart   skr03|skr04|nstype — Override fuer den Auto-Vorschlag
 *   saved   integer — vom POST-Handler gesetzt, triggert Status-Banner
 *
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */
define([
  'N/ui/serverWidget', 'N/query', 'N/record', 'N/url', 'N/runtime',
  'N/redirect', 'N/log',
  './4a_bilanz_style', './4a_bilanz_config',
], (serverWidget, query, record, url, runtime, redirect, log,
    style, config) => {

  const { esc } = style;
  // Wie im Haupt-Suitelet: Variant-spezifische Helpers werden PRO REQUEST aus
  // config.resolve(layout) gezogen, nicht hier module-level destrukturiert.

  // Selbe Liste wie in 4a_bilanz_queries.js — bewusst dupliziert, damit das
  // Mapping-Suitelet keine Abhaengigkeit zum queries-Modul braucht.
  const BS_ACCT_TYPES = [
    'Bank', 'AcctRec', 'OthCurrAsset', 'FixedAsset', 'OthAsset',
    'DeferExpense', 'Unbilled', 'AcctPay', 'CreditCard',
    'OthCurrLiab', 'LongTermLiab', 'DeferRevenue', 'Equity',
  ];

  const CHART_LABELS = { skr03: 'SKR03', skr04: 'SKR04', nstype: 'NetSuite-Kontotyp' };

  const runSql = (sql, params) => {
    const opts = { query: sql };
    if (params && params.length) opts.params = params;
    return query.runSuiteQL(opts).asMappedResults();
  };

  const isOverrideSchemaMissing = (e) => {
    const msg = String((e && e.message) || '');
    return msg.indexOf('custrecord_4abilanz_line') !== -1
      || msg.indexOf('customlist_4abilanz_lines') !== -1;
  };

  const getChartOfAccounts = () => {
    const v = String(runtime.getCurrentScript().getParameter({ name: 'custscript_4abilanz_map_chart' }) || '').toLowerCase();
    if (v === 'skr03' || v === 'skr04' || v === 'nstype') return v;
    return 'skr04';
  };

  const getChartLayout = () => {
    const v = String(runtime.getCurrentScript().getParameter({ name: 'custscript_4abilanz_map_layout' }) || '').toLowerCase();
    if (v === 'voll' || v === 'hgb_voll') return 'voll';
    return 'lean'; // Default — siehe Hinweis in 4a_bilanz_sl.js getChartLayout()
  };

  // Alle aktiven BS-Konten + aktueller Override (interne customvalue-ID).
  // Fehlt das Override-Schema beim Kunden (Bundle-Update steht aus), liefern
  // wir die Konten ohne override-Feld zurueck und markieren `schemaMissing`.
  const getAllBsAccounts = () => {
    const list = BS_ACCT_TYPES.map((t) => `'${t}'`).join(',');
    const buildSql = (withOverride) => `
      SELECT id,
             NVL(acctnumber, '') AS acctnumber,
             accountsearchdisplaynamecopy AS acctname,
             accttype${withOverride ? ',\n             custrecord_4abilanz_line AS override_line_id' : ",\n             '' AS override_line_id"}
      FROM account
      WHERE isinactive = 'F'
        AND accttype IN (${list})
      ORDER BY acctnumber, accountsearchdisplaynamecopy
    `;
    try {
      return { accounts: runSql(buildSql(true)), schemaMissing: false };
    } catch (e) {
      if (isOverrideSchemaMissing(e)) {
        log.audit({
          title: '4a_bilanz mapping: Override-Schema fehlt',
          details: 'Fallback auf Query ohne custrecord_4abilanz_line.',
        });
        return { accounts: runSql(buildSql(false)), schemaMissing: true };
      }
      throw e;
    }
  };

  // Live-Snapshot der customlist_4abilanz_lines.
  const getLineListMap = () => {
    let rows;
    try {
      rows = runSql(`
        SELECT id, scriptid, name
        FROM customlist_4abilanz_lines
        WHERE isinactive = 'F'
      `);
    } catch (e) {
      if (isOverrideSchemaMissing(e)) {
        return { idToScriptid: {}, scriptidToId: {}, idToName: {}, schemaMissing: true };
      }
      throw e;
    }
    const idToScriptid = {};
    const scriptidToId = {};
    const idToName = {};
    for (const r of rows) {
      const id = String(r.id);
      const sid = String(r.scriptid || '').toLowerCase();
      idToScriptid[id] = sid;
      scriptidToId[sid] = id;
      idToName[id] = r.name;
    }
    return { idToScriptid, scriptidToId, idToName, schemaMissing: false };
  };

  // selfUrl mit beliebigen URL-Parametern.
  const selfUrl = (extraParams) => url.resolveScript({
    scriptId: 'customscript_4abilanz_mapping_sl',
    deploymentId: 'customdeploy_4abilanz_mapping_sl',
    returnExternalUrl: false,
    params: extraParams || {},
  });

  /**
   * POST-Handler: liest acct_<id>=newCustomvalueId und orig_<id>=oldCustomvalueId
   * aus den Form-Params. Speichert nur Konten mit Aenderung.
   * Returns: { saved: number, errored: number }
   */
  const savePostedChanges = (parameters) => {
    let saved = 0;
    let errored = 0;
    for (const key in parameters) {
      if (!Object.prototype.hasOwnProperty.call(parameters, key)) continue;
      const m = /^acct_(\d+)$/.exec(key);
      if (!m) continue;
      const acctId = m[1];
      const newVal = parameters[key] || '';
      const oldVal = parameters['orig_' + acctId] || '';
      if (String(newVal) === String(oldVal)) continue; // keine Aenderung
      try {
        record.submitFields({
          type: record.Type.ACCOUNT,
          id: acctId,
          values: {
            // Leerstring loescht den Override → Aggregation faellt zurueck
            // auf den automatischen SKR/acctType-Lookup.
            custrecord_4abilanz_line: newVal || '',
          },
          options: { enableSourcing: false, ignoreMandatoryFields: true },
        });
        saved++;
      } catch (e) {
        log.error({
          title: '4a_bilanz mapping: submitFields failed account=' + acctId,
          details: 'newVal=' + newVal + ' oldVal=' + oldVal + ' err=' + (e.message || String(e))
            + (isOverrideSchemaMissing(e) ? ' (Schema fehlt — Bundle-Update erforderlich)' : ''),
        });
        errored++;
      }
    }
    return { saved, errored };
  };

  const onRequest = (context) => {
    const { request, response } = context;

    // TEMP TEST MODE — License-Gate auskommentiert. Vor Production wieder rein.

    // --- POST: Override-Aenderungen speichern, dann GET-Redirect mit Status ---
    if (request.method === 'POST') {
      const { saved, errored } = savePostedChanges(request.parameters);
      const overrideChart = String(request.parameters.chart || '').toLowerCase();
      redirect.redirect({
        url: selfUrl({
          saved: String(saved),
          errored: String(errored),
          chart: (overrideChart === 'skr03' || overrideChart === 'skr04' || overrideChart === 'nstype') ? overrideChart : '',
        }),
      });
      return;
    }

    // --- GET: Liste rendern ---
    // Variant aus Deployment-Param + URL-Override `?layout=lean|voll`.
    const overrideLayout = String(request.parameters.layout || '').toLowerCase();
    const chartLayout = (overrideLayout === 'lean' || overrideLayout === 'voll')
      ? overrideLayout
      : getChartLayout();
    const variant = config.resolve(chartLayout);
    const { lookupAccount, allLines, getLineByScriptid, getDetailLines } = variant;

    const chart = getChartOfAccounts();
    const overrideChart = String(request.parameters.chart || '').toLowerCase();
    const effectiveChart = (overrideChart === 'skr03' || overrideChart === 'skr04' || overrideChart === 'nstype')
      ? overrideChart : chart;
    const effectiveLabel = CHART_LABELS[effectiveChart] || effectiveChart;

    const listMap = getLineListMap();
    const { accounts, schemaMissing: acctSchemaMissing } = getAllBsAccounts();
    const schemaMissing = !!(listMap.schemaMissing || acctSchemaMissing);

    // Detail-Lines fuer das Dropdown — gruppiert nach side
    const detailLines = getDetailLines();
    const linesBySide = { aktiva: [], passiva: [] };
    for (const ln of detailLines) {
      // scriptid → customvalue-internal-id ueber listMap
      const internalId = listMap.scriptidToId[ln.scriptid];
      if (!internalId) continue; // sollte nicht passieren, wenn XML konsistent
      linesBySide[ln.side].push({
        id: internalId,
        label: listMap.idToName[internalId] || ln.label,
        configLabel: ln.label,
        configId: ln.id,
      });
    }

    // line-Lookup-Map fuer die Auto-Vorschlag-Anzeige
    const lineMap = {};
    for (const ln of allLines) lineMap[ln.id] = ln;

    // Resolution pro Konto: Auto-Vorschlag UND effective (mit Override)
    const rows = accounts.map((a) => {
      const overrideId = a.override_line_id ? String(a.override_line_id) : '';
      const overrideSid = overrideId ? listMap.idToScriptid[overrideId] : '';
      const overrideLine = overrideSid ? getLineByScriptid(overrideSid) : null;
      const autoLookup = lookupAccount(effectiveChart, a.acctnumber, a.accttype);
      const autoLine = autoLookup ? lineMap[autoLookup.lineId] : null;
      const effectiveLine = overrideLine || autoLine;
      return {
        accountId: String(a.id),
        acctnumber: a.acctnumber || '',
        acctname: a.acctname || '',
        accttype: a.accttype || '',
        overrideCustomvalueId: overrideId,
        overrideLineId: overrideLine ? overrideLine.id : '',
        overrideLineLabel: overrideLine ? overrideLine.label : '',
        autoLineId: autoLine ? autoLine.id : '',
        autoLineLabel: autoLine ? autoLine.label : '',
        autoSide: autoLookup ? autoLookup.side : '',
        effectiveLineId: effectiveLine ? effectiveLine.id : '',
        effectiveSide: effectiveLine ? effectiveLine.side : '',
        source: overrideLine ? 'override' : (autoLine ? 'auto' : 'unmapped'),
      };
    });

    // Sort: unmapped zuerst, dann Aktiva, dann Passiva, dann nach Bilanz-
    // Zeilen-Reihenfolge, dann Konto-Nummer
    const lineOrderIdx = {};
    allLines.forEach((ln, i) => { lineOrderIdx[ln.id] = i; });
    const sideOrder = (s) => s === '' ? 0 : (s === 'aktiva' ? 1 : 2);
    rows.sort((a, b) => {
      const so = sideOrder(a.effectiveSide) - sideOrder(b.effectiveSide);
      if (so) return so;
      const lo = (lineOrderIdx[a.effectiveLineId] || 9999) - (lineOrderIdx[b.effectiveLineId] || 9999);
      if (lo) return lo;
      return String(a.acctnumber).localeCompare(String(b.acctnumber));
    });

    // Counts
    const cnt = { total: rows.length, override: 0, auto: 0, unmapped: 0 };
    for (const r of rows) {
      if (r.source === 'override') cnt.override++;
      else if (r.source === 'auto') cnt.auto++;
      else cnt.unmapped++;
    }

    // Back-URL zur Bilanz
    let bilanzUrl = '';
    try {
      bilanzUrl = url.resolveScript({
        scriptId: 'customscript_4abilanz_sl',
        deploymentId: 'customdeploy_4abilanz_sl',
        returnExternalUrl: false,
      });
    } catch (_) { /* Bilanz-Deployment nicht aufloesbar */ }

    // Chart-Tabs
    const chartLink = (key, label) => {
      const active = key === effectiveChart;
      const cls = active ? 'fa-tab active' : 'fa-tab';
      return `<a href="${esc(selfUrl({ chart: key }))}" class="${cls}">${esc(label)}</a>`;
    };

    // Dropdown-Optionen pro Konto: <optgroup>-strukturiert.
    // Bei schemaMissing rendern wir das Dropdown disabled, damit der User
    // sieht, dass Editieren erst nach Bundle-Update funktioniert.
    const buildDropdown = (acctId, currentValue) => {
      if (schemaMissing) {
        return `<select disabled class="bilanz-mapping-select" title="Custom-Field fehlt — Bundle-Update erforderlich">
          <option>— nicht installiert —</option>
        </select>`;
      }
      const opt = (val, label, selected) =>
        `<option value="${esc(val)}"${selected ? ' selected' : ''}>${esc(label)}</option>`;
      const sideOpts = (side) => linesBySide[side].map((ln) =>
        opt(ln.id, ln.label, String(currentValue) === String(ln.id))).join('');
      return `<select name="acct_${esc(acctId)}" class="bilanz-mapping-select">
        ${opt('', '— Auto (Kontenrahmen) —', !currentValue)}
        <optgroup label="AKTIVA">${sideOpts('aktiva')}</optgroup>
        <optgroup label="PASSIVA">${sideOpts('passiva')}</optgroup>
      </select>`;
    };

    // Status-Banner aus URL-Param
    const savedParam = parseInt(request.parameters.saved || '0', 10) || 0;
    const erroredParam = parseInt(request.parameters.errored || '0', 10) || 0;
    let statusHtml = '';
    if (savedParam || erroredParam) {
      const parts = [];
      if (savedParam) parts.push(`${savedParam} Konto-Override${savedParam === 1 ? '' : 's'} gespeichert`);
      if (erroredParam) parts.push(`<strong>${erroredParam} Fehler</strong> (siehe Execution-Log)`);
      const cls = erroredParam ? 'bilanz-balance-check fail' : 'bilanz-balance-check ok';
      statusHtml = `<div class="${cls}">${parts.join(' · ')}</div>`;
    }
    if (schemaMissing) {
      statusHtml += style.renderNotice({
        variant: 'warn',
        iconChar: '!',
        title: 'Konto-Overrides nicht verfügbar in diesem NetSuite-Account',
        body: 'Das Custom Field <code>custrecord_4abilanz_line</code> und/oder die Customlist <code>customlist_4abilanz_lines</code> sind in diesem Account nicht installiert. Du siehst weiterhin alle Konten samt automatischer Zuordnung — manuelles Editieren ist deaktiviert, bis das Bundle-Update eingespielt ist.',
        steps: [
          '<strong>Setup → Customization → Install Bundle → List Installed Bundles</strong> öffnen.',
          '„4a Bilanz HGB" in der Liste finden und <strong>Update</strong> anklicken.',
          'Diese Seite neu laden — die Dropdowns werden aktiviert.',
        ],
      });
    }

    // Form als reines HTML mit POST auf die Suitelet-URL. NetSuite's
    // serverWidget.createForm umschliesst die INLINEHTML-Felder zwar mit
    // einem outer <form>, aber das tut hier keinen Schaden — die <select>-
    // und <input type="hidden">-Felder werden mitsubmitted, weil sie auf
    // der gleichen Seite liegen und gleiche `name`-Konvention nutzen.
    const form = serverWidget.createForm({ title: 'Bilanz HGB — Konten-Mapping' });

    // Versteckte Felder fuer Chart-Override und Original-Werte werden in
    // der INLINEHTML eingefuegt, damit sie vom POST mitkommen.
    const tableRowsHtml = rows.map((r) => {
      const sideClass = r.source === 'unmapped' ? 'unmapped'
        : (r.effectiveSide === 'aktiva' ? 'aktiva' : 'passiva');
      const sideLabel = r.effectiveSide === 'aktiva' ? 'Aktiva'
        : r.effectiveSide === 'passiva' ? 'Passiva' : '—';
      const autoCell = r.autoLineId
        ? `<span class="bilanz-auto-cell">${esc(r.autoLineId)} ${esc(r.autoLineLabel)}</span>`
        : `<span class="bilanz-auto-empty">—</span>`;
      const sourceBadge = r.source === 'override'
        ? `<span class="bilanz-source-badge override">Override</span>`
        : r.source === 'auto'
          ? `<span class="bilanz-source-badge auto">Auto</span>`
          : `<span class="bilanz-source-badge unmapped">offen</span>`;
      return `<tr class="${sideClass}">
        <td class="num">${esc(r.acctnumber || '—')}</td>
        <td>${esc(r.acctname)}</td>
        <td class="meta">${esc(r.accttype)}</td>
        <td class="side-cell">${esc(sideLabel)}</td>
        <td class="auto-col">${autoCell}</td>
        <td class="override-col">
          ${buildDropdown(r.accountId, r.overrideCustomvalueId)}
          <input type="hidden" name="orig_${esc(r.accountId)}" value="${esc(r.overrideCustomvalueId)}" />
        </td>
        <td>${sourceBadge}</td>
      </tr>`;
    }).join('');

    const topbarHtml = style.BASE_CSS + `
<div class="fa-topbar">
  <div class="fa-topbar-title">
    <h1>Bilanz HGB — Konten-Mapping</h1>
    <span class="fa-subtitle">${esc(effectiveLabel)}</span>
  </div>
  <div class="fa-topbar-actions">
    <button type="submit" class="fa-btn fa-topbar-btn">Override speichern</button>
    ${bilanzUrl ? `<a href="${esc(bilanzUrl)}" class="fa-btn-outline fa-topbar-btn">Zurück zur Bilanz</a>` : ''}
  </div>
</div>
<nav class="fa-tabs" style="margin: -6px 0 14px 0;">
  ${chartLink('skr03', 'SKR03')}
  ${chartLink('skr04', 'SKR04')}
  ${chartLink('nstype', 'NetSuite-Kontotyp')}
</nav>
<input type="hidden" name="chart" value="${esc(effectiveChart)}" />
${statusHtml}
<div class="bilanz-mapping-filter">
  <input type="search" placeholder="Filter Kto-Nr., Name, Typ, Bilanz-Zeile…"
         onkeyup="var q=this.value.toLowerCase();var trs=document.querySelectorAll('table.bilanz-mapping-table tbody tr');var n=0;for(var i=0;i&lt;trs.length;i++){var tr=trs[i];var match=tr.innerText.toLowerCase().indexOf(q)&gt;=0;tr.style.display=match?'':'none';if(match)n++;}var c=document.getElementById('bilanz-mapping-count');if(c)c.innerText=n+' / ${cnt.total} sichtbar';" />
  <span class="fa-muted-small" id="bilanz-mapping-count">${cnt.total} Konten</span>
  <span class="fa-muted-small">·</span>
  <span class="fa-muted-small"><span class="fa-dot fa-dot-orange"></span>${cnt.override} Override</span>
  <span class="fa-muted-small"><span class="fa-dot fa-dot-muted"></span>${cnt.auto} Auto</span>
  ${cnt.unmapped ? `<span class="fa-muted-small" style="color:#C00;"><span class="fa-dot fa-dot-red"></span>${cnt.unmapped} offen</span>` : ''}
</div>`;

    const themeField = form.addField({
      id: 'custpage_fa_theme',
      type: serverWidget.FieldType.INLINEHTML,
      label: ' ',
    });
    themeField.defaultValue = topbarHtml;
    themeField.updateLayoutType({ layoutType: serverWidget.FieldLayoutType.OUTSIDEABOVE });

    const tableField = form.addField({
      id: 'custpage_bilanz_mapping',
      type: serverWidget.FieldType.INLINEHTML,
      label: ' ',
    });
    tableField.defaultValue = `
<div class="bilanz-mapping-wrap">
  <table class="bilanz-mapping-table">
    <thead>
      <tr>
        <th>Kto-Nr.</th>
        <th>Name</th>
        <th>NS-Typ</th>
        <th>Seite</th>
        <th>Auto-Vorschlag</th>
        <th>Override</th>
        <th>Quelle</th>
      </tr>
    </thead>
    <tbody>${tableRowsHtml}</tbody>
  </table>
</div>`;
    tableField.updateLayoutType({ layoutType: serverWidget.FieldLayoutType.OUTSIDEBELOW });

    response.writePage(form);
  };

  return { onRequest };
});
