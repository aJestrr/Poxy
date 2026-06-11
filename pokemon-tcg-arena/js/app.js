import { el, clear, uuid } from './utils.js';
import { getSets, fetchCardsForSet, getPackArtsForSet, getCard, ENERGY_TYPES } from './api.js';
import { openMultiplePacks, openPack } from './packSimulator.js';
import {
  loadDecks, saveDecks, loadAiDeckIds, createDeckFromPulls, deleteDeck,
  addDeckToAi, removeDeckFromAi, loadCollection, addToCollection, getSetProgress,
} from './storage.js';
import { initGame, applyAction, getLegalActions, buildDeckFromIds } from './engine.js';
import { runAiTurn, runAiSetupIfNeeded, chooseAiAction } from './ai.js';
import { makeEnergyCard } from './cards.js';
import { P2PService } from './p2p.js';
import { createCardDisplay, mountPackAnimation } from './ui.js';

const DECK_SIZE = 30;
const mainEl = document.getElementById('main');
const apiKeyBanner = document.getElementById('api-key-banner');
let activeTab = 'packs';

function initApiKeyBanner() {
  const key = localStorage.getItem('pokemontcg_api_key') ?? '';
  if (key) {
    apiKeyBanner.innerHTML = '';
    const toggle = el('button', 'api-key-toggle', 'Change API key');
    toggle.onclick = () => showApiKeyInput(key);
    apiKeyBanner.appendChild(toggle);
  } else {
    const toggle = el('button', 'api-key-toggle', 'Add API key for faster card loading');
    toggle.onclick = () => showApiKeyInput('');
    apiKeyBanner.appendChild(toggle);
  }
}

function showApiKeyInput(current) {
  clear(apiKeyBanner);
  const input = document.createElement('input');
  input.placeholder = 'Optional: Pokémon TCG API key (dev.pokemontcg.io)';
  input.value = current;
  const save = el('button', '', 'Save');
  save.onclick = () => {
    localStorage.setItem('pokemontcg_api_key', input.value);
    initApiKeyBanner();
  };
  apiKeyBanner.appendChild(input);
  apiKeyBanner.appendChild(save);
}

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    activeTab = btn.dataset.tab;
    render();
  });
});

function render() {
  clear(mainEl);
  if (activeTab === 'packs') renderPacksTab();
  else if (activeTab === 'decks') renderDecksTab();
  else if (activeTab === 'battle') renderBattleTab();
  else if (activeTab === 'collection') renderCollectionTab();
}

