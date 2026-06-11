import { uuid, clone } from './utils.js';
import {
  canPayEnergyCost, createBoardPokemon, getResistanceReduction, getWeaknessMultiplier,
  getTrainerSubtype, isBasicPokemon, isEvolutionPokemon, parseDamage, resolveCard, shuffleDeck,
} from './cards.js';

function createPlayer(id, name, deck) {
  const shuffled = shuffleDeck(deck);
  const prizes = shuffled.splice(0, 6);
  const hand = shuffled.splice(0, 7);
  return {
    id, name, deck: shuffled, hand, prizes, discard: [], active: null, bench: [],
    hasPlayedSupporter: false, hasAttachedEnergy: false, hasRetreated: false, hasAttacked: false,
    deckCount: shuffled.length,
  };
}

export function initGame(p1Name, p1Deck, p2Name, p2Deck) {
  return {
    id: uuid(), phase: 'setup', turn: 1,
    currentPlayerId: Math.random() < 0.5 ? 'p1' : 'p2',
    players: [createPlayer('p1', p1Name, p1Deck), createPlayer('p2', p2Name, p2Deck)],
    stadium: null, stadiumOwnerId: null, winnerId: null, winReason: null,
    log: ['Game started. Place a Basic Pokémon!'], firstTurn: true,
  };
}

function getPlayer(state, id) { return state.players.find((p) => p.id === id); }
function opponent(state, id) { return state.players.find((p) => p.id !== id); }

function resetTurnFlags(player) {
  player.hasPlayedSupporter = false;
  player.hasAttachedEnergy = false;
  player.hasRetreated = false;
  player.hasAttacked = false;
  if (player.active) {
    player.active.playedThisTurn = false;
    player.active.evolvedThisTurn = false;
    player.active.abilityUsedThisTurn = false;
    player.active.cannotAttack = false;
  }
  for (const b of player.bench) {
    b.playedThisTurn = false;
    b.evolvedThisTurn = false;
    b.abilityUsedThisTurn = false;
    b.cannotAttack = false;
  }
}

function checkWin(state) {
  for (const p of state.players) {
    const opp = opponent(state, p.id);
    if (p.prizes.length === 0) {
      state.winnerId = p.id;
      state.winReason = 'Took all Prize cards';
      state.phase = 'game-over';
      return true;
    }
    const oppHasPokemon = opp.active || opp.bench.length > 0;
    const oppCanDraw = opp.deck.length > 0;
    if (!oppHasPokemon && !oppCanDraw) {
      state.winnerId = p.id;
      state.winReason = 'Opponent has no Pokémon in play';
      state.phase = 'game-over';
      return true;
    }
    if (opp.deck.length === 0 && opp.hand.length === 0 && !oppHasPokemon) {
      state.winnerId = p.id;
      state.winReason = 'Opponent cannot draw';
      state.phase = 'game-over';
      return true;
    }
  }
  return false;
}

function drawCard(player, state) {
  if (player.deck.length === 0) {
    state.winnerId = opponent(state, player.id).id;
    state.winReason = 'Opponent decked out';
    state.phase = 'game-over';
    return false;
  }
  player.hand.push(player.deck.pop());
  player.deckCount = player.deck.length;
  return true;
}

function applyDamage(target, damage, attackerTypes) {
  const weak = getWeaknessMultiplier(target, attackerTypes);
  const resist = getResistanceReduction(target, attackerTypes);
  const final = Math.max(0, Math.floor(damage * weak) - resist);
  target.damageCounters += final;
  target.currentHp = target.maxHp - target.damageCounters * 10;
  return target.currentHp <= 0;
}

function knockOut(state, attackerId, defender, pokemon, location, benchIndex) {
  defender.discard.push(pokemon.card, ...pokemon.tools);
  for (const e of pokemon.attachedEnergy) {
    defender.discard.push(resolveCard(`energy-${e.type.toLowerCase()}`, new Map()));
  }
  if (location === 'active') defender.active = null;
  else if (benchIndex !== undefined) defender.bench.splice(benchIndex, 1);
  const attacker = getPlayer(state, attackerId);
  if (attacker.prizes.length > 0) {
    attacker.prizes.pop();
    state.log.push(`${attacker.name} took a Prize card!`);
    if (checkWin(state)) return;
  }
  if (location === 'active' && defender.bench.length > 0) {
    state.log.push(`${defender.name} must choose a new Active Pokémon`);
  }
}

