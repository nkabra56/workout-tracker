# Lifty

A private, offline-first workout journal for iPhone and Raspberry Pi. Plain JavaScript, IndexedDB, a service worker and a dependency-free Node server. MIT licensed. The simple blue dumbbell icon is an original SVG with 192px, 512px and 180px Apple variants.

## Run and verify

Use Node 22 or later:

```sh
node server.mjs
node --test
node scripts/build.mjs
```

The default listener is loopback port5173. The offline shell works locally; private synchronization needs the server configuration in [PI-DEPLOYMENT.md](PI-DEPLOYMENT.md). Environment files, backups and server modules are never served as static assets.

## Navigation

- **Today:** resume/start a workout, weekly completion, direct links to body weight and exercise charts. The profile icon opens preferences, private sync status and backup controls.
- **Train → Log workout:** choose a calendar date and any routine. Existing sessions for that date/routine are offered explicitly. Additional sessions require confirmation.
- **Train → Routines:** browse all five routines and edit exercises, sets, targets, rest and order. Custom templates affect future sessions; session-only editing preserves previous entries in an edit archive. Completed snapshots remain read-only.
- **Train → History:** completed, unfinished, planned and conflicting alternative sessions. Session URLs reopen the same saved workout after reload. All exercises remain in one scrolling logger with prescribed rest durations beside each exercise.
- **Progress → Body weight:** dated measurements, optional notes, lb/kg conversion, edit/delete corrections, raw-point chart and seven-day averages where enough days were recorded. An old undated preference is preserved without inventing its date.
- **Progress → Exercises:** choose a comparable exercise and Load, Reps or Volume chart. Exact chart values and comparable session details remain available.
- **Progress → Activity:** completed sessions/sets by actual workout date, weekly counts and a link to session history.

The three bottom destinations are supplemented by named section navigation, contextual entry links and back navigation. Open sections, clear exercise headings, separators and aligned controls replace enclosing rounded cards. Touch targets stay at least44px; short navigation/interaction transitions respect prefers-reduced-motion.

Food tracking has been removed: no Nutrition tab, calorie/macronutrient display, diet setting, food search, custom-food or recipe workflow. The external food lookup endpoint is removed. Historical nutrition records remain inert in the existing database, sync schema and JSON exports/imports so this interface change does not delete data or break old backups. No new third-party food requests are made.

## Workout dates and progression

Routine Day1–5 labels are independent of weekdays. Any routine/custom template can be used on any local calendar date. Backdated workouts count on their recorded date. Future sessions are labeled planned and cannot be marked complete before that date. Existing sessions are never silently overwritten; multiple unfinished matches must be selected explicitly.

Pounds are default, with optional kg. Historical sessions retain their original units. Dumbbell loads are per hand; each-arm entries use the weaker side and represent both sides. Equipment labels distinguish machines/stacks. Completed session alternatives and planned workouts do not inflate progress.

Load charts use the heaviest fully recorded completed set. Reps charts show its repetitions, with the corresponding load listed in Chart values. Volume charts sum weight×reps only when every completed set has load and reps recorded. Missing data is omitted, never treated as zero; explicit zero load is allowed. Comparisons keep exercise identity, routine, target rep range, per-side convention, equipment and units separate. Lines connect observed sessions, not invented measurements. No one-rep-max, muscle-growth or medical claim is made.

Body-weight charts use actual dated points. A trailing seven-day mean requires at least three recorded days; multiple entries on one day are averaged first so days have equal weight. Missing days are not filled. Period changes report actual first/last dates rather than extrapolated changes or weight-loss targets.

## Private automatic sync and data preservation

On the configured private Tailscale Serve deployment, sync starts automatically with no app key, sign-in or enable switch. It retries after saves, reconnect, foreground and every30seconds while open. iOS does not guarantee background execution. Synced with Pi confirms acknowledgement; pending/offline status means edits are still local.

The server requires the exact configured owner login from the trusted loopback Serve proxy and exact HTTPS Origin. Missing/other identities fail closed; tokens/cookies cannot bypass Tailscale mode. [Official Serve documentation](https://tailscale.com/docs/features/tailscale-serve#identity-headers) explains identity injection and client-header stripping. Local processes on the Pi remain trusted and could forge loopback headers. Keep the Pi, Tailscale account and owner devices secured. Never enable Funnel or expose the HTTP listener. Non-Serve installations retain an explicit authenticated compatibility API, never anonymous fallback.

IndexedDB writes mark records dirty atomically. Server updates are serialized and saved with an atomic rename. Retries deduplicate; stale edits become preserved conflict alternatives; deletion tombstones prevent resurrection. Templates, weigh-ins and legacy records use the same versioned pipeline. Export JSON backups privately and test restore. Neither browser data nor the Pi JSON file is app-encrypted, and storage failure still requires backups.

Updates preserve IndexedDB and server records. Reopen/reload with Tailscale connected; a second reload may be needed after the new service worker installs. Never clear app data to refresh the interface. iOS may retain a cached Home Screen icon.

## Verification

Automated tests cover routine snapshots, date attribution, body-weight conversion/averages, exercise chart metrics, navigation separation, auth/owner isolation, retry/conflict/deletion behavior and legacy-data preservation. Browser checks cover phone-width navigation, saved session reload, offline relaunch, draft retention, chart selectors and grouped scrolling workouts. Desktop emulation does not fully reproduce the physical iPhone keyboard or OS storage lifecycle.