// ─── Pack Opening ───────────────────────────────────────────────
function renderPacksTab() {
  const root = el('div', 'pack-opening-tab');
  let sets = [];
  let selectedSet = null;
  let packCount = 5;
  let packArt = 0;
  let openStyle = 'one-by-one';
  let step = 'select';
  let pulledCards = [];
  let search = '';

  const panel = el('div', 'panel');
  panel.appendChild(el('h2', '', 'Choose an Expansion'));
  const searchInput = document.createElement('input');
  searchInput.className = 'search-input';
  searchInput.placeholder = 'Search expansions...';
  const setScroll = el('div', 'set-scroll');
  const configPanel = el('div', 'panel pack-config');
  panel.appendChild(searchInput);
  panel.appendChild(setScroll);
  root.appendChild(panel);
  root.appendChild(configPanel);

  function drawSets() {
    clear(setScroll);
    const filtered = sets.filter((s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.series.toLowerCase().includes(search.toLowerCase()),
    );
    if (!sets.length) setScroll.appendChild(el('p', 'loading', 'Loading all expansions...'));
    filtered.forEach((s) => {
      const btn = el('button', `set-card${selectedSet?.id === s.id ? ' selected' : ''}`);
      const img = document.createElement('img');
      img.src = s.images?.logo;
      img.alt = s.name;
      const info = el('div', 'set-info');
      info.appendChild(el('strong', '', s.name));
      info.appendChild(el('span', '', `${s.series} · ${s.releaseDate}`));
      info.appendChild(el('span', '', `${s.total} cards`));
      btn.appendChild(img);
      btn.appendChild(info);
      btn.onclick = () => { selectedSet = s; drawSets(); drawConfig(); };
      setScroll.appendChild(btn);
    });
  }

  function drawConfig() {
    clear(configPanel);
    if (!selectedSet) return;
    configPanel.appendChild(el('h3', '', selectedSet.name));
    const arts = getPackArtsForSet(selectedSet);

    const row1 = el('div', 'config-row');
    row1.appendChild(el('label', '', 'Number of packs'));
    const grp1 = el('div', 'btn-group');
    const b5 = el('button', packCount === 5 ? 'active' : '', '5 Packs');
    const b10 = el('button', packCount === 10 ? 'active' : '', '10 Packs');
    b5.onclick = () => { packCount = 5; drawConfig(); };
    b10.onclick = () => { packCount = 10; drawConfig(); };
    grp1.appendChild(b5);
    grp1.appendChild(b10);
    row1.appendChild(grp1);

    const row2 = el('div', 'config-row');
    row2.appendChild(el('label', '', 'Pack design'));
    const artsDiv = el('div', 'pack-arts');
    arts.forEach((art, i) => {
      const ab = el('button', `pack-art-btn${packArt === i ? ' active' : ''}`);
      const img = document.createElement('img');
      img.src = art;
      ab.appendChild(img);
      ab.onclick = () => { packArt = i; drawConfig(); };
      artsDiv.appendChild(ab);
    });
    row2.appendChild(artsDiv);

    const row3 = el('div', 'config-row');
    row3.appendChild(el('label', '', 'Opening style'));
    const grp3 = el('div', 'btn-group');
    [['fan', 'Fan Out'], ['one-by-one', 'One by One'], ['flip-array', 'Flip Array']].forEach(([v, l]) => {
      const b = el('button', openStyle === v ? 'active' : '', l);
      b.onclick = () => { openStyle = v; drawConfig(); };
      grp3.appendChild(b);
    });
    row3.appendChild(grp3);

    const openBtn = el('button', 'primary-btn', `Open ${packCount} Packs`);
    openBtn.onclick = async () => {
      openBtn.disabled = true;
      openBtn.textContent = 'Loading cards...';
      const cards = await fetchCardsForSet(selectedSet.id);
      const packs = openMultiplePacks(cards, packCount);
      pulledCards = packs.map((card) => ({ instanceId: uuid(), cardId: card.id, card }));
      step = 'opening';
      drawRoot();
    };
    configPanel.appendChild(row1);
    configPanel.appendChild(row2);
    configPanel.appendChild(row3);
    configPanel.appendChild(openBtn);
  }

  function drawDeckBuilder() {
    clear(mainEl);
    const selected = new Set();
    let deckName = 'My Deck';
    let energyType = ENERGY_TYPES[0];
    const playable = pulledCards.filter((p) => p.card.supertype !== 'Energy');

    const wrap = el('div', 'deck-builder');
    const header = el('div', 'deck-builder-header');
    header.appendChild(el('h2', '', 'Build Your 60-Card Deck'));
    header.appendChild(el('p', '', `Select ${DECK_SIZE} Pokémon & Trainer cards. 30 energy auto-added.`));
    const stats = el('div', 'deck-stats');
    const selSpan = el('span', '', `Selected: 0 / ${DECK_SIZE}`);
    stats.appendChild(selSpan);
    stats.appendChild(el('span', '', `Total deck: 30 / 60`));
    header.appendChild(stats);
    wrap.appendChild(header);

    const form = el('div', 'deck-form');
    const nameInput = document.createElement('input');
    nameInput.value = deckName;
    nameInput.placeholder = 'Deck name';
    const energySelect = document.createElement('select');
    ENERGY_TYPES.forEach((t) => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = `${t} Energy (×30 auto)`;
      energySelect.appendChild(opt);
    });
    const autoFill = el('button', '', `Auto-fill ${DECK_SIZE}`);
    const clearBtn = el('button', '', 'Clear');
    form.appendChild(nameInput);
    form.appendChild(energySelect);
    form.appendChild(autoFill);
    form.appendChild(clearBtn);
    wrap.appendChild(form);

    const grid = el('div', 'card-grid');
    wrap.appendChild(grid);

    const actions = el('div', 'deck-actions');
    const cancelBtn = el('button', 'secondary-btn', 'Cancel');
    const saveBtn = el('button', 'primary-btn', 'Save Deck');
    saveBtn.disabled = true;
    actions.appendChild(cancelBtn);
    actions.appendChild(saveBtn);
    wrap.appendChild(actions);
    mainEl.appendChild(wrap);

    function update() {
      selSpan.textContent = `Selected: ${selected.size} / ${DECK_SIZE}`;
      selSpan.className = selected.size === DECK_SIZE ? 'complete' : '';
      stats.children[1].textContent = `Total deck: ${selected.size + 30} / 60`;
      saveBtn.disabled = selected.size !== DECK_SIZE || !nameInput.value.trim();
      clear(grid);
      playable.forEach((p) => {
        const cw = el('div', 'deck-card-wrap');
        cw.appendChild(createCardDisplay(p.card, {
          selected: selected.has(p.instanceId),
          showDetails: selected.has(p.instanceId),
          onClick: () => toggle(p.instanceId),
        }));
        const tb = el('button', `toggle-btn ${selected.has(p.instanceId) ? 'remove' : 'add'}`,
          selected.has(p.instanceId) ? '− Remove' : '+ Add');
        tb.onclick = () => toggle(p.instanceId);
        cw.appendChild(tb);
        grid.appendChild(cw);
      });
    }

    function toggle(id) {
      if (selected.has(id)) selected.delete(id);
      else if (selected.size < DECK_SIZE) selected.add(id);
      update();
    }

    autoFill.onclick = () => {
      selected.clear();
      playable.slice(0, DECK_SIZE).forEach((p) => selected.add(p.instanceId));
      update();
    };
    clearBtn.onclick = () => { selected.clear(); update(); };
    cancelBtn.onclick = () => { step = 'select'; pulledCards = []; selectedSet = null; drawRoot(); };
    saveBtn.onclick = () => {
      createDeckFromPulls(nameInput.value, energySelect.value,
        pulledCards.map((p) => ({ instanceId: p.instanceId, cardId: p.cardId })),
        [...selected]);
      step = 'select';
      pulledCards = [];
      selectedSet = null;
      drawRoot();
    };
    energySelect.onchange = () => { energyType = energySelect.value; };
    update();
  }

  function drawRoot() {
    clear(mainEl);
    if (step === 'opening') {
      const container = el('div', '');
      mainEl.appendChild(container);
      mountPackAnimation(container, pulledCards.map((p) => p.card), openStyle,
        getPackArtsForSet(selectedSet)[packArt], () => { step = 'deck-build'; drawRoot(); }, false);
      return;
    }
    if (step === 'deck-build') { drawDeckBuilder(); return; }
    mainEl.appendChild(root);
    drawSets();
    drawConfig();
  }

  searchInput.oninput = (e) => { search = e.target.value; drawSets(); };
  getSets().then((s) => { sets = s; drawSets(); });
  drawRoot();
}

