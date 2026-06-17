/**
 * MAPMANAGER.JS - Map/Terrain Management System
 * 
 * Handles:
 * - Map loading and creation
 * - Tile-based terrain
 * - Districts and locations
 * - Terrain properties and walkability
 * - Map generation (procedural or data-driven)
 * - Point of interest management
 * 
 * @module MapManager
 */

export class MapManager {
  /**
   * Creates map manager instance
   * @param {Game} game - Game engine reference
   * @param {Object} config - Configuration
   */
  constructor(game, config = {}) {
    this.game = game;

    this.config = {
      tileSize: config.tileSize || 32,
      mapWidth: config.mapWidth || 125, // in tiles
      mapHeight: config.mapHeight || 94, // in tiles
      ...config
    };

    // Map dimensions
    this.pixelWidth = this.config.mapWidth * this.config.tileSize;
    this.pixelHeight = this.config.mapHeight * this.config.tileSize;

    // Tile data
    this.tiles = [];
    this.tileData = new Map(); // tileId -> {type, walkable, properties}
    this.chunks = new Map(); // chunkKey -> tileArray

    // Districts
    this.districts = new Map(); // districtId -> district
    this.districtMap = new Uint8Array(this.config.mapWidth * this.config.mapHeight);

    // Points of interest
    this.pointsOfInterest = new Map(); // id -> poi
    this.poiIndex = new Map(); // type -> [pois]

    // Terrain types
    this.setupTerrainTypes();

    // Initialize empty map
    this.initializeMap();

    console.log('MapManager initialized', this.config);
  }

  /**
   * Setup terrain type definitions
   * @private
   */
  setupTerrainTypes() {
    this.terrainTypes = {
      grass: { id: 1, walkable: true, color: '#2d5016', cost: 1 },
      road: { id: 2, walkable: true, color: '#444444', cost: 0.5 },
      water: { id: 3, walkable: false, color: '#1e90ff', cost: 100 },
      building: { id: 4, walkable: false, color: '#666666', cost: Infinity },
      wall: { id: 5, walkable: false, color: '#888888', cost: Infinity },
      forest: { id: 6, walkable: true, color: '#1a4d1a', cost: 2 },
      sand: { id: 7, walkable: true, color: '#c9a961', cost: 1.5 }
    };
  }

  /**
   * Initialize empty map
   * @private
   */
  initializeMap() {
    const size = this.config.mapWidth * this.config.mapHeight;
    this.tiles = new Uint8Array(size);

    // Fill with default grass terrain
    this.tiles.fill(this.terrainTypes.grass.id);
  }

  /**
   * Load map from data
   * @param {Object} mapData - Map data configuration
   */
  loadMap(mapData) {
    if (mapData.tiles) {
      this.tiles = new Uint8Array(mapData.tiles);
    }

    if (mapData.districts) {
      for (const districtData of mapData.districts) {
        this.addDistrict(districtData);
      }
    }

    if (mapData.pointsOfInterest) {
      for (const poiData of mapData.pointsOfInterest) {
        this.addPointOfInterest(poiData);
      }
    }

    console.log('Map loaded');
  }

  /**
   * Get tile at position
   * @param {number} x - X pixel coordinate
   * @param {number} y - Y pixel coordinate
   * @returns {number} Tile ID
   */
  getTileAtPixel(x, y) {
    const tileX = Math.floor(x / this.config.tileSize);
    const tileY = Math.floor(y / this.config.tileSize);
    return this.getTile(tileX, tileY);
  }

  /**
   * Get tile at grid coordinates
   * @param {number} tileX - Tile X
   * @param {number} tileY - Tile Y
   * @returns {number} Tile ID
   */
  getTile(tileX, tileY) {
    if (tileX < 0 || tileX >= this.config.mapWidth ||
        tileY < 0 || tileY >= this.config.mapHeight) {
      return 0;
    }

    return this.tiles[tileY * this.config.mapWidth + tileX];
  }

