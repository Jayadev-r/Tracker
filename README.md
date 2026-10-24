# PaisaTrack

A private, offline-first personal financial tracker designed for iPhone 17 (PWA) and desktop browsers.

PaisaTrack provides quick natural-language transaction entry, deterministic review cards, an interactive monthly calendar, a rich financial dashboard, category analytics, budget tracking, and reliable JSON backup/restore. All data remains exclusively on your device.

---

## 1. Prerequisites and Installation

### Prerequisites
- **Node.js:** v20+ recommended (verified on v24.13.0)
- **npm:** v10+ recommended (verified on v11.6.2)

### Install Dependencies
```bash
npm install
```

---

## 2. Running Locally

### Development Mode
To start the Vite local development server with hot module replacement:
```bash
npm run dev
```
By default, the server runs at `http://localhost:5173`.

---

## 3. Verification & Build Commands

| Command | Purpose |
|---|---|
| `npm run typecheck` | Validates TypeScript types across the entire project (`tsc --noEmit`). |
| `npm test` | Runs the complete unit and integration test suite (Vitest). |
| `npm run test:watch` | Runs Vitest in interactive watch mode for active development. |
| `npm run build` | Compiles and bundles production-ready static assets and service worker into `dist/`. |
| `npm run preview` | Starts a local production HTTP server to test the generated `dist/` bundle. |

---

## 4. Serving the Production Build for PWA Testing

To test the Progressive Web App manifest, service worker, and offline caching under realistic production conditions:

1. Build the production bundle:
   ```bash
   npm run build
   ```
2. Serve the production bundle:
   ```bash
   npm run preview
   ```
3. Open `http://localhost:4173` in Chrome, Safari, or Edge.
4. Open Developer Tools → **Application** tab:
   - Check **Manifest**: Verify application name, icons, start URL, theme color, and standalone display.
   - Check **Service Workers**: Confirm `sw.js` is active and running.
   - Under **Cache Storage**: Confirm precached production assets (`index.html`, bundles, icons).
   - In the **Network** tab, toggle **Offline** and reload the page: PaisaTrack will load instantly from the service worker cache with full read and write functionality.

---

## 5. Installing on an iPhone (Safari Add to Home Screen)

To install PaisaTrack on an iPhone 17 as a standalone home screen app:

1. **Deploy to an HTTPS Origin:**
   - Safari on iOS requires a secure HTTPS context to register service workers and enable standalone PWA mode.
   - Deploy the `dist/` directory to an HTTPS-enabled static host (such as Cloudflare Pages, Vercel, Netlify, or a secure local reverse proxy like `caddy` / `mkcert`).
2. **Open in Safari:**
   - On the iPhone, launch **Safari** and navigate to your deployed HTTPS URL.
3. **Add to Home Screen:**
   - Tap the **Share** button (the square icon with an upward arrow at the bottom of Safari).
   - Scroll down and tap **Add to Home Screen**.
   - Confirm the app title (`PaisaTrack`) and tap **Add**.
4. **Launch Standalone:**
   - The PaisaTrack icon will appear on your iPhone Home Screen.
   - Tap the icon to launch in full standalone mode without Safari address bars or browser chrome.
   - Safe areas (Dynamic Island / notch and Home Indicator) and touch targets ($\ge 44 \times 44$px) are fully accommodated.

---

## 6. How Offline Operation Works

PaisaTrack is architected from the ground up as a **local-first** application:

1. **Application Shell Caching:**
   - During your first visit, the service worker precaches all application HTML, CSS, JavaScript, fonts, and icons.
   - When offline or during spotty mobile connectivity, the service worker immediately serves the cached application shell.
2. **Local Data Persistence (IndexedDB):**
   - Financial transactions, accounts, categories, budgets, and preferences are stored exclusively in the browser's local **IndexedDB** database (`paisatrack`).
   - Every operation—adding a transaction, editing, deleting, browsing the calendar, calculating monthly budgets, and viewing dashboard insights—runs entirely in local memory against IndexedDB.
   - **No network connection is ever required** to record or inspect your finances.
