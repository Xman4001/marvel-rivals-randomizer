import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeRoster, generateMatch, compositionSlots, ROLES } from '../generator.js';

const roster = JSON.parse(readFileSync(new URL('../data/heroes.json', import.meta.url), 'utf8'));
const standard = () => [{ Vanguard: 2, Duelist: 2, Strategist: 2 }, { Vanguard: 2, Duelist: 2, Strategist: 2 }];
const hero = (id, roles, enabled = true) => ({ id, name: id, roles, enabled });
function seededRandom(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) >>> 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function checkMatch(match, compositions) {
  const ids = match.flat().map(pick => pick.hero.id);
  assert.equal(ids.length, new Set(ids).size, 'No hero repeats across either team');
  match.forEach((team, index) => {
    assert.equal(team.length, ROLES.reduce((sum, role) => sum + compositions[index][role], 0));
    for (const role of ROLES) assert.equal(team.filter(pick => pick.role === role).length, compositions[index][role]);
    for (const pick of team) assert.ok(pick.hero.roles.includes(pick.role), `${pick.hero.name} supports ${pick.role}`);
  });
}

test('current source roster is usable and Deadpool has all three roles', () => {
  const heroes = normalizeRoster(roster);
  assert.equal(heroes.length, 54);
  assert.deepEqual(new Set(heroes.find(hero => hero.id === 'deadpool').roles), new Set(ROLES));
});

test('10,000 generated matches respect random compositions and global uniqueness', () => {
  for (let run = 0; run < 10000; run++) {
    const compositions = [0, 1].map(() => {
      const result = { Vanguard: 0, Duelist: 0, Strategist: 0 };
      const size = 1 + Math.floor(Math.random() * 6);
      for (let index = 0; index < size; index++) result[ROLES[Math.floor(Math.random() * 3)]]++;
      return result;
    });
    checkMatch(generateMatch(roster, compositions), compositions);
  }
});

test('1v1 and 6v6 with one role are supported', () => {
  for (const role of ROLES) {
    for (const size of [1, 6]) {
      const config = Object.fromEntries(ROLES.map(item => [item, item === role ? size : 0]));
      checkMatch(generateMatch(roster, [config, config]), [config, config]);
    }
  }
});

test('every player position on both teams receives all three roles across rolls', () => {
  const random = seededRandom(42017);
  const runs = 3000;
  const counts = [0, 1].map(() => Array.from({ length: 6 }, () => Object.fromEntries(ROLES.map(role => [role, 0]))));
  for (let run = 0; run < runs; run++) {
    const match = generateMatch(roster, standard(), { random });
    checkMatch(match, standard());
    match.forEach((team, t) => team.forEach((pick, index) => counts[t][index][pick.role]++));
  }
  counts.forEach((team, t) => team.forEach((slot, index) => {
    for (const role of ROLES) {
      assert.ok(slot[role] > runs * 0.27 && slot[role] < runs * 0.40,
        `Team ${t + 1}, player ${index + 1}: ${role} should occur about one-third of the time; got ${slot[role]}/${runs}`);
    }
  }));
});

test('multi-role allocation finds a valid matching even with a restrictive role', () => {
  const pool = [hero('flex', ['Vanguard', 'Duelist', 'Strategist']), hero('duelist-a', ['Duelist']), hero('duelist-b', ['Duelist'])];
  const compositions = [{ Vanguard: 1, Duelist: 1, Strategist: 0 }, { Vanguard: 0, Duelist: 1, Strategist: 0 }];
  for (const random of [() => 0, () => 0.99999, () => 0.5]) {
    const match = generateMatch(pool, compositions, { random });
    checkMatch(match, compositions);
    assert.equal(match[0].find(pick => pick.role === 'Vanguard').hero.id, 'flex');
  }
});

test('locked heroes and roles remain in their exact team and player slot', () => {
  const compositions = standard();
  const initial = generateMatch(roster, compositions);
  const locked = [{ team: 0, index: 0, heroId: initial[0][0].hero.id, role: initial[0][0].role }, { team: 1, index: 4, heroId: initial[1][4].hero.id, role: initial[1][4].role }];
  for (let run = 0; run < 100; run++) {
    const next = generateMatch(roster, compositions, { locked });
    checkMatch(next, compositions);
    assert.equal(next[0][0].hero.id, locked[0].heroId);
    assert.equal(next[1][4].hero.id, locked[1].heroId);
    assert.equal(next[0][0].role, locked[0].role);
    assert.equal(next[1][4].role, locked[1].role);
  }
});

