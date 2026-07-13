const { Telegraf, Markup } = require('telegraf');
const { parseExpenseMessage } = require('../lib/parser');
const { suggestCategory, getCategories } = require('../lib/categories');
const { createExpense, getMonthSummary, getLastExpenses } = require('../lib/expenses');

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

    // Por tipo
    msg += `📌 *Por tipo:*\n`;
    msg += `• Fijo: $${summary.byType.fijo.ARS.toLocaleString('es-AR')}`;
    if (summary.byType.fijo.USD > 0) msg += ` + U$S${summary.byType.fijo.USD}`;
    msg += `\n`;
    msg += `• Variable: $${summary.byType.variable.ARS.toLocaleString('es-AR')}`;
    if (summary.byType.variable.USD > 0) msg += ` + U$S${summary.byType.variable.USD}`;
    msg += `\n\n`;

    // Por categoría
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

// Callback: confirmar categoría sugerida
bot.action(/^confirm_(.+)$/, async (ctx) => {
  try {
    const payload = JSON.parse(ctx.match[1]);
    const { amount, description, currency, categoryId, expenseTypeId } = payload;

    const expense = await createExpense({
      description,
      amount,
      currency,
      categoryId,
      expenseTypeId,
      telegramMessageId: ctx.callbackQuery.message?.message_id,
    });

    const symbol = currency === 'USD' ? 'U$S' : '$';
    await ctx.editMessageText(
      `✅ Gasto registrado!\n${symbol}${amount.toLocaleString('es-AR')} — ${description}`,
    );
    await ctx.answerCbQuery('Registrado!');
  } catch (err) {
    console.error('Error confirming expense:', err);
    await ctx.answerCbQuery('Error al registrar');
  }
});

// Callback: elegir otra categoría
bot.action(/^pick_cat_(.+)$/, async (ctx) => {
  try {
    const payload = JSON.parse(ctx.match[1]);
    const categories = await getCategories();

    // Mostrar todas las categorías como botones (de a 2 por fila)
    const buttons = categories.map(cat => {
      const confirmPayload = JSON.stringify({
        ...payload,
        categoryId: cat.id,
        expenseTypeId: cat.expense_type_id,
      });
      return Markup.button.callback(cat.name, `confirm_${confirmPayload}`);
    });

    const rows = [];
    for (let i = 0; i < buttons.length; i += 2) {
      rows.push(buttons.slice(i, i + 2));
    }

    await ctx.editMessageText(
      `Elegí categoría para: *${payload.description}* ${payload.currency === 'USD' ? 'U$S' : '$'}${payload.amount}`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(rows),
      }
    );
    await ctx.answerCbQuery();
  } catch (err) {
    console.error('Error showing categories:', err);
    await ctx.answerCbQuery('Error');
  }
});

// Mensaje de texto: intentar parsear como gasto
bot.on('text', async (ctx) => {
  const parsed = parseExpenseMessage(ctx.message.text);
  if (!parsed) {
    return ctx.reply(
      'No pude entender el gasto. Probá con:\n`café 350` o `netflix 8 usd`',
      { parse_mode: 'Markdown' }
    );
  }

  const { amount, description, currency } = parsed;
  const suggested = await suggestCategory(description);

  const symbol = currency === 'USD' ? 'U$S' : '$';
  const basePayload = { amount, description, currency };

  if (suggested) {
    const confirmPayload = JSON.stringify({
      ...basePayload,
      categoryId: suggested.id,
      expenseTypeId: suggested.expense_type_id,
    });
    const changePayload = JSON.stringify(basePayload);

    ctx.reply(
      `💰 *${symbol}${amount.toLocaleString('es-AR')}* — ${description}\n📂 Categoría: *${suggested.name}*`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('✅ Confirmar', `confirm_${confirmPayload}`),
            Markup.button.callback('🔄 Cambiar', `pick_cat_${changePayload}`),
          ],
        ]),
      }
    );
  } else {
    const changePayload = JSON.stringify(basePayload);
    ctx.reply(
      `💰 *${symbol}${amount.toLocaleString('es-AR')}* — ${description}\n⚠️ No encontré categoría. Elegí una:`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('📂 Elegir categoría', `pick_cat_${changePayload}`)],
        ]),
      }
    );
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
