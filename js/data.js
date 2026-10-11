'use strict';
// ============================================================
//  Static game data: stage, classes, gestures, characters
// ============================================================

const STAGE = { W: 1280, H: 720, GROUND: 612, LEFT: 50, RIGHT: 1230, GRAVITY: 2100 };

// Ult activation gestures detected by the camera (vision.js).
// Every character has one. Keyboard fallback is always F+G+H (held) + Enter.
const GESTURES = {
  tongue: { name: 'Tongue Out',   icon: '😛', hint: 'Stick your tongue out',          hold: 0.30 },
  blink:  { name: 'Long Blink',   icon: '😑', hint: 'Close BOTH eyes for ~½ second',  hold: 0.45 },
  mouth:  { name: 'Open Wide',    icon: '😮', hint: 'Open your mouth wide ("Ahh!")',  hold: 0.35 },
  smile:  { name: 'Big Grin',     icon: '😁', hint: 'Give a big toothy smile',        hold: 0.45 },
  wink:   { name: 'Wink',         icon: '😉', hint: 'Close ONE eye only',             hold: 0.40 },
  brows:  { name: 'Brows Up',     icon: '🤨', hint: 'Raise both eyebrows high',       hold: 0.45 },
};

const CLASSES = {
  melee: {
    id: 'melee', name: 'Blade', icon: '⚔️', color: '#ff4d6d',
    blurb: 'Fast duelist. Swords, rapiers, katanas.',
    base: { atk: 20, hp: 500, def: 20, crit: 0.05, critDmg: 0.5 },
    move: 285, atkTime: 0.30, range: 95,
    pattern: [1.0, 1.0, 1.2, 1.9],
    passives: [
      { id: 'atkspd',    name: 'Tempo',       desc: 'Attack speed +15%' },
      { id: 'lifesteal', name: 'Bloodthirst', desc: 'Life steal 5% of damage dealt' },
    ],
    skills: [
      { id: 'dashThrust', name: 'Dash & Thrust',  cd: 5, icon: '➶', desc: 'Dash forward and pierce everything in your path (220%).' },
      { id: 'parry',      name: 'Parry',          cd: 7, icon: '⛨', desc: 'Guard stance. If struck: negate the hit, stun the attacker and riposte (180%).' },
      { id: 'barrage',    name: 'Thrust Barrage', cd: 9, icon: '⋙', desc: '7 lightning-fast thrusts (55% each).' },
    ],
    ult: { name: 'Thousand Petal Rush', desc: 'Blink-strike through the foe 8 times, then a finishing slash (~890%).' },
  },
  heavy: {
    id: 'heavy', name: 'Heavy', icon: '🔨', color: '#ff9f1c',
    blurb: 'Slow bruiser. Hammers, maces, claymores.',
    base: { atk: 35, hp: 600, def: 30, crit: 0.05, critDmg: 0.5 },
    move: 225, atkTime: 0.42, range: 120,
    pattern: [1.0, 1.0, 1.1, 1.2, 2.0],
    passives: [
      { id: 'bruteAS', name: 'Brute Force',  desc: 'Damage +20%, attack speed -15%' },
      { id: 'bruteMS', name: 'Iron Stance',  desc: 'Damage +20%, movement speed -15%' },
    ],
    skills: [
      { id: 'smash', name: 'Smash', cd: 6,  icon: '⇊', desc: 'Smash the floor, sending shockwaves both ways (220%). Jump to dodge!' },
      { id: 'grab',  name: 'Grab',  cd: 8,  icon: '✊', desc: 'Grab the opponent and slam them into the ground (300%). Beats Parry.' },
      { id: 'spin',  name: 'Spin',  cd: 10, icon: '🌀', desc: 'Become a tornado with super armor (55% per hit). You can steer.' },
    ],
    ult: { name: 'Earthsplitter', desc: 'Leap and split the earth. Grounded foes take 500%, airborne 250%.' },
  },
  ranged: {
    id: 'ranged', name: 'Ranged', icon: '🏹', color: '#2ec4b6',
    blurb: 'Kiting marksman. Bows, crossbows, slingshots.',
    base: { atk: 15, hp: 400, def: 10, crit: 0.05, critDmg: 0.5 },
    move: 300, atkTime: 0.34, range: 620,
    pattern: [1.0, 1.0, 1.0, 1.6],
    passives: [
      { id: 'eagle', name: 'Eagle Eye',  desc: 'Crit rate +20%' },
      { id: 'swift', name: 'Tailwind',   desc: 'Every 30s: move speed +10% for 10s' },
    ],
    skills: [
      { id: 'backshot', name: 'Back-Step Shot', cd: 5, icon: '↶', desc: 'Dash back horizontally and fire a power shot (220%).' },
      { id: 'strangle', name: 'Bowstring Choke', cd: 8, icon: '➰', desc: 'Close range: strangle the foe with your string, then shove them far away (160%).' },
      { id: 'volley',   name: 'Arrow Storm',    cd: 9, icon: '⋮', desc: 'Rapid-fire a barrage of 8 arrows (50% each).' },
    ],
    ult: { name: 'Starfall', desc: 'Call down 12 starlight arrows on the foe (65% each).' },
  },
  magic: {
    id: 'magic', name: 'Magic', icon: '🔮', color: '#9b5de5',
    blurb: 'Fragile caster. Fire, water, thunder.',
    base: { atk: 20, hp: 375, def: 10, crit: 0.05, critDmg: 0.5 },
    move: 265, atkTime: 0.36, range: 560,
    pattern: [1.0, 1.0, 1.0, 1.6],
    passives: [
      { id: 'hex',  name: 'Hex',          desc: '10% on hit: slow 15%, attack -10%, attack speed -15% (4s)' },
      { id: 'ward', name: 'Arcane Ward',  desc: '20% chance to completely block incoming damage' },
    ],
    skills: [
      { id: 'fireball', name: 'Homing Flame',   cd: 4,  icon: '🔥', desc: 'Launch a homing fireball (220%).' },
      { id: 'summon',   name: 'Sprite Squad',   cd: 10, icon: '✦', desc: 'Summon 3 minions that chase and explode (70% each).' },
      { id: 'cloud',    name: 'Thunderhead',    cd: 11, icon: '⚡', desc: 'A cloud follows the foe and strikes with thunder 5 times (80% each).' },
    ],
    ult: { name: 'Cataclysm Meteor', desc: 'Drop a giant meteor on the foe (600% AoE).' },
  },
  polearm: {
    id: 'polearm', name: 'Polearm', icon: '🔱', color: '#4cc9f0',
    blurb: 'Long reach controller. Spears, lances, halberds.',
    base: { atk: 25, hp: 500, def: 20, crit: 0.05, critDmg: 0.5 },
    move: 265, atkTime: 0.34, range: 150,
    pattern: [1.0, 1.0, 1.2, 1.8],
    passives: [
      { id: 'pierce', name: 'Armor Pierce', desc: '10% on hit: enemy defense -15% (5s)' },
      { id: 'focus',  name: 'Focus',        desc: "After 3s without attacking, next hit deals +50%" },
    ],
    skills: [
      { id: 'leap',      name: 'Sky Cleaver',   cd: 6,  icon: '⤵', desc: 'Extend your weapon, jump and swing it downward (240%).' },
      { id: 'spinBlock', name: 'Whirl Guard',   cd: 8,  icon: '◎', desc: 'Spin your polearm: destroys incoming projectiles and reduces melee damage.' },
      { id: 'throw',     name: 'Boomerang Lance', cd: 7, icon: '↔', desc: 'Throw your spear; it hits going out and coming back (150% x2).' },
    ],
    ult: { name: 'Dragon Lance', desc: 'Charge across the arena with a dragon aura (600%).' },
  },
};
const CLASS_ORDER = ['melee', 'heavy', 'ranged', 'magic', 'polearm'];

