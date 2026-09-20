// Only enable behind the local Tailscale Serve HTTPS reverse proxy.
// Local processes on the server are trusted; loopback is not process authentication.
export function serveAuthConfig(env) {
  const mode = env.SYNC_AUTH || "token";
  if (!["token", "tailscale"].includes(mode)) throw Error("Unknown SYNC_AUTH");
  if (mode === "token") return { mode };
  const proxy = env.TAILSCALE_PROXY_ADDRESS;
  const logins = (env.TAILSCALE_ALLOWED_LOGINS || "").split(",").map(x => x.trim()).filter(Boolean);
  const origin = new URL(env.APP_ORIGIN || "invalid:");
  if (env.HOST !== "127.0.0.1" || proxy !== "127.0.0.1" ||
      origin.protocol !== "https:" || origin.origin !== env.APP_ORIGIN ||
      !logins.length || logins.some(x => !/^[^\s,;=]+@[^\s,;=]+$/.test(x)))
    throw Error("Tailscale auth requires IPv4 loopback, exact HTTPS origin and explicit login allowlist");
  return { mode, proxy, logins: new Set(logins) };
}

export function trustedServeIdentity(req, config) {
  if (config.mode !== "tailscale" || req.socket.remoteAddress !== config.proxy) return false;
  const login = req.headers["tailscale-user-login"];
  // Exact match; reject duplicated or combined headers instead of guessing identity.
  const occurrences = (req.rawHeaders || []).filter((x, i) => i % 2 === 0 && x.toLowerCase() === "tailscale-user-login").length;
  return occurrences === 1 && typeof login === "string" && config.logins.has(login);
}
