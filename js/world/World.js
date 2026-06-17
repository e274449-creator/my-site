/**
 * WORLD.JS - World Management System
 * 
 * Manages:
 * - Entity storage and lifecycle
 * - World state and properties
 * - Spatial queries
 * - Physics and collision updates
 * - Rendering coordination
 * - Time management
 * 
 * @module World
 */

import { Entity } from './Entity.js';

export class World {
  /**
   * Creates world instance
   * @param {Game} game - Game engine reference
   * @param {Object} config - World configuration
   */
  constructor(game, config = {}) {
    this.game = game;

    this.config = {
      width: config.width || 4000,
      height: config.height || 3000,
      gravity: config.gravity || 0,
      friction: config.friction || 0.95,
      ...config
    };

    // Entities
    this.entities = new Map(); // id -> entity
    this.entityList = []; // For iteration
    this.entityGroups = new Map(); // type -> [entities]

    // World state
    this.state = {
      time: 0,
      dayTime: 0, // 0-24 hours
      weather: 'clear',
      temperature: 20,
      isPaused: false
    };

    // Spatial regions (for optimization)
    this.regions = new Map();
    this.regionSize = 500;

    // Debug
    this.debugEnabled = false;
    this.showColliders = false;

    console.log('World initialized', this.config);
  }

  /**
   * Initialize world
   */
  initialize(game) {
    this.game = game;
  }

  /**
   * Create and add entity to world
   * @param {string} entityType - Entity class/type
   * @param {Object} config - Entity configuration
   * @returns {Entity} Created entity
   */
  createEntity(entityType, config = {}) {
    let entity;

    if (typeof entityType === 'function') {
      // Constructor provided
      entity = new entityType(config);
    } else if (entityType === 'base' || typeof entityType === 'string') {
      // Use Entity class
      entity = new Entity({ ...config, type: entityType });
    } else {
      entity = entityType; // Assume it's already an entity instance
    }

    return this.addEntity(entity);
  }

  /**
   * Add entity to world
   * @param {Entity} entity - Entity to add
   * @returns {Entity} Added entity
   */
  addEntity(entity) {
    if (this.entities.has(entity.id)) {
      console.warn(`Entity ${entity.id} already exists in world`);
      return entity;
    }

    entity.initialize(this.game, this);
    this.entities.set(entity.id, entity);
    this.entityList.push(entity);

    // Add to type group
    if (!this.entityGroups.has(entity.type)) {
      this.entityGroups.set(entity.type, []);
    }
    this.entityGroups.get(entity.type).push(entity);

    // Add to region
    this.addToRegion(entity);

    this.game?.emit('world:entityadded', { entity });
    return entity;
  }

  /**
   * Remove entity from world
   * @param {string} entityId - Entity ID
   */
  removeEntity(entityId) {
    const entity = this.entities.get(entityId);
    if (!entity) return;

    this.entities.delete(entityId);
    this.entityList = this.entityList.filter(e => e.id !== entityId);

    // Remove from type group
    const typeGroup = this.entityGroups.get(entity.type);
    if (typeGroup) {
      const index = typeGroup.indexOf(entity);
      if (index > -1) {
        typeGroup.splice(index, 1);
      }
    }

    // Remove from region
    this.removeFromRegion(entity);

    this.game?.emit('world:entityremoved', { entity });
  }

  /**
   * Get entity by ID
   * @param {string} entityId - Entity ID
   * @returns {Entity} Entity or null
   */
  getEntity(entityId) {
    return this.entities.get(entityId) || null;
  }

  /**
   * Get all entities
   * @returns {Array<Entity>} All entities
   */
  getAllEntities() {
    return [...this.entityList];
  }

  /**
   * Get entities by type
   * @param {string} type - Entity type
   * @returns {Array<Entity>} Entities of type
   */
  getEntitiesByType(type) {
    return this.entityGroups.get(type) ? [...this.entityGroups.get(type)] : [];
  }

  /**
   * Get entities by tag
   * @param {string} tag - Tag name
   * @returns {Array<Entity>} Entities with tag
   */
  getEntitiesByTag(tag) {
    return this.entityList.filter(e => e.hasTag(tag));
  }

  /**
   * Get entities in area
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {number} width - Width
   * @param {number} height - Height
   * @returns {Array<Entity>} Entities in area
   */
  getEntitiesInArea(x, y, width, height) {
    return this.entityList.filter(e =>
      !(e.x + e.width < x ||
        x + width < e.x ||
        e.y + e.height < y ||
        y + height < e.y)
    );
  }

  /**
   * Get nearest entity to position
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {number} maxDistance - Maximum distance (optional)
   * @param {Function} filter - Filter function (optional)
   * @returns {Entity} Nearest entity or null
   */
  getNearestEntity(x, y, maxDistance = Infinity, filter = null) {
    let nearest = null;
    let nearestDist = maxDistance;

    for (const entity of this.entityList) {
      if (filter && !filter(entity)) continue;

      const dx = entity.x - x;
      const dy = entity.y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < nearestDist) {
        nearest = entity;
        nearestDist = dist;
      }
    }

