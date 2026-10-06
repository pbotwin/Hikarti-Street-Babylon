import { Vector3 } from '@babylonjs/core';
import { L } from '../world/Layout.js';

// Hikari Plaza and Hikari Motors lots (the original's ShopPlaces PLAZA / MOTORS).
const PLAZA = { x0: -126, x1: -96, z0: 271, z1: 285, walk0: 275.5, walk1: 280.5 };
const MOTORS = { x0: 94, x1: 127, z0: 271, z1: 285, showroomX: 114 };
const SHOP_LOT_FOOTPRINTS = [
  { x0: PLAZA.x0, x1: PLAZA.x1, z0: PLAZA.z0, z1: PLAZA.walk0, color: '#c7a7b4' },
  { x0: PLAZA.x0, x1: PLAZA.x1, z0: PLAZA.walk1, z1: PLAZA.z1, color: '#c7a7b4' },
  { x0: MOTORS.showroomX, x1: MOTORS.x1, z0: MOTORS.z0 + 1, z1: MOTORS.z1 - 1, color: '#c98f8f' },
];

const MAX_ZOOM = 6;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const middle = (bounds) => ({ x: (bounds.x0 + bounds.x1) / 2, z: (bounds.z0 + bounds.z1) / 2 });

/** Rotating street map and a north-up city atlas with touch/mouse navigation. */
export class Minimap {
  constructor(root, { player, cameraRig, collectibles, portal, missions, npcs }) {
    Object.assign(this, { player, cameraRig, collectibles, portal, missions, npcs });
    this.el = document.createElement('div');
    this.el.className = 'minimap';
    this.el.innerHTML = `
      <button class="map-open" aria-label="Open city map"></button>
      <div class="map-heading"><div><small>EXPLORE HIKARI</small><b>City map</b></div><button class="map-close" aria-label="Close map">×</button></div>
      <div class="map-tools" role="group" aria-label="Map navigation">
        <div class="map-zoom"><button data-map-action="out" aria-label="Zoom out">−</button><output class="map-zoom-level" aria-label="Map zoom">1×</output><button data-map-action="in" aria-label="Zoom in">+</button></div>
        <button data-map-action="player">Find me</button><button data-map-action="overview">Overview</button>
      </div>
      <div class="map-drawing"><canvas width="184" height="184" tabindex="-1" aria-label="Map of Hikari city. Use plus and minus to zoom, arrow keys to pan, or drag the map."></canvas><span class="n">N</span><div class="map-location" aria-live="polite"></div></div>
      <div class="map-legend"><span><i class="you"></i>You</span><span><i class="fragment"></i>Fragment</span><span><i class="favor"></i>Favor</span><span><i class="objective"></i>Objective</span><span><i class="resident"></i>Resident</span><span><i class="landmark"></i>Landmark</span><span><i class="shop"></i>Shop</span></div>
      <p class="map-help">Zoom for street details. Drag to pan · tap a marker for its name.</p>`;
    this.root = root;
    this.hud = root.querySelector('.hud');
    this.hud.appendChild(this.el);
    this.canvas = this.el.querySelector('canvas');
    this.g = this.canvas.getContext('2d');
    this.n = this.el.querySelector('.n');
    this.location = this.el.querySelector('.map-location');
    this.zoomLabel = this.el.querySelector('.map-zoom-level');
    this.zoomIn = this.el.querySelector('[data-map-action="in"]');
    this.zoomOut = this.el.querySelector('[data-map-action="out"]');
    this._zoom = 1;
    this._center = middle(L.mapBounds);
    this._hitTargets = [];
    this._drag = null;
    this.t = 1;
    this.expanded = false;
    this._bindNavigation();
  }

  get zoom() { return this._zoom; }

  _bindAction(button, activate) {
    button.addEventListener('pointerup', (event) => {
      if (event.pointerType === 'mouse' || button.disabled) return;
      event.preventDefault(); event.stopPropagation();
      // Shared across buttons: closing the atlas can place the compact map's
      // opener under the finger before the delayed compatibility click arrives.
      this._touchHandledUntil = performance.now() + 700;
      activate();
    });
    button.addEventListener('click', (event) => {
      const fromTouch = event.pointerType === 'touch' || event.pointerType === 'pen' || (!event.pointerType && event.detail > 0);
      if (fromTouch && performance.now() < this._touchHandledUntil) return;
      activate();
    });
  }

