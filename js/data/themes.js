// Pure data: the six launch themes (§3). Adding a theme means adding an
// entry here plus a css/themes/<id>.css file — no engine changes.

export const THEMES = {
  aquatic: {
    id: 'aquatic',
    name: 'Aquatic',
    emojiPool: ['🐠', '🐙', '🦀', '🐬', '🐡', '🦑', '🐢', '🦈', '🐳', '🦞'],
    containerStyle: 'tank',
    lockStyle: 'clamshell',
    label: '🐠',
  },
  farm: {
    id: 'farm',
    name: 'Farm',
    emojiPool: ['🐄', '🐖', '🐔', '🐑', '🐴', '🦆', '🐐', '🐰', '🦃', '🐝'],
    containerStyle: 'stall',
    lockStyle: 'barn',
    label: '🐄',
  },
  flowers: {
    id: 'flowers',
    name: 'Flower Garden',
    emojiPool: ['🌸', '🌹', '🌻', '🌷', '🌼', '💐', '🥀', '🌺', '🪻', '🪷'],
    containerStyle: 'vase',
    lockStyle: 'vines',
    label: '🌸',
  },
  safari: {
    id: 'safari',
    name: 'Safari',
    emojiPool: ['🦁', '🐘', '🦒', '🦓', '🦏', '🐆', '🦛', '🦬', '🐒', '🦩'],
    containerStyle: 'crate',
    lockStyle: 'tent',
    label: '🦁',
  },
  office: {
    id: 'office',
    name: 'Office',
    emojiPool: ['📎', '✏️', '📌', '🖊️', '📏', '✂️', '📁', '🖇️', '📐', '🔖'],
    containerStyle: 'tray',
    lockStyle: 'cabinet',
    label: '📎',
  },
  sweets: {
    id: 'sweets',
    name: 'Sweets',
    emojiPool: ['🍩', '🍪', '🧁', '🍭', '🍬', '🍫', '🍰', '🍨', '🥐', '🍡'],
    containerStyle: 'box',
    lockStyle: 'giftbox',
    label: '🍩',
  },
};

export const THEME_LIST = Object.values(THEMES);
