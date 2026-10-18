import { ROLES, normalizeRoster, compositionSlots, generateMatch } from './generator.js';

const ROSTER_URL = 'https://raw.githubusercontent.com/Xman4001/MarvelRivalsRandomizerData/main/heroes.json';
const IMAGE_BASE = 'https://raw.githubusercontent.com/Xman4001/MarvelRivalsRandomizerData/main/images/';
const STORAGE_KEY = 'xavier-rivals:settings:v2';
const CACHE_KEY = 'xavier-rivals:roster:v2';
const ROLE_ICONS = { Vanguard: 'shield', Duelist: 'target', Strategist: 'plus' };
const $ = selector => document.querySelector(selector);
const defaultComposition = () => ({ Vanguard: 2, Duelist: 2, Strategist: 2 });
const slotKey = (team, index) => `${team}:${index}`;
const cleanName = (value, limit = 32) => String(value ?? '').replace(/[\r\n\t]/g, ' ').slice(0, limit);
function readStorage(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } }
function writeStorage(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Local storage is optional. */ } }
const saved = readStorage(STORAGE_KEY);
const state = {
  compositions: [defaultComposition(), defaultComposition()],
  names: [Array(6).fill(''), Array(6).fill('')],
  teamNames: ['TEAM 1', 'TEAM 2'], roster: [], portraits: {}, match: null,
  locks: new Set(), rolls: 0, source: 'bundled', ready: false, rolling: false, refreshing: false,
};
if (saved?.version === 2) {
  try { compositionSlots(saved.compositions); state.compositions = saved.compositions; } catch { /* Use the standard composition. */ }
  state.names = [0, 1].map(team => Array.from({ length: 6 }, (_, index) => cleanName(saved.names?.[team]?.[index], 30)));
  state.teamNames = [0, 1].map(team => cleanName(saved.teamNames?.[team]) || `TEAM ${team + 1}`);
  state.rolls = Number.isSafeInteger(saved.rolls) && saved.rolls >= 0 ? saved.rolls : 0;
}

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.append(use);
  return svg;
}
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function persist() {
  writeStorage(STORAGE_KEY, {
    version: 2, compositions: state.compositions, names: state.names, teamNames: state.teamNames,
    rolls: state.rolls, locks: [...state.locks],
    match: state.match?.map(team => team.map(pick => ({ role: pick.role, heroId: pick.hero.id }))) ?? null,
  });
}
function toast(message) {
  const node = $('#toast');
  clearTimeout(toast.timer);
  node.textContent = message;
  node.hidden = false;
  toast.timer = setTimeout(() => { node.hidden = true; }, 3300);
}
function showError(message = '') {
  $('#error-banner').textContent = message;
  $('#error-banner').hidden = !message;
}
function updateUI() {
  let valid = true;
  try { compositionSlots(state.compositions); } catch { valid = false; }
  for (let team = 0; team < 2; team++) {
    const count = ROLES.reduce((sum, role) => sum + state.compositions[team][role], 0);
    const label = $(`#team-count-${team}`);
    label.textContent = count > 6 ? `${count} / 6 MAX` : `${count} PLAYER${count === 1 ? '' : 'S'}`;
    label.classList.toggle('invalid', count < 1 || count > 6);
  }
  $('#generate-button').disabled = !state.ready || !valid || state.rolling;
  $('#copy-button').disabled = !state.match || state.rolling;
  $('#reset-button').disabled = state.rolling;
  const picks = state.match?.reduce((sum, team) => sum + team.length, 0);
  $('#match-label').textContent = state.match
    ? `MATCH ${String(state.rolls).padStart(3, '0')} · ${picks} UNIQUE PICKS`
    : state.ready ? 'YOUR COMPOSITION. YOUR NEXT MATCH.' : 'GETTING YOUR ROSTER READY';
  const sources = { live: 'Live GitHub roster', bundled: 'Bundled roster', cached: 'Saved roster' };
  $('#roster-status').textContent = state.roster.length ? `${sources[state.source]} · ${state.roster.length} heroes` : 'Loading hero roster…';
}

function buildControls() {
  for (let team = 0; team < 2; team++) {
    $(`#team-name-${team}`).value = state.teamNames[team];
    const controls = $(`#controls-${team}`);
    controls.replaceChildren();
    for (const role of ROLES) {
      const group = element('div', 'role-control');
      const label = element('label', '', role);
      const id = `role-${team}-${role.toLowerCase()}`;
      label.htmlFor = id;
      const select = element('select');
      select.id = id;
      select.setAttribute('aria-label', `Team ${team + 1} ${role} count`);
      select.dataset.team = team;
      select.dataset.role = role;
      for (let value = 0; value <= 6; value++) {
        const option = element('option', '', String(value));
        option.value = String(value);
        select.append(option);
      }
      select.value = String(state.compositions[team][role]);
      group.append(icon(ROLE_ICONS[role]), label, select);
      controls.append(group);
    }
  }
}