test('Deadpool cannot appear in multiple roles or on both teams when locked', () => {
  assert.throws(() => generateMatch(roster, standard(), { locked: [{ team: 0, index: 0, heroId: 'deadpool', role: 'Vanguard' }, { team: 1, index: 2, heroId: 'deadpool', role: 'Duelist' }] }), /unique/);
  for (let index = 0; index < 6; index++) {
    for (const role of ROLES) {
      const next = generateMatch(roster, standard(), { locked: [{ team: 1, index, heroId: 'deadpool', role }] });
      assert.equal(next.flat().filter(pick => pick.hero.id === 'deadpool').length, 1);
      assert.equal(next[1][index].role, role);
      assert.equal(next[1][index].hero.id, 'deadpool');
    }
  }
});

test('single-slot reroll changes that hero and preserves the other eleven picks', () => {
  const initial = generateMatch(roster, standard());
  const locked = initial.flatMap((team, t) => team.flatMap((pick, index) => t === 0 && index === 3 ? [] : [{ team: t, index, heroId: pick.hero.id, role: pick.role }]));
  const result = generateMatch(roster, standard(), { locked, excludedIds: [initial[0][3].hero.id] });
  assert.notEqual(result[0][3].hero.id, initial[0][3].hero.id);
  assert.equal(result[0][3].role, initial[0][3].role);
  for (const lock of locked) {
    assert.equal(result[lock.team][lock.index].hero.id, lock.heroId);
    assert.equal(result[lock.team][lock.index].role, lock.role);
  }
  checkMatch(result, standard());
});

test('impossible role pools fail rather than return partial or duplicate teams', () => {
  const pool = [hero('flex', ROLES), hero('duelist-only', ['Duelist'])];
  const config = { Vanguard: 1, Duelist: 0, Strategist: 0 };
  assert.throws(() => generateMatch(pool, [config, config]), /Not enough unique/);
});

test('disabled, malformed, and duplicate roster records cannot become duplicate picks', () => {
  const pool = [hero('off', ROLES, false), hero('one', ['Duelist']), hero('one', ['Vanguard']), hero('two', ['Duelist']), { id: 'bad', name: 'bad', roles: ['Unsupported'] }];
  const heroes = normalizeRoster(pool);
  assert.equal(heroes.length, 2);
  assert.deepEqual(new Set(heroes.find(hero => hero.id === 'one').roles), new Set(['Vanguard', 'Duelist']));
  assert.ok(!heroes.some(hero => hero.id === 'off'));
});

test('invalid counts and unsupported locked picks produce useful errors', () => {
  for (const count of [-1, 7, 1.5, '2', NaN]) {
    assert.throws(() => compositionSlots([{ Vanguard: count, Duelist: 0, Strategist: 0 }, standard()[1]]));
  }
  assert.throws(() => compositionSlots([{ Vanguard: 0, Duelist: 0, Strategist: 0 }, standard()[1]]), /1–6/);
  assert.throws(() => compositionSlots([{ Vanguard: 3, Duelist: 3, Strategist: 3 }, standard()[1]]), /1–6/);
  assert.throws(() => generateMatch(roster, standard(), { locked: [{ team: 0, index: 0, heroId: 'loki', role: 'Vanguard' }] }), /no longer fits/);
  assert.throws(() => generateMatch(roster, standard(), { locked: [{ team: 0, index: 0, heroId: 'deadpool' }] }), /no longer fits/);
  assert.throws(() => generateMatch(roster, standard(), { locked: ['loki', 'mantis', 'ultron'].map((heroId, index) => ({ team: 0, index, heroId, role: 'Strategist' })) }), /exceed/);
  assert.throws(() => normalizeRoster({ heroes: [] }), /between 1 and 500/);
});

test('saved lineups can be restored exactly by locking every slot', () => {
  const initial = generateMatch(roster, standard());
  const locked = initial.flatMap((team, t) => team.map((pick, index) => ({ team: t, index, heroId: pick.hero.id, role: pick.role })));
  assert.deepEqual(generateMatch(roster, standard(), { locked }), initial);
});

test('previously saved grouped lineups restore without moving players or changing roles', () => {
  const original = generateMatch(roster, standard()).map(team => ROLES.flatMap(role => team.filter(pick => pick.role === role)));
  const locked = original.flatMap((team, t) => team.map((pick, index) => ({ team: t, index, heroId: pick.hero.id, role: pick.role })));
  assert.deepEqual(generateMatch(roster, standard(), { locked }), original);
});

test('locking one player leaves all remaining roles available to every unlocked position', () => {
  const random = seededRandom(8719);
  const seen = Array.from({ length: 6 }, () => new Set());
  for (let run = 0; run < 150; run++) {
    const match = generateMatch(roster, standard(), { random, locked: [{ team: 0, index: 0, heroId: 'loki', role: 'Strategist' }] });
    checkMatch(match, standard());
    assert.equal(match[0][0].hero.id, 'loki');
    match[0].forEach((pick, index) => seen[index].add(pick.role));
  }
  assert.deepEqual([...seen[0]], ['Strategist']);
  for (const roles of seen.slice(1)) assert.deepEqual(roles, new Set(ROLES));
});
