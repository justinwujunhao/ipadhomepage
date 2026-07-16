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
let bgSlides = [];
let bgIndex = 0;
let bgActiveLayer = 'a';
let bgTimer = null;

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
  updateLunarAndBadge(now);
  updateNightMode();
}

function updateLunarAndBadge(now) {
  if (!window.HomeCalendar) return;
  const lunar = HomeCalendar.lunarOf(now);
  $('lunar').textContent = lunar.text;

  const holiday = HomeCalendar.holidayOf(now);
  const term = HomeCalendar.termInfo(now);
  const parts = [];
  if (holiday) parts.push(holiday);
  if (term.today) {
    parts.push(`今日 ${term.today}`);
  } else if (term.next) {
    parts.push(`下一节气 ${term.next.name} 还有 ${term.next.inDays} 天`);
  }
  $('day-badge').textContent = parts.join(' · ');
}

function updateNightMode() {
  const hour = new Date().getHours();
  document.body.classList.toggle('night', hour >= 22 || hour < 6);
}

function renderWeather(state) {
  const weather = state.weather || {};
  const current = weather.current || {};
  const daily = weather.daily || {};
  $('weather-city').textContent = state.settings.cityName || '广东省佛山市';
  $('weather-temp').textContent = `${formatNumber(current.temperature)}°`;
  $('weather-summary').textContent = current.summary || (Array.isArray(daily.summary) ? daily.summary[0] : '') || '天气更新中';

  const minT = Array.isArray(daily.minTemperature) ? daily.minTemperature[0] : null;
  const maxT = Array.isArray(daily.maxTemperature) ? daily.maxTemperature[0] : null;
  const detail = [
    minT != null && maxT != null ? `${formatNumber(minT)}° / ${formatNumber(maxT)}°` : '',
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

const weekdayShortFormatter = new Intl.DateTimeFormat('zh-CN', { weekday: 'short' });

function renderForecast(state) {
  const daily = (state.weather && state.weather.daily) || {};
  const times = Array.isArray(daily.time) ? daily.time : [];
  if (!times.length) {
    $('forecast').innerHTML = '';
    return;
  }
  const summaries = daily.summary || [];
  const maxs = Array.isArray(daily.maxTemperature) ? daily.maxTemperature : [];
  const mins = Array.isArray(daily.minTemperature) ? daily.minTemperature : [];

  const items = times.map((iso, i) => {
    const date = new Date(`${iso}T00:00:00`);
    const label = i === 0 ? '今天' : weekdayShortFormatter.format(date);
    return `
      <div class="forecast-day">
        <span class="forecast-dow">${escapeHtml(label)}</span>
        <span class="forecast-sum">${escapeHtml(summaries[i] || '--')}</span>
        <span class="forecast-temp">${formatNumber(mins[i])}° / ${formatNumber(maxs[i])}°</span>
      </div>
    `;
  });

  $('forecast').innerHTML = items.join('');
}

function renderQRCode() {
  const target = `${location.origin}/admin`;
  try {
    const qr = qrcode(0, 'M');
    qr.addData(target);
    qr.make();
    $('qr-popover-body').innerHTML = `${qr.createSvgTag(4, 2)}<span class="qr-caption">扫码打开管理页</span><span class="qr-hint">点击空白处关闭</span>`;
  } catch {
    $('qr-popover-body').innerHTML = '';
  }
}

function toggleQRPopover(open) {
  const popover = $('qr-popover');
  const trigger = $('qr-trigger');
  const willOpen = typeof open === 'boolean' ? open : popover.hidden;
  popover.hidden = !willOpen;
  trigger.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
}

$('qr-trigger').addEventListener('click', (event) => {
  event.stopPropagation();
  toggleQRPopover();
});

document.addEventListener('click', (event) => {
  if ($('qr-popover').hidden) return;
  if (event.target.closest('.qr-popover') || event.target.closest('.qr-trigger')) return;
  toggleQRPopover(false);
});

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
    applyBackground(state);

    renderWeather(state);
    renderForecast(state);
    renderMessages(state.messages);
    renderTodos(state.todos);
  } catch {
    $('weather-updated').textContent = '无法连接 Mac mini 服务';
  }
}

function applyBackground(state) {
  const settings = state.settings || {};
  const list = Array.isArray(settings.backgroundImages) ? settings.backgroundImages.filter(Boolean) : [];
  const imgs = list.length ? list : (settings.backgroundImage ? [settings.backgroundImage] : []);

  // 列表未变化时保留当前轮播进度和 timer，避免被 5 秒一次的 loadState 反复重置
  if (imgs.length === bgSlides.length && imgs.every((value, i) => value === bgSlides[i])) {
    return;
  }

  if (bgTimer) {
    clearInterval(bgTimer);
    bgTimer = null;
  }
  bgSlides = imgs;
  bgIndex = 0;

  const slideA = $('bg-slide-a');
  const slideB = $('bg-slide-b');
  if (!imgs.length) {
    slideA.style.backgroundImage = '';
    slideB.style.backgroundImage = '';
    slideA.classList.remove('active');
    slideB.classList.remove('active');
    return;
  }

  bgActiveLayer = 'a';
  slideA.classList.remove('active');
  slideB.classList.remove('active');
  showBgSlide(0);

  if (imgs.length > 1) {
    bgTimer = setInterval(() => {
      bgIndex = (bgIndex + 1) % bgSlides.length;
      showBgSlide(bgIndex);
    }, 15000);
  }
}

function showBgSlide(index) {
  const url = bgSlides[index];
  if (!url) return;
  const nextLayer = bgActiveLayer === 'a' ? 'b' : 'a';
  const currentEl = $('bg-slide-' + bgActiveLayer);
  const nextEl = $('bg-slide-' + nextLayer);
  const img = new Image();
  img.onload = () => {
    nextEl.style.backgroundImage = `url("${url}")`;
    nextEl.classList.add('active');
    currentEl.classList.remove('active');
    bgActiveLayer = nextLayer;
  };
  img.src = url;
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
renderQRCode();
setInterval(updateClock, 30 * 1000);
setInterval(loadState, 5 * 1000);