function handleTrainerEffect(state, player, trainer) {
  const name = trainer.name.toLowerCase();
  if (name.includes('potion')) {
    if (player.active && player.active.damageCounters > 0) {
      player.active.damageCounters = Math.max(0, player.active.damageCounters - 3);
      player.active.currentHp = player.active.maxHp - player.active.damageCounters * 10;
      state.log.push(`Healed 30 damage from ${player.active.card.name}`);
    }
  } else if (name.includes('professor') || name.includes('research')) {
    player.hand = [];
    for (let i = 0; i < 7 && player.deck.length; i++) player.hand.push(player.deck.pop());
    player.deckCount = player.deck.length;
    state.log.push(`${player.name} drew 7 new cards`);
  } else if (name.includes('ultra ball')) {
    for (let i = 0; i < 2 && player.deck.length; i++) {
      const basic = player.deck.findIndex((c) => isBasicPokemon(c));
      if (basic >= 0) {
        const [card] = player.deck.splice(basic, 1);
        player.hand.push(card);
      }
    }
    player.deckCount = player.deck.length;
    state.log.push(`${player.name} searched for Pokémon`);
  }
}

function endTurn(state) {
  const current = getPlayer(state, state.currentPlayerId);
  if (current.active?.status === 'asleep' && Math.random() < 0.5) current.active.status = 'none';
  if (current.active?.status === 'paralyzed') current.active.status = 'none';
  if (current.active?.status === 'burned') {
    applyDamage(current.active, 2, []);
    if (current.active.currentHp <= 0) knockOut(state, opponent(state, current.id).id, current, current.active, 'active');
  }
  if (current.active?.status === 'poisoned') {
    applyDamage(current.active, 1, []);
    if (current.active?.currentHp <= 0) knockOut(state, opponent(state, current.id).id, current, current.active, 'active');
  }
  state.currentPlayerId = opponent(state, state.currentPlayerId).id;
  state.turn++;
  state.firstTurn = false;
  const next = getPlayer(state, state.currentPlayerId);
  resetTurnFlags(next);
  state.phase = 'draw';
  state.log.push(`Turn ${state.turn}: ${next.name}'s turn`);
  drawCard(next, state);
  state.phase = 'main';
}

export function applyAction(state, action) {
  if (state.phase === 'game-over') return state;
  const s = clone(state);
  const player = getPlayer(s, s.currentPlayerId);

  switch (action.type) {
    case 'PLAY_POKEMON': {
      const card = player.hand[action.handIndex ?? -1];
      if (!card || !isBasicPokemon(card)) break;
      const board = createBoardPokemon(card);
      player.hand.splice(action.handIndex, 1);
      if (s.phase === 'setup' || (!player.active && action.targetIndex === undefined)) {
        player.active = board;
        s.log.push(`${player.name} played ${card.name} as Active`);
        if (s.phase === 'setup' && s.players.every((p) => p.active)) {
          s.phase = 'main';
          s.log.push('Setup complete!');
        }
      } else if (player.bench.length < 5) {
        player.bench.push(board);
        s.log.push(`${player.name} benched ${card.name}`);
      }
      break;
    }
    case 'ATTACH_ENERGY': {
      if (player.hasAttachedEnergy) break;
      const energy = player.hand[action.handIndex ?? -1];
      if (!energy || energy.supertype !== 'Energy') break;
      const target = action.targetIndex === -1 ? player.active : player.bench[action.benchIndex ?? -1];
      if (!target) break;
      const type = energy.types?.[0] ?? energy.name.replace(' Energy', '');
      target.attachedEnergy.push({ type, sourceCardId: energy.id });
      player.hand.splice(action.handIndex, 1);
      player.hasAttachedEnergy = true;
      s.log.push(`${player.name} attached ${energy.name} to ${target.card.name}`);
      break;
    }
    case 'EVOLVE': {
      const evo = player.hand[action.handIndex ?? -1];
      if (!evo || !isEvolutionPokemon(evo)) break;
      const target = action.targetIndex === -1 ? player.active : player.bench[action.benchIndex ?? -1];
      if (!target || target.evolvedThisTurn) break;
      if (evo.evolvesFrom && target.card.name !== evo.evolvesFrom) break;
      const evolved = createBoardPokemon(evo);
      evolved.attachedEnergy = [...target.attachedEnergy];
      evolved.damageCounters = target.damageCounters;
      evolved.currentHp = evolved.maxHp - evolved.damageCounters * 10;
      evolved.tools = [...target.tools];
      evolved.evolvedThisTurn = true;
      player.hand.splice(action.handIndex, 1);
      player.discard.push(target.card);
      if (action.targetIndex === -1) player.active = evolved;
      else player.bench[action.benchIndex] = evolved;
      s.log.push(`${player.name} evolved into ${evo.name}`);
      break;
    }
    case 'PLAY_TRAINER': {
      const trainer = player.hand[action.handIndex ?? -1];
      if (!trainer || trainer.supertype !== 'Trainer') break;
      const subtype = getTrainerSubtype(trainer);
      if (subtype === 'Supporter' && player.hasPlayedSupporter) break;
      player.hand.splice(action.handIndex, 1);
      if (subtype === 'Supporter') player.hasPlayedSupporter = true;
      if (subtype === 'Stadium') {
        if (s.stadium) getPlayer(s, s.stadiumOwnerId).discard.push(s.stadium);
        s.stadium = trainer;
        s.stadiumOwnerId = player.id;
      } else {
        handleTrainerEffect(s, player, trainer);
        player.discard.push(trainer);
      }
      s.log.push(`${player.name} played ${trainer.name}`);
      break;
    }
    case 'RETREAT': {
      if (player.hasRetreated || !player.active) break;
      const benchIdx = action.benchIndex ?? -1;
      const replacement = player.bench[benchIdx];
      if (!replacement || player.active.cannotRetreat) break;
      const cost = player.active.card.convertedRetreatCost ?? 0;
      if (player.active.attachedEnergy.length < cost) break;
      for (let i = 0; i < cost; i++) player.active.attachedEnergy.pop();
      const old = player.active;
      player.active = replacement;
      player.bench[benchIdx] = old;
      player.hasRetreated = true;
      s.log.push(`${player.name} retreated to ${replacement.card.name}`);
      break;
    }
    case 'ATTACK': {
      if (player.hasAttacked || !player.active) break;
      if (player.active.cannotAttack || player.active.status === 'asleep' || player.active.status === 'paralyzed') break;
      if (s.firstTurn && s.turn === 1) break;
      const opp = opponent(s, player.id);
      if (!opp.active) break;
      const attack = player.active.card.attacks?.[action.attackIndex ?? 0];
      if (!attack || !canPayEnergyCost(player.active, attack.cost)) break;
      if (player.active.status === 'confused' && Math.random() < 0.5) {
        applyDamage(player.active, 30, []);
        s.log.push(`${player.active.card.name} hurt itself in confusion!`);
        player.hasAttacked = true;
        if (player.active.currentHp <= 0) knockOut(s, opp.id, player, player.active, 'active');
        break;
      }
      const baseDamage = parseDamage(attack.damage);
      const attackerTypes = player.active.card.types ?? [];
      const ko = applyDamage(opp.active, baseDamage, attackerTypes);
      s.log.push(`${player.active.card.name} used ${attack.name} for ${baseDamage} damage!${attack.text ? ` (${attack.text})` : ''}`);
      player.hasAttacked = true;
      if (ko) knockOut(s, player.id, opp, opp.active, 'active');
      checkWin(s);
      break;
    }
    case 'PASS':
    case 'DRAW':
      endTurn(s);
      break;
  }
  if (s.phase === 'setup' && s.players.every((p) => p.active)) s.phase = 'main';
  checkWin(s);
  return s;
}

