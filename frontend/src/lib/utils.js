// utils.js
// Combina classes do Tailwind CSS e remove duplicadas de forma limpa

import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combina múltiplas classes CSS em uma string única.
 * Aceita condicionais, arrays e strings simples.
 * @param  {...any} inputs - Classes CSS ou expressões condicionais
 * @returns {string} Classes combinadas e mescladas
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * Retorna o limite de estoque baixo para cada tipo de unidade
 * @param {string} unitType - Tipo de unidade (Unidades, Litros, Kg, Pacote, Caixas)
 * @returns {number} Limite de estoque baixo para o tipo de unidade
 */
export function getLowStockLimit(unitType) {
  const limits = {
    "Unidades": 5,
    "Litros": 5,
    "Kg": 5,
    "Pacote": 5,
    "Caixas": 2,
  };

  return limits[unitType] || 5; // Retorna 5 como padrão para unidades desconhecidas
}
