# Chibi Clash Zero

A 2D chibi arena fighter that runs in the browser: ranked PvP, a seasonal boss raid, a practice room, a gacha, and ultimates you can fire with face gestures through your webcam.

## Run it

You need a local web server because browsers only allow camera access on `localhost` or `https`:

```bash
cd "/Users/palmmie/Create game"
python3 -m http.server 8000
```

Then open **http://localhost:8000** in Chrome, Edge or Firefox. There's no build step and nothing to install. The fonts and the MediaPipe face model load from a CDN on first use.

## Controls

| Action | Keys |
|---|---|
| Move | `A` `D` / `←` `→` |
| Jump | `W` / `↑` / `Space` |
| Basic attack (hold for the full combo) | `J` |
| Skills 1 / 2 / 3 | `U` `I` `O` (or `1` `2` `3`) |
| **Ultimate** | Your character's camera gesture, **or** hold `F`+`G`+`H` and press `Enter` |
| Pause | `Esc` |

## Camera ultimates

Go to **Camera & Settings → Enable Camera**. Live meters show each gesture, and a "!" pops when one fires. Every character has their own gesture:

- 😛 Tongue out
- 😑 Long blink
- 😮 Open wide
- 😁 Big grin
- 😉 Wink
- 🤨 Brows up

You have to hold a gesture for a moment, so normal blinking won't fire it. Sensitivity is adjustable. Video never leaves your machine: MediaPipe processes it in the browser.

## Modes

- **Ranked PvP**: queue, match found, versus screen, then a countdown and a 99-second fight. A win gives ◆ 80, ● 300 and RP. Tiers run Bronze → Master. The season resets every **2 months**, with rewards by tier.
- **Boss Raid**: 180 seconds against Gloomhorn, who gets enraged at 50% HP. Your score is damage, plus clear, time, HP and combo bonuses. The leaderboard resets every **3 months**. The top 20 get special rewards and titles, and everyone else is rewarded by rank bracket.
- **Practice**: offline. Fight a training dummy (with a DPS meter), an AI fighter or the boss. You can turn on no-cooldowns mode.
- **Signal Search (gacha)**: S-rank 0.6% with soft pity from pull 74 and a hard guarantee at 90. Featured 50/50 with a guarantee after a loss. A-rank guaranteed every 10 pulls. Duplicates raise Mindscape (+3% stats each).

## Classes

There are five classes: Blade, Heavy, Ranged, Magic and Polearm. Each has its spec base stats, a basic-attack combo pattern, 2 passives (pick 1 before each battle), 3 skills and an ultimate. The gacha has 15 characters (5 B, 5 A, 5 S). A- and S-rank characters have a unique signature effect and their own story.

## Project layout

```
index.html        page shell
css/style.css     menu / UI styling
js/data.js        classes, skills text, characters, gestures, rates, rewards
js/save.js        localStorage profile, seasons, leaderboards, gacha logic
js/input.js       keyboard + F+G+H+Enter ult combo
js/vision.js      MediaPipe face gestures (blink / tongue / mouth / smile / wink / brows)
js/art.js         procedural chibi renderer, weapons, boss, backgrounds
js/fighter.js     fighter stats, basic attacks, all skills & ultimates, AI
js/boss.js        raid boss + training dummy
js/battle.js      world: hitboxes, projectiles, damage pipeline, FX, HUD, cut-ins
js/ui.js          menus / screens / rewards flow
js/main.js        boot + game loop
```

## What's local for now

Everything is single-player in the browser:

- Progress is saved to `localStorage`.
- PvP opponents are AI fighters scaled to your rank.
- Leaderboard rivals are simulated with deterministic data for each season.

Real online matchmaking, server-validated leaderboards and anti-cheat need a backend (for example a WebSocket game server and a database). The season and reward logic in `save.js` is where that would connect.