// ─── Decks ──────────────────────────────────────────────────────
const decksState = { expanded: null, hydrated: null };

function renderDecksTab() {
  const root = el('div', 'decks-tab');
  root.appendChild(el('h2', '', 'My Decks'));
  const decks = loadDecks();
  const aiIds = loadAiDeckIds();
  const expanded = decksState.expanded;
  const hydrated = decksState.hydrated;

  if (!decks.length) {
    root.appendChild(el('p', 'empty', 'No decks yet. Open some packs to build your first deck!'));
  } else {
    const list = el('div', 'deck-list');
    decks.forEach((deck) => {
      const item = el('div', 'deck-item');
      const header = el('div', 'deck-item-header');
      const info = el('div', '');
      info.appendChild(el('h3', '', deck.name));
      info.appendChild(el('span', '', `${deck.pokemonAndTrainers.length} cards + 30 ${deck.energyType} Energy · Updated ${new Date(deck.updatedAt).toLocaleDateString()}`));
      const actions = el('div', 'deck-item-actions');
      const viewBtn = el('button', '', expanded === deck.id ? 'Hide' : 'View Cards');
      const aiBtn = el('button', aiIds.includes(deck.id) ? 'ai-active' : '',
        aiIds.includes(deck.id) ? '✓ AI Deck (Remove)' : 'Give to AI');
      const delBtn = el('button', 'danger', 'Delete');
      viewBtn.onclick = async () => {
        if (decksState.expanded === deck.id) {
          decksState.expanded = null;
          decksState.hydrated = null;
          renderDecksTab();
          return;
        }
        decksState.expanded = deck.id;
        decksState.hydrated = null;
        renderDecksTab();
        const h = { ...deck };
        for (const e of h.pokemonAndTrainers) e.card = await getCard(e.cardId);
        decksState.hydrated = h;
        renderDecksTab();
      };
      aiBtn.onclick = () => {
        if (aiIds.includes(deck.id)) removeDeckFromAi(deck.id);
        else addDeckToAi(deck.id);
        renderDecksTab();
      };
      delBtn.onclick = () => { deleteDeck(deck.id); renderDecksTab(); };
      actions.appendChild(viewBtn);
      actions.appendChild(aiBtn);
      actions.appendChild(delBtn);
      header.appendChild(info);
      header.appendChild(actions);
      item.appendChild(header);
      if (expanded === deck.id) {
        const exp = el('div', 'deck-expanded');
        if (!hydrated) exp.appendChild(el('p', '', 'Loading cards...'));
        else {
          exp.appendChild(el('h4', '', `Pokémon & Trainers (${hydrated.pokemonAndTrainers.length})`));
          const grid = el('div', 'card-grid small-grid');
          hydrated.pokemonAndTrainers.forEach((e) => {
            if (e.card) grid.appendChild(createCardDisplay(e.card, { small: true, showDetails: true }));
          });
          exp.appendChild(grid);
          exp.appendChild(el('p', 'energy-note', `+ 30 ${deck.energyType} Energy cards (auto-included)`));
        }
        item.appendChild(exp);
      }
      list.appendChild(item);
    });
    root.appendChild(list);
  }
  clear(mainEl);
  mainEl.appendChild(root);
}

