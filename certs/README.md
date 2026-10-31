# One-time HTTPS setup (needed for phone geolocation)

Geolocation only works on a "secure context" — HTTPS, or exactly `localhost`.
`http://<your-lan-ip>` doesn't count, which is why your phone's browser never
even shows the Allow/Deny prompt. This folder holds one shared, locally-trusted
cert that both the frontend (Vite) and backend (Express) read, so everything
runs on `https://` instead.

## 1. Install mkcert (one time, on your Mac)

```bash
brew install mkcert
mkcert -install
```

The `-install` step adds a local Certificate Authority to your Mac's trust
store, so Safari/Chrome on the Mac trust certs mkcert issues without warnings.

## 2. Generate the cert (one time, from this `certs/` folder)

```bash
cd certs
mkcert -key-file dev-key.pem -cert-file dev-cert.pem localhost 127.0.0.1 172.20.10.5
```

Replace `172.20.10.5` with your current Mac LAN IP if it's changed
(`ipconfig getifaddr en0`). If your IP changes later (e.g. different Wi-Fi),
just re-run this command with the new IP — it overwrites the two files.

## 3. Trust the cert on your phone (optional, avoids a browser warning)

Without this step, your phone's browser will show an "unsafe/not private"
warning the first time — tapping through it ("Advanced" → "Proceed") still
works fine for geolocation. To remove the warning entirely:

```bash
mkcert -CAROOT
```

That prints a folder path containing `rootCA.pem`. AirDrop or email that file
to your phone, open it, and install/trust it:
- **iPhone:** Settings → General → VPN & Device Management → install the
  profile, then Settings → General → About → Certificate Trust Settings →
  enable full trust for it.
- **Android:** Settings → Security → Encryption & credentials → Install a
  certificate → CA certificate.

## Notes

- `dev-key.pem` and `dev-cert.pem` are gitignored — never commit them.
- Both `vite.config.js` and `lablybackend/index.js` automatically detect these
  files and switch to HTTPS when present, and fall back to plain HTTP if you
  haven't run step 2 yet — so `npm run dev` won't break in the meantime.
