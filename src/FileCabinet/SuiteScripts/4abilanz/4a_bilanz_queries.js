/**
 * @NApiVersion 2.1
 *
 * SuiteQL-Queries fuer die Bilanz HGB.
 *
 * Konzept:
 *   - Eine Bilanz ist eine Stichtagsgroesse: Saldo aller bestandswirksamen
 *     Konten zum Ende einer gewaehlten Posting-Periode (inkl. dieser).
 *   - GuV-Konten (Income/Expense/...) werden NICHT direkt in der Bilanz
 *     gezeigt — sie laufen ueber das Jahresergebnis (P.A.V) bzw. den
 *     Gewinn-/Verlustvortrag (P.A.IV). Das berechnet das Suitelet nach
 *     der Aggregation; die Query liefert nur die Rohdaten je BS-Konto.
 *
 * Datenmodell:
 *   - TransactionAccountingLine (tal): die accounting-book-spezifischen
 *     Debit/Credit-Buchungen. accountingbook filtert das Buch.
 *   - Transaction (t): liefert postingperiod, posting-Flag.
 *   - TransactionLine (tls): liefert subsidiary (nicht in tal exponiert).
 *   - Account (a): liefert acctnumber, acctType, name.
 *
 * Vorzeichen:
 *   Liefert pro Konto: balance = SUM(debit) − SUM(credit).
 *   Soll-Salden (Aktiva) sind positiv, Haben-Salden (Passiva) sind negativ.
 *   Das Suitelet negiert Passiva-Werte, sodass beide Seiten positiv erscheinen.
 */