  /**
   * Set tile at grid coordinates
   * @param {number} tileX - Tile X
   * @param {number} tileY - Tile Y
   * @param {number} tileId - Tile ID
   */
  setTile(tileX, tileY, tileId) {
    if (tileX < 0 || tileX >= this.config.mapWidth ||
        tileY < 0 || tileY >= this.config.mapHeight) {
      return;
    }

    this.tiles[tileY * this.config.mapWidth + tileX] = tileId;
  }

  /**
   * Check if position is walkable
   * @param {number} x - X pixel coordinate
   * @param {number} y - Y pixel coordinate
   * @returns {boolean} True if walkable
   */
  isWalkable(x, y) {
    const tileId = this.getTileAtPixel(x, y);
    
    for (const [, terrain] of Object.entries(this.terrainTypes)) {
      if (terrain.id === tileId) {
        return terrain.walkable;
      }
    }

    return true;
  }

  /**
   * Get terrain cost at position
   * @param {number} x - X pixel coordinate
   * @param {number} y - Y pixel coordinate
   * @returns {number} Movement cost
   */
  getTerrainCost(x, y) {
    const tileId = this.getTileAtPixel(x, y);

    for (const [, terrain] of Object.entries(this.terrainTypes)) {
      if (terrain.id === tileId) {
        return terrain.cost;
      }
    }

    return 1;
  }

  /**
   * Add district to map
   * @param {Object} districtData - District configuration
   */
  addDistrict(districtData) {
    const district = {
      id: districtData.id || Math.random().toString(36).substr(2, 9),
      name: districtData.name || 'District',
      x: districtData.x || 0,
      y: districtData.y || 0,
      width: districtData.width || 500,
      height: districtData.height || 500,
      type: districtData.type || 'residential',
      color: districtData.color || '#ffffff'
    };

    this.districts.set(district.id, district);

    // Mark tiles in districtMap
    const startTileX = Math.floor(district.x / this.config.tileSize);
    const startTileY = Math.floor(district.y / this.config.tileSize);
    const endTileX = Math.ceil((district.x + district.width) / this.config.tileSize);
    const endTileY = Math.ceil((district.y + district.height) / this.config.tileSize);

    const districtId = this.districts.size;
    for (let ty = startTileY; ty < endTileY; ty++) {
      for (let tx = startTileX; tx < endTileX; tx++) {
        if (tx >= 0 && tx < this.config.mapWidth && ty >= 0 && ty < this.config.mapHeight) {
          this.districtMap[ty * this.config.mapWidth + tx] = districtId;
        }
      }
    }

    return district;
  }

  /**
   * Get district at position
   * @param {number} x - X pixel coordinate
   * @param {number} y - Y pixel coordinate
   * @returns {Object} District or null
   */
  getDistrictAtPixel(x, y) {
    const tileX = Math.floor(x / this.config.tileSize);
    const tileY = Math.floor(y / this.config.tileSize);

    if (tileX < 0 || tileX >= this.config.mapWidth ||
        tileY < 0 || tileY >= this.config.mapHeight) {
      return null;
    }

    const districtId = this.districtMap[tileY * this.config.mapWidth + tileX];
    if (districtId === 0) return null;

    let index = 0;
    for (const [, district] of this.districts) {
      index++;
      if (index === districtId) {
        return district;
      }
    }

    return null;
  }

  /**
   * Add point of interest
   * @param {Object} poiData - POI configuration
   */
  addPointOfInterest(poiData) {
    const poi = {
      id: poiData.id || Math.random().toString(36).substr(2, 9),
      name: poiData.name || 'POI',
      x: poiData.x || 0,
      y: poiData.y || 0,
      type: poiData.type || 'landmark',
      radius: poiData.radius || 50,
      metadata: poiData.metadata || {}
    };

    this.pointsOfInterest.set(poi.id, poi);

    if (!this.poiIndex.has(poi.type)) {
      this.poiIndex.set(poi.type, []);
    }
    this.poiIndex.get(poi.type).push(poi);

    return poi;
  }

