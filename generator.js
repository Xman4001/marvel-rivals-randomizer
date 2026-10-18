export const ROLES = Object.freeze(['Vanguard', 'Duelist', 'Strategist']);

export function normalizeRoster(payload) {
  const input = Array.isArray(payload) ? payload : payload?.heroes;
  if (!Array.isArray(input) || input.length === 0 || input.length > 500) {
    throw new Error('The hero roster must contain between 1 and 500 heroes.');
  }
  const heroes = new Map();
  for (const item of input) {
    if (!item || item.enabled === false) continue;
    const id = String(item.id ?? '').trim().toLowerCase();
    const name = String(item.name ?? '').trim().slice(0, 100);
    const roles = [...new Set((Array.isArray(item.roles) ? item.roles : []).filter(role => ROLES.includes(role)))];
    if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(id) || !name || !roles.length) continue;
    if (heroes.has(id)) {
      const existing = heroes.get(id);
      existing.roles = [...new Set([...existing.roles, ...roles])];
    } else {
      heroes.set(id, { id, name, roles, image: typeof item.image === 'string' ? item.image : '' });
    }
  }
  if (!heroes.size) throw new Error('No enabled heroes with supported roles were found.');
  return [...heroes.values()];
}

export function compositionSlots(compositions) {
  if (!Array.isArray(compositions) || compositions.length !== 2) {
    throw new Error('Configure exactly two teams.');
  }
  return compositions.flatMap((composition, team) => {
    let count = 0;
    for (const role of ROLES) {
      if (!Number.isInteger(composition?.[role]) || composition[role] < 0 || composition[role] > 6) {
        throw new Error(`Team ${team + 1}: each role must be a whole number from 0 to 6.`);
      }
      count += composition[role];
    }
    if (count < 1 || count > 6) {
      throw new Error(`Team ${team + 1} has ${count} players. Choose a total of 1–6.`);
    }
    let index = 0;
    return ROLES.flatMap(role => Array.from({ length: composition[role] }, () => ({ team, index: index++, role })));
  });
}

function randomUnit() {
  if (globalThis.crypto?.getRandomValues) {
    return globalThis.crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
  }
  return Math.random();
}

function shuffled(values, random) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Randomize each player's role, then match unique heroes across both teams.
 * Locked picks carry their assigned role so they keep that role and position.
 */
export function generateMatch(payload, compositions, { locked = [], excludedIds = [], random = randomUnit } = {}) {
  const roster = normalizeRoster(payload);
  const slots = compositionSlots(compositions);
  const byId = new Map(roster.map(hero => [hero.id, hero]));
  const excluded = new Set(excludedIds);
  const pools = Object.fromEntries(ROLES.map(role => [role, roster.filter(hero => hero.roles.includes(role) && !excluded.has(hero.id))]));
  const used = new Set();
  const assignments = new Map();
  const key = slot => `${slot.team}:${slot.index}`;
  const remaining = compositions.map(composition => ({ ...composition }));

  for (const lock of locked) {
    const slot = slots.find(item => item.team === lock.team && item.index === lock.index);
    const hero = byId.get(lock.heroId);
    if (!slot || !hero || !ROLES.includes(lock.role) || !hero.roles.includes(lock.role) || excluded.has(hero.id)) {
      throw new Error('A locked pick no longer fits the roster or composition. Unlock it and try again.');
    }
    if (used.has(hero.id) || assignments.has(key(slot))) {
      throw new Error('Locked picks must be unique across both teams.');
    }
    if (remaining[slot.team][lock.role] < 1) {
      throw new Error(`Locked picks exceed the ${lock.role} count for team ${slot.team + 1}. Unlock a pick or adjust the composition.`);
    }
    slot.role = lock.role;
    remaining[slot.team][lock.role]--;
    used.add(hero.id);
    assignments.set(key(slot), hero);
  }

  // Shuffle the unfilled role slots independently on each team. Player indexes
  // never move: names remain at their index while any selected role can land there.
  for (let team = 0; team < 2; team++) {
    const roles = shuffled(ROLES.flatMap(role => Array(remaining[team][role]).fill(role)), random);
    slots.filter(slot => slot.team === team && !assignments.has(key(slot)))
      .forEach((slot, index) => { slot.role = roles[index]; });
  }

  // Each hero may hold one slot. Augmenting paths repair an earlier assignment
  // when a multi-role hero is the only fit for a later slot; no retry limit is needed.
  const unlocked = shuffled(slots.filter(slot => !assignments.has(key(slot))), random);
  const candidates = new Map(unlocked.map(slot => [key(slot), shuffled(pools[slot.role].filter(hero => !used.has(hero.id)), random)]));
  const owner = new Map();
  function assign(slot, seen) {
    for (const hero of candidates.get(key(slot))) {
      if (seen.has(hero.id)) continue;
      seen.add(hero.id);
      const previous = owner.get(hero.id);
      if (!previous || assign(previous, seen)) {
        owner.set(hero.id, slot);
        assignments.set(key(slot), hero);
        return true;
      }
    }
    return false;
  }
  for (const slot of unlocked) {
    if (!assign(slot, new Set())) {
      throw new Error(`Not enough unique heroes for these roles. Reduce a role count or unlock some picks.`);
    }
  }
  return [0, 1].map(team => slots.filter(slot => slot.team === team).map(slot => ({ role: slot.role, hero: assignments.get(key(slot)) })));
}
