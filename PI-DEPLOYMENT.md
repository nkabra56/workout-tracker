# Private Raspberry Pi installation

Use Node 22+ and Tailscale on a maintained 64-bit Linux system. Review existing services and Serve routes before changing them. Each installation owns a separate journal.

## Owner-only automatic sync

1. Determine the intended owner's exact Tailscale login using the Tailscale admin console or the User profile in tailscale status --json. Do not assume every tailnet member is an owner. Tagged devices do not carry user identity headers.
2. Set server-only configuration in /etc/steadily.env (root-owned, mode 0600): HOST=127.0.0.1, PORT=5173, DATA_DIR=/var/lib/steadily, APP_ORIGIN=https://your-private-host.tailnet.ts.net, SYNC_AUTH=tailscale, TAILSCALE_PROXY_ADDRESS=127.0.0.1, and TAILSCALE_ALLOWED_LOGINS to the exact approved login. Multiple explicit logins may be comma-separated; all share the same journal. Never commit real identities or data.
3. Review deploy/install.sh and deploy/steadily.service. For a new install run sudo with APP_ORIGIN, NODE_BINARY and TAILSCALE_ALLOWED_LOGINS explicitly set, then bash deploy/install.sh. The installer preserves existing environment and records on updates; to migrate an existing installation, update the server environment before restarting. The script copies only application files, creates an unprivileged service account, restricts data to mode 0700 and starts the loopback service.
4. Review tailnet access rules and current Serve routes, then configure private HTTPS with tailscale serve --bg http://127.0.0.1:5173. Never enable Funnel or router forwarding. Verify the actual hostname/certificate. The installer does not change Tailscale policy or Serve routes.
5. With the owner's Tailscale connection active, open the private HTTPS URL in Safari and use Share → Add to Home Screen. Sync starts automatically: no app key, unlock, toggle or monthly session. Existing device data is preserved. Wait for Synced with Pi. Offline edits stay local and retry after writes, reconnect, foreground or every 30 seconds while open. iOS does not guarantee background execution.

## Trust boundary and verification

[Official Serve documentation](https://tailscale.com/docs/features/tailscale-serve#identity-headers) describes how Serve removes incoming identity headers and injects the connected user's login. The application trusts that header only from its configured loopback proxy, requires one exact allowlisted login, and refuses an unsafe listener/origin configuration. Missing identity, tagged devices and non-owners fail closed. Legacy bearer tokens/cookies are ignored in Tailscale mode; session expiry is irrelevant. Exact Origin and JSON POST checks remain enforced.

The loopback boundary trusts other processes and administrators on the Pi: local malware can forge a request. It does not prove the peer process is tailscaled. Keep the Pi trusted and patched. A compromised owner device/account can access this journal. Device revocation belongs in Tailscale; browser storage and the Pi database are not app-encrypted. Local offline copies persist even if network authorization is revoked.

Verify successful HTTPS sync with no Authorization or Cookie headers, rejection of missing/unapproved identity on loopback, rejection of cross-origin requests, loopback-only listener, and no Funnel configuration. Test offline edits/reconnect and separate devices without deleting site data. Auth tests simulate other users; testing a second real tailnet identity requires a separate account/device.

## Environments without trusted Serve

Unset SYNC_AUTH or explicitly set token to retain the authenticated compatibility API. Set a cryptographically random SYNC_TOKEN of at least 32 characters; missing credentials return 503. The API supports bearer authorization or an administrator-provisioned protected cookie via /api/unlock. There is no app key-entry UI, anonymous mode, or fallback from failed Tailscale identity to tokens. For automatic browser use, configure private Serve as above. Do not enable identity mode behind an arbitrary proxy or a publicly reachable listener.

## Backup and updates

Back up /var/lib/steadily/records.json privately with restricted permissions and encrypted storage. Test restore separately. Export device JSON before risky maintenance; never commit backups. Stop the service before manual restoration. Updates preserve IndexedDB and server records. Bump the service-worker cache for app-shell changes, then reload the installed app (a second reload can be needed after worker installation). Never clear site data to refresh assets.

Keep Node, Debian and Tailscale patched. The JSON database uses atomic renames and serialized writes; storage failure still requires recovery from backups. This is a small single-person journal, not a multi-tenant service.
