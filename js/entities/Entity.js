/**
 * ENTITY.JS - Base Entity Class
 * 
 * Foundation for all game entities:
 * - Position and movement
 * - State management
 * - Physics/collision integration
 * - Component system
 * - Lifecycle management
 * - Event handling
 * 
 * @module Entity
 */

export class Entity {
  /**
   * Creates a new entity
   * @param {Object} config - Entity configuration
   */
  constructor(config = {}) {
    this.id = config.id || Math.random().toString(36).substr(2, 9);
    this.name = config.name || 'Entity';
    this.type = config.type || 'entity';
    this.active = true;
    this.visible = true;
    this.destroyed = false;

    // Transform
    this.x = config.x || 0;
    this.y = config.y || 0;
    this.z = config.z || 0; // For layering
    this.rotation = config.rotation || 0;
    this.scale = config.scale || 1;

    // Physics
    this.velocityX = 0;
    this.velocityY = 0;
    this.accelerationX = 0;
    this.accelerationY = 0;
    this.friction = config.friction || 0.95;
    this.mass = config.mass || 1;
    this.gravity = config.gravity || 0;

    // Dimensions
    this.width = config.width || 32;
    this.height = config.height || 32;
    this.radius = config.radius || 16;

    // Collision body reference
    this.collisionBody = null;
    this.collisionConfig = config.collision || {};

    // Health and state
    this.health = config.health || 100;
    this.maxHealth = config.maxHealth || 100;
    this.state = config.initialState || 'idle';
    this.stateTime = 0;

    // Components
    this.components = new Map();

    // Callbacks
    this.callbacks = {
      onUpdate: config.onUpdate || null,
      onRender: config.onRender || null,
      onDestroy: config.onDestroy || null,
      onCollision: config.onCollision || null
    };

    // Metadata
    this.tags = new Set(config.tags || []);
    this.data = { ...config.data };

    // Game reference
    this.game = null;
    this.world = null;
  }

  /**
   * Initialize entity
   * @param {Game} game - Game engine reference
   * @param {World} world - World reference
   */
  initialize(game, world) {
    this.game = game;
    this.world = world;

    // Create collision body if collision config provided
    if (Object.keys(this.collisionConfig).length > 0) {
      this.createCollisionBody();
    }
  }

  /**
   * Create collision body
   * @private
   */
  createCollisionBody() {
    const collisionSystem = this.game?.getSystem('collision');
    if (!collisionSystem) return;

    this.collisionBody = collisionSystem.createBody({
      type: this.collisionConfig.type || 'dynamic',
      shape: this.collisionConfig.shape || 'box',
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      radius: this.radius,
      entity: this,
      isSensor: this.collisionConfig.isSensor || false,
      onCollisionEnter: (other) => this.onCollisionEnter(other),
      onCollisionStay: (other) => this.onCollisionStay(other),
      onCollisionExit: (other) => this.onCollisionExit(other)
    });
  }

  /**
   * Update entity
   * @param {number} deltaTime - Delta time in seconds
   */
  update(deltaTime) {
    if (!this.active) return;

    // Update velocity with acceleration
    this.velocityX += this.accelerationX * deltaTime;
    this.velocityY += this.accelerationY * deltaTime;

    // Apply gravity
    if (this.gravity > 0) {
      this.velocityY += this.gravity * deltaTime;
    }

    // Apply friction
    this.velocityX *= this.friction;
    this.velocityY *= this.friction;

    // Update position
    this.x += this.velocityX * deltaTime;
    this.y += this.velocityY * deltaTime;

    // Update collision body position
    if (this.collisionBody) {
      this.collisionBody.x = this.x;
      this.collisionBody.y = this.y;
    }

    // Update state time
    this.stateTime += deltaTime;

    // Custom update callback
    if (this.callbacks.onUpdate) {
      this.callbacks.onUpdate.call(this, deltaTime);
    }

    // Update components
    for (const component of this.components.values()) {
      if (component.update) {
        component.update(deltaTime);
      }
    }
  }

  /**
   * Render entity
   */
  render() {
    if (!this.visible) return;

    const renderer = this.game?.getSystem('renderer');
    if (!renderer) return;

    // Default entity rendering (white rectangle)
    renderer.drawRect(this.x, this.y, this.width, this.height, {
      fill: '#ff00ff',
      alpha: 0.7,
      layer: 'entities'
    });

    // Custom render callback
    if (this.callbacks.onRender) {
      this.callbacks.onRender.call(this);
    }

    // Render components
    for (const component of this.components.values()) {
      if (component.render) {
        component.render();
      }
    }
  }

  /**
   * Handle collision enter
   * @param {Object} otherBody - Other collision body
   */
  onCollisionEnter(otherBody) {
    if (this.callbacks.onCollision) {
      this.callbacks.onCollision.call(this, otherBody.entity, 'enter');
    }
  }

  /**
   * Handle collision stay
   * @param {Object} otherBody - Other collision body
   */
  onCollisionStay(otherBody) {
    if (this.callbacks.onCollision) {
      this.callbacks.onCollision.call(this, otherBody.entity, 'stay');
    }
  }

