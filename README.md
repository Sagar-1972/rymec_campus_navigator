# RYMEC Campus Navigator — Production Build

## Included in this build

### Phase 1 — Production / SEO
- Privacy policy and Terms & Conditions
- HTTPS through Vercel
- Meta title/description, canonical URL and social preview metadata
- Favicon and social preview image
- Sitemap and robots.txt
- Image alt text and lazy loading
- Custom 404 page
- SEO-friendly campus description
- Basic performance and accessibility improvements

### Phase 2 — Security
- No admin password is stored in `index.html`
- Admin login uses `/api/admin-login.js`
- Set `ADMIN_PASSWORD` as a Vercel Environment Variable
- Do not put secrets in HTML, JavaScript or Git

### Phase 3 — UX / accessibility
- Mobile responsive layout
- Skip-to-content link
- Contrast-friendly controls
- Analytics consent banner
- Better error messages
- Clear primary actions

### Phase 4 — Campus features
- Satellite, Standard and Hybrid maps
- New 3D Campus map using `media/campus-3d-map.png`
- Clickable 3D place markers
- Real aerial flyover
- Main Block photos/video
- Search, favorites and directory
- GPS location and route calculation
- Campus Assistant
- Admin location management

## Vercel setup

1. Deploy this folder to Vercel.
2. In Vercel Project Settings → Environment Variables, add:
   - Name: `ADMIN_PASSWORD`
   - Value: choose your private admin password
3. Redeploy after adding the variable.
4. Never commit the password to GitHub.

## Important

The location database is currently browser-local (`localStorage`). Admin edits therefore apply to the browser where they are made. For shared multi-admin production data, move locations/authentication to a real backend such as Supabase or Firebase.

The 3D image is intended as a visual campus-orientation layer. Its marker positions are approximate until the exact locations are calibrated.
