# Steadily

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
- Private authenticated Pi sync with automatic retries every 30 seconds while the app is open/unlocked, record versions, idempotent retries and conflicting alternatives. An unconfigured or unavailable server never reports synced. No browser background-sync guarantee on iOS.
- JSON backup export and additive import. Differing IDs/content are preserved as alternatives. Settings are exported for reference but import leaves current settings unchanged. Treat exports as sensitive.

## Storage and conflict behavior

Browser edits are marked dirty in the same IndexedDB record write. Sync uploads dirty records with their last server version. The server serializes updates and atomically renames a private JSON file. Matching retries are no-ops. Stale changes become deterministically identified alternative records; neither version is overwritten. Deleted meal records are tombstones so reconnecting devices cannot silently resurrect them. Changes made during an in-flight sync are left dirty for the next pass. Alternatives in session history can be reviewed; advanced conflict resolution and undo UI are future work. Food/log alternatives remain separate visible entries and can double-count totals until manually reviewed. Browser tab locking prevents two tabs editing a stale local snapshot on browsers supporting Web Locks.

Browser storage is not app-encrypted and may be evicted; request persistence and keep backups. The Pi JSON database is not encrypted at rest. Atomic renaming protects partial writes, but power loss, SD-card failure and full disks still require backup/recovery planning. This is a single-person journal; the access key grants access to the entire journal. It is not a multi-user account system or a medically validated product.

## Food sources and coverage

[Open Food Facts API](https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/) is integrated through the same-origin Node server for international packaged foods and barcode lookup, without credentials. Explicit searches are rate limited; incomplete macro records are omitted. [Open Food Facts](https://world.openfoodfacts.org) community records are estimates and must be checked against labels. This does not provide exhaustive Indian/home-cooked food coverage. Household recipes and user-entered labels are the working path for those foods, with no invented nutrition database.

Food data has a separate license from MIT code: the OFF database is [ODbL](https://opendatacommons.org/licenses/odbl/1-0/), individual contents are Database Contents License; images are not used. Preserve attribution and assess share-alike obligations before redistributing a derived database. Private journal backups should not be posted publicly.

[USDA FoodData Central](https://fdc.nal.usda.gov/api-guide/) was evaluated: public-domain data and useful ingredient coverage, but requires a private API key. It is not integrated in this version. No key should be placed in browser code. Public food queries go to OFF through the Pi; journal data is not sent to food providers.

## Raspberry Pi deployment

See [PI-DEPLOYMENT.md](PI-DEPLOYMENT.md). Use private Tailscale Serve HTTPS and application authentication. Do not open router ports or enable Funnel. The public repository contains code only, never access keys, personal history, environment files or journal data.

## Interface and verification

Restrained system typography, generous spacing, 44px minimum buttons, bottom navigation, explicit labels and safe-area padding, informed by [Apple's interface guidance](https://developer.apple.com/design/tips/). Physical iPhone Safari installation/offline lifecycle and real Pi synchronization still need device acceptance testing on a physical device. Automated tests cover routine invariants, recipe math, progression gating, retry/conflict semantics and auth rejection; local browser checks cover session rendering and persistence. No claim of absolute security is made.

## Authentication and independent installations

Every installation generates its own random 256-bit access key; none is shipped in source. A key signs in only to that installation. On private HTTPS, sign-in exchanges the key for a 30-day HttpOnly, Secure, SameSite=Strict cookie scoped to the API. The browser app does not store the raw key. Exact Origin checks protect state-changing requests; cookies and authorization headers are never forwarded to food providers. Lock sync clears this browser's cookie but leaves its offline journal available. Rotate the installation key and restart to invalidate all sessions, including a stolen cookie. This intentionally simple personal installation has no multi-user accounts or individual-device revocation system. Only authorize devices you control.

Each person should run their own independent instance, data directory, private HTTPS hostname and generated key. Installing the frontend alone does not provide a private shared hosting service. See the repeatable installer in `deploy/install.sh`. The same-origin shell uses no third-party scripts. XSS defenses include escaped user text, typed record validation, CSP and explicit static file allowlisting. Device/browser compromise can still expose local journal data; this is not an encrypted vault or a guarantee against compromise.

Body weight is optional and labeled with its own unit. Switching units converts its numeric value and the default load increment; historical workout loads retain their original session units. Recipe ingredients and food portions remain in grams.
