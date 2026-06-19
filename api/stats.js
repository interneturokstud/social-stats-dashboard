// api/stats.js
// Отдаёт агрегированные данные для дашборда: текущие показатели,
// динамику по дням и топ постов/видео.
//
// Параметры запроса:
//   ?days=7|30|90|365 — глубина истории для графика динамики (по умолчанию 30)

import { getDb, ensureSchema } from '../lib/db.js';

export default async function handler(req, res) {
  const sql = getDb();
  await ensureSchema(sql);

  const days = Math.min(Math.max(Number(req.query?.days) || 30, 1), 365);

  // --- Текущие показатели (самый свежий снимок по каждой платформе) ---
  const latestAccount = await sql`
    SELECT DISTINCT ON (platform) platform, followers, total_views, collected_at
    FROM account_metrics
    ORDER BY platform, collected_at DESC
  `;

  // --- Показатели на начало выбранного периода, для расчёта изменения ---
  const periodStartAccount = await sql`
    SELECT DISTINCT ON (platform) platform, followers, total_views, collected_at
    FROM account_metrics
    WHERE collected_at <= now() - (${days}::text || ' days')::interval
    ORDER BY platform, collected_at DESC
  `;

  // --- Сумма лайков/комментов/репостов/просмотров за период (последний снимок каждого поста) ---
  const postTotals = await sql`
    SELECT platform,
           COALESCE(SUM(likes), 0) AS likes,
           COALESCE(SUM(comments), 0) AS comments,
           COALESCE(SUM(reposts), 0) AS reposts,
           COALESCE(SUM(views), 0) AS views
    FROM (
      SELECT DISTINCT ON (platform, post_id) platform, post_id, likes, comments, reposts, views
      FROM post_metrics
      ORDER BY platform, post_id, collected_at DESC
    ) latest_per_post
    GROUP BY platform
  `;

  // --- Динамика по дням: подписчики на конец каждого дня ---
  const dailyFollowers = await sql`
    SELECT platform, date_trunc('day', collected_at) AS day, MAX(followers) AS followers
    FROM account_metrics
    WHERE collected_at >= now() - (${days}::text || ' days')::interval
    GROUP BY platform, day
    ORDER BY day ASC
  `;

  // --- Топ постов/видео по лайкам (последний снимок каждого) ---
  const topPosts = await sql`
    SELECT DISTINCT ON (platform, post_id)
      platform, post_id, title, url, published_at, likes, comments, reposts, views
    FROM post_metrics
    ORDER BY platform, post_id, collected_at DESC
  `;
  topPosts.sort((a, b) => Number(b.likes) - Number(a.likes));

  return res.status(200).json({
    generatedAt: new Date().toISOString(),
    periodDays: days,
    latestAccount,
    periodStartAccount,
    postTotals,
    dailyFollowers,
    topPosts: topPosts.slice(0, 15),
  });
}
