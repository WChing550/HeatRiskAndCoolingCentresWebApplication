# HeatSafe KL — Heat Risk & Cooling Centre Web Application

A React + Express + PostgreSQL starter with **User** and **Admin** modules, based on the two uploaded project reports.

## Features
- User: registration/login, profile/password management, current heat index, location permission, Kuala Lumpur cooling-centre map/list, report submission with optional photo, report tracking, trend charts.
- Admin: dashboard metrics, weather refresh, cooling-centre create/edit/delete/status, one centre photo, report review, approve/reject with review note and optional review photo.
- Cooling-centre records are constrained to Kuala Lumpur coordinates. No invented centre records are seeded; add only real-world facilities after verifying their address, hours, contact, accessibility and status.

## Run locally
1. Install Node.js 20+ and PostgreSQL.
2. Create a PostgreSQL database named `heat_admin`.
3. In a terminal:
   ```bash
   cd server
   npm install
   copy .env.example .env
   ```
4. Edit `server/.env` with your own database URL and a random `SESSION_SECRET`. Add an OpenWeather API key for live weather.
5. Run `npm run db:init`, then `npm run db:seed`, then `npm run dev`.
6. In a second terminal:
   ```bash
   cd client
   npm install
   npm run dev
   ```
7. Open the Vite URL shown in the terminal.

Demo admin (change immediately): `admin@example.com` / `Admin!Password1213`.

## Images & deployment
Images are validated as JPG/PNG/WebP up to 5 MB and saved to `server/uploads` for local development. Free hosting filesystems may be ephemeral; configure durable object storage (e.g. Cloudinary/S3-compatible storage) before accepting real public uploads. Keep `.env` and all credentials out of GitHub.

For Neon, set `DATABASE_URL` to its connection string and `DATABASE_SSL=true`. Deploy the server with root `server`, build `npm install`, start `npm start`. Deploy the client with root `client`, build `npm install && npm run build`, publish `dist`, and set `VITE_API_BASE_URL=https://YOUR-API-HOST`. Set backend `CLIENT_ORIGIN` to the exact frontend URL. The backend free tier may sleep; first request can take a while.

Heat Index thresholds follow the User Module report: Low ≤32°C, Moderate >32°C to 40°C, High >40°C. This is informational, not an official emergency warning. Validate, test, secure and review privacy/backup procedures before real-world use.


## Refactoring structure (first safe pass)

The frontend now separates reusable UI and authentication from the main application:

- `client/src/App.jsx` — application state, navigation, and existing page workflows.
- `client/src/pages/auth/Auth.jsx` — login and registration UI.
- `client/src/components/Shared.jsx` — shared form fields, photo picker, panels, metrics, report table/cards, and account password panel.
- `client/src/components/LocationSearchMap.jsx` — location search, map selection, coordinates, and address lookup.
- `client/src/lib/api.js` — shared API helpers.

The page workflows still share state and handlers in `App.jsx`. They should be extracted one submodule at a time in a follow-up pass, passing explicit props and testing after each extraction. This avoids changing endpoint behavior or database operations all at once.
