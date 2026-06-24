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
const WORKING_REDIRECT_URI = 'https://example.com'; // единственный домен, подтверждённо принятый VK

function base64UrlEncode(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function parseCookies(header) {
  const out = {};
  (header || '').split(';').forEach((part) => {
    const [k, ...v] = part.trim().split('=');
    if (k) out[k] = decodeURIComponent(v.join('='));
  });
  return out;
}

export default async function handler(req, res) {
  const crypto = await import('crypto');
  const cookies = parseCookies(req.headers.cookie);

  const { code, device_id } = req.query;

  // --- Шаг 2: пользователь вернулся с кодом от VK — обмениваем на токен ---
  if (code) {
    try {
      const verifier = cookies.vk_verifier;
      if (!verifier) {
        return res.status(400).send('Не найден code_verifier (cookie истекла или была очищена). Начните заново.');
      }
      const response = await fetch('https://id.vk.com/oauth2/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: String(code),
          code_verifier: String(verifier),
          client_id: APP_ID,
          redirect_uri: WORKING_REDIRECT_URI,
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
  authUrl.searchParams.set('redirect_uri', WORKING_REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 's256');
  authUrl.searchParams.set('scope', 'video');
  authUrl.searchParams.set('state', 'exchange');
  authUrl.searchParams.set('v', '5.199');

  // Сохраняем verifier в cookie на 10 минут, чтобы достать его при возврате
  res.setHeader('Set-Cookie', `vk_verifier=${verifier}; Max-Age=600; Path=/; HttpOnly; SameSite=Lax`);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(`
    <html><body style="font-family: sans-serif; background:#14161b; color:#eef0f4; padding: 40px; text-align:center;">
      <h2>Получение токена VK (право на видео)</h2>
      <p>Нажмите кнопку, войдите в VK и разрешите доступ.</p>
      <p style="color:#9aa1b2; font-size:14px;">После разрешения VK перенаправит вас на example.com — скопируйте оттуда часть адреса после <code>code=</code> и до <code>&amp;</code>, затем вручную откройте:<br><code style="word-break:break-all;">${req.headers.host ? `https://${req.headers.host}` : ''}/api/vk-token-exchange?code=ВАШ_КОД&device_id=ВАШ_DEVICE_ID</code></p>
      <a href="${authUrl.toString()}" style="display:inline-block; background:#f5a623; color:#1a1303; padding: 14px 28px; border-radius: 999px; text-decoration:none; font-weight:600; margin-top:20px;">Войти через VK</a>
    </body></html>
  `);
}
