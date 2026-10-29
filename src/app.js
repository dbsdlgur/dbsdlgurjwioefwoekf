
(() => {
 const TAB_KEY = 'vault.tab';
 const { dday, formatMoney, parseMoney, isValidDate, sortByDate, matchesSearch, migratePasswordLinks } = window.VaultPure;
 const PASSWORD_COLUMNS = [
  { field: 'category', label: '분류' }, { field: 'site', label: '사이트' },
  { field: 'link', label: '링크', type: 'links' }, { field: 'loginId', label: 'ID' },
  { field: 'password', label: 'PW', type: 'copy' },
  { field: 'note1', label: '비고1' }, { field: 'note2', label: '비고2' }, { field: 'note3', label: '비고3' },
 ];
 const sum = (rows, field) => rows.reduce((total, row) => total + (Number(row[field]) || 0), 0);
 // 표 정의(S-4~S-6). path는 상태 JSON(S-7) 안의 위치다. computed 열은 저장하지 않는다.
 const TABLES = {
  expenses: { title: '지출', path: ['profile', 'expenses'], columns: [
   { field: 'kind', label: '구분', type: 'select', options: [['monthly', '월간'], ['total', '총']], initial: 'monthly' },
   { field: 'item', label: '항목' },
   { field: 'total', label: '총액', type: 'money' }, { field: 'balance', label: '잔액', type: 'money' },
   { field: 'monthly', label: '매월 금액', type: 'money' }, { field: 'payDay', label: '출금일', type: 'day' },
   { field: 'dday', label: 'D-day', type: 'computed', compute: row => dday(row.payDay) },
   { field: 'note', label: '비고' },
  ], footer: rows => [['월간 합계', sum(rows, 'monthly')], ['총 잔액', sum(rows, 'balance')]] },
  identity: { title: '신상', path: ['profile', 'identity'], columns: [
   { field: 'label', label: '항목' },
   { field: 'value', label: '값', type: 'secret', secretWhen: row => row.secret },
   { field: 'secret', label: '민감', type: 'toggle' },
  ] },
  family: { title: '가족이력', path: ['profile', 'family'], columns: [
   { field: 'relation', label: '관계' }, { field: 'name', label: '이름' }, { field: 'birth', label: '생년월일' },
   { field: 'detail', label: '내용' }, { field: 'note', label: '비고' },
  ] },
  history: { title: '이력', path: ['history'], sortable: true, columns: [
   { field: 'date', label: '날짜', type: 'date' }, { field: 'content', label: '내용' }, { field: 'note1', label: '비고1' },
   { field: 'note2', label: '비고2' }, { field: 'residence', label: '거주지' },
  ] },
  passwordsSelf: { title: '본인', path: ['passwords', 'self'], view: 'self', searchable: true, columns: PASSWORD_COLUMNS },
  passwordsFamily: { title: '가족', path: ['passwords', 'family'], view: 'family', searchable: true, columns: [{ field: 'owner', label: '누구' }, ...PASSWORD_COLUMNS] },
 };
 const sortDir = { history: 'desc' };
 let search = '', pwView = 'self';
 const categoryFilters = { passwordsSelf: '', passwordsFamily: '' };
 const categoryOf = row => String(row.category ?? '').trim();
 // 날짜를 고치면 다시 정렬하되, 같은 표 안에서 다음 칸으로 옮겨 입력하는 중에는 미룬다.
 // 표를 다시 그리면 입력 중인 칸이 사라지기 때문이다. 포커스가 표를 벗어날 때 정렬한다.
 const pendingSort = new Set();

 let state = normalize({ schema: 1 });
 const $ = sel => document.querySelector(sel);
 const changed = () => parent.vaultHost?.changed();
 const newId = () => crypto.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2);
 const el = (tag, props = {}) => Object.assign(document.createElement(tag), props);
 const button = (textContent, onclick, props = {}) => el('button', { type: 'button', textContent, onclick, ...props });

 // 빠진 목록만 채운다. 모르는 필드는 그대로 둔다(S-7.2).
 function normalize(input) {
  const s = structuredClone(input);
  s.profile = { ...s.profile };
  for (const key of ['expenses', 'identity', 'family']) s.profile[key] = Array.isArray(s.profile[key]) ? s.profile[key] : [];
  s.history = Array.isArray(s.history) ? s.history : [];
  s.passwords = { ...s.passwords };
  for (const key of ['self', 'family']) s.passwords[key] = Array.isArray(s.passwords[key]) ? s.passwords[key].map(migratePasswordLinks) : [];
  return s;
 }

 const rowsOf = def => def.path.reduce((node, key) => node[key], state);
 const INITIAL = { money: 0, toggle: false };

 function emptyRow(def) {
  const row = { id: newId() };
  for (const col of def.columns) if (col.type !== 'computed') row[col.field] = col.initial ?? INITIAL[col.type] ?? '';
  return row;
 }

 function textInput(col, value, props = {}) {
  const input = el('input', { type: 'text', autocomplete: 'off', value: value ?? '', ...props });
  input.setAttribute('aria-label', col.label);
  return input;
 }

 // 민감 값(S-4.3): 기본 가림, 보기·복사. 탭을 바꾸면 mask()로 다시 가린다.
 function secretCell(col, row, onInput) {
  const box = el('div', { className: 'secret' });
  const input = textInput(col, row[col.field]);
  const [copy, copied] = copyButton(() => row[col.field]);
  let revealed = false;
  const reveal = button('보기', () => { revealed = !revealed; box.update(); });
  input.addEventListener('input', () => { row[col.field] = input.value; onInput(); });
  box.update = () => {
   const secret = col.secretWhen ? !!col.secretWhen(row) : true;
   input.type = secret && !revealed ? 'password' : 'text';
   reveal.textContent = revealed ? '숨기기' : '보기';
   reveal.hidden = copy.hidden = !secret;
  };
  box.mask = () => { revealed = false; box.update(); };
  box.update();
  box.append(input, reveal, copy, copied);
  return box;
 }

 // 복사 버튼과 결과 표시. 값은 누를 때 읽는다.
 function copyButton(value) {
  const copied = el('span', { className: 'copied', role: 'status' });
  const copy = button('복사', async () => {
   try { await navigator.clipboard.writeText(value() ?? ''); copied.textContent = '복사됨'; }
   catch { copied.textContent = '복사 실패'; }
   setTimeout(() => { copied.textContent = ''; }, 2000);
  });
  return [copy, copied];
 }

 // 항상 보이는 값 + 복사(PW·링크). 가림 대상이 아니라 .secret과 따로 둔다.
 function copyCell(input, row, col) {
  const box = el('div', { className: 'copyable' });
  box.append(input, ...copyButton(() => row[col.field]));
  return box;
 }

 function fillCell(td, col, row, ctx) {
  td.dataset.label = col.label;
  td.dataset.field = col.field;
  const edited = (value, after = ctx.refresh) => { row[col.field] = value; changed(); after(); };
  switch (col.type) {
   case 'links': {
    const input = el('textarea', { value: row[col.field] ?? '', rows: Math.max(1, Math.min(3, (row[col.field] || '').split('\n').length)), autocomplete: 'off', spellcheck: false });
    input.setAttribute('aria-label', col.label);
    input.addEventListener('input', () => edited(input.value));
    td.append(copyCell(input, row, col));
    return;
   }
   case 'copy': {
    const input = textInput(col, row[col.field]);
    input.addEventListener('input', () => edited(input.value));
    td.append(copyCell(input, row, col));
    return;
   }
   case 'computed': {
    const update = () => { td.textContent = col.compute(row) || '–'; };
    ctx.updaters.push(update);
    update();
    return;
   }
   case 'select': {
    const select = el('select');
    for (const [value, text] of col.options) select.append(new Option(text, value));
    select.value = row[col.field] ?? col.initial;
    select.setAttribute('aria-label', col.label);
    select.addEventListener('change', () => edited(select.value));
    td.append(select);
    return;
   }
   case 'money': {
    const input = textInput(col, formatMoney(row[col.field]), { inputMode: 'numeric', className: 'money' });
    input.addEventListener('input', () => edited(parseMoney(input.value)));
    input.addEventListener('blur', () => { input.value = formatMoney(row[col.field]); });
    td.append(input);
    return;
   }
   case 'day': {
    const input = textInput(col, row[col.field], { inputMode: 'numeric' });
    input.addEventListener('input', () => edited(input.value.trim() === '' ? '' : parseMoney(input.value) || ''));
    td.append(input);
    return;
   }
   case 'date': {
    const input = textInput(col, row[col.field], { placeholder: 'YYYY-MM-DD' });
    const check = () => input.setAttribute('aria-invalid', String(!isValidDate(input.value)));
    input.addEventListener('input', () => { check(); edited(input.value); });
    input.addEventListener('change', ctx.resort);
    check();
    td.append(input);
    return;
   }
   case 'secret': {
    const box = secretCell(col, row, () => { changed(); ctx.refresh(); });
    ctx.updaters.push(box.update);
    td.append(box);
    return;
   }
   case 'toggle': {
    const toggle = button(col.label, () => {
     edited(!row[col.field]);
     toggle.setAttribute('aria-pressed', String(!!row[col.field]));
    }, { className: 'toggle' });
    toggle.setAttribute('aria-pressed', String(!!row[col.field]));
    td.append(toggle);
    return;
   }
   default: {
    const input = textInput(col, row[col.field], { type: col.type === 'password' ? 'password' : 'text' });
    input.addEventListener('input', () => edited(input.value));
    td.append(input);
   }
  }
 }

 function rowActions(name, rows, row) {
  const td = el('td', { className: 'row-actions' });
  const ask = () => {
   const no = button('취소', idle);
   td.replaceChildren(button('삭제 확인', () => { rows.splice(rows.indexOf(row), 1); changed(); renderTable(name); }, { className: 'danger' }), no);
   no.focus();
  };
  function idle() { td.replaceChildren(button('삭제', ask)); }
  idle();
  return td;
 }

 function addRow(name) {
  const def = TABLES[name];
  if (def.searchable && search) setSearch('');
  const row = emptyRow(def);
  if (def.searchable && categoryFilters[name]) row.category = JSON.parse(categoryFilters[name]);
  rowsOf(def).push(row);
  changed();
  renderTable(name);
  document.querySelector(`[data-table="${name}"] tbody tr:last-child :is(input, select)`)?.focus();
 }

 function updateCategoryFilter(name, select) {
  const categories = [...new Set(rowsOf(TABLES[name]).map(categoryOf))];
  // Keep the selected category available while its last row is edited or deleted.
  const selected = categoryFilters[name];
  if (selected && !categories.includes(JSON.parse(selected))) categories.push(JSON.parse(selected));
  categories.sort((a, b) => a.localeCompare(b, 'ko'));
  select.replaceChildren(new Option('전체 분류', ''), ...categories.map(value => new Option(value || '미분류', JSON.stringify(value))));
  select.value = selected;
 }

 function renderTable(name) {
  const def = TABLES[name], rows = rowsOf(def);
  const section = document.querySelector(`[data-table="${name}"]`);
  const head = (def.searchable && section.querySelector('.section-head')) || el('div', { className: 'section-head' });
  const replaceContent = (...content) => {
   // Keep the search input attached while typing, including Korean IME composition.
   if (def.searchable && section.firstElementChild === head) {
    while (head.nextSibling) head.nextSibling.remove();
    section.append(...content);
   } else section.replaceChildren(head, ...content);
  };
  if (!def.searchable) head.append(el('h2', { textContent: def.title }));
  let categorySelect;
  if (def.searchable) {
   if (def.view === pwView && searchInput.parentElement !== head) head.prepend(searchInput);
   categorySelect = head.querySelector('.category-filter');
   if (!categorySelect) {
    categorySelect = el('select', { className: 'category-filter', ariaLabel: def.title + ' 분류 필터' });
    categorySelect.addEventListener('change', () => { categoryFilters[name] = categorySelect.value; renderTable(name); categorySelect.focus(); });
    head.append(categorySelect);
   }
   updateCategoryFilter(name, categorySelect);
  }
  if (def.sortable && rows.length > 1) {
   const asc = sortDir[name] === 'asc';
   head.append(button(asc ? '최근 순으로' : '오래된 순으로', () => { sortDir[name] = asc ? 'desc' : 'asc'; renderTable(name); }));
  }
  if (!def.searchable || !head.querySelector('button')) head.append(button('+ 추가', () => addRow(name)));
  if (def.view) updateCount(def.view, rows.length);
  let visible = def.sortable ? sortByDate(rows, sortDir[name]) : rows;
  if (def.searchable) visible = visible.filter(row => matchesSearch(row, search) && (!categoryFilters[name] || categoryOf(row) === JSON.parse(categoryFilters[name])));
  if (!visible.length) {
   const empty = el('div', { className: 'empty' });
   if (rows.length) empty.append('검색 결과가 없습니다');
   else empty.append('아직 항목이 없습니다 · ', button('추가', () => addRow(name)));
   replaceContent(empty);
   return;
  }
  const totals = def.footer && el('div', { className: 'totals' });
  const ctx = {
   updaters: [],
   refresh() {
    for (const update of ctx.updaters) update();
    if (categorySelect) updateCategoryFilter(name, categorySelect);
    totals?.replaceChildren(...def.footer(rows).map(([label, value]) => {
     const item = el('span', { textContent: label + ' ' });
     item.append(el('b', { textContent: formatMoney(value) + '원' }));
     return item;
    }));
   },
   resort: () => pendingSort.add(name),
  };
  const table = el('table');
  const headRow = table.createTHead().insertRow();
  for (const col of def.columns) headRow.append(el('th', { textContent: col.label }));
  headRow.append(el('th', { ariaLabel: '관리' }));
  const body = table.createTBody();
  for (const row of visible) {
   const tr = body.insertRow();
   for (const col of def.columns) fillCell(tr.insertCell(), col, row, ctx);
   tr.append(rowActions(name, rows, row));
  }
  const wrap = el('div', { className: 'table-wrap' });
  wrap.append(table);
  replaceContent(wrap, ...(totals ? [totals] : []));
  ctx.refresh();
 }

 // 비밀번호 하위 탭(S-6.1)과 검색(S-6.4)
 const searchInput = $('#pwSearch');
 const viewButtons = [...document.querySelectorAll('[data-view]')];
 function updateCount(view, n) { document.querySelector(`[data-view="${view}"] .count`).textContent = n; }
 function renderPasswords() { for (const [name, def] of Object.entries(TABLES)) if (def.searchable) renderTable(name); }
 function setSearch(value) { search = value; searchInput.value = value; renderPasswords(); }
 function selectView(view) {
  pwView = view;
  for (const b of viewButtons) b.setAttribute('aria-pressed', String(b.dataset.view === view));
  for (const [name, def] of Object.entries(TABLES)) if (def.view) document.querySelector(`[data-table="${name}"]`).hidden = def.view !== view;
  renderPasswords();
  for (const box of document.querySelectorAll('.secret')) box.mask();
 }
 for (const b of viewButtons) b.addEventListener('click', () => selectView(b.dataset.view));
 searchInput.addEventListener('input', () => { search = searchInput.value; renderPasswords(); });
 selectView(pwView);

 for (const [name, def] of Object.entries(TABLES)) {
  if (!def.sortable) continue;
  const section = document.querySelector(`[data-table="${name}"]`);
  section.addEventListener('focusout', e => {
   if (!pendingSort.has(name) || section.contains(e.relatedTarget)) return;
   pendingSort.delete(name);
   renderTable(name);
  });
 }

 function renderAll() {
  for (const name of Object.keys(TABLES)) renderTable(name);
  showUpdatedAt();
 }

 function showUpdatedAt() {
  const at = state.updatedAt ? new Date(state.updatedAt) : null;
  $('#updatedAt').textContent = at && !isNaN(at) ? '저장 ' + at.toLocaleString('ko-KR') : '';
 }

 // 탭(S-3.1): 마지막 탭은 sessionStorage에 기억한다.
 const tabs = [...document.querySelectorAll('[role=tab]')];
 function selectTab(name, focus = false) {
  $('.segmented').hidden = name !== 'passwords';
  for (const tab of tabs) {
   const on = tab.dataset.tab === name;
   tab.setAttribute('aria-selected', String(on));
   tab.tabIndex = on ? 0 : -1;
   document.getElementById(tab.getAttribute('aria-controls')).hidden = !on;
   if (on && focus) tab.focus();
  }
  for (const box of document.querySelectorAll('.secret')) box.mask();
  try { sessionStorage.setItem(TAB_KEY, name); } catch {}
 }
 for (const tab of tabs) {
  tab.addEventListener('click', () => selectTab(tab.dataset.tab));
  tab.addEventListener('keydown', e => {
   const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
   if (!step) return;
   e.preventDefault();
   const next = tabs[(tabs.indexOf(tab) + step + tabs.length) % tabs.length];
   selectTab(next.dataset.tab, true);
  });
 }
 let saved = null;
 try { saved = sessionStorage.getItem(TAB_KEY); } catch {}
 selectTab(tabs.some(t => t.dataset.tab === saved) ? saved : 'passwords');

 window.vaultApi = {
  load(input) { state = normalize(input); renderAll(); },
  serialize() { return structuredClone(state); },
  saved(updatedAt) { state.updatedAt = updatedAt; showUpdatedAt(); },
 };
 renderAll();
})();
