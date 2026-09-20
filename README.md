# Lifty

A private, offline-first workout and nutrition journal for iPhone and Raspberry Pi 4B. Plain JavaScript modules, IndexedDB, a service worker, and a dependency-free Node server. No build framework or package installation required.

## Run locally

Install Node 22 or later, then run:

```sh
node server.mjs
```

Open http://127.0.0.1:5173. Validation:

```sh
node --test
node scripts/build.mjs
```

Equivalent npm scripts are provided. `dist/` contains the static offline shell; online food search and sync require `server.mjs` plus its modules. Source files are served from an explicit allowlist; environment files, data and source-server modules are never static assets.

## Included

- All five prescribed routines in exact exercise order, set counts, rep ranges and rest times. One scrolling session with editable load, reps, RIR and set checkmarks; last matching session; manual-only rest timer; optional cardio and private notes.
- Immediate IndexedDB transaction saves, resumable history, cached application/templates/foods, pounds by default with optional kg/lb per session, editable weekly schedule and preferences. Dumbbell loads are per hand. Each-arm entries represent both arms, using the weaker side; separate left/right entries are not implemented.
- Exercise histories show load/reps, volume and conservative reps-first suggestions. Comparisons stay within day/rep target/unit/equipment; use consistent machine labels. Training volume is an indicator, not measured muscle growth. Weekly consistency currently counts sessions in the last seven days; graphical charts are not yet included.
- Calories, protein, carbohydrate and fat by date; real packaged-food search and manual barcode lookup; custom foods, favorites and recipes with all ingredient weights, oil/ghee, cooked batch yield and saved serving weight. Food records and log snapshots work offline. Camera barcode scanning and meal grouping are not included.
- Private authenticated Pi sync with automatic retries every 30 seconds while the app is open, record versions, idempotent retries and conflicting alternatives. An unconfigured or unavailable server never reports synced. No browser background-sync guarantee on iOS.
- JSON backup export and additive import. Differing IDs/content are preserved as alternatives. Settings are exported for reference but import leaves current settings unchanged. Treat exports as sensitive.

## Storage and conflict behavior

Browser edits are marked dirty in the same IndexedDB record write. Sync uploads dirty records with their last server version. The server serializes updates and atomically renames a private JSON file. Matching retries are no-ops. Stale changes become deterministically identified alternative records; neither version is overwritten. Deleted meal records are tombstones so reconnecting devices cannot silently resurrect them. Changes made during an in-flight sync are left dirty for the next pass. Alternatives in session history can be reviewed; advanced conflict resolution and undo UI are future work. Food/log alternatives remain labeled for review. Unresolved log alternatives are excluded from calorie and macro totals; alternative sessions are excluded from progress counts. To use a preferred meal alternative, remove the original and log the preferred food/portion once. Browser tab locking prevents two tabs editing a stale local snapshot on browsers supporting Web Locks.

Browser storage is not app-encrypted and may be evicted; request persistence and keep backups. The Pi JSON database is not encrypted at rest. Atomic renaming protects partial writes, but power loss, SD-card failure and full disks still require backup/recovery planning. This is a single-person journal; each authorized owner identity grants access to the entire journal. It is not a multi-user account system or a medically validated product.

## Food sources and coverage

