// lib/instagram.js
// Сбор метрик из Instagram: подписчики аккаунта и метрики последних публикаций.
const IG_API_BASE = 'https://graph.instagram.com/v22.0';

async function igCall(path, params = {}) {
  const url = new URL(`${IG_API_BASE}/${path}`);
  url.searchParams.set('access_token', process.env.INSTAGRAM_ACCESS_TOKEN);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const res = await fetch(url.toString());
  const data = await res.json();
  if (data.error) {
    throw new Error(`Instagram API ошибка (${path}): ${data.error.message}`);
  }
  return data;
}

export async function fetchInstagramAccountMetrics() {
  const userId = process.env.INSTAGRAM_USER_ID;
  const data = await igCall(userId, {
    fields: 'followers_count,media_count',
  });
  return {
    followers: Number(data.followers_count ?? 0),
    mediaCount: Number(data.media_count ?? 0),
  };
}

function parseMetricValue(data, name) {
  const item = (data.data || []).find((m) => m.name === name);
  return Number(item?.values?.[0]?.value ?? 0);
}

let debugLogsLeft = 3; // покажем подробности только для первых 3 постов, чтобы не засорять логи

async function fetchPostInsights(postId, mediaType) {
  const result = { reposts: 0, shares: 0, views: 0 };
  const shouldLog = debugLogsLeft > 0;
  if (shouldLog) debugLogsLeft -= 1;

  try {
    const data = await igCall(`${postId}/insights`, { metric: 'reposts,shares' });
    if (shouldLog) console.log('IG_INSIGHTS_RAW reposts/shares', postId, mediaType, JSON.stringify(data));
    result.reposts = parseMetricValue(data, 'reposts');
    result.shares = parseMetricValue(data, 'shares');
  } catch (err) {
    console.error(`Instagram insights (reposts/shares) для ${postId}:`, err.message);
  }

  try {
    const data = await igCall(`${postId}/insights`, { metric: 'views' });
    if (shouldLog) console.log('IG_INSIGHTS_RAW views', postId, mediaType, JSON.stringify(data));
    result.views = parseMetricValue(data, 'views');
  } catch (err) {
    console.error(`Instagram insights (views) для ${postId}:`, err.message);
  }

  return result;
}

export async function fetchInstagramPostMetrics(count = 30) {
  const userId = process.env.INSTAGRAM_USER_ID;
  const data = await igCall(`${userId}/media`, {
    fields: 'id,caption,media_type,permalink,timestamp,like_count,comments_count',
    limit: String(count),
  });
  const items = data.data || [];

  const posts = await Promise.all(items.map(async (item) => {
    const insights = await fetchPostInsights(item.id, item.media_type);
    return {
      postId: item.id,
      title: (item.caption || '').slice(0, 200),
      url: item.permalink,
      publishedAt: item.timestamp,
      likes: Number(item.like_count ?? 0),
      comments: Number(item.comments_count ?? 0),
      reposts: insights.reposts + insights.shares,
      views: insights.views,
    };
  }));
  return posts;
}