// look: skin, hair, hair2 (shade), eye, outfit, outfit2, accent, style, acc
const CHARACTERS = [
  // ---------------- B rank starters ----------------
  { id: 'rin', name: 'Rin', title: 'Alley Fencer', cls: 'melee', rarity: 'B', weapon: 'sword', gesture: 'tongue',
    look: { skin: '#ffe2cf', hair: '#2f3350', hair2: '#1e2138', eye: '#ff4f5e', outfit: '#262938', outfit2: '#ff4d6d', accent: '#ffd23f', style: 'spiky', acc: 'cap' },
    fx: '#ff4d6d', unique: null, uniqueDesc: 'Standard Blade kit.',
    story: 'Rin grew up fencing with broom handles behind a noodle shop on Sixth Street. A secondhand blade and a lot of stubbornness later, they are the block\'s self-appointed protector.' },
  { id: 'gorou', name: 'Gorou', title: 'Demolition Kid', cls: 'heavy', rarity: 'B', weapon: 'hammer', gesture: 'blink',
    look: { skin: '#f6d0b1', hair: '#e07a2f', hair2: '#b0561a', eye: '#3a86ff', outfit: '#f4a300', outfit2: '#33363f', accent: '#ffffff', style: 'messy', acc: 'goggles' },
    fx: '#ff9f1c', unique: null, uniqueDesc: 'Standard Heavy kit.',
    story: 'An apprentice at a demolition crew who took the company motto — "if it\'s in the way, it isn\'t anymore" — far too literally.' },
  { id: 'pip', name: 'Pip', title: 'Rooftop Scout', cls: 'ranged', rarity: 'B', weapon: 'bow', gesture: 'mouth',
    look: { skin: '#ffe6d6', hair: '#7bd389', hair2: '#4f9e5c', eye: '#8a5cff', outfit: '#2b4a3a', outfit2: '#f1f7ed', accent: '#ffcf56', style: 'bob', acc: 'ahoge' },
    fx: '#2ec4b6', unique: null, uniqueDesc: 'Standard Ranged kit.',
    story: 'Pip runs messages across the rooftops faster than any courier app, and never misses a pigeon — not that they shoot pigeons. Usually.' },
  { id: 'mochi', name: 'Mochi', title: 'Hedge Witch', cls: 'magic', rarity: 'B', weapon: 'staff', gesture: 'tongue',
    look: { skin: '#fff0e4', hair: '#f7a8c4', hair2: '#d47aa0', eye: '#5ec8ff', outfit: '#5b3f8c', outfit2: '#ffe066', accent: '#ffffff', style: 'twin', acc: 'catears' },
    fx: '#9b5de5', unique: null, uniqueDesc: 'Standard Magic kit.',
    story: 'Mochi failed the Arcane Academy entrance exam three times. They now run a very successful magic tea stall and hold a grudge.' },
  { id: 'ko', name: 'Ko', title: 'Night Guard', cls: 'polearm', rarity: 'B', weapon: 'spear', gesture: 'tongue',
    look: { skin: '#e9c3a3', hair: '#1c1c24', hair2: '#000000', eye: '#ffb703', outfit: '#1d3557', outfit2: '#a8dadc', accent: '#e63946', style: 'pony', acc: 'none' },
    fx: '#4cc9f0', unique: null, uniqueDesc: 'Standard Polearm kit.',
    story: 'Ko guards the old subway depot at night. Nobody remembers hiring them, but the paycheck keeps arriving.' },

  // ---------------- A rank ----------------
  { id: 'vera', name: 'Vera Thorn', title: 'Rose Duelist', cls: 'melee', rarity: 'A', weapon: 'rapier', gesture: 'smile',
    look: { skin: '#fff1e8', hair: '#c9184a', hair2: '#800f2f', eye: '#ffd6e0', outfit: '#fdf0f5', outfit2: '#c9184a', accent: '#2b2d42', style: 'long', acc: 'none' },
    fx: '#ff4d8d', unique: 'bleed', uniqueDesc: 'Critical hits scatter rose petals that make the foe Bleed for 3s.',
    story: 'Heiress of a fencing dynasty who walked out of the family estate with only a rapier and a rose. Every duel ends with a bow — whether the opponent is standing or not.' },
  { id: 'bruno', name: 'Bruno', title: 'Wrecking Crew', cls: 'heavy', rarity: 'A', weapon: 'mace', gesture: 'blink',
    look: { skin: '#d9a77c', hair: '#3d2b1f', hair2: '#24170f', eye: '#8ac926', outfit: '#3a5a40', outfit2: '#ffca3a', accent: '#ff595e', style: 'spiky', acc: 'headphones' },
    fx: '#ffca3a', unique: 'aftershock', uniqueDesc: 'Smash sends a second wave of aftershocks.',
    story: 'Foreman of the most feared construction crew in the city. Speaks softly, listens to lo-fi, and carries an extremely big mace.' },
  { id: 'hazel', name: 'Hazel', title: 'Slingshot Menace', cls: 'ranged', rarity: 'A', weapon: 'slingshot', gesture: 'wink',
    look: { skin: '#ffe0c2', hair: '#a0522d', hair2: '#6b3419', eye: '#06d6a0', outfit: '#ef476f', outfit2: '#ffd166', accent: '#118ab2', style: 'twin', acc: 'cap' },
    fx: '#ffd166', unique: 'ricochet', uniqueDesc: 'The 4th basic shot splits into 3 pellets.',
    story: 'Arcade champion, prankster and owner of a slingshot carved from a lucky tree. Wanted posters around town describe them as "small, fast, giggling".' },
  { id: 'nimbus', name: 'Nimbus', title: 'Tide Caller', cls: 'magic', rarity: 'A', weapon: 'orb', gesture: 'mouth',
    look: { skin: '#eaf6ff', hair: '#4ea8de', hair2: '#2c6e9b', eye: '#ffffff', outfit: '#1b4965', outfit2: '#bee9e8', accent: '#ffd60a', style: 'long', acc: 'halo' },
    fx: '#4ea8de', unique: 'storm', uniqueDesc: 'Thunderhead strikes 7 times instead of 5.',
    story: 'A weather forecaster who got tired of being wrong and started making the weather instead. Their forecasts are now 100% accurate.' },
  { id: 'juno', name: 'Juno', title: 'Lance Corporal', cls: 'polearm', rarity: 'A', weapon: 'lance', gesture: 'brows',
    look: { skin: '#f3d2c1', hair: '#f4f1de', hair2: '#c9c4a6', eye: '#e07a5f', outfit: '#3d405b', outfit2: '#e07a5f', accent: '#81b29a', style: 'bob', acc: 'goggles' },
    fx: '#e07a5f', unique: 'tether', uniqueDesc: 'The returning lance drags the foe toward you and stuns briefly.',
    story: 'Top of their class at the city defense academy — and bottom in "following orders". Their lance has a homing beacon they installed themself.' },

  // ---------------- S rank ----------------
  { id: 'akane', name: 'Akane Kurogane', title: 'Crimson Oni', cls: 'melee', rarity: 'S', weapon: 'katana', gesture: 'tongue',
    look: { skin: '#fbe3d6', hair: '#141414', hair2: '#000000', eye: '#ff2e2e', outfit: '#1a1a1a', outfit2: '#d00000', accent: '#ffba08', style: 'pony', acc: 'horns' },
    fx: '#ff2e2e', unique: 'afterimage', uniqueDesc: 'Dash & Thrust leaves a crimson afterimage that repeats the strike (60%).',
    story: 'They say an oni haunts the Kurogane dojo, cutting down anyone who enters after dark. The oni is Akane. They just really want to be left alone to practice.' },
  { id: 'mira', name: 'Mira', title: 'Titan of Ash', cls: 'heavy', rarity: 'S', weapon: 'claymore', gesture: 'blink',
    look: { skin: '#f7d9c4', hair: '#e9ecef', hair2: '#adb5bd', eye: '#fca311', outfit: '#14213d', outfit2: '#fca311', accent: '#e5e5e5', style: 'messy', acc: 'horns' },
    fx: '#fca311', unique: 'quake', uniqueDesc: 'Grab\'s slam erupts into shockwaves on both sides.',
    story: 'A former gladiator who swings a claymore taller than they are. Retired twice. Un-retired three times.' },
  { id: 'selene', name: 'Selene', title: 'Moonlit Hunter', cls: 'ranged', rarity: 'S', weapon: 'crossbow', gesture: 'wink',
    look: { skin: '#f5ebff', hair: '#c8b6ff', hair2: '#8f7ad6', eye: '#ffd60a', outfit: '#240046', outfit2: '#e0aaff', accent: '#ffd60a', style: 'long', acc: 'catears' },
    fx: '#c8b6ff', unique: 'moonvolley', uniqueDesc: 'Arrow Storm fires 3 extra arrows that gently home in.',
    story: 'A bounty hunter who only works under the full moon. Their crossbow bolts glow silver, and nobody has ever seen them miss — or smile.' },
  { id: 'ignis', name: 'Ignis', title: 'Ember Prodigy', cls: 'magic', rarity: 'S', weapon: 'book', gesture: 'tongue',
    look: { skin: '#fff3e6', hair: '#f3e1c7', hair2: '#cdb48f', eye: '#c8e04a', outfit: '#6a4c93', outfit2: '#ffffff', accent: '#ffb703', style: 'bob', acc: 'ahoge' },
    fx: '#ff7b00', unique: 'embers', uniqueDesc: 'Homing Flame explodes into 3 embers on impact and burns.',
    story: 'Youngest archmage in a century, banned from four libraries for "spontaneous combustion events". Sticks their tongue out at every rule they break.' },
  { id: 'hal', name: 'Hal', title: 'Iron Halberd', cls: 'polearm', rarity: 'S', weapon: 'halberd', gesture: 'brows',
    look: { skin: '#e8b996', hair: '#ffbe0b', hair2: '#d18f00', eye: '#3a86ff', outfit: '#2b2d42', outfit2: '#8d99ae', accent: '#ef233c', style: 'spiky', acc: 'headphones' },
    fx: '#ffbe0b', unique: 'crater', uniqueDesc: 'Sky Cleaver leaves a crater that slows and damages foes.',
    story: 'Captain of the city wall guard. Their halberd is older than the wall itself, and rumor says it once belonged to a dragon slayer.' },
];
const CHAR_BY_ID = Object.fromEntries(CHARACTERS.map(c => [c.id, c]));
const STARTERS = ['rin', 'gorou', 'pip', 'mochi', 'ko'];

