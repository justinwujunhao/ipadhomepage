const stateUrl = '/api/state';
const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: 'long',
  day: 'numeric'
});
const weekdayFormatter = new Intl.DateTimeFormat('zh-CN', { weekday: 'long' });
const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
});
const relativeFormatter = new Intl.RelativeTimeFormat('zh-CN', { numeric: 'auto' });
let latestState = null;
const pendingTodoIds = new Set();

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatRelativeTime(value) {
  if (!value) return '';
  const diffMinutes = Math.round((Date.parse(value) - Date.now()) / 60000);
  if (Math.abs(diffMinutes) < 60) return relativeFormatter.format(diffMinutes, 'minute');
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return relativeFormatter.format(diffHours, 'hour');
  return relativeFormatter.format(Math.round(diffHours / 24), 'day');
}

function formatNumber(value) {
  return Number.isFinite(Number(value)) ? Math.round(Number(value)) : '--';
}

function updateClock() {
  const now = new Date();
  $('time').textContent = timeFormatter.format(now);
  $('date').textContent = dateFormatter.format(now);
  $('weekday').textContent = weekdayFormatter.format(now);
}

function renderWeather(state) {
  const weather = state.weather || {};
  const current = weather.current || {};
  const daily = weather.daily || {};
  $('weather-city').textContent = state.settings.cityName || '广东省佛山市';
  $('weather-temp').textContent = `${formatNumber(current.temperature)}°`;
  $('weather-summary').textContent = current.summary || daily.summary || '天气更新中';

  const detail = [
    daily.minTemperature != null && daily.maxTemperature != null
      ? `${formatNumber(daily.minTemperature)}° / ${formatNumber(daily.maxTemperature)}°`
      : '',
    current.apparentTemperature != null ? `体感 ${formatNumber(current.apparentTemperature)}°` : '',
    current.humidity != null ? `湿度 ${formatNumber(current.humidity)}%` : '',
    current.windSpeed != null ? `风速 ${formatNumber(current.windSpeed)} km/h` : ''
  ].filter(Boolean);

  $('weather-detail').textContent = detail.length ? detail.join(' · ') : '暂无天气数据';
  if (weather.status === 'error') {
    $('weather-updated').textContent = `天气暂不可用：${weather.error || '更新失败'}`;
  } else if (weather.status === 'stale') {
    $('weather-updated').textContent = `天气未能更新，显示${formatRelativeTime(weather.updatedAt)}的数据`;
  } else {
    $('weather-updated').textContent = weather.updatedAt
      ? `更新于 ${formatRelativeTime(weather.updatedAt)}`
      : '尚未更新';
  }
}

function renderMessages(messages = []) {
  $('message-count').textContent = `${messages.length} 条`;
  $('messages').innerHTML = messages.length
    ? messages
        .map(
          (message) => `
            <div class="message-item">
              ${escapeHtml(message.text)}
              <span class="message-meta">${escapeHtml(formatRelativeTime(message.updatedAt || message.createdAt))}</span>
            </div>
          `
        )
        .join('')
    : '<div class="empty">还没有留言。</div>';
}

function renderTodos(todos = []) {
  const activeCount = todos.filter((todo) => !todo.done).length;
  $('todo-count').textContent = `${activeCount}/${todos.length} 项`;
  $('todos').innerHTML = todos.length
    ? todos
        .map(
          (todo) => `
            <button class="todo-item ${todo.done ? 'done' : ''}" data-todo-id="${escapeHtml(todo.id)}" aria-pressed="${
              todo.done ? 'true' : 'false'
            }" ${pendingTodoIds.has(todo.id) ? 'disabled' : ''}>
              <span class="todo-check" aria-hidden="true"></span>
              <div>
                ${escapeHtml(todo.text)}
                <span class="todo-meta">${todo.done ? '已完成，点击可取消' : '待完成，点击可标记'}</span>
              </div>
            </button>
          `
        )
        .join('')
    : '<div class="empty">没有备忘事项。</div>';
}

async function loadState() {
  try {
    const response = await fetch(stateUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const state = await response.json();
    latestState = state;

    $('board-title').textContent = state.settings.title || '家里的小看板';
    if (state.settings.backgroundImage) {
      document.body.style.setProperty('--board-bg', `url("${state.settings.backgroundImage}")`);
    } else {
      document.body.style.removeProperty('--board-bg');
    }

    renderWeather(state);
    renderMessages(state.messages);
    renderTodos(state.todos);
  } catch {
    $('weather-updated').textContent = '无法连接 Mac mini 服务';
  }
}

$('todos').addEventListener('click', async (event) => {
  const item = event.target.closest('.todo-item');
  if (!item || !latestState) return;

  const todo = latestState.todos.find((entry) => entry.id === item.dataset.todoId);
  if (!todo || pendingTodoIds.has(todo.id)) return;

  pendingTodoIds.add(todo.id);
  const nextDone = !todo.done;
  const previousTodos = latestState.todos.map((entry) => ({ ...entry }));
  latestState.todos = latestState.todos.map((entry) =>
    entry.id === todo.id ? { ...entry, done: nextDone } : entry
  );
  renderTodos(latestState.todos);

  try {
    const response = await fetch('/api/todos', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: todo.id, text: todo.text, done: nextDone })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    latestState = await response.json();
  } catch {
    latestState.todos = previousTodos;
  } finally {
    pendingTodoIds.delete(todo.id);
    renderTodos(latestState.todos);
  }
});

updateClock();
loadState();
setInterval(updateClock, 30 * 1000);
setInterval(loadState, 5 * 1000);
