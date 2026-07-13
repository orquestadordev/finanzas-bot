const { supabase } = require('./supabase');

let cachedCategories = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

async function getCategories() {
  const now = Date.now();
  if (cachedCategories && (now - cacheTimestamp) < CACHE_TTL) {
    return cachedCategories;
  }

  const { data, error } = await supabase
    .from('categories')
    .select('id, name, description, expense_type_id, keywords')
    .order('id');

  if (error) throw error;

  cachedCategories = data;
  cacheTimestamp = now;
  return data;
}

/**
 * Sugiere una categoría basándose en keywords.
 * Retorna la mejor coincidencia o null.
 */
async function suggestCategory(description) {
  const categories = await getCategories();
  const words = description.toLowerCase().split(/\s+/);

  let bestMatch = null;
  let bestScore = 0;

  for (const cat of categories) {
    if (!cat.keywords || cat.keywords.length === 0) continue;

    let score = 0;
    for (const keyword of cat.keywords) {
      for (const word of words) {
        if (word.includes(keyword) || keyword.includes(word)) {
          // Coincidencia exacta vale más
          score += (word === keyword) ? 2 : 1;
        }
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = cat;
    }
  }

  return bestMatch;
}

module.exports = { getCategories, suggestCategory };