const RARITY = {
  S: { color: '#ffb800', glow: '#ffe066', label: 'S' },
  A: { color: '#b45cff', glow: '#e0b3ff', label: 'A' },
  B: { color: '#3aa0ff', glow: '#9fd3ff', label: 'B' },
};

// Gacha
const GACHA = {
  cost1: 160,
  featuredS: 'ignis',
  featuredA: ['vera', 'nimbus'],
  baseS: 0.006, softPity: 74, hardPity: 90,
  baseA: 0.094, aPity: 10,
};

const ECON = {
  startGems: 3200,
  startCoins: 3000,
  levelCost: lvl => 800 * lvl,
  maxLevel: 10,
  maxDupes: 6,
};

// PvP ranks
const PVP_TIERS = [
  { name: 'Bronze',   min: 0,    color: '#cd7f32', reward: 300 },
  { name: 'Silver',   min: 300,  color: '#c0c7d0', reward: 600 },
  { name: 'Gold',     min: 600,  color: '#ffcc33', reward: 1000 },
  { name: 'Platinum', min: 1000, color: '#5ee7df', reward: 1600 },
  { name: 'Diamond',  min: 1400, color: '#7aa2ff', reward: 2400 },
  { name: 'Master',   min: 1900, color: '#ff4fd8', reward: 3600 },
];

