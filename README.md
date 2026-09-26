# Campus Navigator — FIXED Vercel package

This version is intentionally self-contained: CSS, configuration and JavaScript are inside index.html. Upload the ZIP contents so Vercel cannot miss local CSS/JS files.

## Vercel
1. Extract this ZIP.
2. Create a new Vercel project from the extracted folder (or upload the folder using Vercel Drop).
3. Framework: Other.
4. Build command: empty.
5. Output directory: `.`.
6. Deploy.

## Important
Change the admin password and campus coordinates in the inline `CAMPUS_CONFIG` near the beginning of the script before final public deployment.

Demo admin password: admin123
\n\n## Map styles\n\nThe map opens in Satellite mode and supports Satellite, Standard OpenStreetMap, and Hybrid (satellite with a light map-context overlay). Map attribution is displayed in the map.\n

## Vercel Web Analytics

This build includes the Vercel Web Analytics script at `/_vercel/insights/script.js`. In the Vercel project dashboard, open Analytics and enable Web Analytics if prompted, then redeploy this project. After visitors load the deployed site, the Analytics dashboard can show visitors, page views, top pages, referrers and related traffic information.