  /**
   * Handle collision exit
   * @param {Object} otherBody - Other collision body
   */
  onCollisionExit(otherBody) {
    if (this.callbacks.onCollision) {
      this.callbacks.onCollision.call(this, otherBody.entity, 'exit');
    }
  }

  /**
   * Set entity state
   * @param {string} newState - New state name
   */
  setState(newState) {
    if (this.state !== newState) {
      this.state = newState;
      this.stateTime = 0;
      this.game?.emit('entity:statechanged', { entity: this, state: newState });
    }
  }

  /**
   * Move entity
   * @param {number} x - X offset
   * @param {number} y - Y offset
   */
  move(x, y) {
    this.x += x;
    this.y += y;

    if (this.collisionBody) {
      this.collisionBody.x = this.x;
      this.collisionBody.y = this.y;
    }
  }

  /**
   * Apply velocity
   * @param {number} vx - X velocity
   * @param {number} vy - Y velocity
   */
  setVelocity(vx, vy) {
    this.velocityX = vx;
    this.velocityY = vy;
  }

  /**
   * Apply impulse
   * @param {number} forceX - Force X
   * @param {number} forceY - Force Y
   */
  applyForce(forceX, forceY) {
    this.accelerationX += forceX / this.mass;
    this.accelerationY += forceY / this.mass;
  }

  /**
   * Take damage
   * @param {number} amount - Damage amount
   */
  takeDamage(amount) {
    this.health = Math.max(0, this.health - amount);

    if (this.health <= 0) {
      this.destroy();
    }

    this.game?.emit('entity:damaged', { entity: this, amount, health: this.health });
  }

  /**
   * Heal entity
   * @param {number} amount - Heal amount
   */
  heal(amount) {
    const oldHealth = this.health;
    this.health = Math.min(this.maxHealth, this.health + amount);
    const actualHeal = this.health - oldHealth;

    this.game?.emit('entity:healed', { entity: this, amount: actualHeal, health: this.health });
  }

  /**
   * Add component
   * @param {string} name - Component name
   * @param {Object} component - Component instance
   */
  addComponent(name, component) {
    component.entity = this;
    this.components.set(name, component);

    if (component.initialize) {
      component.initialize(this.game);
    }
  }

  /**
   * Get component
   * @param {string} name - Component name
   * @returns {Object} Component or null
   */
  getComponent(name) {
    return this.components.get(name) || null;
  }

  /**
   * Remove component
   * @param {string} name - Component name
   */
  removeComponent(name) {
    const component = this.components.get(name);
    if (component && component.destroy) {
      component.destroy();
    }
    this.components.delete(name);
  }

  /**
   * Add tag
   * @param {string} tag - Tag name
   */
  addTag(tag) {
    this.tags.add(tag);
  }

  /**
   * Remove tag
   * @param {string} tag - Tag name
   */
  removeTag(tag) {
    this.tags.delete(tag);
  }

  /**
   * Check if has tag
   * @param {string} tag - Tag name
   * @returns {boolean} True if has tag
   */
  hasTag(tag) {
    return this.tags.has(tag);
  }

  /**
   * Check if entity is visible in viewport
   * @returns {boolean} True if visible
   */
  isInViewport() {
    const renderer = this.game?.getSystem('renderer');
    if (!renderer) return true;

    return renderer.isInViewport(this.x, this.y, this.width, this.height);
  }

  /**
   * Destroy entity
   */
  destroy() {
    if (this.destroyed) return;

    this.destroyed = true;
    this.active = false;

    // Remove collision body
    if (this.collisionBody) {
      const collisionSystem = this.game?.getSystem('collision');
      collisionSystem?.removeBody(this.collisionBody.id);
    }

    // Destroy components
    for (const component of this.components.values()) {
      if (component.destroy) {
        component.destroy();
      }
    }

    // Custom destroy callback
    if (this.callbacks.onDestroy) {
      this.callbacks.onDestroy.call(this);
    }

    // Remove from world
    if (this.world) {
      this.world.removeEntity(this.id);
    }

    this.game?.emit('entity:destroyed', { entity: this });
  }

  /**
   * Get entity data for saving
   * @returns {Object} Save data
   */
  getSaveData() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      x: this.x,
      y: this.y,
      z: this.z,
      rotation: this.rotation,
      health: this.health,
      state: this.state,
      data: this.data,
      tags: Array.from(this.tags)
    };
  }

  /**
   * Restore entity from save data
   * @param {Object} saveData - Save data
   */
  restoreFromSave(saveData) {
    this.x = saveData.x;
    this.y = saveData.y;
    this.z = saveData.z;
    this.rotation = saveData.rotation;
    this.health = saveData.health;
    this.state = saveData.state;
    this.data = saveData.data;

    if (saveData.tags) {
      this.tags = new Set(saveData.tags);
    }
  }

  /**
   * Get debug info
   * @returns {Object} Debug information
   */
  getDebugInfo() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      position: { x: this.x, y: this.y },
      velocity: { x: this.velocityX, y: this.velocityY },
      health: `${this.health}/${this.maxHealth}`,
      state: this.state,
      active: this.active,
      visible: this.visible
    };
  }
}

export default Entity;
