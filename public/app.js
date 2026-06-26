// app.js — загружает данные с /api/stats и отрисовывает дашборд.

const PLATFORM_LABELS = { youtube: 'YouTube', instagram: 'Instagram' };
const numberFormatter = new Intl.NumberFormat('ru-RU');

function formatNumber(value) {
  return numberFormatter.format(Math.round(Number(value) || 0));
}

function formatDelta(current, previous) {
  const diff = Number(current) - Number(previous);
  if (!previous || diff === 0) {
    return { text: diff === 0 ? 'без изменений' : `${diff > 0 ? '+' : ''}${formatNumber(diff)}`, kind: 'neutral' };
  }
  const sign = diff > 0 ? '+' : '';
  return {
    text: `${sign}${formatNumber(diff)}`,
    kind: diff > 0 ? 'positive' : 'negative',
  };
}

function findPlatform(list, platform) {
  return (list || []).find((row) => row.platform === platform) || null;
}

async function loadStats(days) {
  const res = await fetch(`/api/stats?days=${days}`);
  if (!res.ok) throw new Error('Не удалось загрузить данные дашборда');
  return res.json();
}

function renderKpiRow(data) {
  const container = document.getElementById('kpi-row');

  const ytLatest = findPlatform(data.latestAccount, 'youtube');
  const igLatest = findPlatform(data.latestAccount, 'instagram');
  const ytStart = findPlatform(data.periodStartAccount, 'youtube');
  const igStart = findPlatform(data.periodStartAccount, 'instagram');

  const totalFollowersNow = (Number(ytLatest?.followers) || 0) + (Number(igLatest?.followers) || 0);
  const totalFollowersStart = (Number(ytStart?.followers) || 0) + (Number(igStart?.followers) || 0);

  const ytTotals = findPlatform(data.postTotals, 'youtube');
  const igTotals = findPlatform(data.postTotals, 'instagram');
  const totalViews = (Number(ytTotals?.views) || 0) + (Number(igTotals?.views) || 0) + (Number(ytLatest?.total_views) || 0);
  const totalLikes = (Number(ytTotals?.likes) || 0) + (Number(igTotals?.likes) || 0);
  const totalEngagement =
    totalLikes +
    (Number(ytTotals?.comments) || 0) + (Number(igTotals?.comments) || 0);

  const followersDelta = formatDelta(totalFollowersNow, totalFollowersStart);

  const cards = [
    {
      label: 'Подписчики всего',
      value: formatNumber(totalFollowersNow),
      delta: followersDelta,
    },
    {
      label: 'Просмотры (за период)',
      value: formatNumber(totalViews),
      delta: { text: `за ${data.periodDays} дн.`, kind: 'neutral' },
    },
    {
      label: 'Лайки (текущий снимок)',
      value: formatNumber(totalLikes),
      delta: { text: 'по всем публикациям', kind: 'neutral' },
    },
    {
      label: 'Вовлечённость всего',
      value: formatNumber(totalEngagement),
      delta: { text: 'лайки + комментарии', kind: 'neutral' },
    },
  ];

  container.innerHTML = cards.map((card) => `
    <div class="kpi-card">
      <span class="kpi-card__label">${card.label}</span>
      <div class="kpi-card__value-row">
        <span class="kpi-card__value">${card.value}</span>
        <span class="kpi-card__delta is-${card.delta.kind}">${card.delta.text}</span>
      </div>
    </div>
  `).join('');
}

function renderPlatformCard(platform, data) {
  const followersEl = document.getElementById(`${platform}-followers`);
  const metricsEl = document.getElementById(`${platform}-metrics`);

  const latest = findPlatform(data.latestAccount, platform);
  const totals = findPlatform(data.postTotals, platform);

  followersEl.textContent = latest ? `${formatNumber(latest.followers)} подписчиков` : 'нет данных';

  const metrics = [
    { label: 'Лайки', value: totals?.likes },
    { label: 'Комментарии', value: totals?.comments },
    { label: 'Репосты', value: totals?.reposts },
    { label: 'Просмотры', value: totals?.views },
  ];

  metricsEl.innerHTML = metrics.map((m) => `
    <div class="metric-pill">
      <span class="metric-pill__label">${m.label}</span>
      <span class="metric-pill__value">${formatNumber(m.value ?? 0)}</span>
    </div>
  `).join('');
}