  _bindNavigation() {
    this.el.addEventListener('pointerdown', (event) => event.stopPropagation());
    this._bindAction(this.el.querySelector('.map-open'), () => this.onOpen?.());
    this._bindAction(this.el.querySelector('.map-close'), () => this.onClose?.());
    this.el.querySelectorAll('[data-map-action]').forEach((button) => {
      this._bindAction(button, () => {
        const action = button.dataset.mapAction;
        if (action === 'in') this.zoomBy(1.5);
        else if (action === 'out') this.zoomBy(1 / 1.5);
        else if (action === 'player') this.focusPlayer();
        else this.showOverview();
      });
    });
    this.canvas.addEventListener('wheel', (event) => {
      if (!this.expanded) return;
      event.preventDefault(); event.stopPropagation();
      const bounds = this.canvas.getBoundingClientRect();
      this.zoomBy(Math.exp(-clamp(event.deltaY, -150, 150) * .003), {
        x: event.clientX - bounds.left, y: event.clientY - bounds.top,
      });
    }, { passive: false });
    this.canvas.addEventListener('pointerdown', (event) => {
      if (!this.expanded || this._drag || (event.pointerType === 'mouse' && event.button !== 0)) return;
      event.preventDefault(); event.stopPropagation();
      this.canvas.focus({ preventScroll: true });
      this.canvas.setPointerCapture(event.pointerId);
      this._drag = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false };
      this.el.classList.add('is-panning');
    });
    this.canvas.addEventListener('pointermove', (event) => {
      const drag = this._drag;
      if (!drag || drag.id !== event.pointerId || !this._view) return;
      event.preventDefault(); event.stopPropagation();
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      drag.moved ||= Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 5;
      drag.x = event.clientX; drag.y = event.clientY;
      if (this._zoom <= 1) return;
      this._center.x -= dx / this._view.scale;
      this._center.z += dy / this._view.scale;
      this._clampCenter(); this._redraw();
    });
    const endDrag = (event) => {
      if (!this._drag || this._drag.id !== event.pointerId) return;
      if (event.type === 'pointerup' && !this._drag.moved) {
        const bounds = this.canvas.getBoundingClientRect();
        this._selectMarker(event.clientX - bounds.left, event.clientY - bounds.top);
      }
      this._drag = null;
      if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
      this.el.classList.remove('is-panning');
    };
    this.canvas.addEventListener('pointerup', endDrag);
    this.canvas.addEventListener('pointercancel', endDrag);
    this.canvas.addEventListener('lostpointercapture', endDrag);
    this.el.addEventListener('keydown', (event) => {
      if (!this.expanded) return;
      if (event.code === 'Tab') {
        const targets = [...this.el.querySelectorAll('button:not(.map-open):not(:disabled), canvas')];
        const index = targets.indexOf(document.activeElement);
        targets[(index + (event.shiftKey ? -1 : 1) + targets.length) % targets.length]?.focus();
      } else if (event.code === 'Equal' || event.code === 'NumpadAdd') this.zoomBy(1.5);
      else if (event.code === 'Minus' || event.code === 'NumpadSubtract') this.zoomBy(1 / 1.5);
      else if (event.code === 'Home' || event.code === 'Digit0') this.showOverview();
      else if (document.activeElement === this.canvas && event.code.startsWith('Arrow')) {
        if (!this._view) return;
        const step = 48 / this._view.scale;
        if (event.code === 'ArrowLeft') this._center.x -= step;
        if (event.code === 'ArrowRight') this._center.x += step;
        if (event.code === 'ArrowUp') this._center.z += step;
        if (event.code === 'ArrowDown') this._center.z -= step;
        this._clampCenter(); this._redraw();
      } else return; // M and Escape remain the HUD's open/close shortcuts.
      event.preventDefault(); event.stopPropagation();
    });
  }

  setExpanded(expanded) {
    this.expanded = expanded;
    if (this._drag && this.canvas.hasPointerCapture(this._drag.id)) this.canvas.releasePointerCapture(this._drag.id);
    this._drag = null;
    this.el.classList.remove('is-panning');
    (expanded ? this.root : this.hud).appendChild(this.el);
    this.el.classList.toggle('big', expanded);
    this.el.setAttribute('role', expanded ? 'dialog' : 'group');
    this.el.setAttribute('aria-label', expanded ? 'Hikari city map' : 'Minimap');
    this.canvas.tabIndex = expanded ? 0 : -1;
    if (expanded) {
      this.el.setAttribute('aria-modal', 'true');
      this.el.querySelector('.map-close').focus({ preventScroll: true });
    } else this.el.removeAttribute('aria-modal');
    this._redraw();
  }

  showOverview() {
    this._zoom = 1;
    this._center = middle(L.mapBounds);
    this.location.textContent = '';
    this._redraw();
  }

  focusPlayer() {
    this._zoom = Math.max(2.5, this._zoom);
    this._center = { x: this.player.position.x, z: this.player.position.z };
    this.location.textContent = 'Your location';
    this._clampCenter(); this._redraw();
  }

  zoomBy(factor, anchor) {
    if (!Number.isFinite(factor) || factor <= 0) return;
    const oldZoom = this._zoom;
    this._zoom = clamp(this._zoom * factor, 1, MAX_ZOOM);
    if (anchor && this._view && this._zoom !== oldZoom) {
      const { W, H, scale } = this._view;
      const ratio = oldZoom / this._zoom;
      this._center.x += (anchor.x - W / 2) / scale * (1 - ratio);
      this._center.z -= (anchor.y - H / 2) / scale * (1 - ratio);
    }
    this._clampCenter(); this._redraw();
  }

  _clampCenter() {
    if (this._zoom === 1) { this._center = middle(L.mapBounds); return; }
    const bounds = L.mapBounds;
    this._center.x = clamp(this._center.x, bounds.x0, bounds.x1);
    this._center.z = clamp(this._center.z, bounds.z0, bounds.z1);
  }

  _redraw() { this.t = 1; this.update(0); }

  _selectMarker(x, y) {
    const targets = this._hitTargets.map((target) => ({ ...target, distance: Math.hypot(target.x - x, target.y - y) }));
    targets.sort((a, b) => a.distance - b.distance || b.priority - a.priority);
    this.location.textContent = targets[0]?.distance < 15 ? targets[0].label : '';
  }

  update(dt) {
    this.t += dt;
    if (this.t < .1) return;
    this.t = 0;
    const g = this.g, big = this.expanded;
    const W = big ? Math.max(100, this.canvas.clientWidth) : 184;
    const H = big ? Math.max(100, this.canvas.clientHeight) : 184;
    const dpr = big ? Math.min(devicePixelRatio || 1, 2) : 1;
    if (this.canvas.width !== Math.round(W * dpr) || this.canvas.height !== Math.round(H * dpr)) {
      this.canvas.width = Math.round(W * dpr); this.canvas.height = Math.round(H * dpr);
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const bounds = L.mapBounds, p = this.player.position;
    const center = big ? this._center : p;
    const scale = big ? Math.min((W - 42) / (bounds.x1 - bounds.x0), (H - 36) / (bounds.z1 - bounds.z0)) * this._zoom : W / 64;
    this._view = { W, H, scale, center: { x: center.x, z: center.z } };
    this._hitTargets = [];
    const yaw = this.cameraRig.yaw, c = Math.cos(yaw), s = Math.sin(yaw);
    const point = (x, z) => {
      const dx = x - center.x, dz = z - center.z;
      return big ? [W / 2 + dx * scale, H / 2 - dz * scale] : [W / 2 - (dx * c - dz * s) * scale, H / 2 - (dx * s + dz * c) * scale];
    };
    const rect = (x0, z0, x1, z1, color) => {
      g.beginPath();
      for (const [i, pos] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].entries()) {
        const [x, y] = point(...pos);
        if (!i) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.closePath(); g.fillStyle = color; g.fill();
    };
    const footprint = (area, color) => rect(area.x0, area.z0, area.x1, area.z1, color);
    g.fillStyle = '#20293d'; g.fillRect(0, 0, W, H);
    footprint(L.expansion, '#8c9990');
    // Original roads stop at the city entrance; the new grid uses world data.
    rect(-L.walkOuter, L.playMinZ, L.walkOuter, L.expansion.z1, '#acb4b7');
    rect(L.walkOuter, L.alley.z0, L.alley.x1, L.alley.z1, '#acb4b7');
    rect(L.park.x0, L.park.z0, -L.walkOuter, L.park.z1, '#638774');
    footprint(L.market, '#b0a187');
    rect(L.market.x0, L.market.z1, L.market.x1, L.garden.z0, '#a3aaa0');
    footprint(L.garden, '#5e877b');
    rect(-L.roadHalf, L.playMinZ, L.roadHalf, L.expansion.z1, '#59677b');
    rect(-L.walkOuter, 46, L.walkOuter, 49, '#758398');
    for (const z of [...L.crosswalks, 70, 88, 106, 132]) rect(-4.5, z - .45, 4.5, z + .45, '#e4dfd0');
    for (const side of [-1, 1]) {
      const a = side < 0 ? -25 : 9, b = side < 0 ? -9 : 27;
      for (const [z0, z1] of [[-43, -28], [8, 21], [26, 43], [53, 65]]) rect(a, z0, b, z1, '#35465c');
    }
    for (const [x, z] of [[-24, 74.8], [24, 74.8], [-23, 100], [24, 100]]) rect(x - 2.7, z - 1.7, x + 2.7, z + 1.7, '#786a70');
    if (L.city) {
      footprint(L.city, '#8a9c85');
      for (const district of L.districts.filter((area) => area.z0 >= L.city.z0)) footprint(district, district.color || '#8b9f88');
      const surfaces = { grass: '#63917a', stone: '#b5bbb1', sand: '#cbb383', dirt: '#b8a486', wood: '#b99574' };
      for (const area of L.citySurfaces || []) footprint(area, surfaces[area.type] || area.color || '#8aa58b');
      if (L.cityCanal) footprint(L.cityCanal, '#4a8f9f');
      for (const road of L.cityRoads || []) rect(road.x0 - 2, road.z0 - 2, road.x1 + 2, road.z1 + 2, '#bec4bd');
      for (const road of L.cityRoads || []) footprint(road, '#586779');
      for (const bridge of L.cityBridges || []) footprint(bridge, '#cbb28c');
      for (const block of L.cityBlocks || []) footprint(block, block.color || '#66777f');
      for (const lot of SHOP_LOT_FOOTPRINTS) footprint(lot, lot.color);
    }
    const missionMarkers = this.missions.getMarkers();
    const labelBoxes = big ? [
      ...missionMarkers,
      ...(L.cityLandmarks || []),
      ...this.collectibles.items.filter((item) => !item.collected).map((item) => item.base),
      p,
    ].map((position) => {
      const [x, y] = point(position.x, position.z);
      return { x0: x - 6, x1: x + 6, y0: y - 6, y1: y + 6 };
    }) : [];
    const drawnLabelBoxes = [];
    const label = (x, z, title, color = '#f3eddf', small = false) => {
      let [sx, sy] = point(x, z);
      if (sx < -80 || sx > W + 80 || sy < -12 || sy > H + 12) return;
      g.font = `${small ? 500 : 600} ${small ? 9 : 10}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      const width = g.measureText(title).width;
      // Overview labels keep a readable pixel size on a short landscape map.
      // Stagger neighboring district names instead of shrinking them to dots.
      const originX = sx, originY = sy;
      const positions = [[0, 0], [-width / 2 - 12, 0], [width / 2 + 12, 0], [-width - 20, 0], [width + 20, 0], [0, -18], [0, 18], [0, -36], [0, 36], [-W / 3, 0], [W / 3, 0]];
      let box;
      // District names remain visible even if a dense group of nearby pins
      // leaves no perfect position. Minor landmark captions can be omitted.
      for (const obstacles of small ? [labelBoxes] : [labelBoxes, drawnLabelBoxes]) {
        for (const [dx, dy] of positions) {
          const x = clamp(originX + dx, width / 2 + 7, W - width / 2 - 7);
          const y = clamp(originY + dy, 10, H - 10);
          const candidate = { x0: x - width / 2 - 6, x1: x + width / 2 + 6, y0: y - 9, y1: y + 9 };
          if (obstacles.every((other) => candidate.x1 < other.x0 || candidate.x0 > other.x1 || candidate.y1 < other.y0 || candidate.y0 > other.y1)) {
            sx = x; sy = y; box = candidate; break;
          }
        }
        if (box) break;
      }
      if (!box) return;
      labelBoxes.push(box);
      drawnLabelBoxes.push(box);
      if (Math.hypot(sx - originX, sy - originY) > 12) {
        g.beginPath(); g.moveTo(originX, originY); g.lineTo(sx, sy);
        g.strokeStyle = '#bccfd170'; g.lineWidth = 1; g.stroke();
      }
      g.fillStyle = '#1b2538de'; g.fillRect(sx - width / 2 - 5, sy - 8, width + 10, 16);
      g.fillStyle = color; g.fillText(title, sx, sy);
    };
    if (big) {
      for (const district of L.districts) {
        if (district.id === 'avenue' && this._zoom < 1.8) continue;
        const center = middle(district);
        label(district.labelX ?? center.x, district.labelZ ?? center.z, district.name.toUpperCase());
      }
      if (this._zoom >= 1.8) {
        label(-21, -14, 'Neighborhood park', '#d4e6d8', true);
        label(24, -3, 'Shrine', '#e5d8c1', true);
        label(0, 48, 'Railway', '#d4e1ed', true);
      }
    }
    const dot = (x, z, color, radius, kind = 'dot', title) => {
      let [sx, sy] = point(x, z);
      if (!big) {
        const dx = sx - W / 2, dy = sy - H / 2, distance = Math.hypot(dx, dy), max = W / 2 - 9;
        if (distance > max) { sx = W / 2 + dx * max / distance; sy = H / 2 + dy * max / distance; }
      } else if (sx < -radius || sx > W + radius || sy < -radius || sy > H + radius) return;
      g.beginPath();
      if (['delivery', 'parcel', 'garden', 'vista', 'landmark'].includes(kind)) {
        g.moveTo(sx, sy - radius); g.lineTo(sx + radius, sy); g.lineTo(sx, sy + radius); g.lineTo(sx - radius, sy); g.closePath();
      } else g.arc(sx, sy, radius, 0, Math.PI * 2);
      g.fillStyle = color; g.fill(); g.strokeStyle = '#142334'; g.lineWidth = 1.5; g.stroke();
      if (kind === 'quest' || kind === 'quest-ready') {
        g.font = `bold ${radius * 1.6}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = '#142334'; g.fillText(kind === 'quest-ready' ? '?' : '!', sx, sy + .5);
      }
      if (big && title) this._hitTargets.push({ x: sx, y: sy, label: title, priority: kind === 'dot' ? 0 : 1 });
    };
    for (const landmark of L.cityLandmarks || []) {
      if (big || Math.hypot(landmark.x - p.x, landmark.z - p.z) < 30) {
        dot(landmark.x, landmark.z, '#ead6ac', big ? 4.5 : 4, 'landmark', landmark.name);
        if (big && this._zoom >= 1.8) label(landmark.x, landmark.z - 12 / scale, landmark.name, '#ead6ac', true);
      }
    }
    for (const npc of this.npcs.items) {
      const [x, y] = point(npc.position.x, npc.position.z);
      if (big && drawnLabelBoxes.some((box) => x > box.x0 - 3 && x < box.x1 + 3 && y > box.y0 - 3 && y < box.y1 + 3)) continue;
      if (big || Vector3.DistanceSquared(npc.position, p) < 32 * 32) dot(npc.position.x, npc.position.z, '#e7d9f3', big ? 2.8 : 3.2, 'dot', npc.name);
    }
    for (const it of this.collectibles.items) if (!it.collected) dot(it.base.x, it.base.z, '#ffd24a', big ? 4 : 5, 'dot', 'Energy fragment');
    // Shops: all of them on the big map, nearby ones on the minimap.
    for (const s of this.extraMarkers?.() || []) {
      if (big || Math.hypot(s.x - p.x, s.z - p.z) < 25) dot(s.x, s.z, s.color, big ? 3.6 : 3.4, 'dot', s.label);
    }
    for (const marker of missionMarkers) dot(marker.x, marker.z, marker.kind === 'quest' ? '#af9cff' : '#77e9c0', big ? 5.5 : 6, marker.kind, marker.label);
    if (this.portal.active) dot(this.portal.spot.position.x, this.portal.spot.position.z, '#9fe4ff', big ? 6 : 8, 'dot', 'The open gate');
    let [px, py] = point(p.x, p.z);
    if (big) { px = clamp(px, 12, W - 12); py = clamp(py, 12, H - 12); }
    g.save(); g.translate(px, py); g.rotate(big ? this.player.yaw : -(this.player.yaw - yaw));
    const size = big ? 8 : 10;
    g.beginPath(); g.moveTo(0, -size); g.lineTo(size * .75, size * .8); g.lineTo(0, size * .35); g.lineTo(-size * .75, size * .8); g.closePath();
    g.fillStyle = '#6ae2ff'; g.fill(); g.strokeStyle = '#19324c'; g.lineWidth = 2; g.stroke(); g.restore();
    if (big) {
      this._hitTargets.push({ x: px, y: py, label: 'Your location', priority: 2 });
      this.n.style.left = 'auto'; this.n.style.top = '12px';
      this.zoomLabel.textContent = `${Number(this._zoom.toFixed(1))}×`;
      this.zoomIn.disabled = this._zoom >= MAX_ZOOM;
      this.zoomOut.disabled = this._zoom <= 1;
    } else { this.n.style.left = `${50 + s * 40}%`; this.n.style.top = `${45 - c * 40}%`; }
  }
}
