import { el } from './utils.js';

export function createCardDisplay(card, { selected, onClick, small, showDetails } = {}) {
  const wrap = el('div', `card-display${selected ? ' selected' : ''}${small ? ' small' : ''}${onClick ? ' clickable' : ''}`);
  const img = document.createElement('img');
  img.src = card.images?.small || card.images?.large;
  img.alt = card.name;
  img.loading = 'lazy';
  img.onerror = () => { img.src = 'https://images.pokemontcg.io/energy/colorless.png'; };
  wrap.appendChild(img);
  if (showDetails) {
    const details = el('div', 'card-details');
    details.appendChild(el('h4', '', card.name));
    details.appendChild(el('span', 'card-meta', `${card.supertype} · ${card.rarity}`));
    if (card.hp) details.appendChild(el('span', 'card-hp', `HP ${card.hp}`));
    if (card.abilities) for (const a of card.abilities) {
      const ab = el('div', 'card-ability');
      ab.appendChild(el('strong', '', a.name));
      ab.appendChild(el('p', '', a.text));
      details.appendChild(ab);
    }
    if (card.attacks) for (const a of card.attacks) {
      const atk = el('div', 'card-attack');
      atk.appendChild(el('strong', '', a.name));
      atk.appendChild(el('span', 'attack-cost', `${(a.cost || []).join(' ')} → ${a.damage || '—'}`));
      if (a.text) atk.appendChild(el('p', '', a.text));
      details.appendChild(atk);
    }
    wrap.appendChild(details);
  }
  if (onClick) {
    wrap.addEventListener('click', onClick);
    wrap.setAttribute('role', 'button');
    wrap.tabIndex = 0;
  }
  return wrap;
}

export function mountPackAnimation(container, cards, style, packArt, onComplete, freeMode) {
  let revealed = 0;
  const flipped = cards.map(() => false);
  const root = el('div', `pack-anim ${style}`);
  const hint = el('p', 'hint');
  root.appendChild(hint);

  const doneBtn = el('button', 'primary-btn', freeMode ? 'Open Another Pack' : 'Build Your Deck');
  doneBtn.addEventListener('click', onComplete);

  function revealNext() {
    revealed = Math.min(revealed + 1, cards.length);
    render();
    if (revealed >= cards.length) root.appendChild(doneBtn);
  }

  function render() {
    if (style === 'fan') {
      hint.textContent = '';
      const fan = el('div', 'fan-cards');
      cards.forEach((card, i) => {
        const fc = el('div', 'fan-card');
        fc.style.transform = `rotate(${(i - cards.length / 2) * 8}deg) translateY(${revealed > i ? -20 : 80}px)`;
        fc.style.opacity = revealed > i ? 1 : 0;
        fc.style.transitionDelay = `${i * 80}ms`;
        fc.appendChild(createCardDisplay(card));
        fan.appendChild(fc);
      });
      root.replaceChildren(hint, fan);
      if (revealed >= cards.length) root.appendChild(doneBtn);
    } else if (style === 'one-by-one') {
      hint.textContent = `Press Space or click to reveal (${revealed}/${cards.length})`;
      const current = cards[revealed - 1];
      const strip = el('div', 'revealed-strip');
      cards.slice(0, revealed).forEach((c) => strip.appendChild(createCardDisplay(c, { small: true })));
      root.replaceChildren(hint);
      if (current) {
        const cur = el('div', 'current-card');
        cur.appendChild(createCardDisplay(current, { showDetails: true }));
        root.appendChild(cur);
      }
      root.appendChild(strip);
      if (revealed >= cards.length) root.appendChild(doneBtn);
      root.onclick = () => revealNext();
    } else {
      hint.textContent = `Cards flipping... (${revealed}/${cards.length})`;
      const grid = el('div', 'flip-grid');
      cards.forEach((card, i) => {
        const fc = el('div', `flip-card${flipped[i] ? ' flipped' : ''}`);
        const inner = el('div', 'flip-inner');
        const back = el('div', 'flip-back');
        if (packArt) {
          const img = document.createElement('img');
          img.src = packArt;
          back.appendChild(img);
        } else back.textContent = '🃏';
        const front = el('div', 'flip-front');
        front.appendChild(createCardDisplay(card, { small: true }));
        inner.appendChild(back);
        inner.appendChild(front);
        fc.appendChild(inner);
        grid.appendChild(fc);
      });
      root.replaceChildren(hint, grid);
    }
  }

  if (style === 'fan') {
    setTimeout(() => { revealed = cards.length; render(); root.appendChild(doneBtn); }, 600);
  } else if (style === 'flip-array') {
    cards.forEach((_, i) => {
      setTimeout(() => {
        flipped[i] = true;
        revealed = i + 1;
        render();
        if (i === cards.length - 1) setTimeout(() => root.appendChild(doneBtn), 500);
      }, 400 + i * 350);
    });
    render();
  } else {
    const onKey = (e) => {
      if (style === 'one-by-one' && e.code === 'Space') { e.preventDefault(); revealNext(); }
    };
    window.addEventListener('keydown', onKey);
    render();
    return () => window.removeEventListener('keydown', onKey);
  }
  render();
}
