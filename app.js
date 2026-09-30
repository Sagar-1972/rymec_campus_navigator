// Campus configuration. Edit these values for your college.
window.CAMPUS_CONFIG = {
  name: "Rao Bahadur Y Mahabaleswarappa Engineering College",
  shortName: "Campus Navigator",
  tagline: "Smart Campus Guide",
  center: [15.1394, 76.9214], // approximate Ballari area; replace with your exact campus coordinates
  zoom: 17
};

const DEFAULT_PLACES = [
  {id:"main",name:"Main Block",category:"Building",description:"Main academic and administrative block.",building:"Main Block",floor:"Ground Floor",room:"",lat:15.13955,lng:76.92135},
  {id:"cse101",name:"CSE Computer Laboratory",category:"Laboratory",description:"Computer Science and Engineering laboratory.",building:"CSE Block",floor:"1st Floor",room:"CSE-101",lat:15.13975,lng:76.92110},
  {id:"cse302",name:"CSE Classroom 302",category:"Classroom",description:"CSE classroom for theory sessions.",building:"CSE Block",floor:"2nd Floor",room:"CSE-302",lat:15.13972,lng:76.92105},
  {id:"library",name:"Central Library",category:"Facility",description:"Books, digital resources and study spaces.",building:"Library Block",floor:"Ground Floor",room:"",lat:15.13915,lng:76.92165},
  {id:"canteen",name:"College Canteen",category:"Facility",description:"Food and refreshments for students and staff.",building:"Canteen",floor:"Ground Floor",room:"",lat:15.13905,lng:76.92115},
  {id:"hod",name:"CSE HOD Office",category:"Office",description:"Department office of Computer Science and Engineering.",building:"CSE Block",floor:"2nd Floor",room:"CSE-201",lat:15.13968,lng:76.92108},
  {id:"principal",name:"Principal Office",category:"Office",description:"Principal and administration office.",building:"Main Block",floor:"1st Floor",room:"A-105",lat:15.13960,lng:76.92142},
  {id:"parking",name:"Student Parking",category:"Facility",description:"Parking area for students.",building:"Parking Area",floor:"Ground",room:"",lat:15.13885,lng:76.92095},
  {id:"washroom",name:"Main Block Washroom",category:"Facility",description:"Student washroom facility.",building:"Main Block",floor:"Ground Floor",room:"",lat:15.13948,lng:76.92152}
];

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const app = {
  places: [],
  map: null,
  markers: {},
  userMarker: null,
  routeLine: null,
  campusRouteLayer: null,
  deferredInstall: null,
  currentLocation: null,
  navigationWatchId: null,
  navigationDestination: null,
  navigationRoute: null,
  navigationSteps: [],
  navigationStepIndex: 0,
  userAccuracyCircle: null,
  lastHeading: 0,
  lastRerouteAt: 0,
  adminToken: sessionStorage.getItem("admin_token") || "",
  campusRoutes: [],
  routeEditMap: null,
  routeEditLayer: null,

  currentPlacesCategory: "All",
async init() {
    const cached = JSON.parse(localStorage.getItem("campus_places") || "null");
    this.places = cached || DEFAULT_PLACES;
    await this.loadPlacesFromServer();
    await this.loadRoutesFromServer();
    document.title = CAMPUS_CONFIG.name + " | Campus Navigator";
    $("#brandName").textContent = CAMPUS_CONFIG.shortName;
    this.renderPopular();
    this.currentPlacesCategory = "All";
    this.renderPlaces("", this.currentPlacesCategory);
    this.renderCategories();
    this.renderFavorites();
    this.initMap();
    this.registerPWA();
    this.initAnalyticsConsent();
    window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); this.deferredInstall = e; $("#installBtn").hidden = false; });
    $("#installBtn").onclick = () => this.install();

    // Home buttons: bind directly so navigation also works when inline
    // event handlers are restricted by the site's Content Security Policy.
    $$("[data-home-button]").forEach(btn => {
      btn.addEventListener("click", e => {
        e.preventDefault();
        this.show("home");
      });
    });
    const initialPage = ["home","map","places","details","favorites","admin","privacy","terms"].includes(location.hash.slice(1)) ? location.hash.slice(1) : "home";
    this.currentPage = null;
    this.detailsReturnPage = "home";
    this.show(initialPage, {replace:true, force:true, fromHistory:true});
    window.addEventListener("popstate", () => {
      const page = ["home","map","places","details","favorites","admin","privacy","terms"].includes(location.hash.slice(1)) ? location.hash.slice(1) : "home";
      this.show(page, {fromHistory:true, force:true});
    });
  },

  async loadPlacesFromServer(){
    try{
      const res=await fetch("/api/campus-locations",{cache:"no-store"});
      if(!res.ok) throw new Error("load failed");
      const data=await res.json();
      if(Array.isArray(data.places)){
        this.places=data.places;
        localStorage.setItem("campus_places",JSON.stringify(this.places));
      }
    }catch(e){ /* Keep cached/default data when the server is unavailable. */ }
  },
  async loadRoutesFromServer(){
    try{
      const res=await fetch("/api/campus-routes",{cache:"no-store"});
      if(!res.ok) throw new Error("route load failed");
      const data=await res.json();
      if(Array.isArray(data.routes)){
        this.campusRoutes=data.routes;
        localStorage.setItem("campus_routes",JSON.stringify(this.campusRoutes));
        if(this.map)this.renderCampusRoutes();
      }
    }catch(e){
      try{ this.campusRoutes=JSON.parse(localStorage.getItem("campus_routes")||"[]"); }catch{ this.campusRoutes=[]; }
    }
  },
  async saveRoutes(){
    localStorage.setItem("campus_routes",JSON.stringify(this.campusRoutes));
    if(this.map)this.renderCampusRoutes();
    if(!this.adminToken){this.toast("Routes saved on this device. Log in as admin to sync.");return false;}
    try{
      const res=await fetch("/api/campus-routes",{method:"PUT",headers:{"Content-Type":"application/json","x-admin-token":this.adminToken},body:JSON.stringify({routes:this.campusRoutes})});
      if(res.status===401){sessionStorage.removeItem("admin_token");this.adminToken="";this.toast("Admin session expired. Please log in again.");return false;}
      if(!res.ok) throw new Error("route save failed");
      return true;
    }catch(e){this.toast("Routes saved locally, but server sync failed.");return false;}
  },

  async save(){
    localStorage.setItem("campus_places",JSON.stringify(this.places));
    if(!this.adminToken){ this.toast("Saved on this device. Log in as admin to sync across devices."); return false; }
    try{
      const res=await fetch("/api/campus-locations",{method:"PUT",headers:{"Content-Type":"application/json","x-admin-token":this.adminToken},body:JSON.stringify({places:this.places})});
      if(res.status===401){sessionStorage.removeItem("admin_token");this.adminToken="";this.toast("Admin session expired. Please log in again to sync.");return false;}
      if(!res.ok) throw new Error("save failed");
      return true;
    }catch(e){this.toast("Saved locally, but server sync failed.");return false;}
  },

  show(id, options = {}) {
    const current = this.currentPage || "home";
    if (current === id && !options.force) return;
    if (!options.fromHistory && !options.replace) {
      history.pushState({page:id}, "", "#" + id);
    } else if (options.replace) {
      history.replaceState({page:id}, "", "#" + id);
    }
    this.currentPage = id;
    $$(".page").forEach(p => p.classList.remove("active"));
    $("#" + id).classList.add("active");
    $$(".bottom-nav button").forEach(b => b.classList.toggle("active", b.dataset.page === id));
    if (id === "map" && this.map) {
      // Opening Campus Map itself should show the 3D campus overview, not a previous navigation session.
      this.stopNavigation(true);
      if (this.routeLine) { this.routeLine.remove(); this.routeLine = null; }
      this.navigationDestination = null;
      this.setMapStyle("3d");
      this.render3DMarkers();
      setTimeout(() => this.map.invalidateSize(), 150);
    }
    if (id === "favorites") this.renderFavorites();
    if (id === "places") {
      const search = $("#placesSearch")?.value || "";
      this.renderPlaces(search, this.currentPlacesCategory || "All");
      $$(".chip").forEach(c => c.classList.toggle(
        "active",
        c.textContent === (this.currentPlacesCategory || "All")
      ));
    }
    window.scrollTo({top:0,behavior:"smooth"});
  },

  goBack() {
    if (history.length > 1 && this.currentPage !== "home") history.back();
    else this.show("home");
  },

  initMap() {
    this.map = L.map("mapCanvas", {zoomControl:false}).setView(CAMPUS_CONFIG.center, CAMPUS_CONFIG.zoom);
    L.control.zoom({position:"bottomright"}).addTo(this.map);
    this.baseLayers = {
      street: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom:20, attribution:'&copy; OpenStreetMap contributors'
      }),
      satellite: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
        maxZoom:19, attribution:'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
      })
    };
    this.baseLayers.satellite.addTo(this.map);
    this.hybridOverlay = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom:19, opacity:0.38, attribution:'&copy; OpenStreetMap contributors'
    });
    this.mapStyle = "satellite";
    this.renderMarkers();
    this.renderCampusRoutes();
    this.render3DMarkers();
    // Campus Map opens in the visual 3D campus view by default.
    this.setMapStyle("3d");
  },

  renderCampusRoutes(){
    if(!this.map)return;
    if(this.campusRouteLayer)this.campusRouteLayer.remove();
    this.campusRouteLayer=L.layerGroup().addTo(this.map);
    this.campusRoutes.forEach(r=>{
      if(!Array.isArray(r.points)||r.points.length<2)return;
      L.polyline(r.points,{color:r.type==='restricted'?'#ef4444':r.type==='vehicle'?'#f59e0b':'#2563eb',weight:4,opacity:.55,dashArray:r.type==='restricted'?'8 8':null}).bindTooltip(this.escape(r.name||'Campus path')).addTo(this.campusRouteLayer);
    });
  },

  render3DMarkers() {
    const host = $("#map3dMarkers");
    if (!host) return;
    const positions = {
      main:[52,35], cse101:[20,35], cse302:[20,35], library:[77,35],
      canteen:[91,47], hod:[20,31], principal:[57,35], parking:[78,78],
      washroom:[55,39], park:[50,60], cse:[20,35]
    };
    host.innerHTML = this.places.map(p => {
      const pos = positions[p.id] || [50,50];
      return `<button class="map3d-marker" style="left:${pos[0]}%;top:${pos[1]}%" onclick="app.showDetails('${p.id}')" aria-label="Open ${this.escapeAttr(p.name)}">${this.escape(p.name)}</button>`;
    }).join("");
  },

  setMapStyle(style) {
    const map3d = $("#map3dCanvas"), map2d = $("#mapCanvas");
    if (style === "3d") {
      if (map2d) map2d.style.display = "none";
      if (map3d) map3d.hidden = false;
    } else {
      if (map3d) map3d.hidden = true;
      if (map2d) map2d.style.display = "";
      if (!this.map || !this.baseLayers) return;
      ["street","satellite"].forEach(k => {
        if (this.map.hasLayer(this.baseLayers[k])) this.map.removeLayer(this.baseLayers[k]);
      });
      if (this.map.hasLayer(this.hybridOverlay)) this.map.removeLayer(this.hybridOverlay);
      if (style === "street") {
        this.baseLayers.street.addTo(this.map);
      } else if (style === "hybrid") {
        this.baseLayers.satellite.addTo(this.map);
        this.hybridOverlay.addTo(this.map);
      } else {
        this.baseLayers.satellite.addTo(this.map);
      }
      setTimeout(() => this.map.invalidateSize(), 100);
    }
    this.mapStyle = style;
    document.querySelectorAll(".map-style-btn").forEach(b => b.classList.toggle("active", b.dataset.style === style));
  },

  renderMarkers() {
    Object.values(this.markers).forEach(m => m.remove());
    this.markers = {};
    this.places.forEach(p => {
      const m = L.marker([p.lat,p.lng]).addTo(this.map);
      m.bindPopup(`<b>${this.escape(p.name)}</b><br><small>${this.escape(p.category)} · ${this.escape(p.building)}</small><br><button class="popup-btn" onclick="app.showDetails('${p.id}')">View details</button>`);
      this.markers[p.id] = m;
    });
  },

  renderPopular() {
    $("#popularList").innerHTML = this.places.slice(0,6).map(p => this.placeCard(p)).join("");
  },

  renderPlaces(filter="", category="All") {
    const q = filter.toLowerCase();
    const list = this.places.filter(p => (category==="All" || p.category===category) &&
      [p.name,p.category,p.building,p.room,p.description].join(" ").toLowerCase().includes(q));
    $("#placesList").innerHTML = list.length ? list.map(p=>this.placeCard(p,true)).join("") : `<div class="empty">No matching places found.</div>`;
  },

  filterPlaces(v) {
    this.renderPlaces(v, this.currentPlacesCategory || "All");
  },

  openCategories(cat) {
    this.currentPlacesCategory = cat || "All";
    $("#placesSearch").value = "";
    this.show("places");
    this.renderPlaces("", this.currentPlacesCategory);
    $$(".chip").forEach(c => c.classList.toggle(
      "active",
      c.textContent === this.currentPlacesCategory
    ));
  },

  renderCategories() {
    const cats = ["All",...new Set(this.places.map(p=>p.category))];
    $("#categoryChips").innerHTML = cats.map(c=>`<button class="chip ${c==="All"?"active":""}" onclick="app.category('${this.escapeAttr(c)}')">${this.escape(c)}</button>`).join("");
  },

  category(cat) {
    this.currentPlacesCategory = cat || "All";
    $$(".chip").forEach(c => c.classList.toggle(
      "active",
      c.textContent === this.currentPlacesCategory
    ));
    this.renderPlaces($("#placesSearch").value, this.currentPlacesCategory);
  },

  placeCard(p, detailed=false) {
    const fav = this.isFavorite(p.id);
    return `<article class="place-card" onclick="app.showDetails('${p.id}')">
      <div class="place-icon ${p.category.toLowerCase()}">${this.icon(p.category)}</div>
      <div class="place-info"><h3>${this.escape(p.name)}</h3><p>${this.escape(p.building)}${p.room ? " · "+this.escape(p.room):""}</p>${detailed?`<small>${this.escape(p.description)}</small>`:""}</div>
      <button class="heart ${fav?"on":""}" onclick="event.stopPropagation();app.toggleFavorite('${p.id}')">${fav?"♥":"♡"}</button>
    </article>`;
  },

  showDetails(id) {
    const p = this.places.find(x=>x.id===id); if(!p) return;
    this.detailsReturnPage = this.currentPage && this.currentPage !== "details" ? this.currentPage : "home";
    $("#detailsContent").innerHTML = `
      <div class="detail-hero"><div class="big-icon">${this.icon(p.category)}</div><span class="tag">${this.escape(p.category)}</span><h1>${this.escape(p.name)}</h1><p>${this.escape(p.description)}</p></div>
      <div class="detail-grid">
        <div><small>BUILDING</small><b>${this.escape(p.building)}</b></div>
        <div><small>FLOOR</small><b>${this.escape(p.floor)}</b></div>
        <div><small>ROOM</small><b>${this.escape(p.room || "—")}</b></div>
        <div><small>COORDINATES</small><b>${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}</b></div>
      </div>
      <div class="detail-actions"><button class="primary-btn" onclick="app.navigateTo('${p.id}')">🧭 Navigate</button><button class="secondary-btn" onclick="app.toggleFavorite('${p.id}');app.showDetails('${p.id}')">${this.isFavorite(p.id)?"♥ Saved":"♡ Save"}</button></div>
      ${p.id==='main'?`<div class="media-gallery"><h3>Actual Main Block Views</h3><div class="gallery-grid">
        <figure><img src="media/main-block-front.jpg" alt="RYMEC Main Block front view"><figcaption>Front approach captured from the uploaded campus video.</figcaption></figure>
        <figure><img src="media/main-block-close.jpg" alt="RYMEC Main Block entrance close view" loading="lazy" decoding="async"><figcaption>Closer view of the Main Block entrance.</figcaption></figure>
        <figure class="video-badge"><video controls playsinline preload="metadata" poster="media/main-block-front.jpg"><source src="media/main-block.mp4" type="video/mp4"></video><figcaption>Main Block aerial-to-front video.</figcaption></figure>
        <figure class="video-badge"><video controls playsinline preload="metadata" poster="media/aerial-campus.jpg"><source src="media/campus-aerial.mp4" type="video/mp4"></video><figcaption>Campus aerial video used to understand the campus layout.</figcaption></figure>
      </div></div>`:''}
      <div class="mini-map" id="detailMap"></div>`;
    this.show("details");
    setTimeout(()=>{
      const m=L.map("detailMap",{zoomControl:false,attributionControl:false}).setView([p.lat,p.lng],18);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(m);
      L.marker([p.lat,p.lng]).addTo(m).bindPopup(this.escape(p.name)).openPopup();
    },50);
  },

  backFromDetails() {
    // Details was opened from the current page, so go back through
    // browser history instead of calling show(), which would create
    // another history entry and cause the Details ↔ Places loop.
    if (history.length > 1) {
      history.back();
    } else {
      this.show("home", {replace:true});
    }
  },

  openCampusMedia(type) {
    const isMain = type === 'main';
    const title = isMain ? 'Main Block — Real Campus View' : 'Campus — Aerial View';
    const poster = isMain ? 'media/main-block-front.jpg' : 'media/aerial-campus.jpg';
    const video = isMain ? 'media/main-block.mp4' : 'media/campus-aerial.mp4';
    const modal = document.createElement('div');
    modal.className='modal';
    modal.innerHTML=`<div class="modal-card"><div class="modal-head"><h3>${title}</h3><button onclick="this.closest('.modal').remove()">×</button></div><video controls autoplay playsinline style="width:100%;border-radius:14px;margin-top:14px;background:#000" poster="${poster}"><source src="${video}" type="video/mp4"></video><p class="muted">This view was created from the campus footage you provided. It is used as a place-specific visual reference, not a full Street View.</p></div>`;
    document.body.appendChild(modal);
  },

  search(q) {
    q=(q||"").trim();
    if(!q){this.show("places");return;}
    const found=this.places.find(p=>[p.name,p.category,p.building,p.room].join(" ").toLowerCase().includes(q.toLowerCase()));
    this.currentPlacesCategory = "All";
    this.show("places");
    $("#placesSearch").value=q;
    this.renderPlaces(q, "All");
    $$(".chip").forEach(c => c.classList.toggle("active", c.textContent === "All"));
    if(found){ this.map.setView([found.lat,found.lng],18); this.markers[found.id]?.openPopup(); }
  },

  navigateTo(id) {
    const p=this.places.find(x=>x.id===id); if(!p)return;
    this.show("map");
    if(this.mapStyle==="3d") this.setMapStyle("satellite");
    this.navigationDestination=p;
    this.map.setView([p.lat,p.lng],18);
    this.markers[p.id]?.openPopup();
    this.startNavigation(p);
  },

  locate(callback) {
    if(!navigator.geolocation){this.toast("Geolocation is not supported on this device.");return;}
    this.toast("Requesting your location...");
    navigator.geolocation.getCurrentPosition(pos=>{
      this.updateUserLocation(pos);
      this.map.setView(this.currentLocation,18);
      this.toast("Location found.");
      if(callback)callback();
    },()=>this.toast("Location permission was denied or unavailable."),{enableHighAccuracy:true,timeout:10000,maximumAge:5000});
  },

  startNavigation(p) {
    this.stopNavigation(false);
    this.navigationDestination=p;
    this.navigationDestination._arrived=false;
    this.showNavigationLoading(p);
    if(this.currentLocation){
      this.buildRoute(p,true);
    } else {
      this.locate(()=>this.buildRoute(p,true));
    }
  },

  stopNavigation(clearPanel=true) {
    if(this.navigationWatchId!==null){navigator.geolocation.clearWatch(this.navigationWatchId);this.navigationWatchId=null;}
    this.navigationRoute=null;
    this.navigationSteps=[];
    this.navigationStepIndex=0;
    if(clearPanel)$("#routePanel").hidden=true;
  },

  showNavigationLoading(p){
    $("#routePanel").hidden=false;
    $("#routePanel").innerHTML=`<div class="nav-direction"><div class="nav-turn">🧭</div><div class="nav-copy"><strong>Finding route to ${this.escape(p.name)}</strong><small>Getting your live location and directions…</small></div></div>`;
  },

  ensureUserMarker(){
    if(this.userMarker)return;
    const icon=L.divIcon({className:"user-nav-icon",html:'<div class="user-nav-arrow">➤</div>',iconSize:[34,34],iconAnchor:[17,17]});
    this.userMarker=L.marker(this.currentLocation,{title:"You are here",icon,zIndexOffset:1000}).addTo(this.map);
  },

  updateUserHeading(pos){
    let heading=typeof pos.coords.heading==='number' && pos.coords.heading>=0 ? pos.coords.heading : null;
    if(heading===null && this.currentLocation){
      const prev=this.previousLocation;
      if(prev){ heading=this.bearingBetween(prev[0],prev[1],this.currentLocation[0],this.currentLocation[1]); }
    }
    if(heading!==null) this.lastHeading=heading;
    const el=this.userMarker?.getElement()?.querySelector('.user-nav-arrow');
    if(el) el.style.transform=`rotate(${this.lastHeading}deg)`;
  },

  updateUserLocation(pos){
    this.previousLocation=this.currentLocation;
    this.currentLocation=[pos.coords.latitude,pos.coords.longitude];
    this.ensureUserMarker();
    this.userMarker.setLatLng(this.currentLocation);
    this.updateUserHeading(pos);
    const accuracy=Math.max(5,Number(pos.coords.accuracy||20));
    if(!this.userAccuracyCircle){
      this.userAccuracyCircle=L.circle(this.currentLocation,{radius:accuracy,className:"accuracy-circle",interactive:false}).addTo(this.map);
    } else {
      this.userAccuracyCircle.setLatLng(this.currentLocation).setRadius(accuracy);
    }
    if(this.navigationDestination && this.navigationRoute){
      const distance=this.map.distance(this.currentLocation,[this.navigationDestination.lat,this.navigationDestination.lng]);
      if(distance<=30){this.reachedDestination(distance);return;}
      const nearest=this.nearestRouteIndex(this.currentLocation);
      if(nearest>=0){
        const nearestCoord=this.navigationRoute.geometry.coordinates[nearest];
        const offRoute=this.map.distance(this.currentLocation,[nearestCoord[1],nearestCoord[0]]);
        if(offRoute>60 && Date.now()-this.lastRerouteAt>15000){
          this.lastRerouteAt=Date.now();
          this.buildRoute(this.navigationDestination,true);
          return;
        }
      }
      const total=this.navigationRoute.geometry.coordinates.length;
      if(nearest>=0 && total>1){
        const progress=Math.max(0,Math.min(100,(nearest/(total-1))*100));
        const bar=$("#navProgress"); if(bar)bar.style.width=progress+"%";
      }
      this.updateNavigationInstruction();
      if(this.map.getBounds().contains(this.currentLocation)===false){this.map.setView(this.currentLocation,Math.max(this.map.getZoom(),18),{animate:true});}
    }
  },

  startWatchingLocation(){
    if(!navigator.geolocation || this.navigationWatchId!==null)return;
    this.navigationWatchId=navigator.geolocation.watchPosition(pos=>this.updateUserLocation(pos),()=>this.toast("Live location updates are unavailable. Check location permission."),{enableHighAccuracy:true,maximumAge:2000,timeout:10000});
  },

  bearingBetween(lat1,lng1,lat2,lng2){
    const toRad=d=>d*Math.PI/180, toDeg=r=>r*180/Math.PI;
    const y=Math.sin(toRad(lng2-lng1))*Math.cos(toRad(lat2));
    const x=Math.cos(toRad(lat1))*Math.sin(toRad(lat2))-Math.sin(toRad(lat1))*Math.cos(toRad(lat2))*Math.cos(toRad(lng2-lng1));
    return (toDeg(Math.atan2(y,x))+360)%360;
  },

  nearestRouteIndex(loc){
    if(!this.navigationRoute?.geometry?.coordinates?.length)return -1;
    let best=-1,bestD=Infinity;
    this.navigationRoute.geometry.coordinates.forEach((c,i)=>{
      const d=this.map.distance(loc,[c[1],c[0]]);
      if(d<bestD){bestD=d;best=i;}
    });
    return best;
  },

  formatStep(step){
    const m=step.maneuver||{};
    const type=m.type||"continue", mod=m.modifier||"straight";
    const names={
      'depart':'Start navigation', 'arrive':'Arrive at your destination', 'turn':'Turn',
      'new name':'Continue', 'continue':'Continue straight', 'merge':'Merge', 'fork':'Keep',
      'on ramp':'Take the ramp', 'off ramp':'Take the exit', 'roundabout':'Enter roundabout',
      'rotary':'Enter roundabout', 'end of road':'Turn at the end of the road'
    };
    let text=names[type]||'Continue';
    if(type==='turn'||type==='fork'||type==='end of road') text += ' '+({left:'left',right:'right',straight:'straight',slight_left:'slight left',slight_right:'slight right',sharp_left:'sharp left',sharp_right:'sharp right',uturn:'U-turn'}[mod]||mod);
    else if(type==='continue' && mod!=='straight') text='Continue '+(mod.replace('_',' '));
    if(type==='roundabout'||type==='rotary'){ if(m.exit) text+=` and take exit ${m.exit}`; }
    return text;
  },

  updateNavigationInstruction(){
    if(!this.navigationSteps.length || !this.navigationRoute)return;
    const idx=this.nearestRouteIndex(this.currentLocation);
    let next=this.navigationStepIndex;
    while(next<this.navigationSteps.length-1){
      const step=this.navigationSteps[next];
      const end=step.maneuver?.location;
      if(!end)break;
      const d=this.map.distance(this.currentLocation,[end[1],end[0]]);
      if(d<18) next++; else break;
    }
    this.navigationStepIndex=next;
    const step=this.navigationSteps[next];
    const end=step.maneuver?.location;
    const d=end?this.map.distance(this.currentLocation,[end[1],end[0]]):0;
    const icon=({left:'↰',right:'↱',straight:'↑',slight_left:'↖',slight_right:'↗',sharp_left:'↙',sharp_right:'↘',uturn:'↶'}[step.maneuver?.modifier]||'↑');
    const text=this.formatStep(step);
    const total=this.navigationSteps.length;
    $("#routePanel").hidden=false;
    $("#routePanel").innerHTML=`<div class="nav-direction"><div class="nav-turn">${icon}</div><div class="nav-copy"><strong>${this.escape(text)}</strong><small>Step ${Math.min(next+1,total)} of ${total}</small></div></div><div class="nav-progress"><i id="navProgress"></i></div>`;
    const nearest=this.nearestRouteIndex(this.currentLocation);
    if(nearest>=0 && this.navigationRoute.geometry.coordinates.length>1){$("#navProgress").style.width=(nearest/(this.navigationRoute.geometry.coordinates.length-1)*100)+"%";}
  },

  reachedDestination(distance){
    if(this.navigationDestination?._arrived)return;
    if(this.navigationDestination)this.navigationDestination._arrived=true;
    const name=this.navigationDestination?.name||'your destination';
    this.stopNavigation(false);
    $("#routePanel").hidden=false;
    $("#routePanel").classList.add('nav-arrived');
    $("#routePanel").innerHTML=`<div class="nav-direction"><div class="nav-turn">✓</div><div class="nav-copy"><strong>🎉 Reached the destination!</strong><small>You have arrived at ${this.escape(name)}.</small></div></div>`;
    this.toast(`Reached ${name}`);
  },

  distanceMeters(a,b){
    const R=6371000,toRad=x=>x*Math.PI/180;const dLat=toRad(b[0]-a[0]),dLng=toRad(b[1]-a[1]);const x=Math.sin(dLat/2)**2+Math.cos(toRad(a[0]))*Math.cos(toRad(b[0]))*Math.sin(dLng/2)**2;return 2*R*Math.asin(Math.sqrt(x));
  },
  buildCampusGraph(){
    const active=this.campusRoutes.filter(r=>r.type!=='restricted'&&(r.points||[]).length>1);const nodes=[];const pointNode=[];
    const findOrCreate=p=>{let best=-1,bd=Infinity;nodes.forEach((n,i)=>{const d=this.distanceMeters(n,p);if(d<12&&d<bd){bd=d;best=i;}});if(best<0){best=nodes.length;nodes.push([p[0],p[1]]);}return best;};
    const edges=new Map();const addEdge=(a,b)=>{if(a===b)return;const d=this.distanceMeters(nodes[a],nodes[b]);if(!edges.has(a))edges.set(a,[]);if(!edges.has(b))edges.set(b,[]);if(!edges.get(a).some(e=>e.to===b))edges.get(a).push({to:b,w:d});if(!edges.get(b).some(e=>e.to===a))edges.get(b).push({to:a,w:d});};
    active.forEach(r=>{const ids=r.points.map(findOrCreate);for(let i=1;i<ids.length;i++)addEdge(ids[i-1],ids[i]);pointNode.push(ids);});
    return {nodes,edges};
  },
  nearestGraphNode(nodes,loc){let best=-1,bd=Infinity;nodes.forEach((n,i)=>{const d=this.distanceMeters(loc,n);if(d<bd){bd=d;best=i;}});return {index:best,distance:bd};},
  shortestGraphPath(graph,start,end){
    const n=graph.nodes.length;if(start<0||end<0)return null;const dist=Array(n).fill(Infinity),prev=Array(n).fill(-1),used=Array(n).fill(false);dist[start]=0;
    for(let k=0;k<n;k++){let u=-1,bd=Infinity;for(let i=0;i<n;i++)if(!used[i]&&dist[i]<bd){bd=dist[i];u=i;}if(u<0)break;used[u]=true;if(u===end)break;for(const e of (graph.edges.get(u)||[])){const nd=dist[u]+e.w;if(nd<dist[e.to]){dist[e.to]=nd;prev[e.to]=u;}}}
    if(!Number.isFinite(dist[end]))return null;const ids=[];for(let u=end;u!==-1;u=prev[u])ids.push(u);ids.reverse();return {indices:ids,distance:dist[end]};
  },
  makeCampusSteps(coords){
    const steps=[];if(coords.length<2)return steps;steps.push({maneuver:{type:'depart',modifier:'straight',location:coords[0]},distance:0});
    for(let i=1;i<coords.length-1;i++){const a=coords[i-1],b=coords[i],c=coords[i+1];const b1=this.bearingBetween(a[0],a[1],b[0],b[1]),b2=this.bearingBetween(b[0],b[1],c[0],c[1]);let d=((b2-b1+540)%360)-180;let mod=Math.abs(d)<20?'straight':d>0?'right':'left';steps.push({maneuver:{type:mod==='straight'?'continue':'turn',modifier:mod,location:b}});}steps.push({maneuver:{type:'arrive',modifier:'straight',location:coords[coords.length-1]}});return steps;
  },
  async buildCampusRoute(p){
    if(!this.campusRoutes.length)return null;const graph=this.buildCampusGraph();if(!graph.nodes.length)return null;const s=this.nearestGraphNode(graph.nodes,this.currentLocation),e=this.nearestGraphNode(graph.nodes,[p.lat,p.lng]);
    if(s.distance>180||e.distance>180)return null;const path=this.shortestGraphPath(graph,s.index,e.index);if(!path)return null;
    const coords=[this.currentLocation,...path.indices.map(i=>graph.nodes[i]),[p.lat,p.lng]];const route={geometry:{type:'LineString',coordinates:coords.map(c=>[c[1],c[0]])},distance:path.distance+s.distance+e.distance,duration:(path.distance+s.distance+e.distance)/1.25};route.steps=this.makeCampusSteps(coords);return route;
  },
  async buildRoute(p,live=false) {
    const [lat,lng]=this.currentLocation;$("#routePanel").hidden=false;$("#routePanel").classList.remove('nav-arrived');$("#routePanel").innerHTML="Finding the best campus route…";
    try{
      let route=await this.buildCampusRoute(p);let source='Campus route';
      if(!route){
        source='Online road route';
        const url=`https://router.project-osrm.org/route/v1/driving/${lng},${lat};${p.lng},${p.lat}?overview=full&steps=true&geometries=geojson`;const r=await fetch(url);const data=await r.json();if(!data.routes?.length)throw new Error();route=data.routes[0];
      }
      this.lastRerouteAt=Date.now();this.navigationRoute=route;this.navigationSteps=route.steps||route.legs?.[0]?.steps||[];this.navigationStepIndex=0;
      if(this.routeLine)this.routeLine.remove();this.routeLine=L.geoJSON(route.geometry,{weight:7,color:'#2563eb'}).addTo(this.map);this.map.fitBounds(this.routeLine.getBounds(),{padding:[30,30]});this.startWatchingLocation();this.updateNavigationInstruction();
      if(!this.navigationSteps.length)$("#routePanel").innerHTML=`<b>${source} to ${this.escape(p.name)}</b><span>Route ready</span>`;
      else {const badge=document.createElement('small');badge.textContent=source;badge.style.cssText='display:block;margin-top:6px;color:#93c5fd;font-weight:700';$("#routePanel").appendChild(badge);}
    }catch(e){$("#routePanel").innerHTML=`<b>Navigation</b><span>Could not calculate a route. You can still use the map marker at ${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}.</span>`;}
  },

  isFavorite(id){return JSON.parse(localStorage.getItem("campus_favorites")||"[]").includes(id);},
  toggleFavorite(id){
    let f=JSON.parse(localStorage.getItem("campus_favorites")||"[]");
    f=f.includes(id)?f.filter(x=>x!==id):[...f,id];
    localStorage.setItem("campus_favorites",JSON.stringify(f));
    this.renderPopular();this.renderPlaces();this.renderFavorites();
    this.toast(f.includes(id)?"Added to favorites":"Removed from favorites");
  },
  renderFavorites(){
    const f=JSON.parse(localStorage.getItem("campus_favorites")||"[]");
    const list=this.places.filter(p=>f.includes(p.id));
    $("#favoritesList").innerHTML=list.length?list.map(p=>this.placeCard(p,true)).join(""):`<div class="empty"><div class="empty-icon">♡</div><h3>No saved places</h3><p>Tap the heart on any location to save it.</p></div>`;
  },

  openAssistant(){
    $("#assistantModal").hidden=false;
    if(!$("#chat").children.length)this.addChat("bot","Hi! I can help you find places on campus. Try “Where is the library?”");
  },
  closeAssistant(){$("#assistantModal").hidden=true;},
  addChat(who,msg){$("#chat").insertAdjacentHTML("beforeend",`<div class="bubble ${who}">${this.escape(msg)}</div>`);$("#chat").scrollTop=$("#chat").scrollHeight;},
  askAssistant(){
    const input=$("#chatInput"), q=input.value.trim(); if(!q)return; input.value="";
    this.addChat("user",q);
    const found=this.places.find(p=>[p.name,p.category,p.building,p.room].join(" ").toLowerCase().includes(q.toLowerCase()));
    let reply;
    if(found) reply=`${found.name} is in ${found.building}, ${found.floor}${found.room?" ("+found.room+")":""}. Tap the location card for navigation.`;
    else if(q.toLowerCase().includes("near")||q.toLowerCase().includes("facility")) reply="I can search the campus directory for classrooms, labs, offices and facilities. Try a specific name.";
    else reply="I couldn't find that place in the campus directory. Try the building, room number, or facility name.";
    setTimeout(()=>this.addChat("bot",reply),250);
  },

  initAnalyticsConsent(){
    const banner=$("#cookieBanner");
    const choice=localStorage.getItem("analytics_consent");
    if(choice==="granted") this.loadAnalytics();
    else if(choice==="denied") banner.hidden=true;
    else { banner.hidden=false; banner.style.display=""; }
  },
  setAnalyticsConsent(granted){
    try { localStorage.setItem("analytics_consent",granted?"granted":"denied"); } catch(e) {}
    const banner=$("#cookieBanner");
    banner.hidden=true;
    banner.style.display="none";
    banner.setAttribute("aria-hidden","true");
    if(granted) this.loadAnalytics();
    this.toast(granted?"Analytics enabled.":"Analytics declined.");
  },
  loadAnalytics(){
    if(window.__analyticsLoaded) return;
    window.__analyticsLoaded=true;
    const s=document.createElement("script");
    s.defer=true;s.src="/_vercel/insights/script.js";
    document.head.appendChild(s);
  },

  openAdmin(){$("#adminUsername").value="admin";$("#adminPassword").value="";$("#adminPassword").type="password";$("#toggleAdminPassword").textContent="Show";$("#toggleAdminPassword").setAttribute("aria-label","Show password");$("#toggleAdminPassword").setAttribute("aria-pressed","false");$("#adminModal").hidden=false;setTimeout(()=>$("#adminUsername").focus(),50);},
  closeAdmin(){$("#adminModal").hidden=true;},
  async loginAdmin(){
    const username=(document.getElementById("adminUsername")?.value||"").trim();
    const password=$("#adminPassword").value;
    if(!username){this.toast("Enter the admin username.");return;}
    if(!password){this.toast("Enter the admin password.");return;}
    try{
      const res=await fetch("/api/admin-login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username,password})});
      if(!res.ok){this.toast(res.status===401?"Incorrect username or password.":"Admin login is unavailable.");return;}
      const data=await res.json();
      if(!data.ok){this.toast("Incorrect username or password.");return;}
      sessionStorage.setItem("admin_session","1");
      if(data.token){sessionStorage.setItem("admin_token",data.token);this.adminToken=data.token;}
      await this.loadPlacesFromServer();
      this.closeAdmin();this.renderAdmin();this.show("admin");
    }catch(e){this.toast("Admin login is temporarily unavailable.");}
  },
  toggleAdminPassword(){
    const input=document.getElementById("adminPassword");
    const button=document.getElementById("toggleAdminPassword");
    if(!input||!button)return;
    const visible=input.type==="text";
    input.type=visible?"password":"text";
    button.textContent=visible?"Show":"Hide";
    button.setAttribute("aria-label",visible?"Show password":"Hide password");
    button.setAttribute("aria-pressed",String(!visible));
  },
  renderAdmin(){
    $("#adminContent").innerHTML=`
      <div class="stats"><div><b>${this.places.length}</b><span>Locations</span></div><div><b>${this.campusRoutes.length}</b><span>Campus paths</span></div><div><b>${JSON.parse(localStorage.getItem("campus_favorites")||"[]").length}</b><span>Saved</span></div></div>
      <div class="admin-actions"><button class="primary-btn" onclick="app.newPlace()">＋ Add location</button><button class="primary-btn" onclick="app.openRouteManager()">🛣️ Campus Routes</button><button class="secondary-btn" onclick="app.exportData()">Export JSON</button><label class="secondary-btn file-label">Import JSON<input type="file" accept=".json" onchange="app.importData(event)" hidden></label><button class="danger-btn" onclick="app.resetData()">Reset demo data</button></div>
      <div class="admin-list">${this.places.map(p=>`<div class="admin-row"><div><b>${this.escape(p.name)}</b><small>${this.escape(p.category)} · ${this.escape(p.building)}</small></div><button onclick="app.editPlace('${p.id}')">Edit</button><button class="danger-text" onclick="app.deletePlace('${p.id}')">Delete</button></div>`).join("")}</div>`;
  },
  openRouteManager(){
    const modal=document.createElement("div");modal.className="modal";
    modal.innerHTML=`<div class="modal-card route-manager-card"><div class="modal-head"><div><h3>🛣️ Campus Route Manager</h3><p class="muted" style="margin:4px 0 0">Draw the real roads and walking paths inside RYMEC. Click along the path, then save it.</p></div><button type="button" data-close>×</button></div>
      <div class="route-manager-toolbar"><select id="routeType"><option value="walking">🚶 Walking path</option><option value="vehicle">🚗 Vehicle road</option><option value="restricted">🚫 Restricted path</option></select><input id="routeName" placeholder="Path name e.g. Main Gate → CSE Block"><button type="button" class="secondary-btn" data-undo>Undo</button><button type="button" class="primary-btn" data-finish>Finish path</button></div>
      <div id="routeManagerMap" class="route-manager-map"></div><div class="route-manager-status" data-status>Click <b>Start drawing</b> on the map by placing the first point.</div>
      <div class="route-list">${this.campusRoutes.length?this.campusRoutes.map(r=>`<div class="route-row"><div><b>${this.escape(r.name||"Unnamed path")}</b><small>${r.type||"walking"} · ${(r.points||[]).length} points</small></div><button class="danger-text" data-delete-route="${this.escapeAttr(r.id)}">Delete</button></div>`).join(""):"<div class='empty' style='padding:25px'>No campus paths yet. Draw your first path above.</div>"}</div>
      <p class="coordinate-help">Tip: Draw continuously along the center of the actual road/path. Add points at every turn and junction. Restricted paths are shown but excluded from normal navigation.</p></div>`;
    document.body.appendChild(modal);
    const map=L.map("routeManagerMap",{zoomControl:true}).setView(CAMPUS_CONFIG.center,18);
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",{maxZoom:20,attribution:'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'}).addTo(map);
    const existing=L.layerGroup().addTo(map);
    this.campusRoutes.forEach(r=>{if((r.points||[]).length>1)L.polyline(r.points,{color:r.type==='restricted'?'#ef4444':r.type==='vehicle'?'#f59e0b':'#2563eb',weight:5,opacity:.8,dashArray:r.type==='restricted'?'8 8':null}).addTo(existing);});
    if(this.campusRoutes.some(r=>(r.points||[]).length)){
      const all=this.campusRoutes.flatMap(r=>r.points||[]); if(all.length>1) map.fitBounds(L.latLngBounds(all),{padding:[25,25]});
    }
    let points=[],line=null,markers=L.layerGroup().addTo(map),drawing=false;
    const status=modal.querySelector("[data-status]");
    const redraw=()=>{if(line)line.remove();line=points.length?L.polyline(points,{color:'#22c55e',weight:6}).addTo(map):null;markers.clearLayers();points.forEach((p,i)=>L.circleMarker(p,{radius:i===0?7:5,color:'#22c55e',fillOpacity:1}).addTo(markers));status.innerHTML=points.length?`Drawing <b>${points.length} points</b>. Click the road to continue, then press <b>Finish path</b>.`:'Click the map to place the first point.';};
    map.on("click",e=>{points.push([e.latlng.lat,e.latlng.lng]);drawing=true;redraw();});
    modal.querySelector("[data-undo]").addEventListener("click",()=>{if(points.length){points.pop();redraw();}});
    modal.querySelector("[data-finish]").addEventListener("click",async()=>{
      const name=modal.querySelector("#routeName").value.trim()||`Campus path ${this.campusRoutes.length+1}`;
      const type=modal.querySelector("#routeType").value;
      if(points.length<2){this.toast("Place at least two points on the road.");return;}
      const ok=await this.saveRoute({id:"r"+Date.now(),name,type,points:points.map(p=>[+p[0].toFixed(7),+p[1].toFixed(7)])});
      if(ok){points=[];line?.remove();markers.clearLayers();modal.remove();map.remove();this.toast("Campus path saved and synced.");this.renderAdmin();this.openRouteManager();}
    });
    modal.querySelectorAll("[data-delete-route]").forEach(btn=>btn.addEventListener("click",async()=>{const id=btn.dataset.deleteRoute;if(!confirm("Delete this campus path?"))return;this.campusRoutes=this.campusRoutes.filter(r=>r.id!==id);if(await this.saveRoutes()){modal.remove();map.remove();this.renderAdmin();this.openRouteManager();}}));
    modal.querySelector("[data-close]").addEventListener("click",()=>{map.remove();modal.remove();});
    setTimeout(()=>map.invalidateSize(),80);
  },
  async saveRoute(route){this.campusRoutes.push(route);const ok=await this.saveRoutes();if(!ok){this.campusRoutes=this.campusRoutes.filter(r=>r.id!==route.id);return false;}return true;},

  newPlace(){this.editPlace(null);},
  editPlace(id){
    const p=id?this.places.find(x=>x.id===id):{id:"p"+Date.now(),name:"",category:"Classroom",description:"",building:"",floor:"",room:"",lat:CAMPUS_CONFIG.center[0],lng:CAMPUS_CONFIG.center[1]};
    const modal=document.createElement("div");modal.className="modal";modal.innerHTML=`<div class="modal-card location-editor"><div class="modal-head"><h3>${id?"Edit":"Add"} location</h3><button type="button" data-close>×</button></div>
    <div class="form-grid">
      <label>NAME<input id="f_name" value="${this.escapeAttr(p.name)}"></label>
      <label>CATEGORY<select id="f_category"><option>Classroom</option><option>Laboratory</option><option>Office</option><option>Facility</option><option>Building</option></select></label>
      <label>DESCRIPTION<input id="f_description" value="${this.escapeAttr(p.description)}"></label>
      <label>BUILDING<input id="f_building" value="${this.escapeAttr(p.building)}"></label>
      <label>FLOOR<input id="f_floor" value="${this.escapeAttr(p.floor)}"></label>
      <label>ROOM<input id="f_room" value="${this.escapeAttr(p.room)}"></label>
    </div>
    <div class="coordinate-panel">
      <div class="coordinate-title"><span>📍 Exact location</span><small>Choose coordinates without typing them manually</small></div>
      <div class="coordinate-fields"><label>LATITUDE<input id="f_lat" inputmode="decimal" value="${this.escapeAttr(p.lat)}"></label><label>LONGITUDE<input id="f_lng" inputmode="decimal" value="${this.escapeAttr(p.lng)}"></label></div>
      <div class="coordinate-actions"><button type="button" class="secondary-btn" data-pick>🗺️ Pick on Map</button><button type="button" class="secondary-btn" data-gps>📍 Use My GPS</button></div>
      <p class="coordinate-help">Tip: On the satellite map, click the exact spot or drag the marker. GPS needs location permission.</p>
    </div>
    <button type="button" class="primary-btn full" data-save>Save location</button></div>`;
    document.body.appendChild(modal);
    $("#f_category").value=p.category||"Classroom";
    modal.querySelector("[data-close]").addEventListener("click",()=>modal.remove());
    modal.querySelector("[data-save]").addEventListener("click",()=>this.savePlace(p.id,modal));
    modal.querySelector("[data-pick]").addEventListener("click",()=>this.openCoordinatePicker(modal));
    modal.querySelector("[data-gps]").addEventListener("click",()=>this.useAdminGPS(modal));
  },

  updateAdminCoordinates(lat,lng,modal){
    const la=Number(lat),lo=Number(lng);
    if(!Number.isFinite(la)||!Number.isFinite(lo)) return;
    modal.querySelector("#f_lat").value=la.toFixed(7);
    modal.querySelector("#f_lng").value=lo.toFixed(7);
  },

  useAdminGPS(modal){
    if(!navigator.geolocation){this.toast("GPS is not supported by this browser.");return;}
    this.toast("Requesting your location…");
    navigator.geolocation.getCurrentPosition(pos=>{
      this.updateAdminCoordinates(pos.coords.latitude,pos.coords.longitude,modal);
      this.toast(`GPS location captured (±${Math.round(pos.coords.accuracy)} m).`);
    },err=>{
      const msg=err.code===1?"Location permission was denied.":err.code===2?"Your location could not be determined.":"GPS request timed out.";
      this.toast(msg);
    },{enableHighAccuracy:true,timeout:12000,maximumAge:0});
  },

  openCoordinatePicker(parentModal){
    const lat=parseFloat(parentModal.querySelector("#f_lat").value);
    const lng=parseFloat(parentModal.querySelector("#f_lng").value);
    const center=Number.isFinite(lat)&&Number.isFinite(lng)?[lat,lng]:CAMPUS_CONFIG.center;
    const picker=document.createElement("div");picker.className="modal coordinate-picker-modal";picker.innerHTML=`<div class="modal-card coordinate-picker-card"><div class="modal-head"><div><h3>Pick exact location</h3><p class="muted" style="margin:4px 0 0">Tap the map or drag the marker to the exact building entrance or facility.</p></div><button type="button" data-close>×</button></div><div id="adminPickerMap" class="admin-picker-map"></div><div class="picker-bottom"><div><b data-picker-coords>Lat ${center[0].toFixed(7)} · Lng ${center[1].toFixed(7)}</b><small>Satellite imagery</small></div><button type="button" class="primary-btn" data-use>Use this location</button></div></div>`;
    document.body.appendChild(picker);
    const map=L.map("adminPickerMap",{zoomControl:true}).setView(center,19);
    const satellite=L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",{maxZoom:20,attribution:'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'}).addTo(map);
    let marker=L.marker(center,{draggable:true}).addTo(map);
    const setPoint=(ll)=>{const a=ll.lat,b=ll.lng;marker.setLatLng([a,b]);picker.querySelector("[data-picker-coords]").textContent=`Lat ${a.toFixed(7)} · Lng ${b.toFixed(7)}`;};
    map.on("click",e=>setPoint(e.latlng));
    marker.on("dragend",()=>setPoint(marker.getLatLng()));
    picker.querySelector("[data-use]").addEventListener("click",()=>{const ll=marker.getLatLng();this.updateAdminCoordinates(ll.lat,ll.lng,parentModal);map.remove();picker.remove();});
    picker.querySelector("[data-close]").addEventListener("click",()=>{map.remove();picker.remove();});
    setTimeout(()=>map.invalidateSize(),80);
  },
  async savePlace(id,modal){
    const p={id};["name","category","description","building","floor","room"].forEach(k=>p[k]=$("#f_"+k).value.trim());
    p.lat=parseFloat($("#f_lat").value);p.lng=parseFloat($("#f_lng").value);
    if(!p.name||!Number.isFinite(p.lat)||!Number.isFinite(p.lng)){this.toast("Name and valid coordinates are required.");return;}
    const i=this.places.findIndex(x=>x.id===id); if(i>=0)this.places[i]=p;else this.places.push(p);
    const synced=await this.save();if(!synced){this.toast("Location was not synced. Check admin login and Vercel storage, then save again.");return;}modal.remove();this.renderAdmin();this.renderMarkers();this.render3DMarkers();this.renderPlaces();this.renderPopular();this.renderCategories();this.toast("Location saved and synced.");
  },
  async deletePlace(id){if(confirm("Delete this location?")){this.places=this.places.filter(p=>p.id!==id);await this.save();this.renderAdmin();this.renderMarkers();this.render3DMarkers();this.renderPlaces();this.renderPopular();this.renderCategories();}},
  async resetData(){if(confirm("Reset all locations to demo data?")){this.places=[...DEFAULT_PLACES];await this.save();location.reload();}},
  exportData(){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(this.places,null,2)],{type:"application/json"}));a.download="campus-locations.json";a.click();},
  importData(e){const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{const d=JSON.parse(r.result);if(!Array.isArray(d))throw 0;this.places=d;this.save();this.renderAdmin();this.renderMarkers();this.renderPlaces();this.renderPopular();this.renderCategories();this.toast("Locations imported.");}catch{this.toast("Invalid JSON file.");}};r.readAsText(f);},
  install(){if(this.deferredInstall){this.deferredInstall.prompt();this.deferredInstall=null;}},
  registerPWA(){if("serviceWorker" in navigator)navigator.serviceWorker.register("sw.js").catch(()=>{});},
  icon(cat){return ({Laboratory:"🧪",Classroom:"🏫",Office:"👨‍💼",Facility:"⭐",Building:"🏢"})[cat]||"📍";},
  escape(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));},
  escapeAttr(s){return this.escape(s).replace(/`/g,"&#96;");},
  toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("show");clearTimeout(this.tt);this.tt=setTimeout(()=>t.classList.remove("show"),2800);}
};

document.addEventListener("DOMContentLoaded",()=>app.init());

