import { uuid } from './utils.js';

const DECKS_KEY = 'ptcg_arena_decks';
const AI_DECKS_KEY = 'ptcg_arena_ai_decks';
const COLLECTION_KEY = 'ptcg_arena_collection';

export function loadDecks() {
  try { return JSON.parse(localStorage.getItem(DECKS_KEY) ?? '[]'); } catch { return []; }
}

export function saveDecks(decks) {
  localStorage.setItem(DECKS_KEY, JSON.stringify(decks));
}

export function loadAiDeckIds() {
  try { return JSON.parse(localStorage.getItem(AI_DECKS_KEY) ?? '[]'); } catch { return []; }
}

export function saveAiDeckIds(ids) {
  localStorage.setItem(AI_DECKS_KEY, JSON.stringify(ids));
}

export function createDeckFromPulls(name, energyType, pulls, selectedIds) {
  const selected = new Set(selectedIds);
  const pokemonAndTrainers = pulls
    .filter((p) => selected.has(p.instanceId))
    .map((p) => ({ instanceId: p.instanceId, cardId: p.cardId }));
  const energyCards = [];
  for (let i = 0; i < 30; i++) energyCards.push({ instanceId: uuid(), cardId: `energy-${energyType.toLowerCase()}` });
  const deck = {
    id: uuid(), name, energyType, pokemonAndTrainers, energyCards,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  const decks = loadDecks();
  decks.push(deck);
  saveDecks(decks);
  return deck;
}

export function deleteDeck(id) {
  saveDecks(loadDecks().filter((d) => d.id !== id));
  saveAiDeckIds(loadAiDeckIds().filter((aid) => aid !== id));
}

export function addDeckToAi(id) {
  const ids = loadAiDeckIds();
  if (!ids.includes(id)) { ids.push(id); saveAiDeckIds(ids); }
}

export function removeDeckFromAi(id) {
  saveAiDeckIds(loadAiDeckIds().filter((aid) => aid !== id));
}

export function loadCollection() {
  try { return JSON.parse(localStorage.getItem(COLLECTION_KEY) ?? '{}'); } catch { return {}; }
}

export function saveCollection(col) {
  localStorage.setItem(COLLECTION_KEY, JSON.stringify(col));
}

export function addToCollection(setId, cardIds) {
  const col = loadCollection();
  const existing = new Set(col[setId] ?? []);
  for (const id of cardIds) existing.add(id);
  col[setId] = [...existing];
  saveCollection(col);
}

export function getSetProgress(setId, total) {
  const col = loadCollection();
  return { owned: (col[setId] ?? []).length, total };
}
