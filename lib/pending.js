const { supabase } = require('./supabase');
const crypto = require('crypto');

/**
 * Guarda un gasto pendiente de confirmación.
 * Retorna un ID corto (8 chars) para usar en callback data.
 */
async function savePending({ amount, description, currency }) {
  const id = crypto.randomBytes(4).toString('hex'); // 8 chars

  const { error } = await supabase
    .from('pending_expenses')
    .insert({
      id,
      amount,
      description,
      currency,
      created_at: new Date().toISOString(),
    });

  if (error) throw error;
  return id;
}

/**
 * Obtiene un gasto pendiente por su ID.
 */
async function getPending(id) {
  const { data, error } = await supabase
    .from('pending_expenses')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return null;
  return data;
}

/**
 * Elimina un gasto pendiente después de confirmarlo.
 */
async function deletePending(id) {
  await supabase
    .from('pending_expenses')
    .delete()
    .eq('id', id);
}

module.exports = { savePending, getPending, deletePending };
