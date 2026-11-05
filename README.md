# Queens Lite

A small, battery-friendly version of the Queens logic puzzle (also known as Star Battle) that runs in the browser.

## Rules

Place one queen in every row, every column and every color region. Queens can't touch each other, not even diagonally.

## Features

- Boards from 5×5 to 10×10, generated on the fly. Every puzzle has exactly one solution.
- A daily puzzle that is the same for everyone, with a daily streak.
- Hints that explain the next logical step in plain words, and a Solve 1 button that places a queen for you.
- Optional modes: Lives, Memory (colors disappear after 10 seconds) and Time attack.
- Puzzle codes, so friends can play the same board.
- A score system and a shared leaderboard.
- Dark theme by default, no animation loops, and a timer that pauses when the page is hidden.

## Scoring

Each queen is worth up to 100 points: `100 × T / (T + seconds since the previous queen)`, where `T` is 2 seconds per row of the board.

The puzzle's points are multiplied by its difficulty (Easy ×1, Medium ×1.5, Hard ×2, Expert ×3) and then by your streak, up to ×10. Difficulty is measured by solving the puzzle with the hint logic and adding up how hard each step was.

Using a hint, losing, or leaving a puzzle unfinished resets the streak. Queens placed for you earn no points, and replaying a solved puzzle adds nothing.

## Running it

Open `index.html` in a browser. No build step and no dependencies.

The shared leaderboard uses the storage that Claude artifacts provide, so it only works when the game is opened as a Claude artifact. Everywhere else, the game and your own scores still work and are saved in the browser.

## Files

| File | What it does |
| --- | --- |
| `index.html` | Page layout and icons |
| `style.css` | All styling |
| `js/generator.js` | Builds puzzles with exactly one solution |
| `js/hints.js` | Finds the next logical step and explains it |
| `js/game.js` | Board, taps and drags, timer, game modes |
| `js/score.js` | Difficulty rating, points and streaks |
| `js/leaderboard.js` | Player names, shared board and personal records |
| `js/settings.js` | Settings panel, puzzle codes, startup |
