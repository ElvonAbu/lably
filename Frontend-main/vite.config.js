import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// Reads the shared cert pair generated once via the mkcert CLI (see
// /certs/README.md at the project root). Geolocation requires a "secure
// context" (HTTPS, or exactly "localhost") — over plain http://<lan-ip>
// your phone's browser silently blocks navigator.geolocation and never
// shows the Allow/Deny prompt. Falls back to plain HTTP if certs aren't
// generated yet, so `npm run dev` still works before you run mkcert.
const certDir = path.resolve(__dirname, '../certs')
const keyPath = path.join(certDir, 'dev-key.pem')
const certPath = path.join(certDir, 'dev-cert.pem')
const hasCerts = fs.existsSync(keyPath) && fs.existsSync(certPath)

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // listen on 0.0.0.0 so your phone (same Wi-Fi) can reach it
    port: 5173,
    https: hasCerts
      ? {
          key: fs.readFileSync(keyPath),
          cert: fs.readFileSync(certPath),
        }
      : false,
  },
})