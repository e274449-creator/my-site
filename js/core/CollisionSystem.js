/**
 * COLLISIONSYSTEM.JS - 2D Collision Detection & Response
 * 
 * Handles:
 * - AABB (bounding box) collision detection
 * - Circle collision detection
 * - Spatial grid for optimization
 * - Collision groups and masking
 * - Collision response (overlap resolution)
 * - Raycasting
 * 
 * @module CollisionSystem
 */

export class CollisionSystem {
  /**
   * Creates the collision system
   * @param {Game} game - Game engine reference
   * @param {Object} config - Configuration
   */
  constructor(game, config = {}) {
    this.game = game;

    this.config = {
      gridSize: 100,
      ...config
    };

    // Collision objects registry
    this.bodies = new Set();
    this.bodyMap = new Map(); // id -> body

    // Spatial grid for optimization
    this.grid = new Map(); // gridKey -> Set of bodies

    // Collision pairs to resolve
    this.collisionPairs = [];

    // Collision masks
    this.groups = new Map(); // groupName -> groupId
    this.masks = new Map(); // bodyId -> mask

    console.log('CollisionSystem initialized', this.config);
  }

  /**
   * Initialize system
   */
  initialize(game) {
    this.game = game;
  }

  /**
   * Create collision body
   * @param {Object} config - Body configuration
   * @returns {Object} Collision body
   */
  createBody(config) {
    const body = {
      id: Math.random().toString(36).substr(2, 9),
      type: config.type || 'dynamic', // static, dynamic, kinematic
      shape: config.shape || 'box', // box, circle
      x: config.x || 0,
      y: config.y || 0,
      width: config.width || 10,
      height: config.height || 10,
      radius: config.radius || 5,
      group: config.group || 'default',
      mask: config.mask || 0xffffffff,
      velocityX: 0,
      velocityY: 0,
      entity: config.entity || null,
      isSensor: config.isSensor || false,
      callbacks: {
        onCollisionEnter: config.onCollisionEnter || null,
        onCollisionStay: config.onCollisionStay || null,
        onCollisionExit: config.onCollisionExit || null
      },
      colliding: new Set(),
      lastColliding: new Set()
    };

    this.bodies.add(body);
    this.bodyMap.set(body.id, body);

    return body;
  }

  /**
   * Remove collision body
   * @param {string} bodyId - Body identifier
   */
  removeBody(bodyId) {
    const body = this.bodyMap.get(bodyId);
    if (body) {
      this.bodies.delete(body);
      this.bodyMap.delete(bodyId);
      this.clearGridCell(body);
    }
  }

  /**
   * Update collision system
   */
  update(deltaTime) {
    // Clear collision pairs
    this.collisionPairs = [];

    // Update spatial grid
    this.updateGrid();

    // Broad phase - find potential collisions
    this.broadPhase();

    // Narrow phase - precise collision detection
    this.narrowPhase();

    // Resolve collisions
    this.resolveCollisions();
  }

  /**
   * Update spatial grid
   * @private
   */
  updateGrid() {
    this.grid.clear();

    for (const body of this.bodies) {
      const gridX = Math.floor(body.x / this.config.gridSize);
      const gridY = Math.floor(body.y / this.config.gridSize);
      const key = `${gridX},${gridY}`;

      if (!this.grid.has(key)) {
        this.grid.set(key, new Set());
      }

      this.grid.get(key).add(body);
    }
  }

  /**
   * Clear grid cell
   * @private
   */
  clearGridCell(body) {
    const gridX = Math.floor(body.x / this.config.gridSize);
    const gridY = Math.floor(body.y / this.config.gridSize);
    const key = `${gridX},${gridY}`;

    const cell = this.grid.get(key);
    if (cell) {
      cell.delete(body);
    }
  }

