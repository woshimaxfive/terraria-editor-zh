let closePicker;

export function chooseColor(json, changed) {
  closePicker?.();
  const options = JSON.parse(json);
  const original = options.value || '#000000';
  const dialog = document.createElement('dialog');
  dialog.setAttribute('aria-label', '选择颜色');
  Object.assign(dialog.style, {
    color: '#eeeeee', background: '#292929', border: '1px solid #666666',
    borderRadius: '8px', padding: '24px', maxWidth: 'calc(100vw - 48px)',
    font: '14px sans-serif'
  });
  const label = document.createElement('label');
  label.textContent = '选择颜色 ';
  const input = document.createElement('input');
  input.type = 'color';
  input.value = /^#[0-9a-f]{6}$/i.test(original) ? original : '#000000';
  input.dataset.teditColor = options.target;
  input.setAttribute('aria-label', '颜色');
  Object.assign(input.style, { width: '80px', height: '40px', verticalAlign: 'middle' });
  label.append(input);
  const hint = document.createElement('p');
  hint.textContent = '预览后点击应用，取消可恢复打开前的颜色。';
  const actions = document.createElement('div');
  Object.assign(actions.style, { display: 'flex', gap: '12px', justifyContent: 'flex-end' });
  const cancel = document.createElement('button');
  cancel.textContent = '取消';
  const apply = document.createElement('button');
  apply.textContent = '应用';
  for (const button of [cancel, apply]) button.style.padding = '8px 16px';
  actions.append(cancel, apply);
  dialog.append(label, hint, actions);
  document.body.append(dialog);

  let closed = false;
  function close(commit = false) {
    if (closed) return;
    closed = true;
    changed(options.target, commit ? input.value.toUpperCase() : original);
    dialog.close();
    dialog.remove();
    if (closePicker === close) closePicker = null;
  }
  closePicker = close;
  input.oninput = input.onchange = () => changed(options.target, input.value.toUpperCase());
  cancel.onclick = () => close();
  apply.onclick = () => close(true);
  dialog.oncancel = event => { event.preventDefault(); close(); };
  dialog.onclose = () => close();
  dialog.showModal();
  return '{}';
}
