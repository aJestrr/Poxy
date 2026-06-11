const RARITY_WEIGHTS = {
  Common: 50, Uncommon: 30, Rare: 12, 'Rare Holo': 5, 'Rare Holo EX': 1.5,
  'Rare Holo GX': 1.2, 'Rare Holo V': 1.2, 'Rare Holo VMAX': 0.5, 'Rare Holo VSTAR': 0.4,
  'Rare Ultra': 0.3, 'Rare Secret': 0.15, 'Rare Rainbow': 0.1, 'Amazing Rare': 0.5,
  'Illustration Rare': 0.3, 'Special Illustration Rare': 0.15, 'Hyper Rare': 0.08,
  'Double Rare': 0.8, 'Ultra Rare': 0.4, Promo: 5,
};

function weightForRarity(rarity) {
  for (const [key, w] of Object.entries(RARITY_WEIGHTS)) {
    if (rarity.includes(key) || rarity === key) return w;
  }
  if (rarity.toLowerCase().includes('rare')) return 3;
  if (rarity.toLowerCase().includes('uncommon')) return 30;
  return 50;
}

function pickWeighted(pool) {
  const weights = pool.map((c) => weightForRarity(c.rarity));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function openPack(setCards) {
  const pokemon = setCards.filter((c) => c.supertype === 'Pokémon');
  const trainers = setCards.filter((c) => c.supertype === 'Trainer');
  const energies = setCards.filter((c) => c.supertype === 'Energy');
  const commons = pokemon.filter((c) => c.rarity === 'Common' || c.rarity.includes('Common'));
  const uncommons = pokemon.filter((c) => c.rarity === 'Uncommon' || c.rarity.includes('Uncommon'));
  const rares = pokemon.filter((c) => !c.rarity.includes('Common') && !c.rarity.includes('Uncommon'));
  const commonPool = commons.length ? commons : pokemon;
  const uncommonPool = uncommons.length ? uncommons : pokemon;
  const rarePool = rares.length ? rares : pokemon;
  const pack = [];
  for (let i = 0; i < 6; i++) pack.push(pickWeighted(commonPool));
  for (let i = 0; i < 3; i++) pack.push(pickWeighted(uncommonPool));
  pack.push(pickWeighted(rarePool));
  if (trainers.length) pack.push(pickWeighted(trainers));
  else pack.push(pickWeighted(uncommonPool));
  if (energies.length) pack.push(pickWeighted(energies));
  else {
    const energyCard = setCards.find((c) => c.name.toLowerCase().includes('energy'));
    pack.push(energyCard ?? pickWeighted(commonPool));
  }
  return shuffle(pack).slice(0, 10);
}

export function openMultiplePacks(setCards, count) {
  const all = [];
  for (let i = 0; i < count; i++) all.push(...openPack(setCards));
  return all;
}
