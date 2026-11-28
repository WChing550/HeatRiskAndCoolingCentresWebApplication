# HeatSafe KL

HeatSafe KL is a web application for checking heat conditions and finding verified cooling centres in Kuala Lumpur. Residents can submit reports about heat-related issues in their neighbourhood. Administrators review those reports, maintain cooling centre records, and publish heat advisories.

The frontend uses React and Vite, the API runs on Express, and PostgreSQL stores account, centre, report, and weather records. The app uses Open-Meteo for current feels-like conditions, Leaflet with OpenStreetMap for centre maps, and Chart.js for trend charts.

## User module

Choose **Continue as public visitor** to view heat readings, trends, active advisories, and cooling centres. Create an account and sign in to submit reports and manage your profile.

- **Heat risk** shows the current feels-like temperature, air temperature, relative humidity, and recommended precautions. Use the Kuala Lumpur reading or allow location access for a reading near you.
- **Cooling centres** lets you search by centre name or address. Open a centre to see its photo gallery, operating hours, facilities, contact details, and map. Allow location access to get walking directions in Google Maps.
- **Submit report** accepts a description, category and location, with an optional photo. The existing report classifier can suggest a category from the description; users can choose a category manually.
- **My reports** shows which submissions are pending, approved, or rejected, along with any review notes.
- **Heat trends** charts the daily average feels-like temperature from stored readings.
- **My profile** lets you update your name, username, profile photo, and password.

## Admin module

Sign in with an administrator account to open the admin dashboard.

- **Overview and Heat Risk** show recent submissions, heat readings, and summary counts. Administrators can refresh the Kuala Lumpur reading or request a separate reading for their current location.
- **Cooling Centres** is where administrators add and edit facilities, update operating status, and manage photo galleries. Each centre can have up to 10 photos, cropped to a square before saving.
- **Centre Verification** records inspection outcomes, remarks, optional photo evidence, and the next inspection date. Pending, rejected, and expired centres are managed here. Only currently verified centres appear in the public directory.
- **Report Review** lets administrators approve or reject community reports and attach a review photo. Rejections require a reason that the submitter can read in **My reports**.
- **Heat Alerts** is used to draft, publish, and deactivate advisories. Published alerts appear to visitors during their scheduled time window.
- **User Management** lists accounts and their report histories. Administrators can deactivate or reactivate accounts.
- **Analytics** compares heat readings and report activity over 7, 30, or 90 days. **Export PDF** opens the browser’s print dialog, where you can choose **Save as PDF**.
- **Activity Log** lists recorded admin actions and can be filtered by module, action, or date.

### Add a cooling centre

1. In **Cooling Centres**, choose **Add centre** and enter the facility’s details.
2. Use **Verify address**, select the matching address, and check that the map pin marks the entrance people should use. Adjust the pin if needed and confirm the location.
3. Add and crop any photos, then save the centre. New entries start as **Pending**.
4. Open **Verification** and record an inspection. Select **Verified** and enter the next inspection date to list the centre publicly.

Use real facilities and check their opening hours and access before publishing them. Photos can be JPG, PNG, or WebP, up to 5 MB each.

## Run locally

Install Node.js 22 with npm and make sure you have a running PostgreSQL instance. Create an empty database named `heat_admin` or use another database name in your connection string.

### Start the API

From the project root, install the server dependencies.

```sh
cd server
npm ci
```

Create `server/.env` and fill in your database credentials and a random session secret. Open-Meteo current weather does not require an API key for this educational setup.

```dotenv
DATABASE_URL=postgresql://postgres:YOUR_DB_PASSWORD@localhost:5432/heat_admin
DATABASE_SSL=false
SESSION_SECRET=REPLACE_WITH_A_RANDOM_SECRET
AUTO_PUBLISH_FORECAST_ALERTS=false
FORECAST_ALERT_MIN_RISK=High
PYTHON_BIN=.venv/Scripts/python.exe
CLIENT_ORIGIN=http://localhost:5173
PORT=4000
```

Use `DATABASE_SSL=true` if your hosted PostgreSQL instance requires TLS. To generate a session secret, run `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Keep `.env` out of version control.

With the terminal still in `server`, initialize the database and start Express.

```sh
npm run db:init
node src/forecast.js migrate
npm run dev
```

The API health check is available at [localhost:4000/api/health](http://localhost:4000/api/health).

### Start the frontend

Open a second terminal at the project root.

```sh
cd client
npm ci
npm run dev
```

Open [localhost:5173](http://localhost:5173). Vite forwards `/api` and `/uploads` to the local Express server on port `4000`. If Vite starts on another port, update `CLIENT_ORIGIN` to match and restart the API.

### Enable password reset emails

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `MAIL_FROM` in `server/.env` using your mail provider’s settings. The SMTP port defaults to `587`. Password reset links use `CLIENT_ORIGIN`, so set it to the frontend address users can open.

### Keep the report classifier running

The existing report-classification API remains in the top-level `ml` folder. Its Python environment and trained report model are separate from the new weather environment in `server/.venv`. Keep your existing report setup and `ML_API_URL` setting. The root `npm run dev` command starts the client, Express API and report API together using the existing Windows report environment.

## Feels-like temperature and trends

The server reads apparent_temperature from the Open-Meteo GFS current-weather response. Risk bands use this feels-like value. The 72-hour forecast is produced by a separately trained model with historical apparent_temperature targets. Training and setup are described in TRAINING-AND-SETUP.txt delivered with this update. Automatic advisories cover predicted High risk within the next 24 hours.

| App risk level | Feels-like temperature |
| --- | --- |
| Low | 32°C or below |
| Moderate | Above 32°C and up to 40°C |
| High | Above 40°C |

The charts summarize readings saved when the app fetches weather. A date range with few readings reflects limited sampling.

## Deployment

Run `npm run build` in `client` to create `client/dist`. Start the API with `npm start` in `server` after initializing the deployment database. Serve the frontend over HTTPS and route `/api` and `/uploads` to Express on the same origin. Set `NODE_ENV=production` on the server and set `CLIENT_ORIGIN` to the public frontend address.

Uploaded files are saved in `server/uploads` by default. Use `UPLOAD_DIR` to point the API to persistent storage if your hosting platform replaces the application filesystem on redeploy.

## Project layout

```text
client/src/modules/user/   Public and signed-in user pages
client/src/modules/admin/  Admin pages and the shared cooling centre directory
client/src/components/     Shared UI, maps, and photo tools
server/src/               Express API, current feels-like readings and forecast jobs
server/sql/               PostgreSQL schema and feature migrations
server/ml/                Weather training, dataset and generated forecast models
ml/                       Existing report classifier and its API
```