// ─── Battle ─────────────────────────────────────────────────────
const battleState = {
  mode: 'menu', game: null, cardMap: new Map(), p2p: new P2PService(),
  hostId: '', joinId: '', playerName: 'Player', isAiGame: false, logOpen: true,
  selectedDeck: '', pvpSubMode: 'host',
};

async function buildCardMap(deck) {
  const map = new Map();
  for (const e of deck.pokemonAndTrainers) {
    const c = await getCard(e.cardId);
    if (c) map.set(c.id, c);
  }
  map.set(`energy-${deck.energyType.toLowerCase()}`, makeEnergyCard(deck.energyType));
  return map;
}

function deckToTcgList(deck, map) {
  const ids = deck.pokemonAndTrainers.map((e) => e.cardId);
  for (let i = 0; i < 30; i++) ids.push(`energy-${deck.energyType.toLowerCase()}`);
  return buildDeckFromIds(ids, map);
}

function renderBattleTab() {
  clear(mainEl);
  const decks = loadDecks();
  const aiIds = loadAiDeckIds();
  const bs = battleState;

  if (bs.mode === 'menu') {
    const root = el('div', 'battle-tab menu');
    root.appendChild(el('h2', '', 'Battle Arena'));
    const modes = el('div', 'battle-modes');
    const pvpCard = el('button', 'mode-card');
    pvpCard.innerHTML = '<span class="mode-icon">🌐</span><h3>Play Real Player</h3><p>Peer-to-peer matchmaking via room code.</p>';
    pvpCard.onclick = () => { bs.mode = 'pvp'; bs.pvpSubMode = 'host'; bs.p2p.host().then((id) => { bs.hostId = id; renderBattleTab(); }); renderBattleTab(); };
    const aiCard = el('button', 'mode-card');
    aiCard.innerHTML = '<span class="mode-icon">🤖</span><h3>AI Battle</h3><p>Face an advanced AI opponent.</p>';
    aiCard.onclick = () => { bs.mode = 'ai'; renderBattleTab(); };
    modes.appendChild(pvpCard);
    modes.appendChild(aiCard);
    root.appendChild(modes);

    const aiMgr = el('div', 'panel ai-deck-manager');
    aiMgr.appendChild(el('h3', '', 'AI Deck Pool'));
    aiMgr.appendChild(el('p', '', 'Assign decks for the AI to use.'));
    if (!decks.length) aiMgr.appendChild(el('p', 'empty', 'Create decks first.'));
    else {
      const list = el('div', 'ai-deck-list');
      decks.forEach((d) => {
        const row = el('div', 'ai-deck-row');
        row.appendChild(el('span', '', d.name));
        const btn = el('button', aiIds.includes(d.id) ? 'ai-active' : '',
          aiIds.includes(d.id) ? '✓ In AI Pool — Remove' : 'Add to AI Pool');
        btn.onclick = () => {
          if (aiIds.includes(d.id)) removeDeckFromAi(d.id);
          else addDeckToAi(d.id);
          renderBattleTab();
        };
        row.appendChild(btn);
        list.appendChild(row);
      });
      aiMgr.appendChild(list);
    }
    root.appendChild(aiMgr);
    mainEl.appendChild(root);
    return;
  }

  if (bs.mode === 'ai') {
    const panel = el('div', 'battle-setup panel');
    const back = el('button', 'back-btn', '← Back');
    back.onclick = () => { bs.mode = 'menu'; renderBattleTab(); };
    panel.appendChild(back);
    panel.appendChild(el('h2', '', 'AI Battle Setup'));
    const nameInput = document.createElement('input');
    nameInput.value = bs.playerName;
    nameInput.placeholder = 'Your name';
    nameInput.oninput = (e) => { bs.playerName = e.target.value; };
    const deckSelect = document.createElement('select');
    deckSelect.innerHTML = '<option value="">Select deck...</option>';
    decks.forEach((d) => {
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = d.name;
      if (d.id === bs.selectedDeck) opt.selected = true;
      deckSelect.appendChild(opt);
    });
    deckSelect.onchange = (e) => { bs.selectedDeck = e.target.value; };
    panel.appendChild(nameInput);
    panel.appendChild(el('label', '', 'Your Deck'));
    panel.appendChild(deckSelect);
    panel.appendChild(el('p', '', `AI will use a random deck from the AI Pool (${aiIds.length} decks)`));
    const startBtn = el('button', 'primary-btn', 'Start Battle');
    startBtn.disabled = !bs.selectedDeck || !aiIds.length;
    startBtn.onclick = async () => {
      const playerDeck = decks.find((d) => d.id === bs.selectedDeck);
      const aiDeck = decks.find((d) => d.id === aiIds[Math.floor(Math.random() * aiIds.length)]);
      const pMap = await buildCardMap(playerDeck);
      const aMap = await buildCardMap(aiDeck);
      const merged = new Map([...pMap, ...aMap]);
      bs.cardMap = merged;
      let g = initGame(bs.playerName, deckToTcgList(playerDeck, merged), 'AI Trainer', deckToTcgList(aiDeck, merged));
      bs.game = g;
      bs.isAiGame = true;
      bs.mode = 'battle';
      renderBattleTab();
      bs.game = await runAiSetupIfNeeded(g, (s) => { bs.game = s; renderBattleTab(); });
      renderBattleTab();
    };
    panel.appendChild(startBtn);
    if (!aiIds.length) panel.appendChild(el('p', 'warn', 'Add at least one deck to the AI Pool first.'));
    mainEl.appendChild(panel);
    return;
  }

  if (bs.mode === 'pvp') {
    const panel = el('div', 'battle-setup panel');
    const back = el('button', 'back-btn', '← Back');
    back.onclick = () => { bs.p2p.destroy(); bs.mode = 'menu'; renderBattleTab(); };
    panel.appendChild(back);
    panel.appendChild(el('h2', '', 'Online Battle'));
    const nameInput = document.createElement('input');
    nameInput.value = bs.playerName;
    nameInput.oninput = (e) => { bs.playerName = e.target.value; };
    panel.appendChild(nameInput);

    if (bs.pvpSubMode === 'host') {
      panel.appendChild(el('p', '', 'Share this Room Code:'));
      panel.appendChild(el('code', 'room-code', bs.hostId || 'Creating room...'));
      const deckSelect = document.createElement('select');
      deckSelect.innerHTML = '<option value="">Select deck...</option>';
      decks.forEach((d) => {
        const opt = document.createElement('option');
        opt.value = d.id;
        opt.textContent = d.name;
        deckSelect.appendChild(opt);
      });
      deckSelect.onchange = (e) => { bs.selectedDeck = e.target.value; };
      panel.appendChild(el('label', '', 'Your Deck'));
      panel.appendChild(deckSelect);
      const startBtn = el('button', 'primary-btn', 'Start When Ready');
      startBtn.disabled = !bs.selectedDeck || !bs.hostId;
      startBtn.onclick = async () => {
        const playerDeck = decks.find((d) => d.id === bs.selectedDeck);
        const map = await buildCardMap(playerDeck);
        bs.cardMap = map;
        const cards = deckToTcgList(playerDeck, map);
        const g = initGame(bs.playerName, cards, 'Opponent', cards);
        bs.game = g;
        bs.p2p.send({ type: 'game-state', state: g });
        bs.mode = 'battle';
        renderBattleTab();
      };
      panel.appendChild(startBtn);
      const joinLink = el('button', '', 'Or Join a Room');
      joinLink.onclick = () => { bs.pvpSubMode = 'join'; renderBattleTab(); };
      panel.appendChild(joinLink);
    } else {
      const joinInput = document.createElement('input');
      joinInput.placeholder = 'Enter room code';
      joinInput.oninput = (e) => { bs.joinId = e.target.value; };
      panel.appendChild(joinInput);
      const deckSelect = document.createElement('select');
      deckSelect.innerHTML = '<option value="">Select deck...</option>';
      decks.forEach((d) => {
        const opt = document.createElement('option');
        opt.value = d.id;
        opt.textContent = d.name;
        deckSelect.appendChild(opt);
      });
      deckSelect.onchange = (e) => { bs.selectedDeck = e.target.value; };
      panel.appendChild(el('label', '', 'Your Deck'));
      panel.appendChild(deckSelect);
      const joinBtn = el('button', 'primary-btn', 'Join Battle');
      joinBtn.onclick = async () => {
        await bs.p2p.join(bs.joinId);
        bs.p2p.onData((msg) => {
          if (msg.type === 'game-state') { bs.game = msg.state; renderBattleTab(); }
          if (msg.type === 'action' && bs.game) { bs.game = applyAction(bs.game, msg.action); renderBattleTab(); }
        });
        bs.mode = 'battle';
        renderBattleTab();
      };
      panel.appendChild(joinBtn);
      const hostLink = el('button', '', 'Or Host a Room');
      hostLink.onclick = () => { bs.pvpSubMode = 'host'; bs.p2p.host().then((id) => { bs.hostId = id; renderBattleTab(); }); };
      panel.appendChild(hostLink);
    }
    mainEl.appendChild(panel);
    return;
  }

  if (bs.mode === 'battle' && bs.game) {
    const g = bs.game;
    const me = g.players.find((p) => p.id === 'p1');
    const opp = g.players.find((p) => p.id === 'p2');
    const isMyTurn = g.currentPlayerId === 'p1';
    const legal = isMyTurn ? getLegalActions(g) : [];

    const field = el('div', 'battle-field');
    const topBar = el('div', 'battle-top-bar');
    const quitBtn = el('button', 'back-btn', '← Quit');
    quitBtn.onclick = () => { bs.game = null; bs.mode = 'menu'; bs.p2p.destroy(); renderBattleTab(); };
    topBar.appendChild(quitBtn);
    topBar.appendChild(el('span', '', `Turn ${g.turn} · ${isMyTurn ? 'Your turn' : "Opponent's turn"}`));
    topBar.appendChild(el('span', '', `Prizes: You ${me.prizes.length} · Opp ${opp.prizes.length}`));
    const logBtn = el('button', '', bs.logOpen ? 'Hide Log' : 'Show Log');
    logBtn.onclick = () => { bs.logOpen = !bs.logOpen; renderBattleTab(); };
    topBar.appendChild(logBtn);
    field.appendChild(topBar);

    if (g.phase === 'game-over') {
      const go = el('div', 'game-over');
      go.appendChild(el('h2', '', g.winnerId === 'p1' ? 'You Win!' : 'You Lose!'));
      go.appendChild(el('p', '', g.winReason));
      field.appendChild(go);
    }

    const oppZone = el('div', 'opponent-zone');
    oppZone.appendChild(el('div', 'zone-label', `${opp.name} · Deck: ${opp.deckCount} · Hand: ${opp.hand.length}`));
    const oppActive = el('div', 'active-zone');
    if (opp.active) oppActive.appendChild(createCardDisplay(opp.active.card, { showDetails: true }));
    else oppActive.appendChild(el('div', 'empty-slot', 'No Active'));
    oppZone.appendChild(oppActive);
    const oppBench = el('div', 'bench-zone');
    opp.bench.forEach((b) => oppBench.appendChild(createCardDisplay(b.card, { small: true })));
    oppZone.appendChild(oppBench);
    field.appendChild(oppZone);

    const playerZone = el('div', 'player-zone');
    const myBench = el('div', 'bench-zone');
    me.bench.forEach((b) => myBench.appendChild(createCardDisplay(b.card, { small: true, showDetails: true })));
    playerZone.appendChild(myBench);
    const myActive = el('div', 'active-zone');
    if (me.active) myActive.appendChild(createCardDisplay(me.active.card, { showDetails: true }));
    else myActive.appendChild(el('div', 'empty-slot', 'Play a Basic Pokémon!'));
    playerZone.appendChild(myActive);
    playerZone.appendChild(el('div', 'zone-label', `${me.name} · Deck: ${me.deckCount}`));
    field.appendChild(playerZone);

    const handZone = el('div', 'hand-zone');
    handZone.appendChild(el('h4', '', `Your Hand (${me.hand.length})`));
    const handCards = el('div', 'hand-cards');
    me.hand.forEach((card, hi) => {
      const hc = el('div', 'hand-card-actions');
      hc.appendChild(createCardDisplay(card, { small: true }));
      if (isMyTurn && g.phase !== 'game-over') {
        const btns = el('div', 'card-action-btns');
        if (legal.some((a) => a.type === 'PLAY_POKEMON' && a.handIndex === hi)) {
          const b = el('button', '', 'Active');
          b.onclick = () => doAction({ type: 'PLAY_POKEMON', handIndex: hi, targetIndex: -1 });
          btns.appendChild(b);
        }
        if (legal.some((a) => a.type === 'PLAY_POKEMON' && a.handIndex === hi && a.benchIndex !== undefined)) {
          const b = el('button', '', 'Bench');
          b.onclick = () => doAction({ type: 'PLAY_POKEMON', handIndex: hi, benchIndex: me.bench.length });
          btns.appendChild(b);
        }
        if (legal.some((a) => a.type === 'ATTACH_ENERGY' && a.handIndex === hi)) {
          const b = el('button', '', 'Attach');
          b.onclick = () => doAction({ type: 'ATTACH_ENERGY', handIndex: hi, targetIndex: -1 });
          btns.appendChild(b);
        }
        if (legal.some((a) => a.type === 'PLAY_TRAINER' && a.handIndex === hi)) {
          const b = el('button', '', 'Play');
          b.onclick = () => doAction({ type: 'PLAY_TRAINER', handIndex: hi });
          btns.appendChild(b);
        }
        if (legal.some((a) => a.type === 'EVOLVE' && a.handIndex === hi)) {
          const b = el('button', '', 'Evolve');
          b.onclick = () => doAction({ type: 'EVOLVE', handIndex: hi, targetIndex: -1 });
          btns.appendChild(b);
        }
        hc.appendChild(btns);
      }
      handCards.appendChild(hc);
    });
    handZone.appendChild(handCards);
    field.appendChild(handZone);

    if (isMyTurn && me.active && g.phase !== 'game-over') {
      const attackBar = el('div', 'attack-bar');
      me.active.card.attacks?.forEach((atk, ai) => {
        if (legal.some((a) => a.type === 'ATTACK' && a.attackIndex === ai)) {
          const b = el('button', 'attack-btn', `${atk.name} (${atk.damage || '0'})`);
          b.onclick = () => doAction({ type: 'ATTACK', attackIndex: ai });
          attackBar.appendChild(b);
        }
      });
      const passBtn = el('button', 'pass-btn', 'End Turn');
      passBtn.onclick = () => doAction({ type: 'PASS' });
      attackBar.appendChild(passBtn);
      field.appendChild(attackBar);
    }

    if (bs.logOpen) {
      const log = el('div', 'battle-log');
      g.log.slice(-12).forEach((l) => log.appendChild(el('p', '', l)));
      field.appendChild(log);
    }

    mainEl.appendChild(field);

    async function doAction(action) {
      let next = applyAction(bs.game, action);
      bs.game = next;
      if (!bs.isAiGame) bs.p2p.send({ type: 'action', action });
      renderBattleTab();
      if (bs.isAiGame && next.currentPlayerId === 'p2' && next.phase !== 'game-over') {
        bs.game = await runAiTurn(next, (s) => { bs.game = s; renderBattleTab(); });
        renderBattleTab();
      }
    }
  }
}

