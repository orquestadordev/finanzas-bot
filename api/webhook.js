const { Telegraf, Markup } = require('telegraf');
const { parseExpenseMessage } = require('../lib/parser');
const { suggestCategory, getCategories } = require('../lib/categories');
const { createExpense, getMonthSummary, getLastExpenses } = require('../lib/expenses');
const { savePending, getPending, deletePending } = require('../lib/pending');

const bot = new Telegraf(process.env.BOT_TOKEN);

// Middleware: solo responder a tu chat
bot.use((ctx, next) => {
  const allowedId = process.env.ALLOWED_CHAT_ID;
  if (allowedId && String(ctx.chat?.id) !== allowedId) {
    return ctx.reply('No autorizado.');
  }
  return next();
});

// /start
bot.start((ctx) => {
  ctx.reply(
    '💰 *Bot de Finanzas Personales*\n\n' +
    'Enviame un gasto así:\n' +
    '`café 350`\n' +
    '`super 15000`\n' +
    '`netflix 8 usd`\n\n' +
    'Comandos:\n' +
    '/resumen - Resumen del mes\n' +
    '/ultimo - Últimos 5 gastos\n' +
    '/categorias - Ver categorías\n' +
    '/help - Ayuda',
    { parse_mode: 'Markdown' }
  );
});

// /help
bot.help((ctx) => {
  ctx.reply(
    '📝 *Cómo registrar un gasto:*\n\n' +
    'Escribí el gasto de forma natural:\n' +
    '• `café 350` → $350 ARS\n' +
    '• `super 15.000` → $15.000 ARS\n' +
    '• `netflix 8 usd` → $8 USD\n' +
    '• `u$s 30 claude` → $30 USD\n\n' +
    'El bot sugiere la categoría automáticamente. Podés confirmar o cambiar con los botones.',
    { parse_mode: 'Markdown' }
  );
});