    return nearest;
  }

  /**
   * Add entity to region
   * @private
   */
  addToRegion(entity) {
    const key = this.getRegionKey(entity.x, entity.y);
    if (!this.regions.has(key)) {
      this.regions.set(key, new Set());
    }
    this.regions.get(key).add(entity);
  }

  /**
   * Remove entity from region
   * @private
   */
  removeFromRegion(entity) {
    const key = this.getRegionKey(entity.x, entity.y);
    const region = this.regions.get(key);
    if (region) {
      region.delete(entity);
    }
  }

  /**
   * Get region key
   * @private
   */
  getRegionKey(x, y) {
    const gridX = Math.floor(x / this.regionSize);
    const gridY = Math.floor(y / this.regionSize);
    return `${gridX},${gridY}`;
  }

  /**
   * Update world
   * @param {number} deltaTime - Delta time in seconds
   */
  update(deltaTime) {
    if (this.state.isPaused) return;

    // Update world time
    this.state.time += deltaTime;
    this.state.dayTime = (this.state.dayTime + deltaTime / 3600) % 24;

    // Update entities
    for (const entity of this.entityList) {
      if (entity.active && !entity.destroyed) {
        entity.update(deltaTime);
      }
    }

    // Clean up destroyed entities
    const toRemove = [];
    for (const entity of this.entityList) {
      if (entity.destroyed) {
        toRemove.push(entity.id);
      }
    }

    for (const id of toRemove) {
      this.removeEntity(id);
    }
  }

  /**
   * Render world
   */
  render() {
    const renderer = this.game?.getSystem('renderer');
    if (!renderer) return;

    // Render entities sorted by Z-order
    const visibleEntities = this.entityList.filter(e => e.isInViewport() && e.visible);
    visibleEntities.sort((a, b) => a.z - b.z);

    for (const entity of visibleEntities) {
      entity.render();
    }

    // Debug rendering
    if (this.debugEnabled) {
      this.renderDebug(renderer);
    }
  }

  /**
   * Render debug information
   * @private
   */
  renderDebug(renderer) {
    // Draw world bounds
    renderer.drawRect(0, 0, this.config.width, this.config.height, {
      stroke: '#00ff00',
      lineWidth: 2,
      layer: 'debug'
    });

    // Draw collision bodies
    if (this.showColliders) {
      const collisionSystem = this.game?.getSystem('collision');
      if (collisionSystem) {
        const bodies = collisionSystem.getAllBodies();
        for (const body of bodies) {
          if (body.shape === 'box') {
            renderer.drawRect(body.x, body.y, body.width, body.height, {
              stroke: '#ff0000',
              lineWidth: 1,
              layer: 'debug'
            });
          } else if (body.shape === 'circle') {
            renderer.drawCircle(body.x, body.y, body.radius, {
              stroke: '#ff0000',
              lineWidth: 1,
              layer: 'debug'
            });
          }
        }
      }
    }

    // Draw entity count
    renderer.drawText(`Entities: ${this.entityList.length}`, 10, 100, {
      font: 'mono',
      color: '#00ff00',
      layer: 'debug'
    });
  }

  /**
   * Set world paused state
   * @param {boolean} paused - Paused state
   */
  setPaused(paused) {
    this.state.isPaused = paused;
    this.game?.emit('world:paused', { paused });
  }

  /**
   * Set weather
   * @param {string} weather - Weather type
   */
  setWeather(weather) {
    this.state.weather = weather;
    this.game?.emit('world:weatherchanged', { weather });
  }

  /**
   * Set temperature
   * @param {number} temperature - Temperature in Celsius
   */
  setTemperature(temperature) {
    this.state.temperature = temperature;
  }

  /**
   * Clear all entities
   */
  clear() {
    const toRemove = [...this.entityList];
    for (const entity of toRemove) {
      this.removeEntity(entity.id);
    }
  }

  /**
   * Get world statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      entityCount: this.entityList.length,
      entityGroups: Object.fromEntries(
        Array.from(this.entityGroups).map(([type, entities]) => [type, entities.length])
      ),
      worldTime: this.state.time,
      dayTime: this.state.dayTime,
      weather: this.state.weather,
      regions: this.regions.size
    };
  }

  /**
   * Get debug info
   * @returns {Object} Debug information
   */
  getDebugInfo() {
    return {
      ...this.getStats(),
      isPaused: this.state.isPaused,
      temperature: this.state.temperature
    };
  }

  /**
   * Get world save data
   * @returns {Object} Save data
   */
  getSaveData() {
    return {
      state: this.state,
      entities: this.entityList.map(e => e.getSaveData())
    };
  }

  /**
   * Restore world from save data
   * @param {Object} saveData - Save data
   */
  restoreFromSave(saveData) {
    this.clear();
    this.state = saveData.state;

    for (const entityData of saveData.entities || []) {
      const entity = new Entity(entityData);
      entity.restoreFromSave(entityData);
      this.addEntity(entity);
    }
  }
}

export default World;
