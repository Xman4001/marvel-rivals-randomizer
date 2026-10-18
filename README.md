# Marvel Rivals Randomizer — your web files

Start here. This folder contains the complete browser app, including the fix that randomizes player roles across positions. Review and edit these files before deciding to publish them on GitHub Pages.

## What the positioning fix does

- On a full roll, each unlocked player position receives a randomly shuffled role from that team's selected composition.
- A 2 Vanguard / 2 Duelist / 2 Strategist team still has those exact counts. With no locked picks, every player position has an equal chance of receiving each role.
- Player names stay at their numbered positions. The hero and its assigned role change together.
- Locked picks keep their hero, role, and player position. The remaining roles are shuffled among the other players.
- Rerolling one hero preserves that slot's assigned role and the other picks.
- Saved lineups restore in their saved order. Click Randomize Teams to create a new randomized order.
- No hero repeats across the two teams. Deadpool may fill any supported role and appears only once per match.

Random results can repeat. Player 1 can still receive a Vanguard on consecutive rolls; that position is no longer permanently assigned to Vanguard.

## Files to review

| File or folder | What it controls |
| --- | --- |
| `index.html` | The page structure, headings, team panels, and help text. HTML describes the elements on the page. |
| `styles.css` | Colors, spacing, sizes, and desktop/mobile layouts. CSS controls appearance. |
| `generator.js` | Role distribution, hero selection, duplicate prevention, and locks. This is where the positioning fix starts. |
| `app.js` | Buttons, player names, displaying the generated roles, saving state, fetching the roster, and copying lineups. |
| `data/heroes.json` | A bundled fallback copy of your hero roster. |
| `data/portraits.json` | Exact portrait source URLs and bundled fallback paths. |
| `assets/heroes/` | All 54 original hero portraits. |
| `favicon.svg` | The small icon shown in a browser tab. |
| `tests/generator.test.mjs` | Automated tests for the generator and the positioning fix. |
| `package.json` | An optional shortcut for running those tests; the hosted app does not require package installation. |
| `.nojekyll` | Tells GitHub Pages to serve the static files directly. |

You can open the text files in PyCharm, VS Code, or another text editor. You do not need to understand every file before reviewing the behavior and appearance.

## Preview the files on your computer

1. Extract the ZIP, then open the `marvel-rivals-randomizer` folder that contains `index.html`.
2. Open a terminal in that folder. On Windows, you can type `cmd` in File Explorer's address bar and press Enter.
3. Run:

   ```bash
   python -m http.server 8000 --bind 127.0.0.1
   ```

   If your Windows Python installation uses the launcher, use `py` instead of `python`.

4. Open <http://127.0.0.1:8000/> in your browser.
5. Keep that terminal open while reviewing. Press Ctrl+C in the terminal when finished.

Use the local server rather than double-clicking `index.html`: this app loads JavaScript modules and JSON files, which browsers restrict when opened directly from disk.

This is a development preview for you. Once the app is hosted, visitors only open the website link; they do not need Python, these source files, or an installation.

## Suggested review

1. Use the standard 2–2–2 composition. Enter player names and click Randomize Teams several times. Names should stay in place while roles and heroes change.
2. Check that every lineup retains the selected role counts and has no duplicate heroes.
3. Lock one pick, then randomize again. That player should keep the locked hero and role while other slots are randomized.
4. Reroll one unlocked hero. Its role should stay the same and all other players should keep their picks.
5. Change the team composition, generate again, and check the result.
6. Check the layout at your preferred browser size. List any text, colors, controls, or behavior you want changed before publishing.

Names and lineups save separately for each browser and website address. The GitHub Pages version will have its own saved state, separate from this local preview or the existing private preview.

## Put it on GitHub Pages when you are ready

The recommended destination is a new repository named `marvel-rivals-randomizer` in your `Xman4001` account. Keep `MarvelRivalsRandomizerData` as your existing hero-data repository. The web app already reads its live roster from there.

1. Create the new repository on GitHub. A public repository supports GitHub Pages on GitHub Free. You can initialize it with a README so the `main` branch exists.
2. In the new repository, choose **Add file → Upload files**. Drag in the files and folders **inside** the extracted project folder, including `assets/` and `data/`. Upload the contents, not the ZIP or the outer folder. `index.html` should appear at the repository's top level.
3. Commit the upload to `main` (or complete and merge a pull request if you choose that workflow).
4. Open **Settings → Pages**. Under **Build and deployment**, choose **Deploy from a branch**. Select **main** and **/(root)**, then **Save**.
5. Wait for GitHub to show a successful Pages deployment and open the address it provides.

For that account and repository name, the expected address after publication is:

<https://xman4001.github.io/marvel-rivals-randomizer/>

That address is a proposed destination; these files have not been uploaded to your GitHub account as part of this handoff.

Once configured, later commits to the selected branch and folder will update the published website.

Official references:

- [GitHub Pages: what it is and supported plans](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [Uploading files to a repository](https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository)
- [Configuring the Pages publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

## Roster updates

Continue updating `heroes.json` in `Xman4001/MarvelRivalsRandomizerData`. Supported role names are exactly `Vanguard`, `Duelist`, and `Strategist`. A hero with multiple roles should have one stable ID and multiple entries in its `roles` list. Set `enabled` to `false` to exclude a hero.

The app refreshes that live roster automatically and uses a saved or bundled roster if the live source is unavailable. Existing portrait mappings preserve the repository's exact capitalization and spacing.

## Optional automated tests

The logic passed all 14 tests, including 10,000 random compositions and a separate 3,000-roll check of every player position. Browser visual testing was unavailable during this update; the suggested review above covers the interaction and layout checks.

If you already have Node.js 20 or newer, run `npm test` from this folder. No package dependencies need to be installed. Node.js is not required by visitors or for GitHub Pages hosting.

Fan project. Hero names and portraits belong to their respective rights holders.
