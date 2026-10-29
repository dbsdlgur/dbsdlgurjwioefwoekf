
// 화면과 무관한 계산(S-4.1, S-4.2, S-5). Node 단위 테스트가 이 블록만 떼어 실행한다.
window.VaultPure = (() => {
 // 출금일까지 남은 날. 이번 달이 지났으면 다음 달, 그 달에 없는 날이면 말일.
 function dday(payDay, today = new Date()) {
  const day = Number(payDay);
  if (payDay === '' || payDay == null || !Number.isInteger(day) || day < 1 || day > 31) return '';
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const due = offset => {
   const last = new Date(start.getFullYear(), start.getMonth() + offset + 1, 0).getDate();
   return new Date(start.getFullYear(), start.getMonth() + offset, Math.min(day, last));
  };
  let target = due(0);
  if (target < start) target = due(1);
  const n = Math.round((target - start) / 86400000);
  return n === 0 ? 'D-day' : 'D-' + n;
 }
 const formatMoney = n => (Number(n) || 0).toLocaleString('en-US');
 const parseMoney = text => Number(String(text ?? '').replace(/[^\d]/g, '')) || 0;
 function isValidDate(text) {
  if (text === '') return true;
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(text);
  if (!m) return false;
  if (m[2] === undefined) return true;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), m[3] && Number(m[3])];
  if (mo < 1 || mo > 12) return false;
  return m[3] === undefined || (d >= 1 && d <= new Date(y, mo, 0).getDate());
 }
 // 표시용 정렬. 원본 배열은 바꾸지 않는다. 빈 날짜는 항상 맨 뒤.
 function sortByDate(rows, dir = 'desc') {
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
   if (!a.date || !b.date) return !a.date - !b.date;
   return a.date < b.date ? -sign : a.date > b.date ? sign : 0;
  });
 }
 // 공백으로 나눈 단어를 분류·사이트·링크·비고에서 찾는다. ID/PW는 제외한다.
 const SEARCH_FIELDS = ['category', 'site', 'link', 'note1', 'note2', 'note3'];
 function matchesSearch(row, query) {
  const terms = String(query ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  return terms.every(term => SEARCH_FIELDS.some(field => String(row[field] ?? '').toLowerCase().includes(term)));
 }
 function migratePasswordLinks(input) {
  const row = { ...input };
  const links = String(row.link ?? '').split('\n').map(value => value.trim()).filter(Boolean);
  // Explicit web URLs plus common bare domains. Do not extract email addresses.
  const urls = /https?:\/\/[^\s<>"']+|(?<![\w@./:-])(?:www\.[a-z0-9-]+(?:\.[a-z0-9-]+)+|(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:com|net|org|edu|gov|kr|io|dev|app|co|me|ai|info|biz|tv|xyz|shop|store|online))(?![a-z0-9.-])(?:[/?#][^\s<>"']*)?/gi;
  for (const field of ['site', 'note1', 'note2', 'note3']) {
   if (typeof row[field] !== 'string') continue;
   let moved = false;
   const remaining = row[field].replace(urls, match => {
    let url = match.replace(/[.,;:!?]+$/, '');
    for (const [open, close] of [['(', ')'], ['[', ']'], ['{', '}']]) {
     while (url.endsWith(close) && url.split(close).length > url.split(open).length) url = url.slice(0, -1);
    }
    if (!links.includes(url)) links.push(url);
    moved = true;
    return match.slice(url.length);
   });
   if (moved) row[field] = remaining.replace(/^[\s/|,;:.·()[\]{}]+|[\s/|,;:.·()[\]{}]+$/g, '').replace(/[ \t]{2,}/g, ' ');
  }
  row.link = links.join('\n');
  return row;
 }
 return { dday, formatMoney, parseMoney, isValidDate, sortByDate, matchesSearch, migratePasswordLinks };
})();