function imageCandidates(hero) {
  const asset = state.portraits[hero.id];
  const candidates = [];
  if (state.source !== 'live' && asset?.local) candidates.push(asset.local);
  if (asset?.source) candidates.push(asset.source);
  if (hero.image && !/[:\\]/.test(hero.image) && !hero.image.includes('..')) {
    const filename = hero.image.replace(/^\/?images\//, '');
    candidates.push(IMAGE_BASE + filename.split('/').map(encodeURIComponent).join('/'));
  }
  candidates.push(IMAGE_BASE + encodeURIComponent(`${hero.name}.png`));
  if (asset?.local) candidates.push(asset.local);
  return [...new Set(candidates)];
}
function portrait(hero) {
  const shell = element('div', 'portrait-shell');
  shell.setAttribute('aria-hidden', 'true');
  const fallback = element('span', 'portrait-fallback', hero ? hero.name.split(/[\s-]+/).map(word => word[0]).join('').slice(0, 2) : '');
  if (!hero) fallback.append(icon('dice'));
  shell.append(fallback);
  if (hero) {
    const img = element('img', 'hero-portrait');
    const urls = imageCandidates(hero);
    let next = 0;
    img.alt = '';
    img.width = 76;
    img.height = 76;
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => {
      if (next < urls.length) img.src = urls[next++];
      else img.remove();
    });
    img.addEventListener('load', () => { fallback.hidden = true; });
    img.src = urls[next++];
    shell.append(img);
  }
  return shell;
}
function pickButton(action, team, index, label, iconName) {
  const button = element('button', 'icon-button');
  button.type = 'button';
  button.dataset.action = action;
  button.dataset.team = team;
  button.dataset.index = index;
  button.setAttribute('aria-label', label);
  button.title = label;
  button.append(icon(iconName));
  return button;
}
function renderLineups() {
  // Retain focus when only the lock or reroll control is re-created.
  const active = document.activeElement;
  const refocus = active?.dataset?.action ? { ...active.dataset } : null;
  const nameFocus = active?.dataset?.nameTeam !== undefined
    ? { team: active.dataset.nameTeam, index: active.dataset.nameIndex, start: active.selectionStart, end: active.selectionEnd } : null;
  for (let team = 0; team < 2; team++) {
    const list = $(`#lineup-${team}`);
    const fragment = document.createDocumentFragment();
    const playerCount = Math.min(6, ROLES.reduce((sum, role) => sum + state.compositions[team][role], 0));
    Array.from({ length: playerCount }, (_, index) => {
      const pick = state.match?.[team]?.[index];
      const hero = pick?.hero;
      const role = pick?.role;
      const locked = state.locks.has(slotKey(team, index));
      const row = element('div', `hero-row${hero ? '' : ' placeholder'}${locked ? ' is-locked' : ''}`);
      row.style.setProperty('--index', String(index));
      row.dataset.slot = slotKey(team, index);
      row.append(portrait(hero));
      const info = element('div', 'hero-info');
      info.append(element('h3', 'hero-name', hero?.name ?? 'Ready to roll'));
      const roleLabel = element('span', 'hero-role');
      roleLabel.append(icon(role ? ROLE_ICONS[role] : 'dice'), document.createTextNode(role ?? 'Random role'));
      info.append(roleLabel);
      if (hero?.roles.length > 1) info.append(element('span', 'multi-role', 'MULTI-ROLE PICK'));
      const input = element('input', 'player-input');
      input.type = 'text';
      input.maxLength = 30;
      input.placeholder = `Player ${index + 1}`;
      input.value = state.names[team][index];
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.dataset.nameTeam = team;
      input.dataset.nameIndex = index;
      input.setAttribute('aria-label', `${state.teamNames[team]}, player ${index + 1} name`);
      const actions = element('div', 'pick-actions');
      const lock = pickButton('lock', team, index, `${locked ? 'Unlock' : 'Lock'} ${hero?.name ?? `player ${index + 1}`} on team ${team + 1}`, locked ? 'lock' : 'unlock');
      lock.setAttribute('aria-pressed', String(locked));
      lock.classList.toggle('is-active', locked);
      lock.disabled = !hero || state.rolling;
      const reroll = pickButton('reroll', team, index, `Reroll ${hero?.name ?? `player ${index + 1}`} on team ${team + 1}`, 'refresh');
      reroll.disabled = !hero || locked || state.rolling;
      actions.append(lock, reroll);
      row.append(info, input, actions);
      fragment.append(row);
    });
    if (!playerCount) fragment.append(element('p', 'empty-team', 'Add a role above to start building this team.'));
    list.replaceChildren(fragment);
  }
  if (refocus) $(`[data-action="${refocus.action}"][data-team="${refocus.team}"][data-index="${refocus.index}"]`)?.focus({ preventScroll: true });
  if (nameFocus) {
    const input = $(`[data-name-team="${nameFocus.team}"][data-name-index="${nameFocus.index}"]`);
    input?.focus({ preventScroll: true });
    input?.setSelectionRange(nameFocus.start, nameFocus.end);
  }
}