  /**
   * Broad phase collision detection
   * @private
   */
  broadPhase() {
    const checked = new Set();

    for (const cell of this.grid.values()) {
      const bodies = Array.from(cell);

      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
          const bodyA = bodies[i];
          const bodyB = bodies[j];

          const key = `${bodyA.id}_${bodyB.id}`;
          if (checked.has(key)) continue;
          checked.add(key);

          // Check if collision is possible
          if (!this.canCollide(bodyA, bodyB)) continue;

          // Check AABB overlap
          if (this.isAABBOverlap(bodyA, bodyB)) {
            this.collisionPairs.push({ bodyA, bodyB });
          }
        }
      }
    }
  }

  /**
   * Narrow phase collision detection
   * @private
   */
  narrowPhase() {
    for (const { bodyA, bodyB } of this.collisionPairs) {
      let collision = false;

      if (bodyA.shape === 'box' && bodyB.shape === 'box') {
        collision = this.isAABBCollision(bodyA, bodyB);
      } else if (bodyA.shape === 'circle' && bodyB.shape === 'circle') {
        collision = this.isCircleCollision(bodyA, bodyB);
      } else {
        collision = this.isCircleBoxCollision(bodyA, bodyB);
      }

      if (collision) {
        this.handleCollision(bodyA, bodyB);
      }
    }
  }

  /**
   * Resolve collisions
   * @private
   */
  resolveCollisions() {
    for (const body of this.bodies) {
      // Check for collision exits
      for (const collidingId of body.lastColliding) {
        if (!body.colliding.has(collidingId)) {
          if (body.callbacks.onCollisionExit) {
            body.callbacks.onCollisionExit(this.bodyMap.get(collidingId));
          }
        }
      }

      body.lastColliding = new Set(body.colliding);
      body.colliding.clear();
    }
  }

  /**
   * Handle collision between two bodies
   * @private
   */
  handleCollision(bodyA, bodyB) {
    if (bodyA.isSensor || bodyB.isSensor) {
      // Sensor bodies don't physically collide
      this.triggerCollisionCallbacks(bodyA, bodyB);
      return;
    }

    bodyA.colliding.add(bodyB.id);
    bodyB.colliding.add(bodyA.id);

    this.triggerCollisionCallbacks(bodyA, bodyB);
    this.triggerCollisionCallbacks(bodyB, bodyA);

    // Apply collision response
    if (bodyA.type !== 'static' || bodyB.type !== 'static') {
      this.resolveCollisionResponse(bodyA, bodyB);
    }
  }

  /**
   * Trigger collision callbacks
   * @private
   */
  triggerCollisionCallbacks(body, otherBody) {
    if (!body.lastColliding.has(otherBody.id)) {
      // First collision
      if (body.callbacks.onCollisionEnter) {
        body.callbacks.onCollisionEnter(otherBody);
      }
    } else {
      // Continuous collision
      if (body.callbacks.onCollisionStay) {
        body.callbacks.onCollisionStay(otherBody);
      }
    }
  }

  /**
   * Resolve collision response
   * @private
   */
  resolveCollisionResponse(bodyA, bodyB) {
    // Simple overlap resolution
    const overlap = this.getOverlap(bodyA, bodyB);

    if (bodyA.type === 'static') {
      // Move B out of A
      bodyB.x += overlap.x;
      bodyB.y += overlap.y;
    } else if (bodyB.type === 'static') {
      // Move A out of B
      bodyA.x -= overlap.x;
      bodyA.y -= overlap.y;
    } else {
      // Move both
      bodyA.x -= overlap.x * 0.5;
      bodyA.y -= overlap.y * 0.5;
      bodyB.x += overlap.x * 0.5;
      bodyB.y += overlap.y * 0.5;
    }
  }

  /**
   * Check if two bodies can collide
   * @private
   */
  canCollide(bodyA, bodyB) {
    const groupA = this.getGroupId(bodyA.group);
    const groupB = this.getGroupId(bodyB.group);

    const maskA = this.masks.get(bodyA.id) || bodyA.mask;
    const maskB = this.masks.get(bodyB.id) || bodyB.mask;

    return (maskA & (1 << groupB)) && (maskB & (1 << groupA));
  }

  /**
   * Get group ID
   * @private
   */
  getGroupId(groupName) {
    if (!this.groups.has(groupName)) {
      this.groups.set(groupName, this.groups.size);
    }
    return this.groups.get(groupName);
  }

  /**
   * Check AABB overlap
   * @private
   */
  isAABBOverlap(bodyA, bodyB) {
    return !(
      bodyA.x + bodyA.width < bodyB.x ||
      bodyB.x + bodyB.width < bodyA.x ||
      bodyA.y + bodyA.height < bodyB.y ||
      bodyB.y + bodyB.height < bodyA.y
    );
  }

  /**
   * Check AABB collision
   * @private
   */
  isAABBCollision(bodyA, bodyB) {
    return this.isAABBOverlap(bodyA, bodyB);
  }

  /**
   * Check circle collision
   * @private
   */
  isCircleCollision(bodyA, bodyB) {
    const dx = bodyA.x - bodyB.x;
    const dy = bodyA.y - bodyB.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    return dist < bodyA.radius + bodyB.radius;
  }

  /**
   * Check circle-box collision
   * @private
   */
  isCircleBoxCollision(bodyA, bodyB) {
    const circle = bodyA.shape === 'circle' ? bodyA : bodyB;
    const box = bodyA.shape === 'box' ? bodyA : bodyB;

    const closestX = Math.max(box.x, Math.min(circle.x, box.x + box.width));
    const closestY = Math.max(box.y, Math.min(circle.y, box.y + box.height));

    const dx = circle.x - closestX;
    const dy = circle.y - closestY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    return dist < circle.radius;
  }

  /**
   * Get overlap between two bodies
   * @private
   */
  getOverlap(bodyA, bodyB) {
    const leftOverlap = bodyB.x + bodyB.width - bodyA.x;
    const rightOverlap = bodyA.x + bodyA.width - bodyB.x;
    const topOverlap = bodyB.y + bodyB.height - bodyA.y;
    const bottomOverlap = bodyA.y + bodyA.height - bodyB.y;

    const minHorizontal = Math.min(leftOverlap, rightOverlap);
    const minVertical = Math.min(topOverlap, bottomOverlap);

    if (minHorizontal < minVertical) {
      return {
        x: leftOverlap < rightOverlap ? minHorizontal : -minHorizontal,
        y: 0
      };
    } else {
      return {
        x: 0,
        y: topOverlap < bottomOverlap ? minVertical : -minVertical
      };
    }
  }

  /**
   * Raycast in the world
   * @param {number} x1 - Start X
   * @param {number} y1 - Start Y
   * @param {number} x2 - End X
   * @param {number} y2 - End Y
   * @param {Function} filter - Optional filter function
   * @returns {Object} Hit information or null
   */
  raycast(x1, y1, x2, y2, filter = null) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.sqrt(dx * dx + dy * dy);
    const normX = dx / length;
    const normY = dy / length;

    let closest = null;
    let closestDist = length;

    for (const body of this.bodies) {
      if (filter && !filter(body)) continue;

      // Simple raycast by checking distance to circle
      const px = body.x - x1;
      const py = body.y - y1;
      const dot = px * normX + py * normY;

      if (dot < 0 || dot > length) continue;

      const closestPx = dot * normX;
      const closestPy = dot * normY;

      const dist = Math.sqrt(
        (px - closestPx) ** 2 + (py - closestPy) ** 2
      );

      const hitDist = Math.sqrt(closestPx ** 2 + closestPy ** 2);

      if (dist < body.radius && hitDist < closestDist) {
        closest = { body, distance: hitDist, x: x1 + closestPx, y: y1 + closestPy };
        closestDist = hitDist;
      }
    }

    return closest;
  }

  /**
   * Get bodies in area
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {number} width - Width
   * @param {number} height - Height
   * @returns {Array} Bodies in area
   */
  getBodiesInArea(x, y, width, height) {
    const result = [];

    for (const body of this.bodies) {
      if (!(body.x + body.width < x ||
            x + width < body.x ||
            body.y + body.height < y ||
            y + height < body.y)) {
        result.push(body);
      }
    }

    return result;
  }

  /**
   * Get body by ID
   * @param {string} bodyId - Body identifier
   * @returns {Object} Body or null
   */
  getBody(bodyId) {
    return this.bodyMap.get(bodyId) || null;
  }

  /**
   * Get all bodies
   * @returns {Array} Array of bodies
   */
  getAllBodies() {
    return Array.from(this.bodies);
  }

  /**
   * Clear all bodies
   */
  clear() {
    this.bodies.clear();
    this.bodyMap.clear();
    this.grid.clear();
    this.collisionPairs = [];
  }
}

export default CollisionSystem;