[Open Food Facts API](https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/) is integrated through the same-origin Node server for international packaged foods and barcode lookup, without credentials. Explicit searches are rate limited; incomplete macro records are omitted. [Open Food Facts](https://world.openfoodfacts.org) community records are estimates and must be checked against labels. This does not provide exhaustive Indian/home-cooked food coverage. Household recipes and user-entered labels are the working path for those foods, with no invented nutrition database.

Food data has a separate license from MIT code: the OFF database is [ODbL](https://opendatacommons.org/licenses/odbl/1-0/), individual contents are Database Contents License; images are not used. Preserve attribution and assess share-alike obligations before redistributing a derived database. Private journal backups should not be posted publicly.

[USDA FoodData Central](https://fdc.nal.usda.gov/api-guide/) was evaluated: public-domain data and useful ingredient coverage, but requires a private API key. It is not integrated in this version. No key should be placed in browser code. Public food queries go to OFF through the Pi; journal data is not sent to food providers.

## Raspberry Pi deployment

See [PI-DEPLOYMENT.md](PI-DEPLOYMENT.md). Use private Tailscale Serve HTTPS and application authentication. Do not open router ports or enable Funnel. The public repository contains code only, never access keys, personal history, environment files or journal data.

## Interface and verification

Restrained system typography, generous spacing, 44px minimum buttons, bottom navigation, explicit labels and safe-area padding, informed by [Apple's interface guidance](https://developer.apple.com/design/tips/). Physical iPhone Safari installation/offline lifecycle and real Pi synchronization still need device acceptance testing on a physical device. Automated tests cover routine invariants, recipe math, progression gating, retry/conflict semantics and auth rejection; local browser checks cover session rendering and persistence. No claim of absolute security is made.

## Authentication and independent installations

Private Tailscale installations use automatic identity authorization with no app key, sign-in, enable switch or session expiry. Set an explicit per-installation login allowlist on the server. Requests must arrive from the configured local Serve proxy and include exactly one approved Tailscale-User-Login header. The listener is restricted to IPv4 loopback, exact HTTPS Origin checks protect sync, and old tokens/cookies cannot bypass identity checks in this mode. Serve strips client-supplied identity headers and replaces them with the connected user's identity. See [official Serve identity documentation](https://tailscale.com/docs/features/tailscale-serve#identity-headers).

This trusts the local Pi and its processes, Tailscale, the owner's account and authorized devices. Local malware can forge loopback requests; this is not process isolation or an encrypted vault. Tagged nodes without user identity and other tailnet users are denied. Keep the server private, patched and single-purpose; never enable Funnel or expose its HTTP port. Each person needs an independent instance, data directory, HTTPS hostname and explicit owner allowlist. A missing allowlist fails closed. Non-Serve environments retain the explicit token-authenticated compatibility API; there is no anonymous fallback or key-entry UI. See PI-DEPLOYMENT.md for administrator configuration.

Body weight is optional and labeled with its own unit. Switching units converts its numeric value and the default load increment; historical workout loads retain their original session units. Recipe ingredients and food portions remain in grams.

## Customize workouts

Open **Train**, then **Edit workout** beside a day. Add or remove exercises, type a known or custom exercise name, move exercises with the arrow buttons, and edit working sets, rep ranges and rest ranges. **Save future template** changes only newly started sessions. An in-progress workout has its own **Edit this workout** button; select **This session only** to avoid changing the saved template. An already-started session intentionally keeps its existing snapshot when the future template changes.

Completed sessions are read-only snapshots. Reordering preserves exercise identities; replacing a name creates a separate history. Session edits preserve prior entries in the session's edit archive and JSON backup. Original defaults remain available through **Restore original Day**, with confirmation and a final save. Saved templates use the existing private IndexedDB/sync pipeline and are included in backups. Concurrent template changes remain separate alternatives in the editor until reviewed.

## Design

The original Today layout takes workflow inspiration from MyFitnessPal's [Today documentation](https://support.myfitnesspal.com/hc/en-us/articles/39985611667341-Your-Today-tab): a useful daily summary and quick access to common logging actions. Lifty keeps its own midnight/blue visual design, illustration, workout-first focus and full scrolling session. No MyFitnessPal assets are bundled. Sync runs on startup, after local writes, on reconnect/foreground and every 30 seconds while open. No app setup is needed. **Synced with Pi** confirms acknowledgement; pending or offline status means changes are still local. Offline edits and existing data survive this update.

The compact logger uses one exercise target line, aligned 44px inputs, a single previous-session disclosure, and a one-row manual timer. Equipment and notes remain secondary. Layout checks used 390×844 portrait and 844×390 landscape targets (iPhone16e), plus a narrower reduced-height viewport; the native date field is capped at168×46px with flexible width. Apple's [16e specifications](https://support.apple.com/en-ie/122208) list1170×2532 pixels; [Chromium's device definition](https://chromium.googlesource.com/devtools/devtools-frontend/+/f1fbee878f8958db80c0d421888ad49e9b03b790%5E%21/) supplies390×844 at3×. Desktop viewport checks do not simulate every physical Safari keyboard or date-picker behavior.
## Body weight and useful progress

Open **Progress → Log body weight**. Save a measurement date, weight (lb by default; kg available) and optional note. **Weight history** has Edit/Add date and Delete corrections. Switching entry units converts the number; display units convert charts without rewriting original measurements. The former Preferences field is linked here. Any previously saved value is preserved once as an **undated** entry; give it its real date before it contributes to a trend. No historical date is invented.

Progress filters 7/30/90 days or all time. Body-weight dots are actual dated entries; pale rings show a trailing seven-day mean when at least three separate days were recorded. Multiple entries on a day are averaged first so each recorded day has equal weight. Missing days are not filled. Change is between actual first/last entries in the selected period and names their dates; it is not a projected change. No weight-loss targets or medical conclusions are inferred.

Training cards show completed sessions/sets on their actual workout dates and Monday-based weekly counts (boundary weeks may be partial). Exercise selection compares matching identity, routine, rep range, per-side convention, equipment and unit. It shows actual heaviest completed load/reps, comparison with the previous comparable session, and weight×reps for fully recorded completed sets. Missing values are not zero; equipment and kg/lb groups are not combined. No estimated one-rep max is claimed. In-progress sessions, tombstones and conflict alternatives do not inflate progress. Alternative body-weight entries remain visible for review; edit the original to apply a correction and delete the unwanted alternative.

Weigh-ins use the existing private settings store and sync/version/conflict pipeline. JSON export includes their history and tombstones, and merge import accepts it plus older backups with the single preference value. Existing workouts and routines are unchanged.

## Choose a workout date and routine

Open **Train → Workout date → Routine → Start workout**. Every Day1–5 routine, including its customized template, is available on every calendar date; Day numbers are routine labels, not weekdays. Today can suggest a routine, but its button opens this chooser.

The selected date is saved literally as the local calendar date. Existing sessions are matched by that date and routine: resume an unfinished one, view a completed snapshot, or explicitly confirm a separate session. If several are unfinished, choose one rather than silently resuming the wrong record. Reloaded unfinished sessions remain in the chooser's unfinished/planned list. An unfinished session's date can be corrected; completed snapshots stay read-only.

Future dates create clearly labeled planned sessions. They cannot be completed before their workout date and are excluded from completed progress. Choose the real earlier date to log past training. Progress and weekly completion use that recorded date rather than the optional schedule or time of data entry.

### Exercise charts and app icon

In **Progress → Exercise charts**, select the comparable exercise and choose **Chart metric → Load, Reps or Volume**. Load is the heaviest fully recorded completed set; Reps is that set's repetitions, with its load available in Chart values. Volume sums weight×reps and plots only sessions with every completed set fully recorded, so missing data cannot create a false dip. Session dates drive the horizontal axis. Dots are observations; connecting lines do not claim measurements between sessions. A single point is a baseline, not a trend. Chart values provides exact dates, values and units in readable text. The body-weight chart remains directly under Progress → Body weight; log dated measurements to populate it.

The original simple blue dumbbell SVG is also rasterized into 192px, 512px and 180px Apple icons. Existing iOS Home Screen icons may stay cached even after app content refreshes; do not clear browser/app data to refresh an icon.