function lockedPicks() {
  return state.match?.flatMap((team, teamIndex) => team.flatMap((pick, index) => state.locks.has(slotKey(teamIndex, index)) ? [{ team: teamIndex, index, heroId: pick.hero.id, role: pick.role }] : [])) ?? [];
}
function animateRoll() {
  const teams = $('.teams');
  teams.classList.remove('is-rolling');
  void teams.offsetWidth;
  teams.classList.add('is-rolling');
  $('#generate-button').classList.add('is-rolling');
  setTimeout(() => { teams.classList.remove('is-rolling'); $('#generate-button').classList.remove('is-rolling'); }, 520);
}
function randomize(animate = true) {
  if (!state.roster.length || state.rolling) return;
  showError();
  try {
    const slots = compositionSlots(state.compositions);
    const locked = lockedPicks();
    if (locked.length === slots.length) { toast('All picks are locked. Unlock a hero to change your lineup.'); return; }
    state.match = generateMatch(state.roster, state.compositions, { locked });
    state.rolls++;
    $('#change-note').hidden = true;
    renderLineups();
    updateUI();
    persist();
    if (animate) animateRoll();
  } catch (error) { showError(error.message); }
}
function rerollOne(team, index) {
  if (!state.match || state.locks.has(slotKey(team, index))) return;
  const previous = state.match[team][index];
  const locked = state.match.flatMap((picks, t) => picks.flatMap((pick, i) => t === team && i === index ? [] : [{ team: t, index: i, heroId: pick.hero.id, role: pick.role }]));
  try {
    state.match = generateMatch(state.roster, state.compositions, { locked, excludedIds: [previous.hero.id] });
    state.rolls++;
    showError();
    renderLineups();
    updateUI();
    persist();
    toast(`${previous.hero.name} → ${state.match[team][index].hero.name}`);
  } catch { toast(`No other unique ${previous.role} is available. Reroll the full match to free up more heroes.`); }
}
function compositionChanged() {
  state.match = null;
  state.locks.clear();
  showError();
  try { compositionSlots(state.compositions); } catch (error) { showError(error.message); }
  $('#change-note').hidden = false;
  renderLineups();
  updateUI();
  persist();
}

async function getJSON(url, timeout = 6500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) throw new Error(`Roster request failed (${response.status}).`);
    return await response.json();
  } finally { clearTimeout(timer); }
}
function restoreMatch() {
  try {
    const slots = compositionSlots(state.compositions);
    if (!Array.isArray(saved?.match) || saved.match.length !== 2 || saved.match.some((team, index) => !Array.isArray(team) || team.length !== slots.filter(slot => slot.team === index).length)) return false;
    const locked = saved.match.flatMap((team, t) => team.map((pick, index) => ({ team: t, index, heroId: pick.heroId, role: pick.role })));
    state.match = generateMatch(state.roster, state.compositions, { locked });
    state.locks = new Set((Array.isArray(saved.locks) ? saved.locks : []).filter(key => slots.some(slot => slotKey(slot.team, slot.index) === key)));
    state.rolls = Math.max(state.rolls, 1);
    return true;
  } catch { return false; }
}
function activateRoster(roster, source) {
  state.roster = roster;
  state.source = source;
  if (!state.ready) {
    state.ready = true;
    if (!restoreMatch()) randomize(false);
  } else if (state.match) {
    try {
      const locked = state.match.flatMap((picks, team) => picks.map((pick, index) => ({ team, index, heroId: pick.hero.id, role: pick.role })));
      state.match = generateMatch(roster, state.compositions, { locked });
    } catch {
      state.match = null;
      state.locks.clear();
      $('#change-note').hidden = false;
      toast('The hero pool changed. Randomize to use the updated roster.');
    }
  }
  renderLineups();
  updateUI();
  persist();
}
async function refreshRoster(userRequested = false) {
  if (state.refreshing) return;
  state.refreshing = true;
  const button = $('#refresh-roster');
  button.disabled = true;
  button.classList.add('is-refreshing');
  try {
    const roster = normalizeRoster(await getJSON(ROSTER_URL));
    writeStorage(CACHE_KEY, { heroes: roster });
    activateRoster(roster, 'live');
    if (userRequested) toast(`Roster refreshed. ${roster.length} heroes ready.`);
  } catch {
    if (!state.ready) showError('Your hero roster could not load. Check your connection, then use the roster refresh button below.');
    else if (userRequested) toast('Couldn’t reach GitHub. Your saved roster is still ready to play.');
  } finally {
    state.refreshing = false;
    button.disabled = false;
    button.classList.remove('is-refreshing');
  }
}

