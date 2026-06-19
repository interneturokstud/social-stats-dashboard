// api/collect.js
// Вызывается автоматически раз в час (см. vercel.json) и вручную при необходимости.
// Собирает текущие метрики из VK и YouTube и сохраняет их в базу данных как новый снимок.

import { getDb, ensureSchema } from '../lib/db.js';
import { fetchVkAccountMetrics, fetchVkPostMetrics } from '../lib/vk.js';
import { fetchYoutubeAccountMetrics, fetchYoutubePostMetrics } from '../lib/youtube.js';

export default async function handler(req, res) {
  // Vercel Cron вызывает эту функцию автоматически. Дополнительно разрешаем
  // ручной запуск по секретному ключу через ?secret=... — удобно для проверки.
  const isCron = req.headers['x-vercel-cron'] !== undefined;
  const providedSecret = req.query?.secret;
  const isManualAuthorized =
    process.env.COLLECT_SECRET && providedSecret === process.env.COLLECT_SECRET;

  if (!isCron && !isManualAuthorized) {
    return res.status(401).json({ error: 'Не авторизовано' });
  }

  const sql = getDb();
  await ensureSchema(sql);

  const results = { vk: null, youtube: null, errors: [] };

  // --- VK ---
  try {
    const vkAccount = await fetchVkAccountMetrics();
    await sql`
      INSERT INTO account_metrics (platform, followers, total_views)
      VALUES ('vk', ${vkAccount.followers}, 0)
    `;

    const vkPosts = await fetchVkPostMetrics(30);
    for (const post of vkPosts) {
      await sql`
        INSERT INTO post_metrics (platform, post_id, title, url, published_at, likes, comments, reposts, views)
        VALUES ('vk', ${post.postId}, ${post.title}, ${post.url}, ${post.publishedAt}, ${post.likes}, ${post.comments}, ${post.reposts}, ${post.views})
      `;
    }
    results.vk = { followers: vkAccount.followers, postsCollected: vkPosts.length };
  } catch (err) {
    results.errors.push(`VK: ${err.message}`);
  }

  // --- YouTube ---
  try {
    const ytAccount = await fetchYoutubeAccountMetrics();
    await sql`
      INSERT INTO account_metrics (platform, followers, total_views)
      VALUES ('youtube', ${ytAccount.followers}, ${ytAccount.totalViews})
    `;

    const ytVideos = await fetchYoutubePostMetrics(30);
    for (const video of ytVideos) {
      await sql`
        INSERT INTO post_metrics (platform, post_id, title, url, published_at, likes, comments, reposts, views)
        VALUES ('youtube', ${video.postId}, ${video.title}, ${video.url}, ${video.publishedAt}, ${video.likes}, ${video.comments}, ${video.reposts}, ${video.views})
      `;
    }
    results.youtube = { followers: ytAccount.followers, postsCollected: ytVideos.length };
  } catch (err) {
    results.errors.push(`YouTube: ${err.message}`);
  }

  const status = results.errors.length > 0 ? 207 : 200;
  return res.status(status).json({
    collectedAt: new Date().toISOString(),
    ...results,
  });
}