// /categorias
bot.command('categorias', async (ctx) => {
  try {
    const categories = await getCategories();
    const lines = categories.map(c => `• *${c.name}* — ${c.description || ''}`);
    ctx.reply('📋 *Categorías disponibles:*\n\n' + lines.join('\n'), { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('Error fetching categories:', err);
    ctx.reply('❌ Error al obtener categorías.');
  }
});

// /resumen
bot.command('resumen', async (ctx) => {
  try {
    const now = new Date();
    const summary = await getMonthSummary(now.getFullYear(), now.getMonth() + 1);

    const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const monthName = monthNames[now.getMonth()];

    let msg = `📊 *Resumen ${monthName} ${now.getFullYear()}*\n\n`;
    msg += `💵 Total ARS: $${summary.totalARS.toLocaleString('es-AR')}\n`;
    if (summary.totalUSD > 0) {
      msg += `💲 Total USD: U$S${summary.totalUSD.toLocaleString('es-AR')}\n`;
    }
    msg += `📝 Cantidad de gastos: ${summary.count}\n\n`;

    msg += `📌 *Por tipo:*\n`;
    msg += `• Fijo: $${summary.byType.fijo.ARS.toLocaleString('es-AR')}`;
    if (summary.byType.fijo.USD > 0) msg += ` + U$S${summary.byType.fijo.USD}`;
    msg += `\n`;
    msg += `• Variable: $${summary.byType.variable.ARS.toLocaleString('es-AR')}`;
    if (summary.byType.variable.USD > 0) msg += ` + U$S${summary.byType.variable.USD}`;
    msg += `\n\n`;

    msg += `📂 *Por categoría:*\n`;
    const sorted = Object.entries(summary.byCategory)
      .sort(([,a], [,b]) => (b.ARS + b.USD * 1000) - (a.ARS + a.USD * 1000));

    for (const [name, amounts] of sorted) {
      msg += `• ${name}: $${amounts.ARS.toLocaleString('es-AR')}`;
      if (amounts.USD > 0) msg += ` + U$S${amounts.USD}`;
      msg += `\n`;
    }

    ctx.reply(msg, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('Error fetching summary:', err);
    ctx.reply('❌ Error al obtener resumen.');
  }
});

// /ultimo
bot.command('ultimo', async (ctx) => {
  try {
    const expenses = await getLastExpenses(5);
    if (expenses.length === 0) {
      return ctx.reply('No hay gastos registrados aún.');
    }

    let msg = '🕐 *Últimos 5 gastos:*\n\n';
    for (const exp of expenses) {
      const date = new Date(exp.created_at).toLocaleDateString('es-AR');
      const symbol = exp.currency === 'USD' ? 'U$S' : '$';
      const cat = exp.categories?.name || '—';
      msg += `• ${date} | ${symbol}${parseFloat(exp.amount).toLocaleString('es-AR')} | ${exp.description} [${cat}]\n`;
    }

    ctx.reply(msg, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('Error fetching last expenses:', err);
    ctx.reply('❌ Error al obtener últimos gastos.');
  }
});

// Callback: confirmar con categoría (formato: "ok:<pendingId>:<categoryId>")
bot.action(/^ok:(\w+):(\d+)$/, async (ctx) => {
  try {
    const pendingId = ctx.match[1];
    const categoryId = parseInt(ctx.match[2]);

    const pending = await getPending(pendingId);
    if (!pending) {
      await ctx.answerCbQuery('Gasto expirado, enviá de nuevo.');
      return;
    }

    // Buscar expense_type_id de la categoría
    const categories = await getCategories();
    const cat = categories.find(c => c.id === categoryId);

    const expense = await createExpense({
      description: pending.description,
      amount: pending.amount,
      currency: pending.currency,
      categoryId,
      expenseTypeId: cat?.expense_type_id || 2,
      telegramMessageId: ctx.callbackQuery.message?.message_id,
    });

    await deletePending(pendingId);

    const symbol = pending.currency === 'USD' ? 'U$S' : '$';
    await ctx.editMessageText(
      `✅ Registrado: ${symbol}${pending.amount.toLocaleString('es-AR')} — ${pending.description} [${cat?.name || '?'}]`
    );
    await ctx.answerCbQuery('Registrado!');
  } catch (err) {
    console.error('Error confirming expense:', err);
    await ctx.answerCbQuery('Error al registrar');
  }
});

// Callback: mostrar selector de categorías (formato: "pick:<pendingId>")
bot.action(/^pick:(\w+)$/, async (ctx) => {
  try {
    const pendingId = ctx.match[1];
    const pending = await getPending(pendingId);
    if (!pending) {
      await ctx.answerCbQuery('Gasto expirado, enviá de nuevo.');
      return;
    }

    const categories = await getCategories();

    // Botones cortos: "ok:<pendingId>:<catId>" — siempre < 64 bytes
    const buttons = categories.map(cat =>
      Markup.button.callback(cat.name, `ok:${pendingId}:${cat.id}`)
    );

    const rows = [];
    for (let i = 0; i < buttons.length; i += 2) {
      rows.push(buttons.slice(i, i + 2));
    }

    const symbol = pending.currency === 'USD' ? 'U$S' : '$';
    await ctx.editMessageText(
      `Elegí categoría para: ${pending.description} ${symbol}${pending.amount}`,
      Markup.inlineKeyboard(rows)
    );
    await ctx.answerCbQuery();
  } catch (err) {
    console.error('Error showing categories:', err);
    await ctx.answerCbQuery('Error');
  }
});

// Comandos desconocidos
bot.on('text', async (ctx, next) => {
  if (ctx.message.text.startsWith('/')) {
    return ctx.reply(
      '❓ Comando no reconocido.\n\n' +
      'Comandos disponibles:\n' +
      '/resumen — Resumen del mes\n' +
      '/ultimo — Últimos 5 gastos\n' +
      '/categorias — Ver categorías\n' +
      '/help — Ayuda\n\n' +
      'O enviá un gasto: `café 350`',
      { parse_mode: 'Markdown' }
    );
  }
  return next();
});

// Mensaje de texto: intentar parsear como gasto
bot.on('text', async (ctx) => {
  try {
    const parsed = parseExpenseMessage(ctx.message.text);
    if (!parsed) {
      return ctx.reply(
        'No pude entender el gasto. Probá con:\n`café 350` o `netflix 8 usd`\n\nUsá /help para ver los comandos.',
        { parse_mode: 'Markdown' }
      );
    }

    const { amount, description, currency } = parsed;
    const suggested = await suggestCategory(description);

    // Guardar gasto pendiente en Supabase con ID corto
    const pendingId = await savePending({ amount, description, currency });

    const symbol = currency === 'USD' ? 'U$S' : '$';

    if (suggested) {
      ctx.reply(
        `💰 *${symbol}${amount.toLocaleString('es-AR')}* — ${description}\n📂 Categoría: *${suggested.name}*`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback('✅ Confirmar', `ok:${pendingId}:${suggested.id}`),
              Markup.button.callback('🔄 Cambiar', `pick:${pendingId}`),
            ],
          ]),
        }
      );
    } else {
      ctx.reply(
        `💰 *${symbol}${amount.toLocaleString('es-AR')}* — ${description}\n⚠️ No encontré categoría. Elegí una:`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('📂 Elegir categoría', `pick:${pendingId}`)],
          ]),
        }
      );
    }
  } catch (err) {
    console.error('Error processing message:', err);
    ctx.reply('❌ Error al procesar el gasto.');
  }
});

// Vercel serverless handler
module.exports = async (req, res) => {
  if (req.method === 'POST') {
    try {
      await bot.handleUpdate(req.body);
    } catch (err) {
      console.error('Webhook error:', err);
    }
    res.status(200).json({ ok: true });
  } else {
    res.status(200).json({ status: 'Bot is running' });
  }
};
