// Clothing/shoe measurements live in the same encrypted state as the rest of the vault.
window.VaultSizes = (() => {
 const CATEGORIES = {
  top: { label: '상의', unit: 'cm', fields: ['어깨너비', '가슴단면', '밑단단면', '소매길이', '소매통단면', '소매단면', '총장'] },
  bottom: { label: '하의', unit: 'cm', fields: ['허리단면', '엉덩이단면', '허벅지단면', '밑위', '안쪽기장', '밑단단면', '총장'] },
  shoes: { label: '신발', unit: 'mm', fields: ['아웃솔길이', '아웃솔너비', '인솔길이', '인솔너비', '굽높이'] },
  other: { label: '기타', unit: 'cm', fields: [] },
 };
 const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
 const newId = () => crypto.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2);
 function profile(input, id, name) {
  const result = { ...object(input) };
  result.id ??= id;
  result.name ??= name;
  result.categories = { ...object(result.categories) };
  for (const [key, def] of Object.entries(CATEGORIES)) {
   const category = { ...object(result.categories[key]) };
   for (const field of ['brand', 'model', 'labeledSize', 'note']) category[field] ??= '';
   if (!Array.isArray(category.measurements)) category.measurements = def.fields.map((label, index) => ({ id: key + '-' + index, label, value: '', unit: def.unit }));
   result.categories[key] = category;
  }
  return result;
 }
 function normalize(input) {
  const result = structuredClone(object(input));
  result.self = profile(result.self, 'self', '본인');
  if (!Array.isArray(result.family)) result.family = [profile(null, 'brother', '형'), profile(null, 'mother', '엄마'), profile(null, 'father', '아빠')];
  else result.family = result.family.map((item, index) => profile(item, 'family-' + index, '가족'));
  return result;
 }
 const el = (tag, props = {}) => Object.assign(document.createElement(tag), props);
 const button = (textContent, onclick, props = {}) => el('button', { type: 'button', textContent, onclick, ...props });

 function mount(root, getState, changed) {
  let scope = 'self', selectedFamily = '', selectedCategory = 'top';
  let selectedProfile = null, editor = null, diagram = null, picker = null;
  const categorySelections = new Map();
  const profileName = item => String(item.name || '').trim() || '이름 미입력';
  function input(label, value, onInput, props = {}) {
   const control = el('input', { type: 'text', autocomplete: 'off', value: value ?? '', ...props });
   control.setAttribute('aria-label', label);
   control.addEventListener('input', () => { onInput(control.value); changed(); });
   return control;
  }
  function labeled(label, control, className = 'size-field') {
   const wrap = el('label', { className });
   wrap.append(el('span', { className: 'size-label', textContent: label }), control);
   return wrap;
  }
  function selectCategory(key) {
   selectedCategory = key;
   categorySelections.set(scope + '/' + selectedProfile.id, key);
   for (const control of root.querySelectorAll('[data-size-category]')) control.setAttribute('aria-pressed', String(control.dataset.sizeCategory === key));
   for (const zone of diagram.querySelectorAll('[data-size-zone]')) zone.classList.toggle('is-selected', zone.dataset.sizeZone === key);
   renderEditor();
  }
  function renderEditor() {
   const def = CATEGORIES[selectedCategory], category = selectedProfile.categories[selectedCategory];
   editor.replaceChildren();
   const title = el('div', { className: 'size-editor-title' });
   title.append(el('h3', { textContent: def.label }), el('span', { className: 'size-unit-hint', textContent: '기본 단위 ' + def.unit }));
   editor.append(title);
   const metadata = el('div', { className: 'size-metadata' });
   for (const [key, label] of [['brand', '브랜드'], ['model', '모델명'], ['labeledSize', '표기 사이즈']]) metadata.append(labeled(label, input(label, category[key], value => { category[key] = value; })));
   editor.append(metadata);
   const headings = el('div', { className: 'size-measurement-headings', ariaHidden: 'true' });
   headings.append(...['치수 항목', '측정값', '단위', ''].map(textContent => el('span', { textContent })));
   editor.append(headings);
   const rows = el('div', { className: 'size-measurements' });
   for (const measurement of category.measurements) {
    const row = el('div', { className: 'size-measurement' });
    const name = input('치수 항목명', measurement.label, value => { measurement.label = value; updateLabels(); });
    const value = input('', measurement.value, text => { measurement.value = text; }, { inputMode: 'decimal', placeholder: '미입력' });
    const unit = input('', measurement.unit, text => { measurement.unit = text; });
    function updateLabels() {
     value.setAttribute('aria-label', (measurement.label || '새 치수') + ' 값');
     unit.setAttribute('aria-label', (measurement.label || '새 치수') + ' 단위');
     if (!row.classList.contains('is-confirming')) row.querySelector('.size-measurement-actions > button')?.setAttribute('aria-label', (measurement.label || '치수') + ' 삭제');
    }
    updateLabels();
    const actions = el('div', { className: 'size-measurement-actions' });
    function idle() {
     row.classList.remove('is-confirming');
     actions.replaceChildren(button('삭제', () => {
      row.classList.add('is-confirming');
      const cancel = button('취소', () => { idle(); actions.querySelector('button').focus(); });
      actions.replaceChildren(button('삭제 확인', () => {
       category.measurements.splice(category.measurements.indexOf(measurement), 1);
       changed(); renderEditor(); editor.querySelector('.size-add-measurement').focus();
      }, { className: 'danger' }), cancel);
      cancel.focus();
     }, { ariaLabel: (measurement.label || '치수') + ' 삭제' }));
    }
    idle();
    row.append(name, value, unit, actions);
    rows.append(row);
   }
   if (!category.measurements.length) rows.append(el('p', { className: 'size-empty', textContent: '치수 항목을 추가해 주세요.' }));
   editor.append(rows, button('+ 치수 항목 추가', () => {
    category.measurements.push({ id: newId(), label: '', value: '', unit: def.unit });
    changed(); renderEditor();
    editor.querySelector('.size-measurement:last-child input').focus();
   }, { className: 'size-add-measurement' }));
   const note = el('textarea', { value: category.note, rows: 3 });
   note.setAttribute('aria-label', '사이즈 메모');
   note.addEventListener('input', () => { category.note = note.value; changed(); });
   editor.append(labeled('메모', note, 'size-field size-note'));
  }
  function render(nextScope) {
   scope = nextScope;
   root.replaceChildren();
   if (scope !== 'self' && scope !== 'family') return;
   const sizes = getState();
   const section = el('section', { className: 'section size-section', ariaLabel: '사이즈 프로필' });
   root.append(section);
   const toolbar = el('div', { className: 'size-profile-toolbar' });
   toolbar.append(el('h2', { textContent: '사이즈' }));
   const family = scope === 'family';
   if (family) {
    if (!sizes.family.some(item => item.id === selectedFamily)) selectedFamily = sizes.family[0]?.id ?? '';
    selectedProfile = sizes.family.find(item => item.id === selectedFamily) ?? null;
    picker = el('select', { ariaLabel: '가족 사이즈 프로필' });
    for (const item of sizes.family) picker.append(new Option(profileName(item), item.id));
    if (!sizes.family.length) picker.append(new Option('등록된 가족 없음', ''));
    picker.value = selectedFamily;
    picker.disabled = !sizes.family.length;
    picker.addEventListener('change', () => { selectedFamily = picker.value; render(scope); root.querySelector('select').focus(); });
    toolbar.append(labeled('가족 선택', picker));
    toolbar.append(button('+ 사람 추가', () => {
     const item = profile(null, newId(), '새 가족');
     sizes.family.push(item); selectedFamily = item.id;
     changed(); render(scope);
     const name = root.querySelector('.size-profile-name input'); name.focus(); name.select();
    }));
   } else selectedProfile = sizes.self;
   section.append(toolbar);
   if (!selectedProfile) {
    section.append(el('p', { className: 'size-empty', textContent: '등록된 가족이 없습니다. 사람을 추가해 사이즈를 기록하세요.' }));
    return;
   }
   const nameRow = el('div', { className: 'size-profile-name' });
   nameRow.append(labeled('프로필 이름', input('프로필 이름', selectedProfile.name, value => {
    selectedProfile.name = value;
    if (family) picker.selectedOptions[0].textContent = profileName(selectedProfile);
   })));
   if (family) {
    const confirmation = el('div', { className: 'size-profile-confirm', hidden: true });
    const remove = button('사람 삭제', () => {
     confirmation.hidden = false;
     confirmation.querySelector('button:last-child').focus();
    });
    confirmation.append(el('span', { textContent: '이 프로필의 모든 사이즈를 삭제할까요?' }), button('삭제 확인', () => {
     sizes.family.splice(sizes.family.indexOf(selectedProfile), 1);
     selectedFamily = ''; changed(); render(scope);
     root.querySelector('.size-profile-toolbar button').focus();
    }, { className: 'danger' }), button('취소', () => { confirmation.hidden = true; remove.focus(); }));
    nameRow.append(remove);
    section.append(nameRow, confirmation);
   } else section.append(nameRow);
   const layout = el('div', { className: 'size-layout' });
   const illustration = el('div', { className: 'size-illustration' });
   // Static vector only. All user-entered text is assigned through DOM text/value properties.
   illustration.innerHTML = `<svg viewBox="0 0 360 410" aria-hidden="true" class="size-body">
    <circle cx="180" cy="50" r="30" class="size-body-neutral"/>
    <path class="size-body-neutral" d="M52 96 32 83Q25 79 26 86L36 98 18 95Q10 95 12 101L32 108 14 108Q6 110 13 115L32 118 18 123Q12 129 20 130L52 123Z M308 96 328 83Q335 79 334 86L324 98 342 95Q350 95 348 101L328 108 346 108Q354 110 347 115L328 118 342 123Q348 129 340 130L308 123Z"/>
    <path data-size-zone="top" d="M145 90Q180 120 215 90L304 94V124L218 130V222H142V130L56 124V94Z"/>
    <path data-size-zone="bottom" d="M142 230H218V359H187L183 265Q180 255 177 265L173 359H142Z"/>
    <g data-size-zone="shoes"><path d="M142 365Q155 374 173 365L176 390H119Q110 390 116 380Z M187 365Q201 374 218 365L244 380Q250 390 241 390H184Z"/></g>
   </svg>`;
   diagram = illustration.querySelector('svg');
   diagram.addEventListener('click', event => {
    const zone = event.target.closest('[data-size-zone]');
    if (zone) selectCategory(zone.dataset.sizeZone);
   });
   illustration.append(el('p', { className: 'size-diagram-hint', textContent: '그림의 상의·하의·신발을 선택하세요.' }));
   const controls = el('div', { className: 'size-category-buttons', role: 'group', ariaLabel: '치수 분류' });
   for (const [key, def] of Object.entries(CATEGORIES)) {
    const control = button(def.label, () => selectCategory(key));
    control.dataset.sizeCategory = key;
    control.addEventListener('keydown', event => {
     const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
     if (!step) return;
     event.preventDefault();
     const buttons = [...controls.children], next = buttons[(buttons.indexOf(control) + step + buttons.length) % buttons.length];
     selectCategory(next.dataset.sizeCategory); next.focus();
    });
    controls.append(control);
   }
   illustration.append(controls);
   editor = el('div', { className: 'size-editor' });
   layout.append(illustration, editor);
   section.append(layout);
   selectCategory(categorySelections.get(scope + '/' + selectedProfile.id) || 'top');
  }
  return { render };
 }
 return { normalize, mount };
})();