  /**
   * Get POIs near position
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {number} radius - Search radius
   * @param {string} type - Optional POI type filter
   * @returns {Array} Nearby POIs
   */
  getPointsOfInterestNear(x, y, radius, type = null) {
    const result = [];
    const pois = type ? (this.poiIndex.get(type) || []) : Array.from(this.pointsOfInterest.values());

    for (const poi of pois) {
      const dx = poi.x - x;
      const dy = poi.y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < radius) {
        result.push({ poi, distance: dist });
      }
    }

    return result.sort((a, b) => a.distance - b.distance);
  }

  /**
   * Render map
   */
  render() {
    const renderer = this.game?.getSystem('renderer');
    if (!renderer) return;

    const camera = this.game?.getSystem('camera');
    if (!camera) return;

    const bounds = camera.getViewportBounds();

    // Calculate visible tile range
    const startTileX = Math.max(0, Math.floor(bounds.left / this.config.tileSize));
    const startTileY = Math.max(0, Math.floor(bounds.top / this.config.tileSize));
    const endTileX = Math.min(
      this.config.mapWidth,
      Math.ceil(bounds.right / this.config.tileSize) + 1
    );
    const endTileY = Math.min(
      this.config.mapHeight,
      Math.ceil(bounds.bottom / this.config.tileSize) + 1
    );

    // Render visible tiles
    for (let tileY = startTileY; tileY < endTileY; tileY++) {
      for (let tileX = startTileX; tileX < endTileX; tileX++) {
        const tileId = this.getTile(tileX, tileY);
        const pixelX = tileX * this.config.tileSize;
        const pixelY = tileY * this.config.tileSize;

        // Get terrain info
        let color = '#2d5016';
        for (const [, terrain] of Object.entries(this.terrainTypes)) {
          if (terrain.id === tileId) {
            color = terrain.color;
            break;
          }
        }

        // Draw tile
        renderer.drawRect(
          pixelX,
          pixelY,
          this.config.tileSize,
          this.config.tileSize,
          {
            fill: color,
            layer: 'world'
          }
        );

        // Draw tile border (optional)
        renderer.drawRect(
          pixelX,
          pixelY,
          this.config.tileSize,
          this.config.tileSize,
          {
            stroke: 'rgba(0, 0, 0, 0.1)',
            lineWidth: 0.5,
            layer: 'world'
          }
        );
      }
    }

    // Render districts (debug)
    if (this.game?.config.debug) {
      for (const district of this.districts.values()) {
        renderer.drawRect(
          district.x,
          district.y,
          district.width,
          district.height,
          {
            stroke: district.color,
            lineWidth: 2,
            alpha: 0.3,
            layer: 'debug'
          }
        );
      }
    }
  }

  /**
   * Get map dimensions in pixels
   * @returns {Object} {width, height}
   */
  getDimensions() {
    return {
      width: this.pixelWidth,
      height: this.pixelHeight
    };
  }

  /**
   * Get all districts
   * @returns {Array} Array of districts
   */
  getAllDistricts() {
    return Array.from(this.districts.values());
  }

  /**
   * Get all POIs
   * @returns {Array} Array of POIs
   */
  getAllPointsOfInterest() {
    return Array.from(this.pointsOfInterest.values());
  }

  /**
   * Get map statistics
   * @returns {Object} Statistics
   */
  getStats() {
    const tileCount = this.tiles.length;
    const terrainCounts = {};

    for (const terrain of Object.values(this.terrainTypes)) {
      terrainCounts[terrain.id] = 0;
    }

    for (const tileId of this.tiles) {
      if (terrainCounts[tileId] !== undefined) {
        terrainCounts[tileId]++;
      }
    }

    return {
      mapSize: `${this.config.mapWidth}x${this.config.mapHeight}`,
      pixelSize: `${this.pixelWidth}x${this.pixelHeight}`,
      tileCount,
      terrainCounts,
      districtCount: this.districts.size,
      poiCount: this.pointsOfInterest.size
    };
  }
}

export default MapManager;
