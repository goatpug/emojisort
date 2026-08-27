#!/usr/bin/env node
// CI / pre-commit check: every level in levels/index.json loads, is
// structurally valid (§10.2), and is solvable with its stored `par`
// matching the solver's answer exactly (§9, §13).

import { readFileSync, readdirSync } from 'node:fs';
import { solve } from './solver.mjs';

function loadJSON(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function validateStructure(level, errors) {
  const prefix = `[${level.id ?? '?'}]`;
  if (!level.id) errors.push(`${prefix} missing id`);
  if (typeof level.capacity !== 'number') errors.push(`${prefix} missing capacity`);
  if (!Array.isArray(level.containers) || !level.containers.length) {
    errors.push(`${prefix} missing containers`);
    return;
  }
  if (typeof level.par !== 'number') errors.push(`${prefix} missing par`);

  const counts = new Map();
  for (const c of level.containers) {
    if (!Array.isArray(c.stack)) {
      errors.push(`${prefix} container missing stack array`);
      continue;
    }
    if (c.stack.length > level.capacity) {
      errors.push(`${prefix} container exceeds capacity (${c.stack.length} > ${level.capacity})`);
    }
    for (const emoji of c.stack) counts.set(emoji, (counts.get(emoji) || 0) + 1);
    if (c.lock) {
      if (!['sort', 'neighbor'].includes(c.lock.type)) {
        errors.push(`${prefix} unknown lock type: ${c.lock.type}`);
      }
      if (c.lock.type === 'sort') {
        if (!c.lock.requires) errors.push(`${prefix} sort lock missing 'requires'`);
        else if (c.stack.includes(c.lock.requires)) {
          errors.push(`${prefix} concealed container contains its own required type ${c.lock.requires} (§4.1)`);
        }
      }
    }
  }
  for (const [emoji, count] of counts) {
    if (count !== level.capacity) {
      errors.push(`${prefix} emoji ${emoji} appears ${count} times, expected exactly ${level.capacity}`);
    }
  }

  const sortLocks = level.containers.filter((c) => c.lock?.type === 'sort');
  if (sortLocks.length > 2) errors.push(`${prefix} more than 2 concealed (sort) locks`);
  const requiredTypes = new Set();
  for (const c of sortLocks) {
    if (requiredTypes.has(c.lock.requires)) {
      errors.push(`${prefix} two concealed locks require the same type ${c.lock.requires}`);
    }
    requiredTypes.add(c.lock.requires);
  }
  const totalLocks = level.containers.filter((c) => c.lock).length;
  if (totalLocks > 3) errors.push(`${prefix} more than 3 locked containers total`);
}

function main() {
  const manifest = loadJSON('levels/index.json');
  let ok = 0;
  const errors = [];

  for (const entry of manifest.levels) {
    const path = `levels/${entry.id}.json`;
    let level;
    try {
      level = loadJSON(path);
    } catch (e) {
      errors.push(`[${entry.id}] failed to load: ${e.message}`);
      continue;
    }

    validateStructure(level, errors);

    const result = solve(level);
    if (!result.solvable) {
      errors.push(`[${level.id}] UNSOLVABLE${result.aborted ? ' (aborted — state space too large)' : ''}`);
      continue;
    }
    if (result.par !== level.par) {
      errors.push(`[${level.id}] stored par=${level.par} but solver found par=${result.par}`);
      continue;
    }
    ok++;
    console.error(`ok  ${level.id}  par=${level.par}`);
  }

  console.error(`\n${ok}/${manifest.levels.length} levels valid`);
  if (errors.length) {
    console.error(`\n${errors.length} error(s):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
}

main();