function lineupText() {
  return state.match.map((team, t) => `${state.teamNames[t] || `TEAM ${t + 1}`}\n${team.map((pick, index) => `${state.names[t][index].trim() || `Player ${index + 1}`} — ${pick.hero.name} (${pick.role})`).join('\n')}`).join('\n\n');
}
function openDialog(dialog) {
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}
async function copyLineups() {
  if (!state.match) return;
  const text = lineupText();
  try { await navigator.clipboard.writeText(text); toast('Both lineups copied. Your group chat awaits.'); }
  catch { $('#copy-text').value = text; openDialog($('#copy-dialog')); $('#copy-text').focus(); $('#copy-text').select(); }
}

$('#generate-button').addEventListener('click', () => randomize());
$('#copy-button').addEventListener('click', copyLineups);
$('#help-button').addEventListener('click', () => openDialog($('#help-dialog')));
$('#refresh-roster').addEventListener('click', () => refreshRoster(true));
$('#reset-button').addEventListener('click', () => {
  state.compositions = [defaultComposition(), defaultComposition()];
  buildControls();
  compositionChanged();
  if (state.ready) randomize();
  toast('Both teams reset to 2 Vanguard, 2 Duelist, 2 Strategist.');
});
for (const dialog of document.querySelectorAll('dialog')) {
  dialog.querySelector('[data-close-dialog]').addEventListener('click', () => {
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  });
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
}
$('.teams').addEventListener('change', event => {
  const { team, role } = event.target.dataset;
  if (event.target.tagName === 'SELECT' && role) {
    state.compositions[Number(team)][role] = Number(event.target.value);
    compositionChanged();
  }
});
$('.teams').addEventListener('input', event => {
  const input = event.target;
  if (input.dataset.nameTeam !== undefined) state.names[Number(input.dataset.nameTeam)][Number(input.dataset.nameIndex)] = cleanName(input.value, 30);
  else if (input.classList.contains('team-name-input')) state.teamNames[Number(input.id.slice(-1))] = cleanName(input.value);
  else return;
  persist();
});
$('.teams').addEventListener('click', event => {
  const button = event.target.closest('button[data-action]');
  if (!button || button.disabled || !state.match) return;
  const team = Number(button.dataset.team), index = Number(button.dataset.index);
  if (button.dataset.action === 'lock') {
    const key = slotKey(team, index);
    if (state.locks.has(key)) state.locks.delete(key); else state.locks.add(key);
    renderLineups();
    persist();
  } else rerollOne(team, index);
});
document.addEventListener('keydown', event => {
  if (!event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || event.key.toLowerCase() !== 'r') return;
  if (event.target.closest('input, textarea, select, [contenteditable="true"]') || document.querySelector('dialog[open]')) return;
  event.preventDefault();
  if (!$('#generate-button').disabled) randomize();
});

async function start() {
  buildControls();
  renderLineups();
  updateUI();
  const bundledRequest = getJSON('./data/heroes.json').catch(() => null);
  const portraitsRequest = getJSON('./data/portraits.json').catch(() => ({}));
  const [bundled, portraits] = await Promise.all([bundledRequest, portraitsRequest]);
  state.portraits = portraits;
  const cached = readStorage(CACHE_KEY);
  let initial;
  try { if (cached) initial = normalizeRoster(cached); } catch { /* Fall back to the bundled roster. */ }
  if (initial) activateRoster(initial, 'cached');
  else {
    try { if (bundled) activateRoster(normalizeRoster(bundled), 'bundled'); }
    catch { /* The live request below can recover an unavailable snapshot. */ }
  }
  await refreshRoster(false);
}
start().catch(() => showError('The app could not start. Refresh this page to try again.'));
