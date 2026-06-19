// lib/vk.js
// Сбор метрик из VK: подписчики группы и метрики клипов (коротких видео).

const VK_API_VERSION = '5.199';
const VK_API_BASE = 'https://api.vk.com/method';

async function vkCall(method, params) {
  const url = new URL(`${VK_API_BASE}/${method}`);
  url.searchParams.set('access_token', process.env.VK_GROUP_TOKEN);
  url.searchParams.set('v', VK_API_VERSION);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const res = await fetch(url.toString());
  const data = await res.json();

  if (data.error) {
    throw new Error(`VK API ошибка (${method}): ${data.error.error_msg} (код ${data.error.error_code})`);
  }
  return data.response;
}

// Возвращает { followers } — текущее число подписчиков группы
export async function fetchVkAccountMetrics() {
  const groupId = process.env.VK_GROUP_ID; // например "club237224882" или "237224882"
  const cleanId = String(groupId).replace(/^club/, '');

  const response = await vkCall('groups.getById', {
    group_id: cleanId,
    fields: 'members_count',
  });

  const group = Array.isArray(response) ? response[0] : response.groups?.[0];
  return {
    followers: group?.members_count ?? 0,
  };
}

// Возвращает массив последних N клипов группы с их метриками.
// Клипы — это короткие вертикальные видео VK, помечаются is_clip:1 в ответе video.get.
export async function fetchVkPostMetrics(count = 30) {
  const groupId = process.env.VK_GROUP_ID;
  const cleanId = String(groupId).replace(/^club/, '');
  const ownerId = `-${cleanId}`; // группы передаются с минусом

  const response = await vkCall('video.get', {
    owner_id: ownerId,
    count,
    extended: 0,
  });

  const items = response.items || [];
  const clips = items.filter((video) => video.is_clip === 1 || video.is_clip === true);
  const source = clips.length > 0 ? clips : items; // если is_clip не пришёл — берём все видео как запасной вариант

  return source.map((video) => ({
    postId: String(video.id),
    title: (video.title || '').slice(0, 200),
    url: `https://vk.com/video${video.owner_id}_${video.id}`,
    publishedAt: new Date(video.date * 1000).toISOString(),
    likes: video.likes?.count ?? 0,
    comments: video.comments ?? 0,
    reposts: video.reposts?.count ?? 0,
    views: video.views ?? 0,
  }));
}
