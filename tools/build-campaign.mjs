#!/usr/bin/env node
// Authoring script: generates the 36-level launch campaign (§10.1) and
// writes levels/*.json + levels/index.json. Not part of the runtime site —
// re-run only when intentionally regenerating the campaign; shipped levels
// are the committed JSON files.

import { writeFileSync } from 'node:fs';
import { generateLevel } from './generate-level.mjs';
import { THEMES } from '../js/data/themes.js';

const THEME_ORDER = ['aquatic', 'farm', 'flowers', 'safari', 'office', 'sweets'];

// One entry per level (1-indexed). Theme rotates through THEME_ORDER so
// every theme lands exactly 6 times across the campaign.
const PLAN = [
  // 1-6: basics, K grows 3->6, 2 empties, vertical, no mechanics.
  { k: 3, empties: 2, orientation: 'vertical' },
  { k: 4, empties: 2, orientation: 'vertical' },
  { k: 4, empties: 2, orientation: 'vertical' },
  { k: 5, empties: 2, orientation: 'vertical' },
  { k: 5, empties: 2, orientation: 'vertical' },
  { k: 6, empties: 2, orientation: 'vertical' },

  // 7-12: first horizontal levels, K 5-7, one with only 1 empty.
  { k: 5, empties: 2, orientation: 'horizontal' },
  { k: 6, empties: 2, orientation: 'vertical' },
  { k: 6, empties: 2, orientation: 'horizontal' },
  { k: 7, empties: 2, orientation: 'vertical' },
  { k: 7, empties: 2, orientation: 'horizontal' },
  { k: 6, empties: 1, orientation: 'vertical' },

  // 13-18: type A (sort) locks, 13 = gentle teach.
  { k: 5, empties: 2, orientation: 'vertical', locks: { sort: 1 } },
  { k: 6, empties: 2, orientation: 'vertical', locks: { sort: 1 } },
  { k: 6, empties: 2, orientation: 'horizontal', locks: { sort: 1 } },
  { k: 7, empties: 2, orientation: 'vertical', locks: { sort: 1 } },
  { k: 7, empties: 2, orientation: 'vertical', locks: { sort: 2 } },
  { k: 7, empties: 2, orientation: 'horizontal', locks: { sort: 2 } },

  // 19-24: type B (neighbor) locks, 19 = teach; A+B mixes late in the band.
  { k: 5, empties: 2, orientation: 'vertical', locks: { neighbor: 1 } },
  { k: 6, empties: 2, orientation: 'vertical', locks: { neighbor: 1 } },
  { k: 6, empties: 2, orientation: 'horizontal', locks: { neighbor: 1 } },
  { k: 7, empties: 2, orientation: 'vertical', locks: { neighbor: 1 } },
  { k: 7, empties: 2, orientation: 'vertical', locks: { sort: 1, neighbor: 1 } },
  { k: 7, empties: 2, orientation: 'horizontal', locks: { sort: 1, neighbor: 1 } },

  // 25-30: blind levels, 25 = teach (no locks); blind + horizontal.
  { k: 5, empties: 2, orientation: 'vertical', blind: true },
  { k: 6, empties: 2, orientation: 'vertical', blind: true },
  { k: 6, empties: 2, orientation: 'horizontal', blind: true },
  { k: 7, empties: 2, orientation: 'vertical', blind: true },
  { k: 7, empties: 2, orientation: 'horizontal', blind: true },
  { k: 7, empties: 2, orientation: 'vertical', blind: true },

  // 31-36: everything combined, K up to 9-10, blind + locks, 1 empty on 35-36.
  { k: 8, empties: 2, orientation: 'vertical', blind: true, locks: { sort: 1 } },
  { k: 8, empties: 2, orientation: 'horizontal', blind: true, locks: { neighbor: 1 } },
  { k: 9, empties: 2, orientation: 'vertical', blind: true, locks: { sort: 1, neighbor: 1 } },
  { k: 9, empties: 2, orientation: 'horizontal', blind: true, locks: { sort: 2 } },
  { k: 9, empties: 1, orientation: 'vertical', blind: true, locks: { neighbor: 1 } },
  { k: 10, empties: 1, orientation: 'vertical', blind: true, locks: { sort: 1 } },
];

function main() {
  const manifest = [];
  PLAN.forEach((cfg, i) => {
    const levelIndex = i + 1;
    const theme = THEME_ORDER[i % THEME_ORDER.length];
    const id = `${theme}-${String(levelIndex).padStart(2, '0')}`;
    const rowWidth = cfg.orientation === 'horizontal' ? 99 : 5;

    console.error(`generating ${id} (k=${cfg.k}, empties=${cfg.empties}, ${cfg.orientation}${cfg.blind ? ', blind' : ''}${cfg.locks ? `, locks=${JSON.stringify(cfg.locks)}` : ''})...`);

    const level = generateLevel({
      id,
      index: levelIndex,
      theme,
      emojiPool: THEMES[theme].emojiPool,
      k: cfg.k,
      empties: cfg.empties,
      capacity: 4,
      orientation: cfg.orientation,
      blind: !!cfg.blind,
      rowWidth,
      locks: cfg.locks,
      seed: levelIndex * 104729, // arbitrary large prime-ish spread
    });

    writeFileSync(`levels/${id}.json`, JSON.stringify(level, null, 2) + '\n');
    manifest.push({ id, index: levelIndex, theme, par: level.par, blind: !!level.blind, orientation: level.orientation });
    console.error(`  -> par=${level.par}`);
  });

  writeFileSync('levels/index.json', JSON.stringify({ levels: manifest }, null, 2) + '\n');
  console.error(`\nwrote ${manifest.length} levels + levels/index.json`);
}

main();
