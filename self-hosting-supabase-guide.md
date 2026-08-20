# Self-hosting Supabase for Gadget Tracker (home PC)

This keeps your entire existing stack — `supabase/schema.sql`, the RLS
policies, `js/core/Auth.js`, `js/core/SupabaseStore.js`, the
employee-portal login — completely unchanged. You're not switching
products, just running the same Supabase services (Postgres, GoTrue
Auth, PostgREST, Realtime) on your own machine instead of Supabase's
cloud. The only file that changes at the end is `supabaseConfig.js`.

---

## 0. Check your PC can actually run this

Supabase's self-hosted stack is ~13 Docker containers. Minimum: **4 GB
RAM / 2 CPU cores**. Recommended for something other people depend on:
**8 GB RAM / 4 cores**, plus a few GB of free disk (Postgres data grows
over time, and Docker images alone are a couple GB).

If this PC also runs XAMPP or other services you use daily, make sure
those aren't already eating most of the RAM.

---

## 1. Install Docker

- **Windows**: install **Docker Desktop**. It requires WSL2 — the
  installer will prompt you to enable it if it isn't already. Once
  installed, do the rest of this guide from a **WSL2 terminal** (or Git
  Bash) rather than plain PowerShell/CMD — the setup script is a bash
  script.
- **Mac**: install Docker Desktop for Mac.
- **Linux**: install Docker Engine + the Docker Compose plugin directly
  (no Docker Desktop needed).

Confirm it works:
```bash
docker --version
docker compose version
```

---

## 2. Get the Supabase stack

```bash
git clone --depth 1 https://github.com/supabase/supabase
cd supabase/docker
cp .env.example .env
```

---

## 3. Generate real secrets — do not skip this

The `.env.example` file ships with **publicly known placeholder
values** (the exact same class of mistake we just fixed in your
`EMPLOYEE_PORTAL_PASSWORD` — a real credential sitting in the repo as a
literal placeholder). Anyone who's ever looked at the Supabase repo
knows the default `POSTGRES_PASSWORD`, `JWT_SECRET`, etc. Generate your
own before ever starting the stack:

```bash
# from supabase/docker
chmod +x generate-keys.sh
./generate-keys.sh
```

