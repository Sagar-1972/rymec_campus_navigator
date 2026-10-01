# RYMEC Campus Navigator — Shared Location Sync Build

This build keeps the existing Campus Navigator UI and exact-location tools, and adds shared cross-device location storage using Vercel Blob Private Storage.

## Vercel setup

1. Connect the project to a Vercel Blob store.
2. Create the store as **Private**.
3. Enable **Add a read-write token env var to this connection** if Vercel offers that option. New Vercel connections may instead use OIDC automatically; the current `@vercel/blob` SDK supports both.
4. Keep the existing `ADMIN_PASSWORD` environment variable.
5. Redeploy after connecting the store so the deployment receives the storage configuration.

## How it works

- Admin login is handled by `/api/admin-login`.
- A short-lived admin token is issued after successful login.
- `/api/campus-locations` reads and writes `campus/locations.json` in the private Blob store.
- Reads use `useCache: false` so the latest saved coordinates are visible immediately across devices.
- Browser `localStorage` remains only as a fallback/cache; it is not the shared database.

## Exact location tools

- Pick Location on satellite map
- Click the map to set coordinates
- Drag the marker to fine-tune coordinates
- Use My GPS when browser location permission is granted
- Manual latitude/longitude editing remains available

## Important

Do not store the admin password in source code. Keep `ADMIN_PASSWORD` in Vercel Environment Variables.


## Indoor floor guides
The app now includes indoor floor-plan references derived from the supplied RYMEC building PDFs. Location details whose `building` matches a supported guide show an **Indoor Guide** button, and the navigation-ready/arrival panel also provides the floor guide. This stage is a visual floor-plan guide; it does not claim live indoor GPS positioning.
