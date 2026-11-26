// Google OIDC discovery publishes this fixed RS256 key set. Never use a URL supplied by a token.
const GOOGLE_JWKS = 'https://www.googleapis.com/oauth2/v3/certs';

function unsignedHex_(bytes) {
  return bytes.map(b => (b & 255).toString(16).padStart(2, '0')).join('');
}
function digestHex_(text) {
  return unsignedHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8));
}
function tokenError_() { fail_('AUTH', '로그인이 만료되었거나 계정을 확인할 수 없어. 다시 로그인해줘.'); }
function decodePart_(s) {
  if (typeof s !== 'string' || !/^[A-Za-z0-9_-]+$/.test(s) || s.length % 4 === 1) tokenError_();
  try { return Utilities.base64DecodeWebSafe(s + '='.repeat((4 - s.length % 4) % 4)); }
  catch (_) { tokenError_(); }
}
function claimsJson_(encoded) {
  try { return JSON.parse(Utilities.newBlob(decodePart_(encoded)).getDataAsString('UTF-8')); }
  catch (_) { tokenError_(); }
}
function signingKey_(kid) {
  const cache = CacheService.getScriptCache(), key = 'google-rs256-v1';
  let set = JSON.parse(cache.get(key) || 'null');
  const matching = s => s.keys.find(k => k.kid === kid && k.kty === 'RSA' && k.alg === 'RS256' && (!k.use || k.use === 'sig'));
  if (set && (matching(set) || Date.now() - set.fetched < 60000)) return matching(set);
  let result;
  try { result = UrlFetchApp.fetch(GOOGLE_JWKS, {muteHttpExceptions:true, followRedirects:false}); }
  catch (_) { fail_('KEYS', '지금 Google 서명 키를 확인할 수 없어. 잠시 뒤 다시 시도해줘.'); }
  if (result.getResponseCode() !== 200) fail_('KEYS', 'Google 서명 키 조회에 실패했어.');
  const keys = JSON.parse(result.getContentText()).keys;
  if (!Array.isArray(keys) || !keys.length) fail_('KEYS', 'Google 서명 키 응답을 확인할 수 없어.');
  set = {keys, fetched:Date.now()};
  const headers = result.getAllHeaders();
  const header = Object.keys(headers).find(h => h.toLowerCase() === 'cache-control');
  const maxAge = String(headers[header] || '').match(/max-age=(\d+)/i);
  if (maxAge && Number(maxAge[1]) > 0) cache.put(key, JSON.stringify(set), Math.min(21600, Number(maxAge[1])));
  return matching(set);
}
// RFC 8017 §§8.2 and 9.2. Verify the complete fixed-width PKCS#1 v1.5 encoding for SHA-256.
function verifiesRs256_(input, signature, jwk) {
  if (!jwk) return false;
  const modulus = decodePart_(jwk.n), sig = decodePart_(signature);
  if (modulus.length < 256 || modulus.length > 512 || sig.length !== modulus.length) return false;
  const n = BigInt('0x' + unsignedHex_(modulus));
  let e = BigInt('0x' + unsignedHex_(decodePart_(jwk.e))), base = BigInt('0x' + unsignedHex_(sig));
  if (base >= n || e < 3n || e > 0xffffffffn || !(e & 1n)) return false;
  let result = 1n;
  while (e > 0n) {
    if (e & 1n) result = (result * base) % n;
    e >>= 1n;
    base = (base * base) % n;
  }
  const digestInfo = '3031300d060960864801650304020105000420' + digestHex_(input);
  const expected = '0001' + 'ff'.repeat(modulus.length - digestInfo.length / 2 - 3) + '00' + digestInfo;
  return result.toString(16).padStart(modulus.length * 2, '0') === expected;
}
function verifiedIdentity_(token, clientId) {
  if (typeof token !== 'string' || token.length > 12000 || !clientId) tokenError_();
  const parts = token.split('.');
  if (parts.length !== 3) tokenError_();
  const header = claimsJson_(parts[0]);
  if (!header || header.alg !== 'RS256' || header.crit || !/^[a-zA-Z0-9_-]{1,128}$/.test(header.kid || '')) tokenError_();
  if (!verifiesRs256_(parts[0] + '.' + parts[1], parts[2], signingKey_(header.kid))) tokenError_();
  const c = claimsJson_(parts[1]), now = Math.floor(Date.now() / 1000);
  if (!c || !['https://accounts.google.com','accounts.google.com'].includes(c.iss) ||
      c.aud !== clientId || (c.azp !== undefined && c.azp !== clientId) ||
      !Number.isInteger(c.exp) || c.exp <= now || !Number.isInteger(c.iat) || c.iat > now + 120 ||
      c.exp <= c.iat || (c.nbf !== undefined && (!Number.isInteger(c.nbf) || c.nbf > now)) ||
      typeof c.sub !== 'string' || !/^[\w.-]{1,255}$/.test(c.sub) ||
      c.email_verified !== true || typeof c.email !== 'string' || !/^[^\s@,;]+@[^\s@,;]+$/.test(c.email)) tokenError_();
  return {sub:c.sub, email:c.email.toLowerCase(), exp:c.exp,
    authoritative:/@gmail\.com$/i.test(c.email) || (typeof c.hd === 'string' && Boolean(c.hd))};
}
function groupActor_(token) {
  const config = PropertiesService.getScriptProperties();
  if (!config.getProperty('GROUP_EMAIL') || !config.getProperty('GOOGLE_CLIENT_ID')) fail_('CONFIG', '운영자가 Google 그룹과 로그인 설정을 완료해야 해.');
  const person = verifiedIdentity_(token, config.getProperty('GOOGLE_CLIENT_ID'));
  let member;
  try {
    const group = GroupsApp.getGroupByEmail(config.getProperty('GROUP_EMAIL'));
    const roles = GroupsApp.Role;
    member = group.hasUser(person.email) && [roles.MEMBER, roles.MANAGER, roles.OWNER].includes(group.getRole(person.email));
  } catch (_) { fail_('GROUP_UNAVAILABLE', '연구실 그룹의 구성원 정보를 확인할 수 없어. 운영자에게 알려줘.'); }
  if (!member) fail_('MEMBER', '연구실 Google 그룹의 직접 구성원만 글을 쓸 수 있어.');
  person.key = 'google:' + person.sub;
  person.isProfessor = config.getProperty('PROFESSOR_SUB') === person.sub;
  person.isAdmin = (config.getProperty('ADMIN_SUBS') || '').split(',').map(s => s.trim()).includes(person.sub);
  return person;
}
// Google may only have verified a third-party mailbox when the Google account was created.
function mailbox_(actor, op, code) {
  if (actor.authoritative) return;
  const cache = CacheService.getScriptCache();
  const key = 'mail:' + digestHex_(actor.sub + '|' + actor.email), proof = key + ':verified';
  if (cache.get(proof)) return;
  if (op !== 'sendCode' && op !== 'verifyCode') fail_('MAIL_REQUIRED', '이 Google 계정은 외부 메일 주소를 사용해. 메일함을 한 번 확인해줘.');
  withLock_(() => {
    if (cache.get(proof)) return;
    const ticket = JSON.parse(cache.get(key) || 'null');
    if (op === 'sendCode') {
      if (ticket && Date.now() - ticket.sent < 120000) fail_('RATE', '확인 메일을 보냈어. 2분 후에 다시 요청할 수 있어.');
      limit_(key, 4, 3600000);
      const secret = Utilities.getUuid().replace(/-/g,'').slice(0,8).toUpperCase();
      const challenge = {sent:Date.now(), tries:0, hash:digestHex_(key + secret)};
      cache.put(key, JSON.stringify(challenge), 600);
      try { MailApp.sendEmail(actor.email, 'Son Lab 겨울 우체국 메일 확인', '확인 코드 ' + secret + '\n10분 안에 트리 화면에 입력해줘.'); }
      catch (_) { cache.remove(key); fail_('MAIL', '확인 메일을 보내지 못했어. 잠시 뒤 다시 시도해줘.'); }
      return;
    }
    if (!ticket || Date.now() - ticket.sent >= 600000 || ticket.tries >= 5) fail_('MAIL_CODE', '확인 코드를 다시 요청해줘.');
    if (typeof code !== 'string' || digestHex_(key + code.trim().toUpperCase()) !== ticket.hash) {
      ticket.tries++; cache.put(key, JSON.stringify(ticket), Math.max(1, Math.ceil((ticket.sent + 600000 - Date.now()) / 1000)));
      fail_('MAIL_CODE', '메일에 적힌 확인 코드를 다시 확인해줘.');
    }
    cache.put(proof, '1', Math.min(3600, Math.max(1,actor.exp - Math.floor(Date.now()/1000))));
    cache.remove(key);
  });
}
