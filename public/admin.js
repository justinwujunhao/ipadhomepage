let currentState = null;

function $(id) {
  return document.getElementById(id);
}

function setStatus(message) {
  $('status').textContent = message;
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {})
    }
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  currentState = payload;
  render();
  return payload;
}

async function loadState() {
  const response = await fetch('/api/state', { cache: 'no-store' });
  currentState = await response.json();
  render();
}

function renderSettings() {
  const form = $('settings-form');
  const settings = currentState.settings || {};
  form.title.value = settings.title || '';
  form.cityName.value = settings.cityName || '';
  form.latitude.value = settings.latitude || '';
  form.longitude.value = settings.longitude || '';
  form.backgroundImages.value = (settings.backgroundImages || []).join('\n');
}

function renderMessages() {
  const messages = currentState.messages || [];
  $('message-editor').innerHTML = messages.length
    ? messages
        .map(
          (message) => `
            <div class="editor-item" data-kind="message" data-id="${escapeHtml(message.id)}">
              <span aria-hidden="true">💬</span>
              <input value="${escapeHtml(message.text)}" aria-label="留言内容">
              <button class="save-button" type="button">保存</button>
              <button class="delete-button" type="button">删除</button>
            </div>
          `
        )
        .join('')
    : '<p class="help-text">还没有留言。</p>';
}

function renderTodos() {
  const todos = currentState.todos || [];
  $('todo-editor').innerHTML = todos.length
    ? todos
        .map(
          (todo) => `
            <div class="editor-item" data-kind="todo" data-id="${escapeHtml(todo.id)}">
              <input type="checkbox" ${todo.done ? 'checked' : ''} aria-label="完成状态">
              <input value="${escapeHtml(todo.text)}" aria-label="备忘内容">
              <button class="save-button" type="button">保存</button>
              <button class="delete-button" type="button">删除</button>
            </div>
          `
        )
        .join('')
    : '<p class="help-text">还没有备忘。</p>';
}

function render() {
  if (!currentState) return;
  renderSettings();
  renderMessages();
  renderTodos();
}

$('settings-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    await api('/api/settings', {
      method: 'POST',
      body: JSON.stringify({
        title: form.title.value,
        cityName: form.cityName.value,
        latitude: form.latitude.value,
        longitude: form.longitude.value,
        backgroundImages: form.backgroundImages.value.split('\n').map((line) => line.trim()).filter(Boolean)
      })
    });
    setStatus('设置已保存');
  } catch (error) {
    setStatus(`保存失败：${error.message}`);
  }
});

$('message-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const text = form.text.value.trim();
  if (!text) return;
  try {
    await api('/api/messages', { method: 'POST', body: JSON.stringify({ text }) });
    form.reset();
    setStatus('留言已添加');
  } catch (error) {
    setStatus(`添加失败：${error.message}`);
  }
});

$('todo-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const text = form.text.value.trim();
  if (!text) return;
  try {
    await api('/api/todos', { method: 'POST', body: JSON.stringify({ text }) });
    form.reset();
    setStatus('备忘已添加');
  } catch (error) {
    setStatus(`添加失败：${error.message}`);
  }
});

document.addEventListener('click', async (event) => {
  const item = event.target.closest('.editor-item');
  if (!item) return;
  const kind = item.dataset.kind;
  const id = item.dataset.id;

  try {
    if (event.target.classList.contains('delete-button')) {
      await api(`/api/${kind === 'message' ? 'messages' : 'todos'}/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
      setStatus(kind === 'message' ? '留言已删除' : '备忘已删除');
    }

    if (event.target.classList.contains('save-button')) {
      if (kind === 'message') {
        const text = item.querySelector('input').value.trim();
        await api('/api/messages', { method: 'POST', body: JSON.stringify({ id, text }) });
        setStatus('留言已保存');
      } else {
        const checkbox = item.querySelector('input[type="checkbox"]');
        const text = item.querySelector('input[aria-label="备忘内容"]').value.trim();
        await api('/api/todos', { method: 'POST', body: JSON.stringify({ id, text, done: checkbox.checked }) });
        setStatus('备忘已保存');
      }
    }
  } catch (error) {
    setStatus(`操作失败：${error.message}`);
  }
});

document.addEventListener('change', async (event) => {
  const item = event.target.closest('.editor-item[data-kind="todo"]');
  if (!item || event.target.type !== 'checkbox') return;
  const text = item.querySelector('input[aria-label="备忘内容"]').value.trim();
  try {
    await api('/api/todos', {
      method: 'POST',
      body: JSON.stringify({ id: item.dataset.id, text, done: event.target.checked })
    });
    setStatus('备忘状态已更新');
  } catch (error) {
    setStatus(`更新失败：${error.message}`);
  }
});

loadState().catch((error) => setStatus(`读取失败：${error.message}`));
loadAssets().catch((error) => setStatus(`图片读取失败：${error.message}`));

async function loadAssets() {
  const response = await fetch('/api/assets', { cache: 'no-store' });
  const assets = await response.json();
  renderAssets(assets);
}

function renderAssets(assets) {
  const grid = $('asset-grid');
  grid.innerHTML = assets.length
    ? assets
        .map(
          (asset) => `
            <div class="asset-item" data-name="${escapeHtml(asset.name)}">
              <img src="${escapeHtml(asset.path)}" alt="${escapeHtml(asset.name)}" loading="lazy">
              <span class="asset-name">${escapeHtml(asset.name)}</span>
              <div class="asset-actions">
                <button type="button" class="add-button">加入</button>
                <button type="button" class="delete-button">删除</button>
              </div>
            </div>
          `
        )
        .join('')
    : '<p class="help-text">还没有上传图片。</p>';
}

function assetPathFor(name) {
  return `/assets/${name}`;
}

$('bg-upload-btn').addEventListener('click', async () => {
  const input = $('bg-file');
  const file = input.files && input.files[0];
  if (!file) {
    setStatus('请先选择图片');
    return;
  }
  setStatus('上传中…');
  try {
    const response = await fetch(`/api/assets?name=${encodeURIComponent(file.name)}`, {
      method: 'POST',
      headers: { 'content-type': file.type || 'application/octet-stream' },
      body: file
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || `HTTP ${response.status}`);
    }
    setStatus('上传成功，点"加入"添加到轮播');
    input.value = '';
    await loadAssets();
  } catch (error) {
    setStatus(`上传失败：${error.message}`);
  }
});

$('asset-grid').addEventListener('click', async (event) => {
  const item = event.target.closest('.asset-item');
  if (!item) return;
  const name = item.dataset.name;
  const assetPath = assetPathFor(name);
  const textarea = $('settings-form').backgroundImages;

  if (event.target.classList.contains('add-button')) {
    const lines = textarea.value.split('\n').map((line) => line.trim()).filter(Boolean);
    if (!lines.includes(assetPath)) lines.push(assetPath);
    textarea.value = lines.join('\n');
    setStatus(`已加入 ${assetPath}（记得保存设置）`);
    return;
  }

  if (event.target.classList.contains('delete-button')) {
    if (!confirm(`删除 ${name}？此操作不可撤销。`)) return;
    try {
      const response = await fetch(`/api/assets/${encodeURIComponent(name)}`, { method: 'DELETE' });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      textarea.value = textarea.value
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== assetPath)
        .join('\n');
      setStatus(`已删除 ${name}`);
      await loadAssets();
    } catch (error) {
      setStatus(`删除失败：${error.message}`);
    }
  }
});
