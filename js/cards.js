import { uuid } from './utils.js';

export function makeEnergyCard(type) {
  const t = type.toLowerCase();
  return {
    id: `energy-${t}`, name: `${type} Energy`, supertype: 'Energy', subtypes: ['Basic'],
    types: [type], number: '0', rarity: 'Common',
    images: { small: `https://images.pokemontcg.io/energy/${t}.png`, large: `https://images.pokemontcg.io/energy/${t}.png` },
    set: { id: 'energy', name: 'Energy', series: 'Energy', printedTotal: 1, total: 1, releaseDate: '' },
  };
}

export function resolveCard(cardId, cache) {
  if (cardId.startsWith('energy-')) {
    const type = cardId.replace('energy-', '');
    return makeEnergyCard(type.charAt(0).toUpperCase() + type.slice(1));
  }
  return cache.get(cardId) ?? null;
}

export function createBoardPokemon(card) {
  const hp = parseInt(card.hp ?? '0', 10) || 60;
  return {
    instanceId: uuid(), card, currentHp: hp, maxHp: hp, damageCounters: 0,
    attachedEnergy: [], status: 'none', playedThisTurn: true, evolvedThisTurn: false,
    abilityUsedThisTurn: false, cannotRetreat: false, cannotAttack: false, tools: [],
  };
}

export function shuffleDeck(deck) {
  const a = [...deck];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function parseDamage(damage) {
  if (!damage) return 0;
  const match = damage.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

export function getWeaknessMultiplier(defender, attackerTypes) {
  const weak = defender.card.weaknesses?.[0];
  if (!weak) return 1;
  if (attackerTypes.includes(weak.type)) {
    const val = weak.value.replace(/[^0-9]/g, '');
    return val ? parseInt(val, 10) : 2;
  }
  return 1;
}

export function getResistanceReduction(defender, attackerTypes) {
  const res = defender.card.resistances?.[0];
  if (!res) return 0;
  if (attackerTypes.includes(res.type)) {
    const val = res.value.replace(/[^0-9]/g, '');
    return val ? parseInt(val, 10) : 30;
  }
  return 0;
}

export function canPayEnergyCost(pokemon, cost) {
  const pool = [...pokemon.attachedEnergy.map((e) => e.type)];
  for (const c of cost) {
    const idx = pool.indexOf(c);
    if (idx >= 0) pool.splice(idx, 1);
    else {
      const anyIdx = pool.findIndex((t) => t !== 'Colorless');
      if (c === 'Colorless' && anyIdx >= 0) pool.splice(anyIdx, 1);
      else if (anyIdx >= 0) pool.splice(anyIdx, 1);
      else return false;
    }
  }
  return true;
}

export function isBasicPokemon(card) {
  return card.supertype === 'Pokémon' && card.subtypes?.includes('Basic');
}

export function isEvolutionPokemon(card) {
  return card.supertype === 'Pokémon' && (
    card.subtypes?.includes('Stage 1') || card.subtypes?.includes('Stage 2') ||
    card.subtypes?.includes('RESTORED') || card.subtypes?.some((s) => s.includes('Stage'))
  );
}

export function getTrainerSubtype(card) {
  if (card.supertype !== 'Trainer') return null;
  if (card.subtypes?.includes('Supporter')) return 'Supporter';
  if (card.subtypes?.includes('Stadium')) return 'Stadium';
  if (card.subtypes?.includes('Item')) return 'Item';
  return card.subtypes?.[0] ?? 'Item';
}
