# Private Raspberry Pi installation

Use a supported 64-bit Linux system with Tailscale and Node 22 or later. Preserve existing services and inspect Serve configuration before deployment. Each installation uses independent credentials and private data.

## Installation

1. Install a maintained Node 22+ ARM64 runtime from the OS/vendor's supported distribution. Create a dedicated unprivileged `steadily` system user.
2. Copy reviewed code into `/opt/steadily`, owned by the administrator and readable by the service. Create `/var/lib/steadily` owned by the service with mode 0700. Do not copy development backups, `.git`, or secrets.
3. Create `/etc/steadily.env` with mode 0600. Set `HOST=127.0.0.1`, `PORT=5173`, `DATA_DIR=/var/lib/steadily`, `APP_ORIGIN=https://<pi-private-tailnet-hostname>`, and `SYNC_TOKEN` to a newly generated cryptographically random key (at least 32 characters, recommended 32 random bytes encoded as hex). Never commit or paste this key into issue reports. Transfer it privately to the owner's phone password manager. On HTTPS, the app exchanges the key for a protected 30-day cookie; the raw key is not persisted by app code.
4. Review and install the example systemd service. Its environment file is server-side only. Run a health check on loopback before any HTTPS proxy change.
5. Review current tailnet grants/ACLs so only the intended user/devices can reach the Pi's HTTPS service. Membership of the tailnet alone is not sufficient authorization: all private sync requests additionally require an authenticated session or the access key. The public shell contains no personal records. Do not enable Funnel or router forwarding.
6. Configure **Tailscale Serve**, e.g. `tailscale serve --bg http://127.0.0.1:5173`. This changes the Pi's Serve configuration and may request tailnet HTTPS enablement. Verify exact hostname, certificate and existing routes first. See [official Serve documentation](https://tailscale.com/docs/features/tailscale-serve). Keep Node on loopback; TLS ends at the trusted local Serve process. Do not deploy a directly exposed HTTP listener.
7. On iPhone with Tailscale connected, visit that private HTTPS hostname in Safari. Use Share → Add to Home Screen. Unlock Pi sync under You, make a synthetic session, disconnect, edit, reconnect and verify persistence and sync. Verify another device with no key cannot fetch records. Clear only synthetic data through normal controls after acceptance.

## Service example

See `deploy/steadily.service`; adjust Node executable path if needed. Service hardening is defense in depth, not a substitute for updates, access control and backups. The application token authorizes a single shared private journal, not multiple users. Rotate a compromised key by replacing the environment value and restarting; all existing signed browser sessions immediately stop working.

## Backup and updates

Back up `/var/lib/steadily/records.json` privately with restricted permissions and encrypted backup storage. Test recovery into a separate directory. Also export device JSON before updates. Stop the service before manual database restoration. Never put backups in the served application directory or repository.

Keep Node, Debian and Tailscale patched. To update app shell assets, bump the cache version in `sw.js`; the new worker activates once older tabs close. Keep the old source version available for rollback. Do not clear IndexedDB during updates. JSON sync is suitable for a small personal journal; large multi-user workloads need a transactional database and individual authentication.

## Remaining acceptance checks

- Verify service permissions, private HTTPS and explicit tailnet access rules.
- Test two-device offline edits, duplicate retries, deletion tombstones, import alternatives and recovery.
- Test physical iPhone safe areas, numeric keyboard, storage persistence, homescreen icon and offline relaunch.
- Verify OFF connectivity from the Pi; provider outages leave custom/saved foods usable.

## Repeatable service installer

After Node is installed and the source is cloned, review and run:

```sh
sudo APP_ORIGIN=https://your-private-host.tailnet.ts.net NODE_BINARY=/absolute/path/to/node bash deploy/install.sh
```

The script creates a service account, copies only application files, generates a fresh server-side key on first installation, preserves existing environment/data on updates, and starts the loopback service. It does not enable Tailscale Serve or alter tailnet policy. Confirm `APP_ORIGIN` in the private environment file when changing hostnames. To retrieve the sign-in key privately, the machine owner can read `/etc/steadily.env` over SSH; do not put its contents into public chat, logs or screenshots. Store it in a password manager.
