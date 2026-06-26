// api/collect.js
// Вызывается автоматически раз в сутки (см. vercel.json) и вручную при необходимости.
// Собирает текущие метрики из YouTube и Instagram и сохраняет их в базу данных как новый снимок.
import { getDb, ensureSchema } from '../lib/db.js';
import { fetchYoutubeAccountMetrics, fetchYoutubePostMetrics } from '../lib/youtube.js';
import { fetchInstagramAccountMetrics, fetchInstagramPostMetrics } from '../lib/instagram.js';

export default async function handler(req, res) {
  // Vercel Cron вызывает эту функцию автоматически, подписывая запрос секретом CRON_SECRET.
  // Дополнительно разрешаем ручной запуск по секретному ключу через ?secret=... — удобно для проверки.
  const authHeader = req.headers['authorization'];
  const isCron = process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`;
  const providedSecret = req.query?.secret;
  const isManualAuthorized =
    process.env.COLLECT_SECRET && providedSecret === process.env.COLLECT_SECRET;

  if (!isCron && !isManualAuthorized) {
    return res.status(401).json({ error: 'Не авторизовано' });
  }

  const sql = getDb();
  await ensureSchema(sql);

  const results = { youtube: null, instagram: null, errors: [] };

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

  // --- Instagram ---
  try {
    const igAccount = await fetchInstagramAccountMetrics();
    await sql`
      INSERT INTO account_metrics (platform, followers, total_views)
      VALUES ('instagram', ${igAccount.followers}, 0)
    `;
    const igPosts = await fetchInstagramPostMetrics(30);
    for (const post of igPosts) {
      await sql`
        INSERT INTO post_metrics (platform, post_id, title, url, published_at, likes, comments, reposts, views)
        VALUES ('instagram', ${post.postId}, ${post.title}, ${post.url}, ${post.publishedAt}, ${post.likes}, ${post.comments}, ${post.reposts}, ${post.views})
      `;
    }
    results.instagram = { followers: igAccount.followers, postsCollected: igPosts.length };
  } catch (err) {
    results.errors.push(`Instagram: ${err.message}`);
  }

  const status = results.errors.length > 0 ? 207 : 200;
  return res.status(status).json({
    collectedAt: new Date().toISOString(),
    ...results,
  });
}
