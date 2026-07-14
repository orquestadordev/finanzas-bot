const { supabase } = require('./supabase');

let cachedCategories = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

const DIACRITICS_RE = new RegExp('[\u0300-\u036f]', 'g');

function normalize(str) {
  return str.normalize('NFD').replace(DIACRITICS_RE, '').toLowerCase();
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

  if (error) {
    console.error('Error fetching categories:', error);
    throw error;
  }

  console.log('Categories loaded:', data?.length || 0);
  cachedCategories = data;
  cacheTimestamp = now;
  return data;
}

async function suggestCategory(description) {
  const categories = await getCategories();
  const words = normalize(description).split(/\s+/);

  console.log('suggestCategory input:', description, '-> words:', words);

  let bestMatch = null;
  let bestScore = 0;

  for (const cat of categories) {
    if (!cat.keywords || cat.keywords.length === 0) continue;

    let score = 0;
    for (const keyword of cat.keywords) {
      const normalizedKeyword = normalize(keyword);
      for (const word of words) {
        if (word === normalizedKeyword) {
          score += 2;
        } else if (word.includes(normalizedKeyword) || normalizedKeyword.includes(word)) {
          score += 1;
        }
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = cat;
    }
  }

  console.log('suggestCategory result:', bestMatch?.name || 'null', 'score:', bestScore);
  return bestMatch;
}

module.exports = { getCategories, suggestCategory };
