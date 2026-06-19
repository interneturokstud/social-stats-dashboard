// lib/vk.js
// Сбор метрик из VK: подписчики группы и метрики последних постов.

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

// Возвращает массив последних N постов с их метриками
export async function fetchVkPostMetrics(count = 20) {
  const groupId = process.env.VK_GROUP_ID;
  const cleanId = String(groupId).replace(/^club/, '');
  const ownerId = `-${cleanId}`; // группы передаются с минусом

  const response = await vkCall('wall.get', {
    owner_id: ownerId,
    count,
    filter: 'owner',
  });

  return (response.items || []).map((post) => ({
    postId: String(post.id),
    title: (post.text || '').slice(0, 200),
    url: `https://vk.com/wall${ownerId}_${post.id}`,
    publishedAt: new Date(post.date * 1000).toISOString(),
    likes: post.likes?.count ?? 0,
    comments: post.comments?.count ?? 0,
    reposts: post.reposts?.count ?? 0,
    views: post.views?.count ?? 0,
  }));
}
