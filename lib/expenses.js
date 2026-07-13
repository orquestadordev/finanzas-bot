const { supabase } = require('./supabase');

async function createExpense({ description, amount, currency, categoryId, expenseTypeId, telegramMessageId }) {
  const { data, error } = await supabase
    .from('expenses')
    .insert({
      description,
      amount,
      currency,
      category_id: categoryId,
      expense_type_id: expenseTypeId,
      telegram_message_id: telegramMessageId,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function getMonthSummary(year, month) {
  const startDate = new Date(year, month - 1, 1).toISOString();
  const endDate = new Date(year, month, 0, 23, 59, 59).toISOString();

  const { data, error } = await supabase
    .from('expenses')
    .select('amount, currency, category_id, expense_type_id, categories(name), expense_types(name)')
    .gte('created_at', startDate)
    .lte('created_at', endDate)
    .order('created_at', { ascending: false });

  if (error) throw error;

  // Agrupar por categoría
  const byCategory = {};
  let totalARS = 0;
  let totalUSD = 0;

  for (const exp of data) {
    const catName = exp.categories?.name || 'Sin categoría';
    if (!byCategory[catName]) {
      byCategory[catName] = { ARS: 0, USD: 0 };
    }
    byCategory[catName][exp.currency] += parseFloat(exp.amount);

    if (exp.currency === 'ARS') totalARS += parseFloat(exp.amount);
    else totalUSD += parseFloat(exp.amount);
  }

  // Agrupar por tipo
  const byType = { fijo: { ARS: 0, USD: 0 }, variable: { ARS: 0, USD: 0 } };
  for (const exp of data) {
    const typeName = exp.expense_types?.name || 'variable';
    byType[typeName][exp.currency] += parseFloat(exp.amount);
  }

  return {
    totalARS,
    totalUSD,
    count: data.length,
    byCategory,
    byType,
  };
}

async function getLastExpenses(limit = 5) {
  const { data, error } = await supabase
    .from('expenses')
    .select('id, description, amount, currency, created_at, categories(name)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data;
}

module.exports = { createExpense, getMonthSummary, getLastExpenses };