// PvE leaderboard season rewards (top 20 = special, everyone else by rank bracket)
const PVE_REWARDS = [
  { from: 1,   to: 1,    gems: 5000, coins: 20000, title: 'Raid Sovereign' },
  { from: 2,   to: 3,    gems: 4000, coins: 15000, title: 'Raid Champion' },
  { from: 4,   to: 10,   gems: 3000, coins: 10000, title: 'Raid Elite' },
  { from: 11,  to: 20,   gems: 2000, coins: 8000,  title: 'Raid Vanguard' },
  { from: 21,  to: 50,   gems: 800,  coins: 4000 },
  { from: 51,  to: 100,  gems: 500,  coins: 3000 },
  { from: 101, to: 500,  gems: 300,  coins: 2000 },
  { from: 501, to: 1e9,  gems: 150,  coins: 1000 },
];

const BOT_NAMES = ['NeonRonin', 'xX_Waffle_Xx', 'Kiwi', 'SoySauce', 'Plushie', 'Bunbun', 'Glitchy', 'MangoTango', 'Zeta', 'Nyx',
  'Takoyaki', 'Pudding', 'Ramen4Life', 'Byte', 'Sprout', 'Lumi', 'Kazu', 'Echo', 'Pixel', 'Toast', 'Mint', 'Hollowed',
  'RiceBall', 'Sakuya', 'Dango', 'Vortex', 'Comet', 'Momo', 'Yuzu', 'Boba'];
