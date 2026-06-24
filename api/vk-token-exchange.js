// api/vk-token-exchange.js
//
// Служебная страница для одноразового получения личного токена VK с правом
// на просмотр видео (нужен для чтения клипов сообщества).
//
// Как использовать:
// 1. Откройте /api/vk-token-exchange — страница сама сгенерирует ссылку
//    авторизации VK и покажет кнопку "Войти через VK".
// 2. Нажмите кнопку, разрешите доступ в VK.
// 3. Вас вернёт на эту же страницу, и она покажет готовый токен —
//    скопируйте его в переменную VK_GROUP_TOKEN на Vercel (или в новую
//    переменную VK_USER_TOKEN, если хотите держать их раздельно).
//
// Токен живёт 1 час — обновляйте по той же ссылке, когда понадобится.

const APP_ID = '54643828';
const REDIRECT_URI_BASE = ''; // заполняется автоматически текущим доменом

function base64UrlEncode(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export default async function handler(req, res) {
  const crypto = await import('crypto');
  const currentUrl = `https://${req.headers.host}/api/vk-token-exchange`;

  const { code, code_verifier: codeVerifierFromQuery, device_id } = req.query;

  // --- Шаг 2: пользователь вернулся с кодом от VK — обмениваем на токен ---
  if (code) {
    try {
      const verifier = req.cookies?.vk_verifier || codeVerifierFromQuery;
      const response = await fetch('https://id.vk.com/oauth2/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: String(code),
          code_verifier: String(verifier),
          client_id: APP_ID,
          redirect_uri: currentUrl,
          device_id: String(device_id || ''),
          state: 'exchange',
        }),
      });
      const data = await response.json();

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(`
        <html><body style="font-family: monospace; background:#14161b; color:#eef0f4; padding: 40px;">
          <h2>Результат обмена</h2>
          <pre style="background:#20232c; padding: 20px; border-radius: 12px; white-space: pre-wrap; word-break: break-all;">${JSON.stringify(data, null, 2)}</pre>
          ${data.access_token ? '<p style="color:#4cc38a;">Скопируйте значение access_token выше в переменную VK_GROUP_TOKEN на Vercel.</p>' : '<p style="color:#ff6b6b;">Не удалось получить токен — см. подробности выше.</p>'}
          <a href="${currentUrl}" style="color:#f5a623;">← Начать заново</a>
        </body></html>
      `);
    } catch (err) {
      return res.status(500).send(`Ошибка обмена: ${err.message}`);
    }
  }

  // --- Шаг 1: показываем кнопку для входа через VK ---
  const verifier = base64UrlEncode(crypto.randomBytes(32));
  const challenge = base64UrlEncode(
    crypto.createHash('sha256').update(verifier).digest()
  );

  const authUrl = new URL('https://id.vk.com/authorize');
  authUrl.searchParams.set('client_id', APP_ID);
  authUrl.searchParams.set('redirect_uri', currentUrl);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 's256');
  authUrl.searchParams.set('scope', 'video');
  authUrl.searchParams.set('state', 'exchange');
  authUrl.searchParams.set('v', '5.199');
  // передаём verifier через query у самого VK как state-подобный параметр
  // (проще: добавим его в redirect_uri как доп. параметр, который VK вернёт обратно)
  authUrl.searchParams.set('redirect_uri', `${currentUrl}?code_verifier=${verifier}`);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(`
    <html><body style="font-family: sans-serif; background:#14161b; color:#eef0f4; padding: 40px; text-align:center;">
      <h2>Получение токена VK (право на видео)</h2>
      <p>Нажмите кнопку, войдите в VK и разрешите доступ.</p>
      <a href="${authUrl.toString()}" style="display:inline-block; background:#f5a623; color:#1a1303; padding: 14px 28px; border-radius: 999px; text-decoration:none; font-weight:600;">Войти через VK</a>
    </body></html>
  `);
}
