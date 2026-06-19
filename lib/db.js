// lib/db.js
// Подключение к базе данных Postgres (Neon/Vercel Postgres)
// и функции создания таблиц при первом запуске.

import { neon } from '@neondatabase/serverless';

export function getDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL не задан. Добавьте его в Environment Variables на Vercel.');
  }
  return neon(process.env.DATABASE_URL);
}

// Создаёт таблицы, если их ещё нет. Безопасно вызывать многократно.
export async function ensureSchema(sql) {
  // Снимки метрик аккаунта (подписчики и т.п.), один снимок = один момент времени
  await sql`
    CREATE TABLE IF NOT EXISTS account_metrics (
      id BIGSERIAL PRIMARY KEY,
      platform TEXT NOT NULL,           -- 'vk' | 'youtube'
      followers BIGINT NOT NULL DEFAULT 0,
      total_views BIGINT NOT NULL DEFAULT 0,
      collected_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  // Снимки метрик отдельных постов/видео
  await sql`
    CREATE TABLE IF NOT EXISTS post_metrics (
      id BIGSERIAL PRIMARY KEY,
      platform TEXT NOT NULL,           -- 'vk' | 'youtube'
      post_id TEXT NOT NULL,            -- идентификатор поста/видео на платформе
      title TEXT,                       -- текст поста или название видео (обрезанное)
      url TEXT,                         -- прямая ссылка на пост/видео
      published_at TIMESTAMPTZ,         -- когда был опубликован пост/видео
      likes BIGINT NOT NULL DEFAULT 0,
      comments BIGINT NOT NULL DEFAULT 0,
      reposts BIGINT NOT NULL DEFAULT 0, -- репосты (VK) или 0 для YouTube
      views BIGINT NOT NULL DEFAULT 0,
      collected_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_account_metrics_platform_time ON account_metrics (platform, collected_at)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_post_metrics_platform_post ON post_metrics (platform, post_id, collected_at)`;
}
