import { cacheSet, cacheSetCardIds, getCachedCard, getCachedSetCards } from './cache.js';

const API_BASE = 'https://api.pokemontcg.io/v2';
let bundledSets = null;

export const ENERGY_TYPES = [
  'Colorless', 'Darkness', 'Dragon', 'Fairy', 'Fighting', 'Fire',
  'Grass', 'Lightning', 'Metal', 'Psychic', 'Water',
];

function getApiKey() {
  return localStorage.getItem('pokemontcg_api_key') ?? undefined;
}

async function loadBundledSets() {
  if (bundledSets) return bundledSets;
  const res = await fetch('./data/bundled-sets.json');
  bundledSets = await res.json();
  return bundledSets;
}

async function apiFetch(path) {
  const headers = { Accept: 'application/json' };
  const key = getApiKey();
  if (key) headers['X-Api-Key'] = key;
  const res = await fetch(`${API_BASE}${path}`, { headers });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function fetchAllSets() {
  try {
    const all = [];
    let page = 1;
    let totalCount = Infinity;
    while (all.length < totalCount) {
      const data = await apiFetch(`/sets?page=${page}&pageSize=250&orderBy=releaseDate`);
      all.push(...data.data);
      totalCount = data.totalCount;
      page++;
      if (!data.data.length) break;
    }
    all.sort((a, b) => new Date(a.releaseDate) - new Date(b.releaseDate));
    await cacheSet('sets', all);
    return all;
  } catch {
    return await loadBundledSets();
  }
}

export async function getSets() {
  try { return await fetchAllSets(); } catch { return await loadBundledSets(); }
}

export async function fetchCardsForSet(setId) {
  const cached = await getCachedSetCards(setId);
  if (cached?.length) {
    const cards = [];
    for (const id of cached) {
      const c = await getCachedCard(id);
      if (c) cards.push(c);
    }
    if (cards.length === cached.length) return cards;
  }
  const all = [];
  let page = 1;
  let totalCount = Infinity;
  while (all.length < totalCount) {
    const data = await apiFetch(`/cards?q=set.id:${setId}&page=${page}&pageSize=250`);
    all.push(...data.data);
    totalCount = data.totalCount;
    page++;
    if (!data.data.length) break;
  }
  await cacheSet('cards', all);
  await cacheSetCardIds(setId, all.map((c) => c.id));
  return all;
}

export async function getCard(cardId) {
  const cached = await getCachedCard(cardId);
  if (cached) return cached;
  try {
    const data = await apiFetch(`/cards/${cardId}`);
    await cacheSet('cards', [data.data]);
    return data.data;
  } catch {
    return null;
  }
}

export function getPackArtsForSet(set) {
  const arts = [set.images?.logo, set.images?.symbol].filter(Boolean);
  return arts.length ? arts : ['https://images.pokemontcg.io/sets/base1/logo.png'];
}
