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

  currentPlacesCategory: "All",
init() {
    this.places = JSON.parse(localStorage.getItem("campus_places") || "null") || DEFAULT_PLACES;
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

  save() { localStorage.setItem("campus_places", JSON.stringify(this.places)); },

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
    if (id === "map" && this.map) setTimeout(() => this.map.invalidateSize(), 150);
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
    this.render3DMarkers();
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
    const distanceText=d>=1000?(d/1000).toFixed(1)+' km':Math.max(1,Math.round(d))+' m';
    const total=this.navigationSteps.length;
    $("#routePanel").hidden=false;
    $("#routePanel").innerHTML=`<div class="nav-direction"><div class="nav-turn">${icon}</div><div class="nav-copy"><strong>${this.escape(text)}</strong><small>${distanceText} · Step ${Math.min(next+1,total)} of ${total}</small></div></div><div class="nav-progress"><i id="navProgress"></i></div>`;
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

  async buildRoute(p,live=false) {
    const [lat,lng]=this.currentLocation;
    $("#routePanel").hidden=false; $("#routePanel").classList.remove('nav-arrived'); $("#routePanel").innerHTML="Calculating route and directions...";
    try{
      const url=`https://router.project-osrm.org/route/v1/driving/${lng},${lat};${p.lng},${p.lat}?overview=full&steps=true&geometries=geojson`;
      const r=await fetch(url); const data=await r.json();
      if(!data.routes?.length)throw new Error();
      const route=data.routes[0];
      this.lastRerouteAt=Date.now();
      this.navigationRoute=route;
      this.navigationSteps=route.legs?.[0]?.steps||[];
      this.navigationStepIndex=0;
      if(this.routeLine)this.routeLine.remove();
      this.routeLine=L.geoJSON(route.geometry,{weight:6}).addTo(this.map);
      this.map.fitBounds(this.routeLine.getBounds(),{padding:[30,30]});
      this.startWatchingLocation();
      this.updateNavigationInstruction();
      if(!this.navigationSteps.length){
        $("#routePanel").innerHTML=`<b>Route to ${this.escape(p.name)}</b><span>${(route.distance/1000).toFixed(2)} km · approx ${Math.ceil(route.duration/60)} min</span>`;
      }
    }catch(e){
      $("#routePanel").innerHTML=`<b>Navigation</b><span>Online routing is temporarily unavailable. Destination: ${this.escape(p.name)} (${p.lat.toFixed(5)}, ${p.lng.toFixed(5)})</span>`;
    }
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
      <div class="stats"><div><b>${this.places.length}</b><span>Locations</span></div><div><b>${new Set(this.places.map(p=>p.category)).size}</b><span>Categories</span></div><div><b>${JSON.parse(localStorage.getItem("campus_favorites")||"[]").length}</b><span>Saved</span></div></div>
      <div class="admin-actions"><button class="primary-btn" onclick="app.newPlace()">＋ Add location</button><button class="secondary-btn" onclick="app.exportData()">Export JSON</button><label class="secondary-btn file-label">Import JSON<input type="file" accept=".json" onchange="app.importData(event)" hidden></label><button class="danger-btn" onclick="app.resetData()">Reset demo data</button></div>
      <div class="admin-list">${this.places.map(p=>`<div class="admin-row"><div><b>${this.escape(p.name)}</b><small>${this.escape(p.category)} · ${this.escape(p.building)}</small></div><button onclick="app.editPlace('${p.id}')">Edit</button><button class="danger-text" onclick="app.deletePlace('${p.id}')">Delete</button></div>`).join("")}</div>`;
  },
  newPlace(){this.editPlace(null);},
  editPlace(id){
    const p=id?this.places.find(x=>x.id===id):{id:"p"+Date.now(),name:"",category:"Classroom",description:"",building:"",floor:"",room:"",lat:CAMPUS_CONFIG.center[0],lng:CAMPUS_CONFIG.center[1]};
    const modal=document.createElement("div");modal.className="modal";modal.innerHTML=`<div class="modal-card"><div class="modal-head"><h3>${id?"Edit":"Add"} location</h3><button onclick="this.closest('.modal').remove()">×</button></div>
    <div class="form-grid">${["name","category","description","building","floor","room","lat","lng"].map(k=>`<label>${k.toUpperCase()}<input id="f_${k}" value="${this.escapeAttr(p[k]??"")}"></label>`).join("")}</div>
    <button class="primary-btn full" onclick="app.savePlace('${p.id}',this.closest('.modal'))">Save location</button></div>`;
    document.body.appendChild(modal);
  },
  savePlace(id,modal){
    const p={id};["name","category","description","building","floor","room"].forEach(k=>p[k]=$("#f_"+k).value.trim());
    p.lat=parseFloat($("#f_lat").value);p.lng=parseFloat($("#f_lng").value);
    if(!p.name||!Number.isFinite(p.lat)||!Number.isFinite(p.lng)){this.toast("Name and valid coordinates are required.");return;}
    const i=this.places.findIndex(x=>x.id===id); if(i>=0)this.places[i]=p;else this.places.push(p);
    this.save();modal.remove();this.renderAdmin();this.renderMarkers();this.render3DMarkers();this.renderPlaces();this.renderPopular();this.renderCategories();this.toast("Location saved.");
  },
  deletePlace(id){if(confirm("Delete this location?")){this.places=this.places.filter(p=>p.id!==id);this.save();this.renderAdmin();this.renderMarkers();this.render3DMarkers();this.renderPlaces();this.renderPopular();this.renderCategories();}},
  resetData(){if(confirm("Reset all locations to demo data?")){this.places=DEFAULT_PLACES;this.save();location.reload();}},
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