function renderChart(data) {
  const svg = document.getElementById('chart-followers');
  const width = 640;
  const height = 220;
  const padding = { top: 16, right: 12, bottom: 24, left: 12 };

  // Суммируем подписчиков по дням (youtube + instagram), используя последнее известное
  // значение каждой платформы на каждый день (форвард-заполнение пропусков).
  const byDay = new Map();
  for (const row of data.dailyFollowers || []) {
    const dayKey = row.day.slice(0, 10);
    if (!byDay.has(dayKey)) byDay.set(dayKey, {});
    byDay.get(dayKey)[row.platform] = Number(row.followers);
  }

  const days = Array.from(byDay.keys()).sort();

  if (days.length < 2) {
    svg.innerHTML = `<text x="20" y="110" fill="var(--text-tertiary)" font-size="13" font-family="Inter">Пока недостаточно данных для графика — он появится после нескольких часов сбора.</text>`;
    return;
  }

  let lastYt = null;
  let lastIg = null;
  const totals = days.map((day) => {
    const entry = byDay.get(day);
    if (entry.youtube !== undefined) lastYt = entry.youtube;
    if (entry.instagram !== undefined) lastIg = entry.instagram;
    return (lastYt || 0) + (lastIg || 0);
  });

  const min = Math.min(...totals);
  const max = Math.max(...totals);
  const range = max - min || 1;

  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const points = totals.map((value, i) => {
    const x = padding.left + (i / (totals.length - 1)) * plotWidth;
    const y = padding.top + plotHeight - ((value - min) / range) * plotHeight;
    return [x, y];
  });

  const linePath = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1][0].toFixed(1)} ${(height - padding.bottom).toFixed(1)} L ${points[0][0].toFixed(1)} ${(height - padding.bottom).toFixed(1)} Z`;

  svg.innerHTML = `
    <defs>
      <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#f5a623" stop-opacity="0.28" />
        <stop offset="100%" stop-color="#f5a623" stop-opacity="0" />
      </linearGradient>
    </defs>
    <path d="${areaPath}" fill="url(#areaFill)" />
    <path d="${linePath}" fill="none" stroke="#f5a623" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />
    ${points.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.5" fill="#f5a623" />`).join('')}
  `;
}

function platformTag(platform) {
  if (platform === 'youtube') return 'YT';
  if (platform === 'instagram') return 'IG';
  return (platform || '').toUpperCase();
}

function renderTopTable(data) {
  const tbody = document.getElementById('top-table-body');

  if (!data.topPosts || data.topPosts.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">Публикации появятся здесь после первого сбора данных.</td></tr>`;
    return;
  }

  tbody.innerHTML = data.topPosts.map((post) => `
    <tr>
      <td><span class="top-table__platform-tag top-table__platform-tag--${post.platform}">${platformTag(post.platform)}</span></td>
      <td>
        <a class="top-table__title" href="${post.url}" target="_blank" rel="noopener" title="${escapeHtml(post.title || '')}">
          ${escapeHtml(post.title || '(без текста)')}
        </a>
      </td>
      <td class="num">${formatNumber(post.likes)}</td>
      <td class="num">${formatNumber(post.comments)}</td>
      <td class="num">${post.reposts > 0 ? formatNumber(post.reposts) : '—'}</td>
      <td class="num">${formatNumber(post.views)}</td>
    </tr>
  `).join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderUpdatedAt(data) {
  const el = document.getElementById('updated-at');
  const date = new Date(data.generatedAt);
  el.textContent = `обновлено в ${date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
}

async function refreshDashboard(days) {
  try {
    const data = await loadStats(days);
    renderKpiRow(data);
    renderPlatformCard('youtube', data);
    renderPlatformCard('instagram', data);
    renderChart(data);
    renderTopTable(data);
    renderUpdatedAt(data);
  } catch (err) {
    console.error(err);
    const kpiRow = document.getElementById('kpi-row');
    kpiRow.innerHTML = `<div class="empty-state">Не удалось загрузить данные. Проверьте, что база данных и переменные окружения настроены на Vercel.</div>`;
  }
}

function initPeriodSwitch() {
  const buttons = document.querySelectorAll('.period-switch__btn');
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      buttons.forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      refreshDashboard(Number(btn.dataset.days));
    });
  });
}

initPeriodSwitch();
refreshDashboard(30);
