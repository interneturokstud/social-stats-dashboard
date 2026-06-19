// lib/youtube.js
// Сбор метрик из YouTube: подписчики канала и метрики последних видео.

const YT_API_BASE = 'https://www.googleapis.com/youtube/v3';

async function ytCall(endpoint, params) {
  const url = new URL(`${YT_API_BASE}/${endpoint}`);
  url.searchParams.set('key', process.env.YOUTUBE_API_KEY);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const res = await fetch(url.toString());
  const data = await res.json();

  if (data.error) {
    throw new Error(`YouTube API ошибка (${endpoint}): ${data.error.message}`);
  }
  return data;
}

// Возвращает { followers, totalViews, uploadsPlaylistId }
export async function fetchYoutubeAccountMetrics() {
  const channelId = process.env.YOUTUBE_CHANNEL_ID;

  const data = await ytCall('channels', {
    part: 'statistics,contentDetails',
    id: channelId,
  });

  const channel = data.items?.[0];
  if (!channel) {
    throw new Error('Канал YouTube не найден — проверьте YOUTUBE_CHANNEL_ID');
  }

  return {
    followers: Number(channel.statistics.subscriberCount ?? 0),
    totalViews: Number(channel.statistics.viewCount ?? 0),
    uploadsPlaylistId: channel.contentDetails.relatedPlaylists.uploads,
  };
}

// Возвращает массив последних N видео с их метриками
export async function fetchYoutubePostMetrics(count = 20) {
  const { uploadsPlaylistId } = await fetchYoutubeAccountMetrics();

  // Шаг 1: получаем последние ID видео из плейлиста загрузок
  const playlistData = await ytCall('playlistItems', {
    part: 'contentDetails,snippet',
    playlistId: uploadsPlaylistId,
    maxResults: String(Math.min(count, 50)),
  });

  const videoIds = (playlistData.items || []).map((item) => item.contentDetails.videoId);
  if (videoIds.length === 0) return [];

  // Шаг 2: получаем статистику этих видео за один запрос
  const videosData = await ytCall('videos', {
    part: 'statistics,snippet',
    id: videoIds.join(','),
  });

  return (videosData.items || []).map((video) => ({
    postId: video.id,
    title: (video.snippet.title || '').slice(0, 200),
    url: `https://www.youtube.com/watch?v=${video.id}`,
    publishedAt: video.snippet.publishedAt,
    likes: Number(video.statistics.likeCount ?? 0),
    comments: Number(video.statistics.commentCount ?? 0),
    reposts: 0, // YouTube не предоставляет число репостов через публичный API
    views: Number(video.statistics.viewCount ?? 0),
  }));
}
