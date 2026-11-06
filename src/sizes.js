// Clothing/shoe measurements live in the same encrypted state as the rest of the vault.
window.VaultSizes = (() => {
 const CATEGORIES = {
  top: { label: '상의', unit: 'cm', fields: ['어깨너비', '가슴단면', '밑단단면', '소매길이', '소매통단면', '소매단면', '총장'] },
  bottom: { label: '하의', unit: 'cm', fields: ['허리단면', '엉덩이단면', '허벅지단면', '밑위', '안쪽기장', '밑단단면', '총장'] },
  shoes: { label: '신발', unit: 'mm', fields: ['아웃솔길이', '아웃솔너비', '인솔길이', '인솔너비', '굽높이'] },
  other: { label: '기타', unit: 'cm', fields: [] },
 };
 const DETAIL_VIEWS = {
  top: {
   shape: '<path d="M220 110Q300 155 380 110L500 185 475 235 380 195V430H220V195L125 235 100 185Z"/>',
   dimensions: [
    ['어깨너비',220,90,380,90,300,45], ['가슴단면',230,245,370,245,300,283],
    ['밑단단면',220,450,380,450,300,492], ['소매길이',385,93,507,173,480,90],
    ['소매통단면',435,155,420,210,470,345], ['소매단면',512,190,487,240,540,267],
    ['총장',195,115,195,430,100,315],
   ],
  },
  bottom: {
   shape: '<path d="M220 70H380V480H315L306 228Q300 205 294 228L285 480H220Z"/>',
   dimensions: [
    ['허리단면',220,52,380,52,300,25], ['엉덩이단면',230,135,370,135,300,169],
    ['허벅지단면',222,245,285,245,120,260], ['밑위',403,75,403,225,485,155],
    ['안쪽기장',300,235,300,478,460,355], ['밑단단면',220,500,285,500,252,525],
    ['총장',195,70,195,480,95,145],
   ],
  },
  shoes: {
   shape: '<path d="M160 70Q200 25 240 70Q277 125 255 225L245 350Q200 380 155 350L145 225Q123 125 160 70Z"/><path class="size-insole" d="M172 88Q200 55 228 88Q252 140 235 224L230 332Q200 350 170 332L165 224Q148 140 172 88Z"/><path d="M335 270Q362 282 390 263L412 302Q467 313 535 335Q557 342 557 361V380H330V319Z"/><path class="size-shoe-sole" d="M331 365H556"/>',
   dimensions: [
    ['아웃솔길이',115,66,115,355,65,160], ['아웃솔너비',140,190,260,190,205,218],
    ['인솔길이',200,87,200,331,355,90], ['인솔너비',169,257,231,257,210,290],
    ['굽높이',575,319,575,380,490,437],
   ],
  },
 };
 const svgEl = (tag, attributes = {}) => {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
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
   category.note ??= '';
   const existing = Array.isArray(category.measurements) ? category.measurements : [];
   const used = new Set();
   const standard = def.fields.map((label, index) => {
    const found = existing.find(item => !used.has(item) && item.id === key + '-' + index) || existing.find(item => !used.has(item) && item.label === label);
    if (found) used.add(found);
    return { ...found, id: key + '-' + index, label, value: found?.value ?? '', unit: found?.unit ?? def.unit, fixed: true };
   });
   category.measurements = [...standard, ...existing.filter(item => !used.has(item)).map(item => ({ ...item, fixed: false }))];
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
  let selectedProfile = null, editor = null, diagram = null, detailDiagram = null, backButton = null, picker = null, zoomed = false;
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
  function selectCategory(key, zoom = true) {
   selectedCategory = key;
   zoomed = zoom && key !== 'other';
   categorySelections.set(scope + '/' + selectedProfile.id, key);
   for (const control of root.querySelectorAll('[data-size-category]')) control.setAttribute('aria-pressed', String(control.dataset.sizeCategory === key));
   for (const zone of diagram.querySelectorAll('[data-size-zone]')) zone.classList.toggle('is-selected', zone.dataset.sizeZone === key);
   renderEditor();
   renderDiagram();
  }
  function updateDiagramValues() {
   if (!detailDiagram || !selectedProfile) return;
   const category = selectedProfile.categories[selectedCategory];
   for (const node of detailDiagram.querySelectorAll('[data-dimension-value]')) {
    const measurement = category.measurements.find(item => item.id === node.dataset.dimensionValue);
    const raw = String(measurement?.value ?? '').trim();
    const unit = String(measurement?.unit ?? CATEGORIES[selectedCategory].unit);
    node.textContent = (raw ? raw.length > 12 ? raw.slice(0, 11) + '…' : raw : '—') + ' ' + (unit.length > 8 ? unit.slice(0, 7) + '…' : unit);
    node.removeAttribute('textLength');
    const width = Number(node.parentElement.querySelector('rect').getAttribute('width')) - 12;
    if (node.getComputedTextLength() > width) {
     node.setAttribute('textLength', width);
     node.setAttribute('lengthAdjust', 'spacingAndGlyphs');
    }
    node.parentElement.querySelector('title').textContent = (measurement?.label || '') + ': ' + (raw || '미입력') + ' ' + unit;
   }
  }
  function renderDiagram() {
   const view = DETAIL_VIEWS[selectedCategory], expanded = zoomed && !!view;
   diagram.style.display = expanded ? 'none' : '';
   detailDiagram.style.display = expanded ? '' : 'none';
   root.querySelector('.size-layout').classList.toggle('is-detail', expanded);
   backButton.hidden = !expanded;
   detailDiagram.replaceChildren();
   if (!expanded) return;
   detailDiagram.setAttribute('aria-label', CATEGORIES[selectedCategory].label + ' 치수 도면');
   detailDiagram.dataset.category = selectedCategory;
   const defs = svgEl('defs');
   defs.innerHTML = '<marker id="size-dimension-arrow" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto-start-reverse"><path d="M0 0 7 3.5 0 7Z"/></marker>';
   const garment = svgEl('g', { class: 'size-garment' });
   garment.innerHTML = view.shape;
   detailDiagram.append(defs, garment);
   for (const [label,x1,y1,x2,y2,tx,ty] of view.dimensions) {
    const group = svgEl('g', { class: 'size-dimension' });
    group.append(svgEl('title'), svgEl('line', { x1,y1,x2,y2, class: 'size-dimension-line' }));
    const width = Math.max(144, label.length * 24 + 20), x = Math.max(width / 2 + 6, Math.min(600 - width / 2 - 6, tx));
    group.append(svgEl('rect', { x: x-width/2, y: ty-20, width, height: 49, rx: 5 }));
    const caption = svgEl('text', { x, y: ty, 'text-anchor': 'middle', class: 'size-dimension-label' });
    caption.textContent = label;
    const value = svgEl('text', { x, y: ty+23, 'text-anchor': 'middle', class: 'size-dimension-value' });
    value.dataset.dimensionValue = selectedCategory + '-' + CATEGORIES[selectedCategory].fields.indexOf(label);
    group.append(caption, value);
    detailDiagram.append(group);
   }
   updateDiagramValues();
  }
  function renderEditor() {
   const def = CATEGORIES[selectedCategory], category = selectedProfile.categories[selectedCategory];
   editor.replaceChildren();
   const title = el('div', { className: 'size-editor-title' });
   title.append(el('h3', { textContent: def.label }), el('span', { className: 'size-unit-hint', textContent: '기본 단위 ' + def.unit }));
   editor.append(title);
   const headings = el('div', { className: 'size-measurement-headings', ariaHidden: 'true' });
   headings.append(...['치수 항목', '측정값', '단위', ''].map(textContent => el('span', { textContent })));
   editor.append(headings);
   const rows = el('div', { className: 'size-measurements' });
   for (const measurement of category.measurements) {
    const row = el('div', { className: 'size-measurement' });
    const name = measurement.fixed ? el('span', { className: 'size-fixed-label', textContent: measurement.label }) : input('치수 항목명', measurement.label, value => { measurement.label = value; updateLabels(); });
    const value = input('', measurement.value, text => { measurement.value = text; updateDiagramValues(); }, { inputMode: 'decimal', placeholder: '미입력' });
    const unit = measurement.fixed ? el('span', { className: 'size-fixed-unit', textContent: measurement.unit }) : input('', measurement.unit, text => { measurement.unit = text; });
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
    if (measurement.fixed) actions.append(el('span', { className: 'size-fixed-badge', textContent: '기본' }));
    else idle();
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
   illustration.innerHTML = `<svg viewBox="0 0 1024 1024" aria-hidden="true" class="size-body">
    <circle cx="512" cy="209" r="66" class="size-body-neutral"/>
    <g class="size-body-neutral">
     <path d="M204 310 162 273Q152 267 153 280L169 303 116 297Q108 296 109 304Q110 309 117 310L151 318 113 315Q104 315 105 324Q106 330 115 330L152 331 115 335Q106 336 109 343Q111 348 120 346L152 341 130 354Q122 358 127 363Q130 367 137 364L173 355Q189 355 204 346Z"/>
     <path d="M176 328Q166 323 168 306" class="size-body-detail"/>
    </g>
    <g class="size-body-neutral" transform="translate(1024 0) scale(-1 1)">
     <path d="M204 310 162 273Q152 267 153 280L169 303 116 297Q108 296 109 304Q110 309 117 310L151 318 113 315Q104 315 105 324Q106 330 115 330L152 331 115 335Q106 336 109 343Q111 348 120 346L152 341 130 354Q122 358 127 363Q130 367 137 364L173 355Q189 355 204 346Z"/>
     <path d="M176 328Q166 323 168 306" class="size-body-detail"/>
    </g>
    <path data-size-zone="top" d="M218 305 469 295Q512 347 555 295L806 305V351L590 360V536H434V360L218 351Z"/>
    <path data-size-zone="bottom" d="M434 536H590V832H528L516 597Q512 580 508 597L495 832H434Z"/>
    <g data-size-zone="shoes">
     <path d="M449 844Q471 853 494 845L501 883V897Q501 907 490 907H397Q385 907 385 896Q385 884 400 877L426 866Z"/>
     <path d="M574 844Q552 853 530 845L523 883V897Q523 907 534 907H627Q639 907 639 896Q639 884 624 877L598 866Z"/>
     <path d="M386 894H500M524 894H638" class="size-body-detail"/>
    </g>
   </svg>`;
   diagram = illustration.querySelector('svg');
   diagram.addEventListener('click', event => {
    const zone = event.target.closest('[data-size-zone]');
    if (zone) selectCategory(zone.dataset.sizeZone);
   });
   detailDiagram = svgEl('svg', { viewBox: '0 0 600 560', class: 'size-detail-body', role: 'img' });
   backButton = button('전체 보기', () => {
    zoomed = false; renderDiagram();
    root.querySelector('[data-size-category="' + selectedCategory + '"]').focus({ preventScroll: true });
   }, { className: 'size-back-button' });
   illustration.append(detailDiagram, backButton, el('p', { className: 'size-diagram-hint', textContent: '부위를 선택하면 확대 도면에 치수가 표시됩니다.' }));
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
   selectCategory(categorySelections.get(scope + '/' + selectedProfile.id) || 'top', false);
  }
  return { render };
 }
 return { normalize, mount };
})();