3. **Visual Indicator:**
   - If network connectivity drops, PaisaTrack displays an amber **Offline** badge in the header to confirm that the app is operating in local storage mode.

---

## 7. How Application Updates Are Delivered and Activated

- PaisaTrack uses `vite-plugin-pwa` with `registerType: 'autoUpdate'`.
- When an updated version of PaisaTrack is deployed to the server, the service worker checks for updates in the background during network availability.
- When new static assets are detected:
  1. The new service worker downloads the revised bundles.
  2. The new service worker activates (`skipWaiting` and `clientsClaim`).
  3. Stale cache entries from previous versions are purged automatically (`cleanupOutdatedCaches`).
  4. On the next visit or navigation, the updated version is presented seamlessly.
- **Your financial data is never touched or reset by app shell updates.** IndexedDB remains intact across code deployments.

---

## 8. Exporting JSON Backups (Mandatory Safety Practice)

Because PaisaTrack stores records locally in your browser's IndexedDB, **you are the sole custodian of your data**. 

> [!IMPORTANT]
> Always export a manual backup before clearing browser cache, switching devices, or updating your operating system.

### Steps to Export:
1. Open the **Settings** tab.
2. Select **Backup** from the top pill navigation.
3. Tap **Export JSON Backup**.
4. Save the generated `.json` file to a secure location (e.g., iPhone Files app, iCloud Drive, or your computer).
5. You can also tap **Export CSV** to download a spreadsheet-compatible transaction history.

---

## 9. Restoring a Previously Exported Backup

PaisaTrack provides an atomic, pre-validated restore engine:

1. Open **Settings** → **Backup**.
2. Tap **Select Backup File (.json)**.
3. The restore validator will inspect the file and display:
   - File format version and export date.
   - Counts of categories, accounts, transactions, and budgets.
   - Verification of referential integrity, transfer pairs, and refund links.
4. Tap **Restore Backup** and confirm the destructive replacement warning.
5. The restore executes inside a single atomic Dexie readwrite transaction. If the file is valid, the database is restored and all views refresh immediately. If an error occurs, the transaction rolls back cleanly without partial data corruption.

---

## 10. Important Storage Context & iOS Limitations

1. **Origin & Browser Profile Isolation:**
   - IndexedDB data belongs strictly to the specific browser and origin (domain + protocol) where it was entered.
   - Data entered in Safari will **not** appear in Chrome, and data entered in an installed PWA context is kept isolated by iOS from Safari browser tabs.
   - Reinstalling the PWA or clearing Safari website data will erase IndexedDB storage. Always keep external JSON backups.
2. **iOS Safari Storage Eviction Rules:**
   - Under severe device storage pressure, iOS Safari may evict client-side storage for websites that have not been opened for an extended period. Installing the app to the Home Screen and regular use mitigates eviction, but manual backups remain essential.
3. **Device Testing Notice:**
   - While the app has been verified against iPhone 17 specifications, viewports, touch targets, and simulated mobile conditions, users deploying to personal physical hardware should perform a test transaction, export a backup, and verify the file saves to their iPhone Files app.

---

## 11. Core Financial Rules Summary

- **Currency:** Indian Rupee (INR, ₹).
- **Exact Money Representation:** Integer paise ($1\text{ Rupee} = 100\text{ paise}$) internally; floating-point math is strictly forbidden for money.
- **Transfers:** Always created in atomic pairs (`from_source` and `to_destination`) linked by `transferGroupId`. Transfers are excluded from income and expense totals.
- **Refunds:** Linked to the original expense via `refundOfId`. Refunds reduce net expense and cannot exceed the original expense amount.
- **Budgets:** Evaluated against qualifying net expenses with 80% warning and 100%+ over-budget threshold alerts.