This writes a fresh `JWT_SECRET`, `ANON_KEY`, and `SERVICE_ROLE_KEY`
into `.env` for you (the anon/service keys are JWTs *derived from* the
secret — don't hand-edit them separately from it).

Still manually set, in `.env`:
```
POSTGRES_PASSWORD=<something long and random — this is your database root password>
DASHBOARD_USERNAME=<pick your own>
DASHBOARD_PASSWORD=<pick your own — this guards Supabase Studio>
```

Leave `SITE_URL` / `API_EXTERNAL_URL` as `http://localhost:8000` for
now — you'll revisit these in step 7 once you've picked how the app
reaches this PC from outside your network.

---

## 4. Start it

```bash
docker compose up -d
docker compose ps
```

Every service should show `running`/`healthy` after a minute or two
(Postgres and the auth/storage services take a moment to come up).

Open **http://localhost:3000** — that's Supabase Studio, logging in
with the `DASHBOARD_USERNAME`/`PASSWORD` you set. This is the same UI
you've been using on Supabase's cloud dashboard, just pointed at your
own Postgres now.

---

## 5. Run your existing schema

In Studio's SQL Editor — same as on the cloud project — run, **in
order**:

1. The whole `supabase/schema.sql` from your project (this is the
   version I already fixed, with the `pgcrypto`/`extensions` schema fix
   from earlier)
2. `supabase/seed.sql`

Nothing about these files needs to change for self-hosting — they're
plain Postgres SQL, and this is plain Postgres.

---

## 6. Point the app at your self-hosted instance

In `env.js` (project root — see that file's own doc comment; it's this
project's ".env" equivalent since there's no bundler to read a real one),
this is the only real config change in this whole migration:

```js
window.__ENV__ = {
  SUPABASE_URL: 'http://localhost:8000',   // → your Kong gateway
  SUPABASE_ANON_KEY: '<the ANON_KEY from your self-hosted .env>'
};
```

(Port `8000` is Kong, the API gateway that routes to Postgres/Auth/
Storage/Realtime underneath — that's the endpoint `supabase-js` always
talks to, cloud or self-hosted.)

At this point, if you open the app from *this same PC*, sign-up/sign-in
should work exactly as before, including the employee-portal flow —
nothing in `Auth.js` or `AuthController.js` needed to change.

---

## 7. Make it reachable from outside this PC

`localhost` only works on the machine running Docker. For anyone else
— a warehouse employee on their own device — to sign in, this PC needs
to be reachable over the internet. You have two real options:

### Option A — Cloudflare Tunnel (recommended)

No port-forwarding on your router, your home IP is never exposed
directly, and you get free HTTPS. You install `cloudflared` on this
PC, it opens an outbound connection to Cloudflare, and Cloudflare
routes a domain/subdomain you control to it.

Rough shape (Cloudflare's own dashboard walks you through the exact
current steps under Zero Trust → Tunnels):
1. Add a domain to Cloudflare (a cheap/free subdomain works — you don't
   need to buy anything new if you already have any domain).
2. Create a tunnel, install `cloudflared` as a service on this PC.
3. Point the tunnel at `http://localhost:8000` (your Kong gateway).
4. Update `.env`'s `SITE_URL`/`API_EXTERNAL_URL` and
   `SUPABASE_PUBLIC_URL` to your new `https://` tunnel address, then
   `docker compose down && docker compose up -d` to pick it up.
5. Update `SUPABASE_URL` in `supabaseConfig.js` to that same
   `https://` address.

### Option B — Port forwarding + Dynamic DNS

Simpler to understand, meaningfully riskier: you forward ports on your
home router directly to this PC, and use a free dynamic-DNS service
(e.g. DuckDNS) to get a stable hostname since home IPs usually change.

The real risk isn't the concept — it's that your home network now has
an internet-facing service on it, on a residential connection with no
dedicated firewall team watching it, running 13 containers you're
solely responsible for patching. If you go this route, put a reverse
proxy (Caddy or Nginx Proxy Manager) in front for TLS rather than
exposing Kong's raw HTTP port directly.

**Recommendation: use Option A.** It's free, avoids exposing your home
IP or opening router ports at all, and gets you HTTPS without a
separate certificate setup.

---

## 8. What's now genuinely on you (read this once, seriously)

This is the actual trade for "free" — flagging it plainly rather than
letting it be a surprise later:

- **Uptime is your PC's uptime.** No auto-pause like the free cloud
  tier (that's gone, which is good) — but also no one else keeping the
  lights on. Power outage, PC restart, ISP hiccup, Windows update
  reboot → the app is down until this machine and Docker come back up
  and the containers restart. Docker Compose restarts containers
  automatically after a reboot **only if** you set
  `restart: unless-stopped` (already the default in this compose file)
  **and** Docker Desktop itself is set to start on login.
- **Backups are entirely your job.** Same gap as the free cloud tier
  had, except now there's no vendor to eventually add it for you.
  Minimum viable version:
  ```bash
  docker exec -t supabase-db pg_dump -U postgres postgres > backup-$(date +%F).sql
  ```
  Put that in a scheduled task (Windows Task Scheduler / cron) writing
  somewhere *off this PC* — a backup that lives on the same machine as
  the database doesn't protect you from the PC itself failing.
- **Security updates are your job.** `docker compose pull && docker
  compose up -d` periodically to pick up patched images — cloud
  Supabase does this for you invisibly; self-hosted doesn't.
- **This machine needs to be an "always-on PC" in practice, not just in
  intent** — sleep/hibernate settings, Windows Update auto-restarts,
  and anything else that might take it offline unexpectedly are all
  now things a live login system depends on.

None of this is a reason not to self-host — it's a legitimate, common
setup for a small internal tool. It's just a different job than "click
deploy and forget," and worth going in with eyes open given this app
already has real employees signing into it.
