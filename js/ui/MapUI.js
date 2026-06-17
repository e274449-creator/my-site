/**
 * MAPUI.JS - Map Display System
 * 
 * Manages:
 * - Full map rendering
 * - Map markers
 * - District labels
 * - Points of interest
 * - Navigation
 * 
 * @module MapUI
 */

export class MapUI {
  /**
   * Creates map UI system
   * @param {Game} game - Game engine reference
   * @param {Object} config - Configuration
   */
  constructor(game, config = {}) {
    this.game = game;

    this.config = {
      scale: 0.15,
      ...config
    };

    this.mapContainer = document.getElementById('map-panel');
    this.mapCanvas = document.getElementById('map-canvas');
    this.isVisible = false;

    if (this.mapCanvas) {
      this.ctx = this.mapCanvas.getContext('2d');
    }

    this.setupEventListeners();
  }

  /**
   * Setup event listeners
   * @private
   */
  setupEventListeners() {
    document.getElementById('btn-map')?.addEventListener('click', () => this.toggle());
  }

  /**
   * Update map display
   */
  update() {
    if (this.isVisible && this.mapCanvas) {
      this.renderMap();
    }
  }

  /**
   * Render map
   * @private
   */
  renderMap() {
    if (!this.ctx || !this.mapCanvas) return;

    // Clear canvas
    this.ctx.fillStyle = '#0a0a0a';
    this.ctx.fillRect(0, 0, this.mapCanvas.width, this.mapCanvas.height);

    // Draw map background
    this.ctx.fillStyle = '#1a3a1a';
    this.ctx.fillRect(0, 0, this.mapCanvas.width, this.mapCanvas.height);

    if (!this.game?.world) return;

    const mapManager = this.game.getSystem('map');
    if (!mapManager) return;

    const dims = mapManager.getDimensions();
    const scaleX = this.mapCanvas.width / dims.width;
    const scaleY = this.mapCanvas.height / dims.height;

    // Draw terrain (simplified)
    this.ctx.fillStyle = '#2d5016';
    this.ctx.fillRect(0, 0, this.mapCanvas.width, this.mapCanvas.height);

    // Draw districts
    const districts = mapManager.getDistricts?.();
    if (districts) {
      for (const district of districts) {
        this.drawDistrictOnMap(district, scaleX, scaleY);
      }
    }

    // Draw POIs
    const pois = mapManager.getAllPointsOfInterest?.();
    if (pois) {
      for (const poi of pois) {
        this.drawPOIOnMap(poi, scaleX, scaleY);
      }
    }

    // Draw player
    const player = this.game.world.getEntitiesByType('player')[0];
    if (player) {
      const x = (player.x / dims.width) * this.mapCanvas.width;
      const y = (player.y / dims.height) * this.mapCanvas.height;

      this.ctx.fillStyle = '#00ff00';
      this.ctx.fillRect(x - 3, y - 3, 6, 6);
    }

    // Draw other entities
    const entities = this.game.world.entities || [];
    for (const entity of entities) {
      if (entity === player) continue;

      const x = (entity.x / dims.width) * this.mapCanvas.width;
      const y = (entity.y / dims.height) * this.mapCanvas.height;

      let color = '#0099ff';
      let size = 2;

      if (entity.type === 'npc') {
        color = entity.faction === 'police' ? '#ff0000' : '#ffff00';
      }

      this.ctx.fillStyle = color;
      this.ctx.fillRect(x - size / 2, y - size / 2, size, size);
    }
  }

  /**
   * Draw district on map
   * @private
   */
  drawDistrictOnMap(district, scaleX, scaleY) {
    // Draw district border
    this.ctx.strokeStyle = '#00ff00';
    this.ctx.lineWidth = 1;
    this.ctx.globalAlpha = 0.3;

    const x1 = district.bounds.left * scaleX;
    const y1 = district.bounds.top * scaleY;
    const width = (district.bounds.right - district.bounds.left) * scaleX;
    const height = (district.bounds.bottom - district.bounds.top) * scaleY;

    this.ctx.strokeRect(x1, y1, width, height);
    this.ctx.globalAlpha = 1;

    // Draw district name
    this.ctx.fillStyle = '#00ff00';
    this.ctx.font = '10px monospace';
    this.ctx.globalAlpha = 0.7;
    this.ctx.fillText(district.name, x1 + 5, y1 + 15);
    this.ctx.globalAlpha = 1;
  }

  /**
   * Draw POI on map
   * @private
   */
  drawPOIOnMap(poi, scaleX, scaleY) {
    const x = poi.x * scaleX;
    const y = poi.y * scaleY;

    // Draw POI marker
    let color = '#ffff00';
    if (poi.type === 'police') {
      color = '#ff0000';
    } else if (poi.type === 'hospital') {
      color = '#00ff00';
    } else if (poi.type === 'shop') {
      color = '#00aaff';
    }

    this.ctx.fillStyle = color;
    this.ctx.globalAlpha = 0.8;

    // Draw circle
    this.ctx.beginPath();
    this.ctx.arc(x, y, 3, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.globalAlpha = 1;
  }

  /**
   * Toggle map
   */
  toggle() {
    this.isVisible ? this.hide() : this.show();
  }

  /**
   * Show map
   */
  show() {
    if (this.mapContainer) {
      this.mapContainer.style.display = 'block';
      this.isVisible = true;
      this.renderMap();
    }
  }

  /**
   * Hide map
   */
  hide() {
    if (this.mapContainer) {
      this.mapContainer.style.display = 'none';
      this.isVisible = false;
    }
  }
}

export default MapUI;
