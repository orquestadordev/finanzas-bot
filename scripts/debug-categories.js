/**
 * Script de diagnóstico: verifica que las categorías tengan keywords.
 * Ejecutar: node scripts/debug-categories.js
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function debug() {
  console.log('🔍 Verificando conexión a Supabase...');
  console.log('URL:', process.env.SUPABASE_URL);
  console.log('Key:', process.env.SUPABASE_ANON_KEY?.slice(0, 20) + '...\n');

  const { data: categories, error } = await supabase
    .from('categories')
    .select('id, name, keywords')
    .order('id');

  if (error) {
    console.error('❌ Error:', error.message);
    return;
  }

  if (!categories || categories.length === 0) {
    console.error('❌ No hay categorías en la tabla. ¿Ejecutaste el SQL seed?');
    return;
  }

  console.log(`✅ ${categories.length} categorías encontradas:\n`);
  for (const cat of categories) {
    const kw = cat.keywords;
    const hasKeywords = kw && Array.isArray(kw) && kw.length > 0;
    console.log(`  [${cat.id}] ${cat.name}`);
    console.log(`      keywords: ${hasKeywords ? kw.join(', ') : '⚠️  VACÍO'}`);
    console.log(`      tipo: ${typeof kw} ${Array.isArray(kw) ? '(array)' : ''}`);
  }
}

debug().catch(console.error);
