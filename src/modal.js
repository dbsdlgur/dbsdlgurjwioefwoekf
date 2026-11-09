// Shared draft-only add dialog. State changes only when the form is submitted.
window.VaultModal = (() => {
 const el = (tag, props = {}) => Object.assign(document.createElement(tag), props);
 function open({ title, fields, onAdd, initialFocus, focusAfterClose }) {
  const scroll = { x: scrollX, y: scrollY }, opener = document.activeElement;
  const dialog = el('dialog', { className: 'password-add-dialog' });
  dialog.setAttribute('aria-labelledby', 'entry-add-title');
  dialog.setAttribute('aria-describedby', 'entry-add-hint');
  const form = el('form');
  form.append(el('h2', { id: 'entry-add-title', textContent: title }),
   el('p', { id: 'entry-add-hint', textContent: '목록에 추가한 뒤 상단 저장 버튼으로 저장하세요.' }));
  const grid = el('div', { className: 'password-add-fields' }), inputs = new Map();
  for (const field of fields) {
   const label = el('label', { className: 'password-field' });
   label.dataset.field = field.key;
   if (field.wide) label.classList.add('add-field-wide');
   const input = field.multiline
    ? el('textarea', { rows: field.rows || 2 }) : el('input', { type: 'text' });
   Object.assign(input, { name: field.key, value: field.value ?? '', autocomplete: 'off', placeholder: field.placeholder || '' });
   input.setAttribute('aria-label', field.label);
   if (field.validate) {
    const check = () => {
     const valid = field.validate(input.value);
     input.setAttribute('aria-invalid', String(!valid));
     input.setCustomValidity(valid ? '' : field.validationMessage);
    };
    input.addEventListener('input', check);
    check();
   }
   inputs.set(field.key, input);
   label.append(el('span', { className: 'password-label', textContent: field.label }), input);
   grid.append(label);
  }
  const actions = el('div', { className: 'password-add-actions' });
  const cancel = el('button', { type: 'button', textContent: '취소' });
  cancel.onclick = () => dialog.close();
  actions.append(cancel, el('button', { type: 'submit', className: 'primary', textContent: '추가' }));
  form.append(grid, actions);
  form.addEventListener('submit', event => {
   event.preventDefault();
   onAdd(Object.fromEntries([...inputs].map(([key, input]) => [key, input.value])));
   dialog.close();
  });
  dialog.addEventListener('close', () => {
   dialog.remove();
   const target = opener?.isConnected ? opener : focusAfterClose?.();
   target?.focus({ preventScroll: true });
   window.scrollTo(scroll.x, scroll.y);
   // A status message or rebuilt list may trigger scroll anchoring on the next layout.
   requestAnimationFrame(() => window.scrollTo(scroll.x, scroll.y));
  }, { once: true });
  dialog.append(form);
  document.body.append(dialog);
  dialog.showModal();
  (inputs.get(initialFocus) || inputs.values().next().value)?.focus({ preventScroll: true });
 }
 return { open };
})();
