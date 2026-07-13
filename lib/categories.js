const { supabase } = require('./supabase');

let cachedCategories = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

// Normalizar acentos: café → cafe, verdulería → verduleria
function normalize(str) {
  return str.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

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
  const words = normalize(description).split(/\s+/);

  let bestMatch = null;
  let bestScore = 0;

  for (const cat of categories) {
    if (!cat.keywords || cat.keywords.length === 0) continue;

    let score = 0;
    for (const keyword of cat.keywords) {
      const normalizedKeyword = normalize(keyword);
      for (const word of words) {
        if (word === normalizedKeyword) {
          score += 2; // exacta
        } else if (word.includes(normalizedKeyword) || normalizedKeyword.includes(word)) {
          score += 1; // parcial
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
