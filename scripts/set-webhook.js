/**
 * Script para configurar el webhook de Telegram.
 * Ejecutar una vez después del deploy:
 *   node scripts/set-webhook.js
 */
require('dotenv').config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

if (!BOT_TOKEN || !WEBHOOK_URL) {
  console.error('Faltan BOT_TOKEN o WEBHOOK_URL en .env');
  process.exit(1);
}

async function setWebhook() {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${encodeURIComponent(WEBHOOK_URL)}`;
  const res = await fetch(url);
  const data = await res.json();

  if (data.ok) {
    console.log('✅ Webhook configurado:', WEBHOOK_URL);
  } else {
    console.error('❌ Error:', data.description);
  }
}

setWebhook();