// ─── Collection ─────────────────────────────────────────────────
function renderCollectionTab() {
  const root = el('div', 'collection-tab');
  let sets = [];
  let selectedSet = null;
  let setCards = [];
  let collection = loadCollection();
  let opening = false;
  let pulledCards = [];
  let openStyle = 'flip-array';
  let search = '';

  const panel = el('div', 'panel');
  panel.appendChild(el('h2', '', 'Free Pack Collection'));
  panel.appendChild(el('p', '', 'Unlimited free pack openings — collect every card from every expansion.'));
  const searchInput = document.createElement('input');
  searchInput.className = 'search-input';
  searchInput.placeholder = 'Search expansions...';
  const setScroll = el('div', 'set-scroll compact');
  const detailPanel = el('div', 'panel');
  panel.appendChild(searchInput);
  panel.appendChild(setScroll);
  root.appendChild(panel);
  root.appendChild(detailPanel);

  function drawSets() {
    clear(setScroll);
    sets.filter((s) => s.name.toLowerCase().includes(search.toLowerCase())).forEach((s) => {
      const prog = getSetProgress(s.id, s.total);
      const btn = el('button', `set-card${selectedSet?.id === s.id ? ' selected' : ''}`);
      const img = document.createElement('img');
      img.src = s.images?.logo;
      const info = el('div', 'set-info');
      info.appendChild(el('strong', '', s.name));
      const barWrap = el('span', 'progress-bar-wrap');
      const bar = el('span', 'progress-bar');
      bar.style.width = `${(prog.owned / prog.total) * 100}%`;
      barWrap.appendChild(bar);
      info.appendChild(barWrap);
      info.appendChild(el('span', '', `${prog.owned} / ${prog.total} collected`));
      btn.appendChild(img);
      btn.appendChild(info);
      btn.onclick = async () => {
        selectedSet = s;
        detailPanel.innerHTML = 'Loading set cards...';
        setCards = await fetchCardsForSet(s.id);
        collection = loadCollection();
        drawSets();
        drawDetail();
      };
      setScroll.appendChild(btn);
    });
  }

  function drawDetail() {
    if (!selectedSet) return;
    clear(detailPanel);
    const prog = getSetProgress(selectedSet.id, selectedSet.total);
    const ownedIds = new Set(collection[selectedSet.id] ?? []);
    detailPanel.appendChild(el('h3', '', selectedSet.name));
    const progressDiv = el('div', 'collection-progress');
    progressDiv.appendChild(el('div', 'progress-ring', `${Math.round((prog.owned / prog.total) * 100)}%`));
    progressDiv.appendChild(el('span', '', `${prog.owned} of ${prog.total} cards collected`));
    detailPanel.appendChild(progressDiv);

    const row = el('div', 'config-row');
    row.appendChild(el('label', '', 'Opening style'));
    const grp = el('div', 'btn-group');
    [['fan', 'Fan'], ['one-by-one', 'One by One'], ['flip-array', 'Flip Array']].forEach(([v, l]) => {
      const b = el('button', openStyle === v ? 'active' : '', l);
      b.onclick = () => { openStyle = v; drawDetail(); };
      grp.appendChild(b);
    });
    row.appendChild(grp);
    detailPanel.appendChild(row);

    const openBtn = el('button', 'primary-btn', 'Open Free Pack ♾️');
    openBtn.onclick = () => {
      pulledCards = openPack(setCards);
      addToCollection(selectedSet.id, pulledCards.map((c) => c.id));
      collection = loadCollection();
      opening = true;
      drawRoot();
    };
    detailPanel.appendChild(openBtn);

    const grid = el('div', 'collection-grid');
    setCards.forEach((card) => {
      const cc = el('div', `collection-card ${ownedIds.has(card.id) ? 'owned' : 'missing'}`);
      cc.appendChild(createCardDisplay(card, { small: true, showDetails: ownedIds.has(card.id) }));
      if (!ownedIds.has(card.id)) cc.appendChild(el('div', 'missing-overlay', '?'));
      grid.appendChild(cc);
    });
    detailPanel.appendChild(grid);
  }

  function drawRoot() {
    clear(mainEl);
    if (opening) {
      const container = el('div', '');
      mainEl.appendChild(container);
      mountPackAnimation(container, pulledCards, openStyle,
        getPackArtsForSet(selectedSet)[0], () => { opening = false; drawRoot(); }, true);
      return;
    }
    mainEl.appendChild(root);
    drawSets();
    if (selectedSet) drawDetail();
  }

  searchInput.oninput = (e) => { search = e.target.value; drawSets(); };
  getSets().then((s) => { sets = s; drawSets(); });
  drawRoot();
}

initApiKeyBanner();
render();
