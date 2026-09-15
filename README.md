# Sales Map

A map-based prospecting tool for the sales team. It shows every restaurant and company we
service or want to service, color-coded by customer status, and finds new restaurants in
any area. The whole team works from **one shared live list**: give them a link, and every
edit shows up on everyone's screen within a second. No accounts or logins.

It runs entirely on free hosted services, so it works around the clock without anyone's
computer being on:

- **GitHub Pages** serves the app itself (this repository).
- **Firebase Realtime Database** (Google, free "Spark" plan) stores the shared customer list.
- **OpenStreetMap** provides the map, address lookup, and restaurant search.

## Features

- **Find Restaurants** – search any city, ZIP, or address (or the current map view) for
  restaurants, fast food, cafes, bars and other food businesses within a chosen radius.
  Add them to the list one at a time or all at once.
- **Add Customer** – manually enter a restaurant or company by name and address. The
  address is located on the map automatically, or click the map to place it.
- **Customer list** – filter by name, address, or status. Click a customer to jump to it on
  the map. Change status straight from the map pin's popup.
- **Statuses** (each has its own pin color): Not a Customer · Talked To ·
  Service Grease Trap (No Contract) · Service Oil (No Contract) ·
  Service Grease Trap (Contract) · Service Oil (Contract) · Service Both Oil and Grease
- **Share link** – one button gives you the link to send to the team.
- **Export / Import** – download the list as JSON (backup) or CSV (spreadsheet).
- **Works on phones** – the layout adapts to small screens for salespeople in the field.

---

## One-time setup (about 15 minutes)

You do this once. Afterwards nobody needs to touch Firebase or GitHub again.

### Step 1 – Create the free database

1. Go to <https://console.firebase.google.com/> and sign in with a Google account.
2. Click **Create a project** (or **Add project**). Name it anything, e.g. `sales-map`.
   You can turn off Google Analytics when asked. Click **Create project**.
3. In the left menu open **Build → Realtime Database** and click **Create Database**.
4. Choose the location closest to you (e.g. *United States*). When asked about security
   rules, choose **Start in locked mode**. Click **Enable**.
5. Open the **Rules** tab of the database. Delete everything there, paste the contents of
   the file [`firebase.rules.json`](firebase.rules.json) from this repository, and click
   **Publish**.

   These rules make the data reachable only by someone who has the long random team key
   in the link, and stop anyone from listing all maps.

### Step 2 – Connect the app to the database

1. In the Firebase console click the gear icon next to **Project Overview** →
   **Project settings**.
2. Scroll down to **Your apps** and click the web icon (`</>`). Give the app a nickname
   (e.g. `sales-map`), leave Firebase Hosting unticked, click **Register app**.
3. Firebase shows a code block containing `const firebaseConfig = { ... }`. Copy the part
   between the braces.
4. In this repository open [`js/config.js`](js/config.js). Replace `firebase: null` with
   `firebase: { ...paste here... }` so it looks like the example at the top of that file.
   Make sure the pasted config includes a `databaseURL` line. If it does not, copy the URL
   shown at the top of the Realtime Database page (it looks like
   `https://sales-map-xxxxx-default-rtdb.firebaseio.com`) and add it as
   `databaseURL: "https://...",`.
5. Commit the change (on GitHub: open the file, click the pencil icon, paste, and
   **Commit changes**).

   The config is safe to publish. It only identifies the project; the database rules and the
   secret team key are what protect the data.

### Step 3 – Publish the app on GitHub Pages

GitHub Pages is free only for **public** repositories. If the repository is private, the
Pages settings page shows no *Build and deployment* section, just a note about upgrading.
Making it public is safe: the repository contains only the app code and the Firebase
project id, not the customer data or the secret team key.

1. Open **Settings → General**, scroll to the bottom (*Danger Zone*), click
   **Change visibility → Make public**, and confirm. (Alternatively, a paid GitHub Pro plan
   allows Pages on private repositories.)
2. Open **Settings → Pages**.
3. Under *Build and deployment* choose **Deploy from a branch**. In the *Branch* dropdown
   pick the repository's default branch (the one already selected when you view the code,
   currently `claude/sleepy-hamilton-y2c30w`), keep the `/ (root)` folder, and click
   **Save**.
4. After a minute or two the page shows the address, something like
   `https://<your-username>.github.io/Sale-Map/`. Refresh the settings page if it does not
   appear right away.

### Step 4 – Create the shared map and send the link

1. Open that address. Click **Create a new shared map**. The address bar now ends with
   `?team=` followed by a long random key.
2. Click **Share link** in the top bar, copy the link, and send it to your sales team.
   Ask them to bookmark it or add it to their phone's home screen.

That is it. Everyone opening the link sees the same customers, and every change is live
for everyone else.

If you had customers saved on a device before setting up sharing, the app offers a
one-click **Upload to shared map** the first time you open the shared link on that device.

---

## Good to know

- **Who can edit?** Anyone with the link. There are no accounts, which is what keeps it
  simple. Treat the link like a shared password: only send it to people on the team. If it
  ever leaks, create a new shared map, export/import the customers, and send the new link.
- **Cost.** Firebase's free plan allows 1 GB of storage and 10 GB of downloads a month. A
  customer list of even several thousand entries uses a tiny fraction of that.
- **Backups.** Use **Export JSON** now and then. **Import JSON** merges a backup back in.
- **Offline.** If a phone loses signal, the app keeps working with what it already loaded
  and pushes changes when the connection returns (shown as *Live* / *Offline* at the top).
- **Address lookup and restaurant search** use free community services with fair-use
  limits, so lookups run one per second. If a search fails, wait a moment and try again.
- **Without Firebase** (leaving `firebase: null` in `js/config.js`) the app still works,
  but each device keeps its own list.

## Project layout

```
index.html                 page layout
css/styles.css             styling
js/config.js               Firebase connection settings (the only file you edit)
js/statuses.js             the status list and colors (edit here to add or rename statuses)
js/store.js                data layer: shared (Firebase) or browser-only storage
js/storage.js              localStorage helpers, record validation, CSV export
js/geo.js                  address lookup and restaurant search (OpenStreetMap)
js/app.js                  map, lists, forms, and all interactions
firebase.rules.json        database security rules to paste into Firebase
vendor/                    Leaflet and Firebase libraries, bundled so no CDN is needed
```
