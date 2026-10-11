const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_WEBHOOK_SECRET: secret, APP_URL: url } = process.env;
if (!token || !secret || !url?.startsWith('https://')) throw new Error('Set TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET and an HTTPS APP_URL.');
const request = async (method, payload) => {
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(15000) });
  const j = await r.json(); if (!j.ok) throw new Error(`${method} failed (${j.error_code}). Check the token, URL and secret.`);
};
await request('setWebhook', { url: url.replace(/\/$/, '') + '/api/telegram', secret_token: secret, allowed_updates: ['message'] });
await request('setMyCommands', { commands: [{ command: 'start', description: 'Get your ID and setup instructions' }, { command: 'whoami', description: 'See your linked employee' }, { command: 'help', description: 'Sale and expense command formats' }] });
console.log('Telegram webhook and help commands configured. Start your bot in a private chat.');