export function getLegalActions(state) {
  if (state.phase === 'game-over') return [];
  const actions = [];
  const player = getPlayer(state, state.currentPlayerId);
  if (state.phase === 'setup' || state.phase === 'main') {
    player.hand.forEach((card, i) => {
      if (isBasicPokemon(card)) {
        if (!player.active) actions.push({ type: 'PLAY_POKEMON', handIndex: i, targetIndex: -1 });
        if (player.bench.length < 5) actions.push({ type: 'PLAY_POKEMON', handIndex: i, benchIndex: player.bench.length });
      }
      if (card.supertype === 'Energy' && !player.hasAttachedEnergy) {
        if (player.active) actions.push({ type: 'ATTACH_ENERGY', handIndex: i, targetIndex: -1 });
        player.bench.forEach((_, bi) => actions.push({ type: 'ATTACH_ENERGY', handIndex: i, benchIndex: bi }));
      }
      if (isEvolutionPokemon(card)) {
        const check = (target, loc) => {
          if (target && card.evolvesFrom === target.card.name && !target.evolvedThisTurn) {
            actions.push({ type: 'EVOLVE', handIndex: i, targetIndex: loc === -1 ? -1 : undefined, benchIndex: loc >= 0 ? loc : undefined });
          }
        };
        check(player.active, -1);
        player.bench.forEach((b, bi) => check(b, bi));
      }
      if (card.supertype === 'Trainer') {
        const sub = getTrainerSubtype(card);
        if (sub !== 'Supporter' || !player.hasPlayedSupporter) actions.push({ type: 'PLAY_TRAINER', handIndex: i });
      }
    });
    if (player.active && !player.hasRetreated) {
      player.bench.forEach((_, bi) => {
        const cost = player.active.card.convertedRetreatCost ?? 0;
        if (player.active.attachedEnergy.length >= cost) actions.push({ type: 'RETREAT', benchIndex: bi });
      });
    }
    if (player.active && !player.hasAttacked && opponent(state, player.id).active) {
      if (!(state.firstTurn && state.turn === 1)) {
        player.active.card.attacks?.forEach((atk, ai) => {
          if (canPayEnergyCost(player.active, atk.cost)) actions.push({ type: 'ATTACK', attackIndex: ai });
        });
      }
    }
  }
  actions.push({ type: 'PASS' });
  return actions;
}

export function buildDeckFromIds(cardIds, cardMap) {
  return cardIds.map((id) => resolveCard(id, cardMap)).filter(Boolean);
}
