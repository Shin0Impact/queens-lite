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

## Android app

Every push to `main` runs the **Build Android APK** action. It wraps the game in an Android app with Capacitor, builds an APK and publishes it on the Releases page. Open the release on your phone and tap the APK to install it.

### Signing key (recommended)

Without a signing key, each build is a debug build with a different signature, so you have to uninstall the old version before installing a new one. To fix that, create a key once on your computer:

```
keytool -genkeypair -v -keystore queens.keystore -alias queens -keyalg RSA -keysize 2048 -validity 10000
```

Then add these under **Settings > Secrets and variables > Actions > Secrets**:

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | The keystore file as base64 (`base64 -w0 queens.keystore`, or `certutil -encode` on Windows) |
| `ANDROID_KEYSTORE_PASSWORD` | The keystore password |
| `ANDROID_KEY_ALIAS` | `queens` |
| `ANDROID_KEY_PASSWORD` | The key password |

Keep the keystore file safe and out of the repo. If you lose it, phones can't update to new versions without uninstalling.

## Online leaderboard

The Android app and web copies save scores in Firebase Firestore on the free Spark plan. Each device signs in anonymously, and players are shown by the name they pick in the game.

1. Go to the [Firebase console](https://console.firebase.google.com) and add a project. Analytics isn't needed.
2. Open **Build > Authentication**, select **Get started**, then turn on **Anonymous** under Sign-in method.
3. Open **Build > Firestore Database** and create a database in production mode.
4. In Firestore, open the **Rules** tab, paste in the contents of `firestore.rules` and publish.
5. Open **Project settings**, add a **Web app**, and copy its `apiKey` and `projectId`.
6. In GitHub, add them under **Settings > Secrets and variables > Actions > Variables** as `FIREBASE_API_KEY` and `FIREBASE_PROJECT_ID`.

The next build turns the online board on. The Firebase web API key isn't a secret: what protects the data are the rules in `firestore.rules`. Anyone can read the board, each player can only write their own entry, and a total can only go up by at most one puzzle's worth of points at a time.

When the game runs as a Claude artifact, it uses the artifact's own storage for the board instead, because artifacts can't reach outside sites. The two boards are separate.

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
| `js/online.js` | Online leaderboard stored in Firebase |
| `js/config.js` | Firebase settings, filled in by the build |
| `firestore.rules` | Security rules for the online leaderboard |
| `capacitor.config.json`, `package.json` | Android app setup |
| `scripts/build-web.mjs` | Copies the game into `www/` for the app |
| `.github/workflows/android.yml` | Builds and releases the APK |
