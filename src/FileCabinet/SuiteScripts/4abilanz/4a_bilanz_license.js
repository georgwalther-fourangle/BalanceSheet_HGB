/**
 * © 2026 fourangle consulting gmbh. All rights reserved.
 *
 * Bilanz HGB — License-Gate (geteilt zwischen 4a_bilanz_sl.js und
 * 4a_bilanz_mapping_sl.js).
 *
 * Modell:
 *   - Lizenzserver (Fourangle-Account 11672894) liefert per HTTP-GET ein Blob
 *     mit allen aktiven Lizenz-Hashes.
 *   - Hash = SHA256(accountId + '|' + LICENSE_PRODUCT_KEY) (UTF-8, hex).
 *   - Pro Kunde wird ein "4a Customer license"-Record im Fourangle-Account
 *     gefuehrt; das License-Key-Feld traegt eben diesen SHA256-Hash.
 *   - Vergleich gegen den Server-Body ist case-insensitiv.
 *
 * @NApiVersion 2.1
 */
define(['N/runtime', 'N/https', 'N/cache', 'N/crypto', 'N/encode', 'N/log'],
       (runtime, https, cache, crypto, encode, log) => {

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
      const response = https.get({ url: LICENSE_URL + '&account=' + encodeURIComponent(accountId) + '&product=' + encodeURIComponent(LICENSE_PRODUCT_KEY) });
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

  return { licenseOk, renderLicenseErrorHtml };
});