define(['N/query', 'N/log'], (query, log) => {

  const runSql = (sql, params) => {
    const opts = { query: sql };
    if (params && params.length) opts.params = params;
    return query.runSuiteQL(opts).asMappedResults();
  };

  // True, wenn der Fehler "Field 'custrecord_4abilanz_line' ... not found"
  // kommt — bedeutet, dass das Override-Custom-Field beim Kunden noch nicht
  // installiert ist (Bundle-Update steht aus).
  const isOverrideSchemaMissing = (e) => {
    const msg = String((e && e.message) || '');
    return msg.indexOf('custrecord_4abilanz_line') !== -1
      || msg.indexOf('customlist_4abilanz_lines') !== -1;
  };

  /**
   * Posting-Perioden (Monate). Liefert id, periodname, startdate (DD.MM.YYYY),
   * enddate (DD.MM.YYYY), closed (T|F). Quartale und Jahre werden gefiltert.
   */
  const getPostingPeriods = () => runSql(`
    SELECT id, periodname,
           TO_CHAR(startdate, 'DD.MM.YYYY') AS startdate_str,
           TO_CHAR(enddate,   'DD.MM.YYYY') AS enddate_str,
           TO_CHAR(startdate, 'YYYY')       AS year_str,
           TO_CHAR(startdate, 'MM')         AS month_str,
           closed
    FROM accountingperiod
    WHERE isquarter = 'F' AND isyear = 'F' AND isadjust = 'F' AND isposting = 'T' AND isinactive = 'F'
    ORDER BY startdate
  `);

  const getSubsidiaries = () => runSql(`
    SELECT id, name, fullname, legalname
    FROM subsidiary
    WHERE isinactive = 'F' AND iselimination = 'F'
    ORDER BY fullname
  `);

  const getAccountingBooks = () => {
    try {
      return runSql(`
        SELECT id, name
        FROM accountingbook
        WHERE isinactive = 'F'
        ORDER BY id
      `);
    } catch (e) {
      // Single-Book-Accounts haben die Tabelle nicht in SuiteQL exponiert —
      // dann fallen wir auf das Default-Book (ID 1) zurueck.
      return [{ id: '1', name: 'Primary Accounting Book' }];
    }
  };

  /**
   * Liefert alle relevanten Konten zu Stichtag-Bilanz (BS-Typen + Equity).
   * GuV-Konten werden separat fuer das Jahresergebnis abgefragt (s. u.).
   */
  const BS_ACCT_TYPES = [
    'Bank', 'AcctRec', 'OthCurrAsset', 'FixedAsset', 'OthAsset',
    'DeferExpense', 'Unbilled', 'AcctPay', 'CreditCard',
    'OthCurrLiab', 'LongTermLiab', 'DeferRevenue', 'Equity',
  ];
  const PL_ACCT_TYPES = ['Income', 'Expense', 'OthIncome', 'OthExpense', 'COGS'];

  /**
   * Closing balances aller Bilanz-Konten zum Ende der gewaehlten Periode:
   * Summe (debit − credit) ueber alle Postings mit posting-period startdate
   * <= periodEndStartdate. (Wir vergleichen ueber startdate der jeweiligen
   * Periode des Transactions-Postings — das ist robust bei Quartal/Adjust-
   * Splits, weil nur isposting='T' Monatsperioden teilnehmen.)
   *
   * Parameter:
   *   periodEndId    — id der zuletzt einbezogenen Posting-Periode
   *   accountingBook — id des Buchs (Default Book id = 1)
   *   subsidiaryId   — id der Subsidiary, oder leer/null fuer 'Alle Subs'
   *
   * Liefert: [{ account_id, acctnumber, acctname, accttype, balance }]
   */
  const getBalanceSheetBalances = (periodEndId, accountingBook, subsidiaryId) => {
    const acctTypeList = BS_ACCT_TYPES.map((t) => `'${t}'`).join(',');
    const params = [String(periodEndId), String(accountingBook)];
    let subClause = '';
    if (subsidiaryId) {
      subClause = `
        AND EXISTS (
          SELECT 1 FROM transactionline tls
          WHERE tls.transaction = tal.transaction
            AND tls.id = tal.transactionline
            AND tls.subsidiary = ?
        )`;
      params.push(String(subsidiaryId));
    }
    // Erster Versuch: Query MIT Override-Spalte. Faellt das mit "Field not
    // found" durch, ist das Bundle beim Kunden noch nicht komplett — wir
    // fallen auf eine Query OHNE Override zurueck und liefern override_line_id
    // immer als leer. Die Bilanz funktioniert dann wie vor dem Override-
    // Feature (reines SKR/acctType-Mapping).
    const buildSelect = (withOverride) => `
      SELECT a.id              AS account_id,
             NVL(a.acctnumber, '') AS acctnumber,
             a.accountsearchdisplaynamecopy AS acctname,
             a.accttype        AS accttype,
             ${withOverride ? 'a.custrecord_4abilanz_line AS override_line_id,' : "'' AS override_line_id,"}
             SUM(NVL(tal.debit, 0) - NVL(tal.credit, 0)) AS balance
      FROM transactionaccountingline tal
      INNER JOIN transaction t ON t.id = tal.transaction
      INNER JOIN account a ON a.id = tal.account
      INNER JOIN accountingperiod pTx ON pTx.id = t.postingperiod
      INNER JOIN accountingperiod pEnd ON pEnd.id = ?
      WHERE tal.posting = 'T'
        AND t.posting = 'T'
        AND tal.accountingbook = ?
        AND a.accttype IN (${acctTypeList})
        AND pTx.startdate <= pEnd.enddate
        ${subClause}
      GROUP BY a.id, NVL(a.acctnumber, ''), a.accountsearchdisplaynamecopy, a.accttype${withOverride ? ', a.custrecord_4abilanz_line' : ''}
    `;
    try {
      return runSql(buildSelect(true), params);
    } catch (e) {
      if (isOverrideSchemaMissing(e)) {
        log.audit({
          title: '4a_bilanz: Override-Schema fehlt — Fallback auf Query ohne custrecord_4abilanz_line',
          details: 'Bitte Bundle-Update einspielen, damit Konto-Overrides greifen.',
        });
        return runSql(buildSelect(false), params);
      }
      throw e;
    }
  };

  /**
   * Liest die customlist_4abilanz_lines live aus NetSuite und liefert eine
   * Mapping-Tabelle:
   *   { idToScriptid: { '12345': 'val_a_ii_3', … },
   *     scriptidToId: { 'val_a_ii_3': '12345', … },
   *     idToName:     { '12345': 'A.II.3 BGA / Andere Anlagen', … } }
   * Das ist noetig, weil das custrecord-Feld am Account die *interne ID* des
   * Customvalues speichert (numerisch). Erst ueber die scriptid kommen wir
   * zurueck zur stabilen Code-ID in 4a_bilanz_config.js.
   */
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
        log.audit({
          title: '4a_bilanz: customlist_4abilanz_lines fehlt — leerer ListMap',
          details: 'Bitte Bundle-Update einspielen.',
        });
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

  /**
   * Net P&L: Differenz Income − Expense ueber alle Postings im aktuellen FY
   * (FY-Start = der erste isposting-Monat des Jahres, in dem die Periode
   * periodEndId liegt; bestimmt ueber den year_str-Vergleich mit MIN(startdate)
   * der gleichen Jahres-Perioden).
   *
   * Wir liefern das Jahresergebnis als einen Skalar zurueck — es wird in
   * Bilanz-Zeile P.A.V (Jahresueberschuss/-fehlbetrag) eingetragen.
   * Vorzeichen: Gewinn → positiv (Eigenkapital steigt), Verlust → negativ.
   *
   * Hinweis: NetSuite verwendet das fiscalcalendar der subsidiary — der hier
   * verwendete Ansatz "selbe year_str wie periodEnd" ist die DATEV-uebliche
   * Heuristik fuer Kalenderjahr-FY. Bei abweichenden Geschaeftsjahren muesste
   * man das fiscalcalendar abfragen; das ist v1 explizit nicht unterstuetzt.
   */
  const getCurrentFyNetIncome = (periodEndId, accountingBook, subsidiaryId) => {
    const acctTypeList = PL_ACCT_TYPES.map((t) => `'${t}'`).join(',');
    const params = [String(periodEndId), String(accountingBook)];
    let subClause = '';
    if (subsidiaryId) {
      subClause = `
        AND EXISTS (
          SELECT 1 FROM transactionline tls
          WHERE tls.transaction = tal.transaction
            AND tls.id = tal.transactionline
            AND tls.subsidiary = ?
        )`;
      params.push(String(subsidiaryId));
    }
    const rows = runSql(`
      SELECT SUM(NVL(tal.credit, 0) - NVL(tal.debit, 0)) AS net_pl
      FROM transactionaccountingline tal
      INNER JOIN transaction t ON t.id = tal.transaction
      INNER JOIN account a ON a.id = tal.account
      INNER JOIN accountingperiod pTx ON pTx.id = t.postingperiod
      INNER JOIN accountingperiod pEnd ON pEnd.id = ?
      WHERE tal.posting = 'T'
        AND t.posting = 'T'
        AND tal.accountingbook = ?
        AND a.accttype IN (${acctTypeList})
        AND TO_CHAR(pTx.startdate, 'YYYY') = TO_CHAR(pEnd.startdate, 'YYYY')
        AND pTx.startdate <= pEnd.enddate
        ${subClause}
    `, params);
    if (!rows.length) return 0;
    return parseFloat(rows[0].net_pl) || 0;
  };

  return {
    BS_ACCT_TYPES,
    PL_ACCT_TYPES,
    getPostingPeriods,
    getSubsidiaries,
    getAccountingBooks,
    getBalanceSheetBalances,
    getCurrentFyNetIncome,
    getLineListMap,
  };
});
