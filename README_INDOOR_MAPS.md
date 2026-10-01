# Admin-managed Indoor Maps

The Campus Navigator now supports indoor floor maps managed from the Admin Dashboard.

## Admin workflow
1. Log in as admin.
2. Open **Indoor Maps**.
3. Select an existing building or type a new building name.
4. Enter the floor name.
5. Upload a JPG/PNG/WebP floor map.
6. Click **Upload / Replace Map**.

Uploading the same building + floor replaces the previous admin-uploaded map. Admins can also replace or delete maps from the list.

The app keeps the original built-in floor maps as fallbacks. An admin-uploaded map overrides a built-in map for that building/floor.

## Storage
- Images are optimized in the browser before upload.
- Server storage uses Vercel Blob through `/api/indoor-maps`.
- The existing `ADMIN_PASSWORD` authentication/token flow is used.


### Admin login
The project now works immediately after deployment with:
- Username: `admin`
- Password: `admin123`

For a deployed/public production site, set the Vercel environment variable `ADMIN_PASSWORD` to your own password. The API will use that value instead of the fallback. Do not put your real password in frontend code.
