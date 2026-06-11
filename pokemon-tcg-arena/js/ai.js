import { clone, sleep } from './utils.js';
import { getLegalActions, applyAction } from './engine.js';
import { isBasicPokemon, parseDamage } from './cards.js';

function scoreAction(state, action) {
  const player = state.players.find((p) => p.id === state.currentPlayerId);
  const opp = state.players.find((p) => p.id !== state.currentPlayerId);
  let score = 0;
  switch (action.type) {
    case 'ATTACK': {
      const attack = player.active?.card.attacks?.[action.attackIndex ?? 0];
      if (!attack || !opp.active) return -100;
      const dmg = parseDamage(attack.damage);
      score += dmg * 2;
      if (opp.active.currentHp <= dmg) score += 80 + opp.prizes.length * 15;
      if (player.prizes.length <= 2) score += 30;
      break;
    }
    case 'PLAY_POKEMON': {
      const card = player.hand[action.handIndex ?? 0];
      if (!card) return -100;
      if (!player.active) score += 100;
      else if (isBasicPokemon(card)) score += 25 + (parseInt(card.hp ?? '0', 10) || 0) / 10;
      break;
    }
    case 'ATTACH_ENERGY': {
      const target = action.targetIndex === -1 ? player.active : player.bench[action.benchIndex ?? 0];
      if (!target) return -100;
      score += 35;
      if (player.active && target === player.active) score += 20;
      for (const atk of target.card.attacks ?? []) {
        if (target.attachedEnergy.length + 1 >= atk.cost.length) score += 25;
      }
      break;
    }
    case 'EVOLVE': {
      const evo = player.hand[action.handIndex ?? 0];
      if (!evo) return -100;
      score += 40 + (parseInt(evo.hp ?? '0', 10) || 0) / 5;
      break;
    }
    case 'PLAY_TRAINER': {
      const trainer = player.hand[action.handIndex ?? 0];
      if (!trainer) return -100;
      const n = trainer.name.toLowerCase();
      if (n.includes('professor') || n.includes('research')) score += 45;
      if (n.includes('ultra ball')) score += 35;
      if (n.includes('potion') && player.active?.damageCounters > 0) score += 30;
      else score += 15;
      break;
    }
    case 'RETREAT': {
      if (!player.active || !opp.active) return -100;
      const theirDmg = parseDamage(opp.active.card.attacks?.[0]?.damage ?? '0');
      if (player.active.currentHp < theirDmg) score += 40;
      else score -= 20;
      break;
    }
    case 'PASS':
      score -= 5;
      if (!player.active) score -= 100;
      break;
  }
  return score;
}

export function chooseAiAction(state) {
  const legal = getLegalActions(state);
  if (!legal.length) return { type: 'PASS' };
  const player = state.players.find((p) => p.id === state.currentPlayerId);
  if (!player.active || state.phase === 'setup') {
    const playBasic = legal.find((a) => a.type === 'PLAY_POKEMON' && a.targetIndex === -1);
    if (playBasic) return playBasic;
  }
  let best = legal[0];
  let bestScore = -Infinity;
  for (const action of legal) {
    let score = scoreAction(state, action);
    if (action.type === 'ATTACK') {
      const sim = applyAction(clone(state), action);
      if (sim.winnerId === player.id) score += 200;
    }
    if (action.type === 'PASS') {
      if (legal.some((a) => a.type === 'ATTACH_ENERGY' || a.type === 'ATTACK')) score -= 50;
    }
    if (score > bestScore) { bestScore = score; best = action; }
  }
  return best;
}

export async function runAiTurn(state, onUpdate, delayMs = 800) {
  let current = state;
  const aiId = current.currentPlayerId;
  while (current.currentPlayerId === aiId && current.phase !== 'game-over') {
    await sleep(delayMs);
    const action = chooseAiAction(current);
    current = applyAction(current, action);
    onUpdate(current);
    if (action.type === 'PASS' || action.type === 'ATTACK') break;
  }
  return current;
}

export async function runAiSetupIfNeeded(state, onUpdate) {
  let current = state;
  while (current.phase === 'setup' && current.currentPlayerId === 'p2') {
    await sleep(600);
    current = applyAction(current, chooseAiAction(current));
    onUpdate(current);
  }
  return current;
}
