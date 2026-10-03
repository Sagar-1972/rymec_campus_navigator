// Campus configuration. Edit these values for your college.
window.CAMPUS_CONFIG = {
  name: "Rao Bahadur Y Mahabaleswarappa Engineering College",
  shortName: "Campus Navigator",
  tagline: "Smart Campus Guide",
  center: [15.1394, 76.9214], // approximate Ballari area; replace with your exact campus coordinates
  zoom: 17
};


// Indoor floor maps are intentionally admin-managed only.
// No built-in/old floor maps are bundled; administrators add or replace
// building/floor maps from Admin -> Indoor Maps.
const BUILDING_GUIDES = {};

const DEFAULT_PLACES = [
  {id:"main",name:"Main Block",category:"Building",description:"Main academic and administrative block.",building:"Main Block",floor:"Ground Floor",room:"",lat:15.13955,lng:76.92135},
  ...Array.from({length:7},(_,i)=>({id:`lh${i+1}`,name:`LH-${String(i+1).padStart(2,"0")}`,category:"Classroom",description:"Lecture hall in the Main Block.",building:"Main Block",floor:"Ground Floor",room:`LH-${String(i+1).padStart(2,"0")}`,lat:15.13955,lng:76.92135})),
  ...Array.from({length:9},(_,i)=>({id:`lh1${i+1}`,name:`LH-${101+i}`,category:"Classroom",description:"Lecture hall in the Main Block.",building:"Main Block",floor:"1st Floor",room:`LH-${101+i}`,lat:15.13960,lng:76.92142})),
  ...Array.from({length:11},(_,i)=>({id:`lh2${i+1}`,name:`LH-${201+i}`,category:"Classroom",description:"Lecture hall in the Main Block.",building:"Main Block",floor:"2nd Floor",room:`LH-${201+i}`,lat:15.13960,lng:76.92142})),
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
  routePassedLine: null,
  navigationStarted: false,
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
  arrivalStableCount: 0,
  lastArrivalDistance: Infinity,
  lastPositionTime: 0,
  adminToken: sessionStorage.getItem("admin_token") || "",
  campusRoutes: [],
  indoorMaps: [],
  routeEditMap: null,
  routeEditLayer: null,

  currentPlacesCategory: "All",
async init() {
    const cached = JSON.parse(localStorage.getItem("campus_places") || "null");
    this.places = cached || DEFAULT_PLACES;
    await this.loadPlacesFromServer();
    await this.loadRoutesFromServer();
    await this.loadIndoorMapsFromServer();
    document.title = CAMPUS_CONFIG.name + " | Campus Navigator";
    $("#brandName").textContent = CAMPUS_CONFIG.shortName;
    this.renderPopular();
    this.currentPlacesCategory = "All";
    this.renderPlaces("", this.currentPlacesCategory);
    this.renderCategories();
    this.renderFavorites();
    this.initMap();
    this.installNavigationStyles();
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
  async loadIndoorMapsFromServer(){
    try{
      const res=await fetch("/api/indoor-maps",{cache:"no-store"});
      if(!res.ok) throw new Error("indoor map load failed");
      const data=await res.json();
      if(Array.isArray(data.maps)){
        this.indoorMaps=data.maps;
        localStorage.setItem("campus_indoor_maps_v2",JSON.stringify(this.indoorMaps));
        this.applyIndoorMaps();
      }
    }catch(e){
      try{this.indoorMaps=JSON.parse(localStorage.getItem("campus_indoor_maps_v2")||"[]");}catch{this.indoorMaps=[];}
      this.applyIndoorMaps();
    }
  },
  applyIndoorMaps(){
    // Uploaded admin maps override built-in floor maps without requiring code changes.
    for(const m of this.indoorMaps||[]){
      if(!m?.building||!m?.floor||!m?.image) continue;
      const existing=BUILDING_GUIDES[m.building] || {title:m.building,source:"Admin uploaded",floors:[],maps:{},image:m.image,note:"Indoor floor map uploaded by the campus administrator."};
      existing.title=existing.title||m.building;
      existing.maps=existing.maps||{};
      if(!existing.floors.includes(m.floor)) existing.floors.push(m.floor);
      existing.maps[m.floor]=m.image;
      existing.image=existing.maps[existing.floors[0]]||m.image;
      existing.source=m.source||existing.source||"Admin uploaded";
      existing.note=m.note||existing.note||"Indoor floor map uploaded by the campus administrator.";
      BUILDING_GUIDES[m.building]=existing;
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
      this.clearNavigationLayers();
      this.navigationDestination = null;
      this.navigationStarted = false;
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
      L.polyline(r.displayPoints?.length>1?r.displayPoints:r.points,{color:r.type==='restricted'?'#ef4444':r.type==='vehicle'?'#f59e0b':'#2563eb',weight:4,opacity:.55,dashArray:r.type==='restricted'?'8 8':null}).bindTooltip(this.escape(r.name||'Campus path')).addTo(this.campusRouteLayer);
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
    const search = $(".map-search"), styleControl = $(".map-style-control"), legend = $(".map-legend");
    if (style === "3d") {
      if (map2d) map2d.style.display = "none";
      if (map3d) map3d.hidden = false;
      if (search) search.style.display = "none";
      if (styleControl) styleControl.style.display = "none";
      if (legend) legend.style.display = "none";
      const note = $(".map3d-note"); if (note) note.textContent = "🏫 3D campus view — Explore only";
    } else {
      if (map3d) map3d.hidden = true;
      if (map2d) map2d.style.display = "";
      if (search) search.style.display = "";
      if (styleControl) styleControl.style.display = "";
      if (legend) legend.style.display = "";
      if (!this.map || !this.baseLayers) return;
      ["street","satellite"].forEach(k => { if (this.map.hasLayer(this.baseLayers[k])) this.map.removeLayer(this.baseLayers[k]); });
      if (this.map.hasLayer(this.hybridOverlay)) this.map.removeLayer(this.hybridOverlay);
      if (style === "street") this.baseLayers.street.addTo(this.map);
      else if (style === "hybrid") { this.baseLayers.satellite.addTo(this.map); this.hybridOverlay.addTo(this.map); }
      else this.baseLayers.satellite.addTo(this.map);
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
      <div class="place-info"><h3>${this.escape(p.name)}</h3><p>${this.escape(p.building)}${p.room ? " · "+this.escape(p.room):""}</p>${detailed?`<small>${this.escape(p.description)}</small>`:""}${this.buildingGuideFor(p)?`<button type="button" class="secondary-btn" style="margin-top:8px;padding:7px 10px;font-size:11px" onclick="event.stopPropagation();app.openIndoorGuide('${this.escapeAttr(p.building)}','${this.escapeAttr(p.floor)}')">🏢 Indoor Guide</button>`:""}</div>
      <button class="heart ${fav?"on":""}" onclick="event.stopPropagation();app.toggleFavorite('${p.id}')">${fav?"♥":"♡"}</button>
    </article>`;
  },

  buildingGuideFor(p){
    if(!p) return null;
    return BUILDING_GUIDES[p.building] || BUILDING_GUIDES[p.building?.replace(/^(Main )?CSE$/i,"CSE Block")] || null;
  },

  openIndoorGuide(building, floor){
    const guide=BUILDING_GUIDES[building];
    if(!guide){this.toast("No floor plan has been attached for this building yet.");return;}
    const selected=floor || guide.floors[0];
    const modal=document.createElement("div");
    modal.className="modal";
    const imageForFloor = f => (guide.maps && guide.maps[f]) || guide.image;
    modal.innerHTML=`<div class="modal-card indoor-modal-card">
      <div class="modal-head"><div><h3>🏢 ${this.escape(guide.title)}</h3><p class="muted" style="margin:4px 0 0">Indoor floor guide — ${this.escape(selected)}</p></div><button type="button" data-close>×</button></div>
      <div class="floor-chips">${guide.floors.map(f=>`<button type="button" class="floor-chip ${f===selected?"active":""}" data-floor="${this.escapeAttr(f)}">${this.escape(f)}</button>`).join("")}</div>
      <img class="indoor-plan" src="${imageForFloor(selected)}" alt="${this.escapeAttr(guide.title)} ${this.escapeAttr(selected)} floor map">
      <p class="muted" style="margin:10px 0 0">${this.escape(guide.note)}</p>
      <div class="indoor-source">Source: ${this.escape(guide.source)}</div>
    </div>`;
    document.body.appendChild(modal);
    const setFloor=(f)=>{
      modal.querySelectorAll("[data-floor]").forEach(b=>b.classList.toggle("active",b.dataset.floor===f));
      modal.querySelector(".indoor-modal-card .muted").textContent=`Indoor floor guide — ${f}`;
      const img=modal.querySelector(".indoor-plan");
      img.src=imageForFloor(f);
      img.alt=`${guide.title} ${f} floor map`;
    };
    modal.querySelectorAll("[data-floor]").forEach(btn=>btn.addEventListener("click",()=>setFloor(btn.dataset.floor)));
    modal.querySelector("[data-close]").addEventListener("click",()=>modal.remove());
    modal.addEventListener("click",e=>{if(e.target===modal)modal.remove();});
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
      <div class="detail-actions"><button class="primary-btn" onclick="app.navigateTo('${p.id}')">🧭 Navigate</button>${this.buildingGuideFor(p)?`<button class="secondary-btn" onclick="app.openIndoorGuide('${this.escapeAttr(p.building)}','${this.escapeAttr(p.floor)}')">🏢 Indoor Guide</button>`:""}<button class="secondary-btn" onclick="app.toggleFavorite('${p.id}');app.showDetails('${p.id}')">${this.isFavorite(p.id)?"♥ Saved":"♡ Save"}</button></div>
      ${this.buildingGuideFor(p)?`<div class="indoor-guide"><h3>Indoor navigation available</h3><p>${this.escape(this.buildingGuideFor(p).title)} · ${this.escape(p.floor || "Floor not specified")}</p><button class="secondary-btn" style="margin-top:10px" onclick="app.openIndoorGuide('${this.escapeAttr(p.building)}','${this.escapeAttr(p.floor)}')">View floor plan</button></div>`:""}
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

  installNavigationStyles(){
    if(document.getElementById('nav-live-style'))return;
    const style=document.createElement('style');style.id='nav-live-style';
    style.textContent='.nav-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px}.nav-actions .primary-btn,.nav-actions .secondary-btn{padding:9px 12px;font-size:12px}.nav-stop-btn{color:#b91c1c;border-color:#fecaca;background:#fff}.map-3d-note{pointer-events:none}.indoor-guide{margin:16px 0;background:#fff;border:1px solid #dbeafe;border-radius:16px;padding:15px}.indoor-guide h3{margin:0 0 5px;font-size:16px}.indoor-guide p{margin:0;color:#64748b;font-size:12px;line-height:1.5}.floor-chips{display:flex;gap:7px;flex-wrap:wrap;margin:12px 0}.floor-chip{border:1px solid #cbd5e1;background:#fff;color:#334155;border-radius:999px;padding:8px 11px;font-size:11px;font-weight:800;cursor:pointer}.floor-chip.active{background:#0f172a;color:#fff;border-color:#0f172a}.indoor-plan{width:100%;max-height:62vh;object-fit:contain;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;margin-top:8px}.indoor-source{font-size:10px;color:#94a3b8;margin-top:8px}.indoor-modal-card{width:min(1050px,100%)}';
    document.head.appendChild(style);
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
    this.navigationDestination=p;
    this.navigationStarted=false;
    this.stopNavigation(false);
    this.clearNavigationLayers();
    this.setMapStyle("satellite");
    this.map.setView([p.lat,p.lng],18);
    this.markers[p.id]?.openPopup();
    this.showNavigationReady(p);
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
    this.arrivalStableCount=0;
    this.lastArrivalDistance=Infinity;
    this.navigationStarted=true;
    this.showNavigationLoading(p);
    if(this.currentLocation) this.buildRoute(p,true); else this.locate(()=>this.buildRoute(p,true));
  },

  showNavigationReady(p){
    $("#routePanel").hidden=false;
    $("#routePanel").classList.remove('nav-arrived');
    const guide=this.buildingGuideFor(p);
    $("#routePanel").innerHTML=`<div class="nav-direction"><div class="nav-turn">🧭</div><div class="nav-copy"><strong>Navigate to ${this.escape(p.name)}</strong><small>${guide?`${this.escape(p.building)} · ${this.escape(p.floor||"Floor not specified")} — outdoor route first, then use the indoor guide.`:"Press Start Navigation to use live GPS."}</small></div></div><div class="nav-actions"><button type="button" class="primary-btn" onclick="app.startNavigation(app.navigationDestination)">▶ Start Navigation</button>${guide?`<button type="button" class="secondary-btn" onclick="app.openIndoorGuide('${this.escapeAttr(p.building)}','${this.escapeAttr(p.floor)}')">🏢 Indoor Guide</button>`:""}<button type="button" class="secondary-btn nav-stop-btn" onclick="app.stopNavigation(true)">⏹ Stop</button></div>`;
  },

  stopNavigation(clearPanel=true) {
    if(this.navigationWatchId!==null){navigator.geolocation.clearWatch(this.navigationWatchId);this.navigationWatchId=null;}
    this.navigationStarted=false;
    this.navigationRoute=null;
    this.navigationSteps=[];
    this.navigationStepIndex=0;
    this.clearNavigationLayers();
    if(clearPanel){const panel=$("#routePanel");if(panel){panel.hidden=true;panel.classList.remove('nav-arrived');}}
    else if(this.navigationDestination) this.showNavigationReady(this.navigationDestination);
  },

  clearNavigationLayers(){
    if(this.routeLine){this.routeLine.remove();this.routeLine=null;}
    if(this.routePassedLine){this.routePassedLine.remove();this.routePassedLine=null;}
  },

  showNavigationLoading(p){
    $("#routePanel").hidden=false;
    $("#routePanel").classList.remove('nav-arrived');
    $("#routePanel").innerHTML=`<div class="nav-direction"><div class="nav-turn">🧭</div><div class="nav-copy"><strong>Finding route to ${this.escape(p.name)}</strong><small>Getting your live location and campus route…</small></div></div><div class="nav-actions"><button type="button" class="secondary-btn nav-stop-btn" onclick="app.stopNavigation(true)">⏹ Stop</button></div>`;
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
      const accuracy=Math.max(5,Number(pos.coords.accuracy||20));
      // GPS can report a position several metres away from the real user. Do not
      // declare arrival from one noisy reading. Require a small, accuracy-aware
      // radius and two consecutive good readings.
      const arrivalRadius=Math.min(18,Math.max(6,Math.min(accuracy*0.55,12)));
      if(distance<=arrivalRadius){
        this.arrivalStableCount=(this.lastArrivalDistance<Infinity && distance<=this.lastArrivalDistance+2) ? this.arrivalStableCount+1 : 1;
        if(this.arrivalStableCount>=2){this.reachedDestination(distance);return;}
      }else{this.arrivalStableCount=0;}
      this.lastArrivalDistance=distance;
      const nearest=this.nearestRouteIndex(this.currentLocation);
      if(nearest>=0){
        const nearestCoord=this.navigationRoute.geometry.coordinates[nearest];
        const offRoute=this.map.distance(this.currentLocation,[nearestCoord[1],nearestCoord[0]]);
        const offRouteLimit=Math.max(45,Math.min(75,Number(pos.coords.accuracy||20)*2.5));
        if(offRoute>offRouteLimit && Date.now()-this.lastRerouteAt>12000){
          this.lastRerouteAt=Date.now();
          this.buildRoute(this.navigationDestination,true);
          return;
        }
      }
      const total=this.navigationRoute.geometry.coordinates.length;
      if(nearest>=0 && total>1){
        const progress=Math.max(0,Math.min(100,(nearest/(total-1))*100));
        const bar=$("#navProgress"); if(bar)bar.style.width=progress+"%";
        this.updateMovingRouteLine(nearest);
      }
      this.updateNavigationInstruction();
      if(this.map.getBounds().contains(this.currentLocation)===false){this.map.setView(this.currentLocation,Math.max(this.map.getZoom(),18),{animate:true});}
    }
  },

  updateMovingRouteLine(nearestIndex){
    if(!this.navigationRoute?.geometry?.coordinates?.length || !this.map)return;
    const coords=this.navigationRoute.geometry.coordinates;
    const start=Math.max(0,Math.min(nearestIndex,coords.length-1));
    const remaining=[[this.currentLocation[1],this.currentLocation[0]],...coords.slice(start+1)];
    if(this.routeLine)this.routeLine.setLatLngs(remaining.map(c=>[c[1],c[0]]));
    else if(remaining.length>1)this.routeLine=L.polyline(remaining.map(c=>[c[1],c[0]]),{weight:7,color:'#2563eb',opacity:.95,lineCap:'round',lineJoin:'round'}).addTo(this.map);
    const passed=coords.slice(0,start+1).map(c=>[c[1],c[0]]);
    if(passed.length>1){
      passed.push([this.currentLocation[0],this.currentLocation[1]]);
      if(this.routePassedLine)this.routePassedLine.setLatLngs(passed);
      else this.routePassedLine=L.polyline(passed,{weight:7,color:'#94a3b8',opacity:.55,lineCap:'round',lineJoin:'round'}).addTo(this.map);
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
    const distanceText=d<1000 ? `${Math.round(d)} m` : `${(d/1000).toFixed(1)} km`;
    const total=this.navigationSteps.length;
    $("#routePanel").hidden=false;
    $("#routePanel").innerHTML=`<div class="nav-direction"><div class="nav-turn">${icon}</div><div class="nav-copy"><strong>${this.escape(text)}</strong><small>${distanceText} · Step ${Math.min(next+1,total)} of ${total}</small></div></div><div class="nav-progress"><i id="navProgress"></i></div><div class="nav-actions"><button type="button" class="secondary-btn nav-stop-btn" onclick="app.stopNavigation(true)">⏹ Stop Navigation</button></div>`;
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
    const destination=this.navigationDestination; const guide=this.buildingGuideFor(destination);
    $("#routePanel").innerHTML=`<div class="nav-direction"><div class="nav-turn">✓</div><div class="nav-copy"><strong>🎉 Reached the destination!</strong><small>You have arrived at ${this.escape(name)}.</small></div></div><div class="nav-actions">${guide?`<button type="button" class="primary-btn" onclick="app.openIndoorGuide('${this.escapeAttr(destination.building)}','${this.escapeAttr(destination.floor)}')">🏢 Open ${this.escape(destination.floor||"Floor")} Guide</button>`:""}<button type="button" class="secondary-btn nav-stop-btn" onclick="app.stopNavigation(true)">⏹ Stop Navigation</button></div>`;
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
      this.clearNavigationLayers();
      const initialCoords=route.geometry?.coordinates||[];
      if(initialCoords.length>1){this.routeLine=L.polyline(initialCoords.map(c=>[c[1],c[0]]),{weight:7,color:'#2563eb',opacity:.95,lineCap:'round',lineJoin:'round'}).addTo(this.map);this.map.fitBounds(this.routeLine.getBounds(),{padding:[30,30]});}
      this.startWatchingLocation();this.updateNavigationInstruction();this.updateMovingRouteLine(0);
      if(!this.navigationSteps.length)$("#routePanel").innerHTML=`<b>${source} to ${this.escape(p.name)}</b><span>Route ready</span>`;
      else {const badge=document.createElement('small');badge.textContent=source;badge.style.cssText='display:block;margin-top:6px;color:#93c5fd;font-weight:700';$("#routePanel").appendChild(badge);}
    }catch(e){$("#routePanel").innerHTML=`<b>Navigation</b><span>Could not calculate a route. You can still use the map marker at ${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}.</span>`;}
  },

  isFavorite(id){return JSON.parse(localStorage.getItem("campus_favorites")||"[]").includes(id);},
  toggleFavorite(id){
    let f=JSON.parse(localStorage.getItem("campus_favorites")||"[]");
    f=f.includes(id)?f.filter(x=>x!==id):[...f,id];
    localStorage.setItem("campus_favorites",JSON.stringify(f));
    this.renderPopular();this.renderPlaces();this.renderFavorites();this.renderUserIndoorMaps();
    this.toast(f.includes(id)?"Added to favorites":"Removed from favorites");
  },
  renderFavorites(){
    const f=JSON.parse(localStorage.getItem("campus_favorites")||"[]");
    const list=this.places.filter(p=>f.includes(p.id));
    $("#favoritesList").innerHTML=list.length?list.map(p=>this.placeCard(p,true)).join(""):`<div class="empty"><div class="empty-icon">♡</div><h3>No saved places</h3><p>Tap the heart on any location to save it.</p></div>`;
  },

  askExample(q){
    this.openAssistant();
    const input=$("#chatInput");
    input.value=q;
    this.askAssistant();
  },
  openAssistant(){
    $("#assistantModal").hidden=false;
    if(!$("#chat").children.length)this.addChat("bot","Hi! I’m your RYMEC AI Campus Assistant. Ask me where a classroom, lab, office or facility is, for example: “Where is LH-01?” or “How do I reach the Computer Lab?”");
  },
  closeAssistant(){$("#assistantModal").hidden=true;},
  addChat(who,msg,html=false){$("#chat").insertAdjacentHTML("beforeend",`<div class="bubble ${who}">${html?msg:this.escape(msg)}</div>`);$("#chat").scrollTop=$("#chat").scrollHeight;},
  findIndoorMapForQuestion(q){
    const text=(q||'').toLowerCase().replace(/[–—]/g,'-');
    const maps=Array.isArray(this.indoorMaps)?this.indoorMaps:[];
    const allPlaces=[...(Array.isArray(this.places)?this.places:[]),...DEFAULT_PLACES];
    const aliases=[
      [/\blh\s*-?0*([1-7])\b/i,'Main Block','Ground Floor'],
      [/\blh\s*-?(10[1-9])\b/i,'Main Block','1st Floor'],
      [/\blh\s*-?(20[1-9]|21[01])\b/i,'Main Block','2nd Floor']
    ];
    let found=allPlaces.find(p=>[p.name,p.room].filter(Boolean).some(v=>text.includes(String(v).toLowerCase())));
    if(!found){
      for(const [re,building,floor] of aliases){
        if(re.test(text)){
          const m=text.match(re), room=m?.[1]?`LH-${String(m[1]).padStart(2,'0')}`:null;
          found=allPlaces.find(p=>room && (p.room===room || p.name===room)) || (room?{name:room,room,building,floor,description:'Lecture hall in the Main Block.'}:null);
          break;
        }
      }
    }
    if(found){
      const exact=maps.find(x=>String(x.building).toLowerCase()===String(found.building).toLowerCase() && String(x.floor).toLowerCase()===String(found.floor).toLowerCase());
      const byBuilding=maps.find(x=>String(x.building).toLowerCase()===String(found.building).toLowerCase());
      return {place:found,map:exact||byBuilding||null};
    }
    for(const m of maps){
      if(text.includes(String(m.building||'').toLowerCase())||text.includes(String(m.floor||'').toLowerCase()))return {place:null,map:m};
    }
    return {place:null,map:null};
  },
  cropIndoorMapForAI(dataUrl){
    return new Promise(resolve=>{
      if(!dataUrl || !String(dataUrl).startsWith('data:image/')) return resolve(dataUrl);
      const img=new Image();
      img.onload=()=>{
        try{
          const w=img.naturalWidth,h=img.naturalHeight;
          const c=document.createElement('canvas'); c.width=w; c.height=h;
          const ctx=c.getContext('2d',{willReadFrequently:true}); ctx.drawImage(img,0,0);
          const d=ctx.getImageData(0,0,w,h).data;
          let minX=w,minY=h,maxX=-1,maxY=-1;
          const step=Math.max(1,Math.floor(Math.max(w,h)/1200));
          for(let y=0;y<h;y+=step) for(let x=0;x<w;x+=step){
            const i=(y*w+x)*4, r=d[i],g=d[i+1],b=d[i+2],a=d[i+3];
            if(a>20 && (r<242 || g<242 || b<242)) { minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y); }
          }
          if(maxX<0) return resolve(dataUrl);
          const pad=Math.max(8,Math.round(Math.min(w,h)*0.015));
          minX=Math.max(0,minX-pad);minY=Math.max(0,minY-pad);maxX=Math.min(w-1,maxX+pad);maxY=Math.min(h-1,maxY+pad);
          const cw=maxX-minX+1,ch=maxY-minY+1;
          if(cw/w>0.94 && ch/h>0.94) return resolve(dataUrl);
          const out=document.createElement('canvas');out.width=cw;out.height=ch;
          out.getContext('2d').drawImage(img,minX,minY,cw,ch,0,0,cw,ch);
          resolve(out.toDataURL('image/webp',0.9));
        }catch(e){resolve(dataUrl);}
      };
      img.onerror=()=>resolve(dataUrl); img.src=dataUrl;
    });
  },
  async askAssistant(){
    const input=$("#chatInput"), q=input.value.trim(); if(!q)return; input.value='';
    this.addChat('user',q);
    this.addChat('bot','Analyzing the campus information and relevant indoor map…');
    try{
      const ctx=this.findIndoorMapForQuestion(q);
      const place=ctx.place;
      const aiImage=ctx.map?.image?await this.cropIndoorMapForAI(ctx.map.image):null;
      const payload={question:q,place:place?{name:place.name,building:place.building,floor:place.floor,room:place.room,description:place.description}:null,map:ctx.map?{building:ctx.map.building,floor:ctx.map.floor,title:ctx.map.title,note:ctx.map.note,image:ctx.map.image,imageForAI:aiImage}:null};
      const res=await fetch('/api/indoor-ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const data=await res.json();
      $("#chat").lastElementChild?.remove();
      if(data.ok){
        let answer=this.escape(data.answer||'I could not determine the location.');
        if(place && /not (?:contain|display|specif)|cannot determine|no information/i.test(answer)){
          answer=this.escape(`${place.name} is in ${place.building}, ${place.floor}${place.room?' ('+place.room+')':''}. The map below shows the relevant floor.`);
        }
        this.addChat('bot',answer);
        if(data.map?.image){
          const loc=data.map.location||null;
          let overlay='';
          if(loc && Number.isFinite(Number(loc.x)) && Number.isFinite(Number(loc.y))){
            const x=Math.max(0,Math.min(100,Number(loc.x)/10));
            const y=Math.max(0,Math.min(100,Number(loc.y)/10));
            const w=Math.max(1,Math.min(100-x,Number(loc.width||70)/10));
            const h=Math.max(1,Math.min(100-y,Number(loc.height||70)/10));
            const label=this.escape(loc.label||place?.name||'Location');
            overlay=`<div class="ai-map-highlight" style="left:${x}%;top:${y}%;width:${w}%;height:${h}%;"><span>${label}</span></div>`;
          }
          const wrap=`<div class="ai-map-result"><b>${this.escape(data.map.building||place?.building||'Indoor Map')} · ${this.escape(data.map.floor||place?.floor||'')}</b><div class="ai-map-stage"><img src="${data.map.image}" alt="Relevant indoor floor map">${overlay}</div><small>${this.escape(data.map.highlight||'Relevant floor map')}${loc?.confidence?` · Highlight confidence: ${this.escape(loc.confidence)}`:''}</small></div>`;
          $("#chat").insertAdjacentHTML('beforeend',wrap);
          $("#chat").scrollTop=$("#chat").scrollHeight;
        }
      }else throw new Error(data.error||'AI service unavailable');
    }catch(e){
      $("#chat").lastElementChild?.remove();
      const ctx=this.findIndoorMapForQuestion(q), p=ctx.place;
      if(p){
        this.addChat('bot',`${p.name} is in ${p.building}, ${p.floor}${p.room?' ('+p.room+')':''}. The relevant indoor map is shown below.`);
        if(ctx.map?.image){
          this.addChat('bot',`<div class="ai-map-result"><b>${this.escape(ctx.map.building)} · ${this.escape(ctx.map.floor)}</b><div class="ai-map-stage"><img src="${ctx.map.image}" alt="Relevant indoor floor map"></div></div>`,true);
        }
      }else{
        this.addChat('bot','I could not analyze that request right now. Try a room name such as “LH-01”, a lab name, or a building/floor.');
      }
      console.warn('Indoor AI fallback:',e);
    }
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
      await this.loadIndoorMapsFromServer();
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
      <div class="admin-actions"><button class="primary-btn" onclick="app.newPlace()">＋ Add location</button><button class="primary-btn" onclick="app.openIndoorMapManager()">🏢 Indoor Maps</button><button class="primary-btn" onclick="app.openRouteManager()">🛣️ Campus Routes</button><button class="secondary-btn" onclick="app.exportData()">Export JSON</button><label class="secondary-btn file-label">Import JSON<input type="file" accept=".json" onchange="app.importData(event)" hidden></label><button class="danger-btn" onclick="app.resetData()">Reset demo data</button></div>
      <div class="admin-list">${this.places.map(p=>`<div class="admin-row"><div><b>${this.escape(p.name)}</b><small>${this.escape(p.category)} · ${this.escape(p.building)}</small></div><button onclick="app.editPlace('${p.id}')">Edit</button><button class="danger-text" onclick="app.deletePlace('${p.id}')">Delete</button></div>`).join("")}</div>`;
  },
  openIndoorMapManager(){
    const existing=document.getElementById('indoorManagerModal');
    if(existing) existing.remove();
    const modal=document.createElement('div');
    modal.id='indoorManagerModal';
    modal.style.cssText='position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(2,6,23,.68);padding:18px;box-sizing:border-box;';

    const campusBuildings=[...new Set((Array.isArray(this.places)?this.places:[]).map(p=>String(p.building||'').trim()).filter(Boolean))];
    const knownBuildings=['Main Block','CS/ES/IS Block','Library & PG Block','Electrical Block','Civil Engineering Block','Mechanical Block','Canteen','Girls Waiting Hall','Generator Room','Polytechnic','Old MEC Block','Old Civil Block','Boys Hostel','PU College','Auditorium','Indoor Stadium','IGNO Centre'];
    const allBuildings=[...new Set([...campusBuildings,...knownBuildings])].sort((a,b)=>a.localeCompare(b));
    const esc=v=>this.escape(String(v??''));
    const attr=v=>this.escapeAttr(String(v??''));
    const options=allBuildings.map(b=>`<option value="${attr(b)}">${esc(b)}</option>`).join('');
    const maps=Array.isArray(this.indoorMaps)?this.indoorMaps:[];
    const rows=maps.length?maps.slice().sort((a,b)=>`${a.building} ${a.floor}`.localeCompare(`${b.building} ${b.floor}`)).map(m=>`<div style="display:flex;gap:8px;align-items:center;padding:12px;border:1px solid #e2e8f0;border-radius:12px;background:#fff;margin-top:8px"><div style="flex:1"><b>${esc(m.building)}</b><small style="display:block;color:#64748b;margin-top:3px">${esc(m.floor)}${m.source?' · '+esc(m.source):''}</small></div><button type="button" class="secondary-btn" data-replace="${attr(m.id)}">Replace</button><button type="button" class="danger-text" data-delete="${attr(m.id)}">Delete</button></div>`).join(''):'<div style="padding:24px;text-align:center;color:#64748b">No admin-uploaded indoor maps yet.</div>';

    modal.innerHTML=`<div style="width:min(1050px,100%);max-height:90vh;overflow:auto;background:#fff;border-radius:20px;padding:20px;box-shadow:0 30px 80px rgba(0,0,0,.35);box-sizing:border-box">
      <div style="display:flex;justify-content:space-between;gap:15px;align-items:flex-start"><div><h3 style="margin:0;font-size:20px">🏢 Indoor Map Manager</h3><p style="margin:5px 0 0;color:#64748b;font-size:12px">Upload, replace or delete floor maps. Buildings come from the campus directory.</p></div><button type="button" data-close style="border:0;background:#f1f5f9;border-radius:9px;font-size:22px;width:36px;height:36px;cursor:pointer">×</button></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:18px">
        <label style="font-size:11px;font-weight:800;color:#475569">BUILDING<select id="indoorBuilding" style="display:block;width:100%;margin-top:6px;padding:11px;border:1px solid #cbd5e1;border-radius:9px;background:#fff"><option value="">Select a campus building</option>${options}</select></label>
        <label style="font-size:11px;font-weight:800;color:#475569">OR NEW BUILDING<input id="indoorNewBuilding" placeholder="Only if not listed" style="display:block;width:100%;margin-top:6px;padding:11px;border:1px solid #cbd5e1;border-radius:9px;box-sizing:border-box"></label>
        <label style="font-size:11px;font-weight:800;color:#475569">FLOOR<input id="indoorFloor" placeholder="e.g. 1st Floor" style="display:block;width:100%;margin-top:6px;padding:11px;border:1px solid #cbd5e1;border-radius:9px;box-sizing:border-box"></label>
        <label style="font-size:11px;font-weight:800;color:#475569">MAP IMAGE<input id="indoorFile" type="file" accept="image/png,image/jpeg,image/webp" style="display:block;width:100%;margin-top:6px;padding:8px;border:1px solid #cbd5e1;border-radius:9px;box-sizing:border-box"></label>
        <label style="grid-column:1/-1;font-size:11px;font-weight:800;color:#475569">SOURCE / NOTE<input id="indoorSource" placeholder="Optional note" style="display:block;width:100%;margin-top:6px;padding:11px;border:1px solid #cbd5e1;border-radius:9px;box-sizing:border-box"></label>
      </div>
      <button type="button" class="primary-btn" data-upload style="margin-top:12px">⬆️ Upload / Replace Map</button>
      <div style="margin-top:18px"><h4 style="margin:0 0 8px">Uploaded Indoor Maps</h4>${rows}</div>
    </div>`;
    document.body.appendChild(modal);
    document.body.style.overflow='hidden';
    const close=()=>{modal.remove();document.body.style.overflow='';};
    modal.querySelector('[data-close]').onclick=close;
    modal.onclick=e=>{if(e.target===modal)close();};
    modal.querySelectorAll('[data-replace]').forEach(btn=>btn.onclick=()=>{
      const m=maps.find(x=>String(x.id)===String(btn.dataset.replace)); if(!m)return;
      const sel=modal.querySelector('#indoorBuilding');
      if(allBuildings.includes(m.building)) sel.value=m.building; else modal.querySelector('#indoorNewBuilding').value=m.building;
      modal.querySelector('#indoorFloor').value=m.floor||'';
      modal.querySelector('#indoorSource').value=m.source||'';
      modal.dataset.replaceId=m.id;
      this.toast(`Ready to replace ${m.building} · ${m.floor}.`);
    });
    modal.querySelectorAll('[data-delete]').forEach(btn=>btn.onclick=async()=>{
      const m=maps.find(x=>String(x.id)===String(btn.dataset.delete)); if(!m)return;
      if(!confirm(`Delete the indoor map for ${m.building} · ${m.floor}?`))return;
      const ok=await this.deleteIndoorMap(m.id); if(ok){close();this.openIndoorMapManager();}
    });
    modal.querySelector('[data-upload]').onclick=async()=>{
      const building=(modal.querySelector('#indoorNewBuilding').value.trim()||modal.querySelector('#indoorBuilding').value.trim());
      const floor=modal.querySelector('#indoorFloor').value.trim();
      const file=modal.querySelector('#indoorFile').files[0];
      const source=modal.querySelector('#indoorSource').value.trim();
      if(!building||!floor||!file){this.toast('Choose a building, floor and map image.');return;}
      try{
        this.toast('Preparing indoor map…');
        const image=await this.optimizeIndoorImage(file);
        const payload={id:modal.dataset.replaceId||`im_${Date.now()}`,building,floor,title:building,source:source||file.name,image,note:`Indoor floor map for ${floor}.`};
        const ok=await this.saveIndoorMap(payload);
        if(ok){close();this.renderAdmin();this.toast('Indoor map uploaded and synced.');}
      }catch(e){console.error(e);this.toast(e?.message||'Unable to upload the map.');}
    };
  },
  openIndoorMapsForUsers(){
    const existing=document.getElementById('userIndoorModal');
    if(existing) existing.remove();
    const modal=document.createElement('div');
    modal.id='userIndoorModal';
    modal.style.cssText='position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(2,6,23,.68);padding:18px;box-sizing:border-box;';
    const maps=Array.isArray(this.indoorMaps)?this.indoorMaps:[];
    const buildings=[...new Set(maps.map(m=>m.building).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    const esc=v=>this.escape(String(v??''));
    const options=buildings.map(b=>`<option value="${this.escapeAttr(b)}">${esc(b)}</option>`).join('');
    modal.innerHTML=`<div style="width:min(1050px,100%);max-height:90vh;overflow:auto;background:#fff;border-radius:20px;padding:20px;box-sizing:border-box;box-shadow:0 30px 80px rgba(0,0,0,.35)"><div style="display:flex;justify-content:space-between;align-items:flex-start"><div><h3 style="margin:0">🏢 Indoor Maps</h3><p style="margin:5px 0;color:#64748b;font-size:12px">Choose a building and floor to view the admin-uploaded floor map.</p></div><button type="button" data-close style="border:0;background:#f1f5f9;border-radius:9px;font-size:22px;width:36px;height:36px">×</button></div>
      ${buildings.length?`<label style="display:block;margin-top:18px;font-size:11px;font-weight:800;color:#475569">BUILDING<select id="userIndoorBuilding" style="display:block;width:100%;margin-top:6px;padding:11px;border:1px solid #cbd5e1;border-radius:9px;background:#fff"><option value="">Select building</option>${options}</select></label><div id="userIndoorFloors" style="display:flex;gap:8px;flex-wrap:wrap;margin:14px 0"></div><div id="userIndoorImage"></div>`:`<div style="padding:35px 10px;text-align:center;color:#64748b"><h3 style="color:#0f172a">No indoor maps available yet</h3><p>The campus administrator has not uploaded any floor maps.</p></div>`}
    </div>`;
    document.body.appendChild(modal); document.body.style.overflow='hidden';
    const close=()=>{modal.remove();document.body.style.overflow='';};
    modal.querySelector('[data-close]').onclick=close; modal.onclick=e=>{if(e.target===modal)close();};
    const renderBuilding=()=>{
      const b=modal.querySelector('#userIndoorBuilding')?.value; const list=maps.filter(m=>m.building===b);
      const floors=[...new Set(list.map(m=>m.floor).filter(Boolean))];
      const floorBox=modal.querySelector('#userIndoorFloors'), imageBox=modal.querySelector('#userIndoorImage');
      if(!floorBox)return;
      floorBox.innerHTML=floors.map((f,i)=>`<button type="button" class="secondary-btn" data-floor="${this.escapeAttr(f)}">${esc(f)}</button>`).join(''); imageBox.innerHTML='';
      floorBox.querySelectorAll('[data-floor]').forEach(btn=>btn.onclick=()=>{
        const m=list.find(x=>x.floor===btn.dataset.floor); if(!m)return;
        imageBox.innerHTML=`<h4 style="margin:12px 0 6px">${esc(b)} · ${esc(m.floor)}</h4><img src="${m.image}" alt="${esc(b)} ${esc(m.floor)} floor map" style="display:block;width:100%;max-height:65vh;object-fit:contain;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px">`;
      });
    };
    modal.querySelector('#userIndoorBuilding')?.addEventListener('change',renderBuilding);
  },
  optimizeIndoorImage(file){
    return new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onerror=()=>reject(new Error("Could not read the image."));
      reader.onload=()=>{
        const img=new Image();
        img.onerror=()=>reject(new Error("The selected file is not a supported image."));
        img.onload=()=>{
          const max=1800;
          const scale=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));
          const w=Math.max(1,Math.round(img.naturalWidth*scale)),h=Math.max(1,Math.round(img.naturalHeight*scale));
          const c=document.createElement("canvas");c.width=w;c.height=h;
          const ctx=c.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,w,h);ctx.drawImage(img,0,0,w,h);
          resolve(c.toDataURL("image/webp",0.84));
        };
        img.src=reader.result;
      };
      reader.readAsDataURL(file);
    });
  },
  async saveIndoorMap(mapData){
    const old=[...(this.indoorMaps||[])];
    this.indoorMaps=this.indoorMaps.filter(m=>!(m.building===mapData.building&&m.floor===mapData.floor)&&m.id!==mapData.id);
    this.indoorMaps.push(mapData);
    localStorage.setItem("campus_indoor_maps_v2",JSON.stringify(this.indoorMaps));
    this.applyIndoorMaps();
    if(!this.adminToken){this.toast("Map saved on this device. Log in as admin to sync.");return true;}
    try{
      const res=await fetch("/api/indoor-maps",{method:"PUT",headers:{"Content-Type":"application/json","x-admin-token":this.adminToken},body:JSON.stringify(mapData)});
      if(res.status===401){this.indoorMaps=old;this.applyIndoorMaps();sessionStorage.removeItem("admin_token");this.adminToken="";this.toast("Admin session expired. Please log in again.");return false;}
      if(!res.ok)throw new Error("server sync failed");
      await this.loadIndoorMapsFromServer();
      return true;
    }catch(e){this.indoorMaps=old;this.applyIndoorMaps();localStorage.setItem("campus_indoor_maps_v2",JSON.stringify(old));this.toast("Map was not synced to the server.");return false;}
  },
  async deleteIndoorMap(id){
    const old=[...(this.indoorMaps||[])];
    this.indoorMaps=this.indoorMaps.filter(m=>m.id!==id);
    localStorage.setItem("campus_indoor_maps_v2",JSON.stringify(this.indoorMaps));
    this.applyIndoorMaps();
    if(!this.adminToken){this.toast("Deleted on this device. Log in as admin to sync.");return true;}
    try{
      const res=await fetch(`/api/indoor-maps?id=${encodeURIComponent(id)}`,{method:"DELETE",headers:{"x-admin-token":this.adminToken}});
      if(res.status===401)throw new Error("session");
      if(!res.ok)throw new Error("delete failed");
      await this.loadIndoorMapsFromServer();
      return true;
    }catch(e){this.indoorMaps=old;this.applyIndoorMaps();localStorage.setItem("campus_indoor_maps_v2",JSON.stringify(old));this.toast(e.message==="session"?"Admin session expired. Please log in again.":"Could not delete the server map.");return false;}
  },
  openRouteManager(){
    const modal=document.createElement("div");modal.className="modal";
    modal.innerHTML=`<div class="modal-card route-manager-card"><div class="modal-head"><div><h3>🛣️ Campus Route Manager</h3><p class="muted" style="margin:4px 0 0">Draw the real roads and walking paths inside RYMEC. Click along the path, then save it.</p></div><button type="button" data-close>×</button></div>
      <div class="route-manager-toolbar"><select id="routeType"><option value="walking">🚶 Walking path</option><option value="vehicle">🚗 Vehicle road</option><option value="restricted">🚫 Restricted path</option></select><input id="routeName" placeholder="Path name e.g. Main Gate → CSE Block"><button type="button" class="secondary-btn" data-undo>Undo</button><button type="button" class="secondary-btn" data-clear>Clear</button><button type="button" class="primary-btn" data-finish>Save Route</button></div>
      <div id="routeManagerMap" class="route-manager-map"></div><div class="route-manager-status" data-status>Click the map to place route points. The saved route will use your exact points.</div>
      <div class="route-list">${this.campusRoutes.length?this.campusRoutes.map(r=>`<div class="route-row"><div><b>${this.escape(r.name||"Unnamed path")}</b><small>${r.type||"walking"} · ${(r.points||[]).length} points</small></div><button class="danger-text" data-delete-route="${this.escapeAttr(r.id)}">Delete</button></div>`).join(""):"<div class='empty' style='padding:25px'>No campus paths yet. Draw your first path above.</div>"}</div>
      <p class="coordinate-help">Tip: Draw continuously along the center of the actual road/path. Add points at every turn and junction. Restricted paths are shown but excluded from normal navigation.</p></div>`;
    document.body.appendChild(modal);
    const map=L.map("routeManagerMap",{zoomControl:true}).setView(CAMPUS_CONFIG.center,18);
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",{maxZoom:20,attribution:'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'}).addTo(map);
    const existing=L.layerGroup().addTo(map);
    this.campusRoutes.forEach(r=>{if((r.points||[]).length>1)L.polyline(r.displayPoints?.length>1?r.displayPoints:r.points,{color:r.type==='restricted'?'#ef4444':r.type==='vehicle'?'#f59e0b':'#2563eb',weight:5,opacity:.8,dashArray:r.type==='restricted'?'8 8':null}).addTo(existing);});
    if(this.campusRoutes.some(r=>(r.points||[]).length)){
      const all=this.campusRoutes.flatMap(r=>r.points||[]); if(all.length>1) map.fitBounds(L.latLngBounds(all),{padding:[25,25]});
    }
    let points=[],line=null,markers=L.layerGroup().addTo(map);
    const status=modal.querySelector("[data-status]");
    const redraw=()=>{if(line)line.remove();line=points.length?L.polyline(points,{color:'#22c55e',weight:6,smoothFactor:1.5,lineCap:'round',lineJoin:'round'}).addTo(map):null;markers.clearLayers();points.forEach((p,i)=>L.circleMarker(p,{radius:i===0||i===points.length-1?7:4,color:'#22c55e',fillOpacity:1,weight:2}).addTo(markers));status.innerHTML=points.length?`Drawing <b>${points.length} points</b>. Points are kept exactly as you place them.`:'Click the map to place the first point.';};
    map.on("click",e=>{const p=[e.latlng.lat,e.latlng.lng],last=points[points.length-1];if(last&&this.distanceMeters(last,p)<4)return;points.push(p);redraw();});
    modal.querySelector("[data-undo]").addEventListener("click",()=>{if(points.length){points.pop();redraw();}});
    modal.querySelector("[data-clear]").addEventListener("click",()=>{points=[];redraw();});
    modal.querySelector("[data-finish]").addEventListener("click",async()=>{
      const name=modal.querySelector("#routeName").value.trim()||`Campus path ${this.campusRoutes.length+1}`;
      const type=modal.querySelector("#routeType").value;
      if(points.length<2){this.toast("Place at least two points on the road.");return;}
      const raw=points.map(p=>[+p[0].toFixed(7),+p[1].toFixed(7)]);
      const ok=await this.saveRoute({id:"r"+Date.now(),name,type,points:raw});
      if(ok){points=[];line?.remove();markers.clearLayers();modal.remove();map.remove();this.toast("Clean campus path saved and synced.");this.renderAdmin();this.openRouteManager();}
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

