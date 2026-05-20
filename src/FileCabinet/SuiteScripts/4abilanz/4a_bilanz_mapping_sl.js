/**
 * © 2026 fourangle consulting gmbh. All rights reserved.
 *
 * Title: Bilanz HGB — Konten-Mapping-View
 * Description: Read-only-Ansicht: zeigt fuer jedes BS-Konto in NetSuite,
 *              welcher Bilanz-Zeile es im aktuell gewaehlten Kontenrahmen
 *              (SKR03/SKR04/NS-Typ) zugeordnet wird. Hilft beim Debuggen
 *              von Konten, die als "nicht zugeordnet" auftauchen oder
 *              auf der falschen Bilanz-Zeile landen.
 *
 *              Funktional analog zum BWA-Mapper, aber ohne Editier-Modus —
 *              die MVP haelt das Mapping in 4a_bilanz_config.js. Spaetere
 *              Versionen koennen ein customlist+custrecord-Schema einfuehren
 *              und an dieser Stelle Dropdowns einblenden.
 *
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */
define([
  'N/ui/serverWidget', 'N/query', 'N/url', 'N/runtime', 'N/log',
  './4a_bilanz_style', './4a_bilanz_config',
], (serverWidget, query, url, runtime, log, style, config) => {

  const { esc } = style;
  const { lookupAccount, allLines } = config;

  // Akzeptierte BS-Konto-Typen — identisch zur Liste in 4a_bilanz_queries.js.
  // GuV-Typen (Income/Expense/COGS) sind hier bewusst nicht enthalten, weil
  // diese in der Bilanz nur via Plug auf P.A.V landen, nicht ueber direkte
  // Konto-Zuordnung.
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

  // Eigener Param-Slug fuer dieses Suitelet, damit das Mapping-Deployment
  // unabhaengig vom Haupt-Bilanz-Deployment geschaltet werden kann (z.B.
  // Bilanz auf SKR03, Mapping zur Kontrolle auf SKR04). scriptid's muessen
  // global eindeutig sein — daher der `_map_chart`-Suffix.
  const getChartOfAccounts = () => {
    const v = String(runtime.getCurrentScript().getParameter({ name: 'custscript_4abilanz_map_chart' }) || '').toLowerCase();
    if (v === 'skr03' || v === 'skr04' || v === 'nstype') return v;
    return 'skr04';
  };

  // Alle BS-Konten in einer Subsidiary-unabhaengigen Liste — Mapping ist
  // konto-global, eine Subsidiary-Selektion ist hier nicht relevant.
  const getAllBsAccounts = () => {
    const list = BS_ACCT_TYPES.map((t) => `'${t}'`).join(',');
    return runSql(`
      SELECT id,
             NVL(acctnumber, '') AS acctnumber,
             accountsearchdisplaynamecopy AS acctname,
             accttype
      FROM account
      WHERE isinactive = 'F'
        AND accttype IN (${list})
      ORDER BY acctnumber, accountsearchdisplaynamecopy
    `);
  };

  const onRequest = (context) => {
    const { request, response } = context;

    // TEMP TEST MODE — License-Gate auch hier deaktiviert, parallel zum
    // Haupt-Suitelet. Vor Production reaktivieren.

    const chart = getChartOfAccounts();
    const chartLabel = CHART_LABELS[chart] || chart;

    // Erlaubt einen Override via URL-Parameter `chart=skr03|skr04|nstype`
    // zum schnellen Vergleich, ohne den Deployment-Param anfassen zu muessen.
    const overrideChart = String(request.parameters.chart || '').toLowerCase();
    const effectiveChart = (overrideChart === 'skr03' || overrideChart === 'skr04' || overrideChart === 'nstype')
      ? overrideChart : chart;
    const effectiveLabel = CHART_LABELS[effectiveChart] || effectiveChart;

    // line-Lookup-Map fuer schnellen Label-Zugriff je lineId
    const lineMap = {};
    for (const ln of allLines) lineMap[ln.id] = ln;

    // Mapping-Resolution pro Konto
    const accounts = getAllBsAccounts();
    const rows = accounts.map((a) => {
      const lookup = lookupAccount(effectiveChart, a.acctnumber, a.accttype);
      const line = lookup ? lineMap[lookup.lineId] : null;
      return {
        acctnumber: a.acctnumber,
        acctname: a.acctname,
        accttype: a.accttype,
        lineId: lookup ? lookup.lineId : '',
        lineLabel: line ? line.label : '',
        lineSide: lookup ? lookup.side : '',
      };
    });

    // Counts fuer die Statuszeile
    const cnt = { total: rows.length, aktiva: 0, passiva: 0, unmapped: 0 };
    for (const r of rows) {
      if (r.lineSide === 'aktiva') cnt.aktiva++;
      else if (r.lineSide === 'passiva') cnt.passiva++;
      else cnt.unmapped++;
    }

    // Sort: zuerst nicht-zugeordnete (rot, oben), dann Aktiva, dann Passiva,
    // jeweils innerhalb sortiert nach Bilanz-Zeilen-Reihenfolge der config,
    // dann nach Konto-Nummer.
    const lineOrderIdx = {};
    allLines.forEach((ln, i) => { lineOrderIdx[ln.id] = i; });
    const sideOrder = (s) => s === '' ? 0 : (s === 'aktiva' ? 1 : 2);
    rows.sort((a, b) => {
      const so = sideOrder(a.lineSide) - sideOrder(b.lineSide);
      if (so) return so;
      const lo = (lineOrderIdx[a.lineId] || 9999) - (lineOrderIdx[b.lineId] || 9999);
      if (lo) return lo;
      return String(a.acctnumber).localeCompare(String(b.acctnumber));
    });

    // Back-URL zur Bilanz
    let bilanzUrl = '';
    try {
      bilanzUrl = url.resolveScript({
        scriptId: 'customscript_4abilanz_sl',
        deploymentId: 'customdeploy_4abilanz_sl',
        returnExternalUrl: false,
      });
    } catch (_) { /* Bilanz-Deployment noch nicht aufloesbar */ }

    // Self-URL fuer Chart-Overrides
    const selfUrl = (chartOverride) => url.resolveScript({
      scriptId: 'customscript_4abilanz_mapping_sl',
      deploymentId: 'customdeploy_4abilanz_mapping_sl',
      returnExternalUrl: false,
      params: chartOverride ? { chart: chartOverride } : {},
    });

    const chartLink = (key, label) => {
      const active = key === effectiveChart;
      const cls = active ? 'fa-tab active' : 'fa-tab';
      return `<a href="${esc(selfUrl(key))}" class="${cls}">${esc(label)}</a>`;
    };

    const form = serverWidget.createForm({ title: 'Bilanz HGB — Konten-Mapping' });

    const renderRowsHtml = () => rows.map((r) => {
      const cls = !r.lineSide ? 'unmapped' : r.lineSide;
      const sideLabel = r.lineSide === 'aktiva' ? 'Aktiva' : r.lineSide === 'passiva' ? 'Passiva' : '—';
      const lineDisplay = r.lineId
        ? `${esc(r.lineId)} — ${esc(r.lineLabel)}`
        : '<em style="font-style:normal;color:#C00;">nicht zugeordnet</em>';
      return `<tr class="${cls}">
        <td class="num">${esc(r.acctnumber || '—')}</td>
        <td>${esc(r.acctname || '')}</td>
        <td class="meta">${esc(r.accttype || '')}</td>
        <td class="side-cell">${esc(sideLabel)}</td>
        <td>${lineDisplay}</td>
      </tr>`;
    }).join('');

    const topbarHtml = style.BASE_CSS + `
<div class="fa-topbar">
  <div class="fa-topbar-title">
    <h1>Bilanz HGB — Konten-Mapping</h1>
    <span class="fa-subtitle">${esc(effectiveLabel)}</span>
  </div>
  <div class="fa-topbar-actions">
    ${bilanzUrl ? `<a href="${esc(bilanzUrl)}" class="fa-btn-outline fa-topbar-btn">Zurück zur Bilanz</a>` : ''}
  </div>
</div>
<nav class="fa-tabs" style="margin: -6px 0 14px 0;">
  ${chartLink('skr03', 'SKR03')}
  ${chartLink('skr04', 'SKR04')}
  ${chartLink('nstype', 'NetSuite-Kontotyp')}
</nav>
<div class="bilanz-mapping-filter">
  <input type="search" placeholder="Filter Kto-Nr., Name, Typ, Bilanz-Zeile…"
         onkeyup="var q=this.value.toLowerCase();var trs=document.querySelectorAll('table.bilanz-mapping-table tbody tr');var n=0;for(var i=0;i&lt;trs.length;i++){var tr=trs[i];var match=tr.innerText.toLowerCase().indexOf(q)&gt;=0;tr.style.display=match?'':'none';if(match)n++;}var c=document.getElementById('bilanz-mapping-count');if(c)c.innerText=n+' / ${cnt.total} sichtbar';" />
  <span class="fa-muted-small" id="bilanz-mapping-count">${cnt.total} Konten</span>
  <span class="fa-muted-small">·</span>
  <span class="fa-muted-small"><span class="fa-dot fa-dot-orange"></span>${cnt.aktiva} Aktiva</span>
  <span class="fa-muted-small"><span class="fa-dot fa-dot-muted"></span>${cnt.passiva} Passiva</span>
  ${cnt.unmapped ? `<span class="fa-muted-small" style="color:#C00;"><span class="fa-dot fa-dot-red"></span>${cnt.unmapped} ohne Zuordnung</span>` : ''}
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
        <th>Bilanz-Zeile</th>
      </tr>
    </thead>
    <tbody>${renderRowsHtml()}</tbody>
  </table>
</div>`;
    tableField.updateLayoutType({ layoutType: serverWidget.FieldLayoutType.OUTSIDEBELOW });

    response.writePage(form);
  };

  return { onRequest };
});
