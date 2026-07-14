/**
 * Parser de lenguaje natural para mensajes de gastos.
 *
 * Ejemplos soportados:
 *   "café 350"          → { amount: 350, description: "café", currency: "ARS" }
 *   "super 15000"       → { amount: 15000, description: "super", currency: "ARS" }
 *   "netflix 8 usd"     → { amount: 8, description: "netflix", currency: "USD" }
 *   "8500 farmacia"     → { amount: 8500, description: "farmacia", currency: "ARS" }
 *   "$5200 verdulería"  → { amount: 5200, description: "verdulería", currency: "ARS" }
 *   "u$s 30 claude"     → { amount: 30, description: "claude", currency: "USD" }
 */

// Patrones para detectar moneda USD
const USD_PATTERNS = [
  /\busd\b/i,
  /\bu\$s\b/i,
  /\bdolar(?:es)?\b/i,
  /\buss?\b/i,
];

// Patrón para extraer monto:
// 1ro: formato miles (15.000 o 1.500.000) — requiere al menos un grupo de 3
// 2do: número simple (4300, 350, 8) con decimales opcionales
const AMOUNT_PATTERN = /\$?\s*(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)/;

function parseExpenseMessage(text) {
  if (!text || typeof text !== 'string') return null;

  const cleaned = text.trim();
  if (cleaned.startsWith('/')) return null; // es un comando

  // Detectar moneda
  let currency = 'ARS';
  let textWithoutCurrency = cleaned;

  for (const pattern of USD_PATTERNS) {
    if (pattern.test(cleaned)) {
      currency = 'USD';
      textWithoutCurrency = cleaned.replace(pattern, '').trim();
      break;
    }
  }

  // Extraer monto
  const amountMatch = textWithoutCurrency.match(AMOUNT_PATTERN);
  if (!amountMatch) return null;

  let amountStr = amountMatch[1];
  // Normalizar separadores: 15.000 → 15000, 15.000,50 → 15000.50
  if (/^\d{1,3}\.\d{3}/.test(amountStr)) {
    amountStr = amountStr.replace(/\./g, '');
  }
  amountStr = amountStr.replace(',', '.');

  const amount = parseFloat(amountStr);
  if (isNaN(amount) || amount <= 0) return null;

  // Extraer descripción (todo lo que no es el monto ni el símbolo $)
  const description = textWithoutCurrency
    .replace(AMOUNT_PATTERN, '')
    .replace(/\$/g, '')
    .trim()
    .toLowerCase();

  if (!description) return null;

  return { amount, description, currency };
}

module.exports = { parseExpenseMessage };
