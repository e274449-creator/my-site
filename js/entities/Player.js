/**
 * PLAYER.JS - Player Entity Class
 * 
 * Extended entity with:
 * - Player-specific properties
 * - Input handling
 * - Inventory system
 * - Wanted level
 * - Money/resources
 * - Skills/abilities
 * 
 * @module Player
 */

import { Entity } from './Entity.js';

export class Player extends Entity {
  /**
   * Creates player entity
   * @param {Object} config - Player configuration
   */
  constructor(config = {}) {
    super({
      ...config,
      type: 'player',
      name: config.name || 'Player',
      width: 24,
      height: 32,
      health: 100,
      maxHealth: 100,
      mass: 1
    });

    // Player-specific properties
    this.money = config.money || 0;
    this.experience = 0;
    this.level = 1;

    // Movement
    this.moveSpeed = config.moveSpeed || 150;
    this.sprintSpeed = config.sprintSpeed || 250;
    this.isSprinting = false;
    this.direction = 0; // 0-2π radians

    // Armor/protection
    this.armor = 0;
    this.maxArmor = 100;

    // Wanted level
    this.wantedLevel = 0;
    this.maxWantedLevel = 6;
    this.wantedTimer = 0;
    this.wantedDecayRate = 10; // Seconds to decay one level

    // Inventory
    this.inventory = new Map(); // itemId -> count
    this.equipment = {
      weapon: null,
      armor: null,
      accessory: null
    };
    this.maxInventorySlots = 20;

    // Skills
    this.skills = new Map(); // skillName -> level
    this.abilities = new Map(); // abilityName -> {cooldown, elapsed}

    // State tracking
    this.isMoving = false;
    this.isAiming = false;
    this.lastDirection = 0;

    // Sprint stamina
    this.stamina = 100;
    this.maxStamina = 100;
    this.staminaDrainRate = 30; // Per second
    this.staminaRegenRate = 50; // Per second

    // Interaction
    this.interactionRange = 50;
    this.nearbyEntities = [];

    console.log('Player created:', this.name);
  }

  /**
   * Update player
   * @param {number} deltaTime - Delta time in seconds
   */
  update(deltaTime) {
    super.update(deltaTime);

    if (!this.active) return;

    // Handle input
    this.handleInput();

    // Update movement
    this.updateMovement(deltaTime);

    // Update stamina
    this.updateStamina(deltaTime);

    // Update wanted level
    this.updateWantedLevel(deltaTime);

    // Update abilities cooldowns
    this.updateAbilities(deltaTime);

    // Update nearby entities
    this.updateNearbyEntities();
  }

  /**
   * Handle input
   * @private
   */
  handleInput() {
    const input = this.game?.getSystem('input');
    if (!input) return;

    // Get movement input
    let moveX = 0;
    let moveY = 0;

    if (input.isActionPressed('moveUp')) moveY -= 1;
    if (input.isActionPressed('moveDown')) moveY += 1;
    if (input.isActionPressed('moveLeft')) moveX -= 1;
    if (input.isActionPressed('moveRight')) moveX += 1;

    // Normalize diagonal movement
    if (moveX !== 0 && moveY !== 0) {
      moveX *= 0.707;
      moveY *= 0.707;
    }

    // Update movement direction
    if (moveX !== 0 || moveY !== 0) {
      this.direction = Math.atan2(moveY, moveX);
      this.isMoving = true;
    } else {
      this.isMoving = false;
    }

    // Check sprint
    this.isSprinting = input.isActionPressed('sprint') && this.stamina > 0 && this.isMoving;

    // Handle interact
    if (input.isActionJustPressed('interact')) {
      this.interact();
    }

    // Handle attack
    if (input.isActionPressed('attack')) {
      this.attack();
    }

    // Handle aim
    this.isAiming = input.isActionPressed('aim');

    // Set velocity based on movement
    if (this.isMoving) {
      const speed = this.isSprinting ? this.sprintSpeed : this.moveSpeed;
      this.velocityX = Math.cos(this.direction) * speed;
      this.velocityY = Math.sin(this.direction) * speed;

      if (this.direction !== this.lastDirection) {
        this.lastDirection = this.direction;
        this.game?.emit('player:directionchanged', { direction: this.direction });
      }
    } else {
      this.velocityX *= 0.8;
      this.velocityY *= 0.8;
    }
  }

  /**
   * Update movement
   * @private
   */
  updateMovement(deltaTime) {
    // Check collision with map
    const mapManager = this.game?.getSystem('map');
    if (mapManager) {
      const newX = this.x + this.velocityX * deltaTime;
      const newY = this.y + this.velocityY * deltaTime;

      if (mapManager.isWalkable(newX, newY)) {
        this.x = newX;
        this.y = newY;
      } else {
        // Try sliding
        if (mapManager.isWalkable(newX, this.y)) {
          this.x = newX;
        }
        if (mapManager.isWalkable(this.x, newY)) {
          this.y = newY;
        }
      }
    }

    // Update collision body
    if (this.collisionBody) {
      this.collisionBody.x = this.x;
      this.collisionBody.y = this.y;
    }

    // Update camera to follow player
    const camera = this.game?.getSystem('camera');
    if (camera) {
      camera.follow(this, { x: 0, y: 0 }, 0.08);
    }
  }

  /**
   * Update stamina
   * @private
   */
  updateStamina(deltaTime) {
    if (this.isSprinting) {
      this.stamina = Math.max(0, this.stamina - this.staminaDrainRate * deltaTime);
    } else {
      this.stamina = Math.min(this.maxStamina, this.stamina + this.staminaRegenRate * deltaTime);
    }
  }

  /**
   * Update wanted level
   * @private
   */
  updateWantedLevel(deltaTime) {
    if (this.wantedLevel > 0) {
      this.wantedTimer += deltaTime;

      if (this.wantedTimer >= this.wantedDecayRate) {
        this.setWantedLevel(this.wantedLevel - 1);
        this.wantedTimer = 0;
      }
    }
  }

  /**
   * Update abilities cooldowns
   * @private
   */
  updateAbilities(deltaTime) {
    for (const ability of this.abilities.values()) {
      if (ability.elapsed < ability.cooldown) {
        ability.elapsed += deltaTime;
      }
    }
  }

  /**
   * Update nearby entities
   * @private
   */
  updateNearbyEntities() {
    const world = this.world;
    if (!world) return;

    this.nearbyEntities = world.getEntitiesInArea(
      this.x - this.interactionRange,
      this.y - this.interactionRange,
      this.interactionRange * 2,
      this.interactionRange * 2
    ).filter(e => e !== this);
  }

  /**
   * Interact with nearby entity
   * @private
   */
  interact() {
    if (this.nearbyEntities.length === 0) return;

    // Find nearest entity
    let nearest = null;
    let nearestDist = Infinity;

    for (const entity of this.nearbyEntities) {
      const dx = entity.x - this.x;
      const dy = entity.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < nearestDist) {
        nearest = entity;
        nearestDist = dist;
      }
    }

    if (nearest && nearestDist < this.interactionRange) {
      this.game?.emit('player:interact', { target: nearest });
    }
  }

  /**
   * Attack
   * @private
   */
  attack() {
    const weapon = this.equipment.weapon;
    if (!weapon) return;

    this.game?.emit('player:attack', {
      position: { x: this.x, y: this.y },
      direction: this.direction,
      weapon: weapon
    });
  }

  /**
   * Render player
   */
  render() {
    if (!this.visible) return;

    const renderer = this.game?.getSystem('renderer');
    if (!renderer) return;

    // Draw player body
    renderer.drawRect(this.x - 12, this.y - 16, 24, 32, {
      fill: '#ff0000',
      layer: 'entities'
    });

    // Draw direction indicator
    const dirX = Math.cos(this.direction);
    const dirY = Math.sin(this.direction);
    renderer.drawLine(
      this.x,
      this.y,
      this.x + dirX * 15,
      this.y + dirY * 15,
      {
        color: '#ffff00',
        width: 2,
        layer: 'entities'
      }
    );

    // Draw health bar above head
    renderer.drawRect(this.x - 12, this.y - 25, 24, 3, {
      fill: '#333333',
      layer: 'entities'
    });

    renderer.drawRect(
      this.x - 12,
      this.y - 25,
      (this.health / this.maxHealth) * 24,
      3,
      {
        fill: '#00ff00',
        layer: 'entities'
      }
    );
  }

  /**
   * Add money
   * @param {number} amount - Money amount
   */
  addMoney(amount) {
    this.money += amount;
    this.game?.emit('player:moneychanged', { money: this.money, delta: amount });
  }

  /**
   * Spend money
   * @param {number} amount - Money amount
   * @returns {boolean} True if successful
   */
  spendMoney(amount) {
    if (this.money >= amount) {
      this.money -= amount;
      this.game?.emit('player:moneychanged', { money: this.money, delta: -amount });
      return true;
    }
    return false;
  }

  /**
   * Set wanted level
   * @param {number} level - New wanted level (0-6)
   */
  setWantedLevel(level) {
    level = Math.clamp(level, 0, this.maxWantedLevel);

    if (level !== this.wantedLevel) {
      this.wantedLevel = level;
      this.wantedTimer = 0;
      this.game?.emit('player:wantedleveled', { level });
    }
  }

  /**
   * Increase wanted level
   * @param {number} amount - Amount to increase
   */
  addWantedLevel(amount = 1) {
    this.setWantedLevel(this.wantedLevel + amount);
  }

  /**
   * Add item to inventory
   * @param {string} itemId - Item identifier
   * @param {number} count - Item count
   */
  addItem(itemId, count = 1) {
    const currentCount = this.inventory.get(itemId) || 0;
    this.inventory.set(itemId, currentCount + count);
    this.game?.emit('player:itemadded', { itemId, count });
  }

  /**
   * Remove item from inventory
   * @param {string} itemId - Item identifier
   * @param {number} count - Item count
   * @returns {boolean} True if successful
   */
  removeItem(itemId, count = 1) {
    const currentCount = this.inventory.get(itemId) || 0;
    if (currentCount >= count) {
      this.inventory.set(itemId, currentCount - count);
      if (this.inventory.get(itemId) === 0) {
        this.inventory.delete(itemId);
      }
      this.game?.emit('player:itemremoved', { itemId, count });
      return true;
    }
    return false;
  }

  /**
   * Get item count
   * @param {string} itemId - Item identifier
   * @returns {number} Item count
   */
  getItemCount(itemId) {
    return this.inventory.get(itemId) || 0;
  }

  /**
   * Set skill level
   * @param {string} skillName - Skill name
   * @param {number} level - Skill level
   */
  setSkillLevel(skillName, level) {
    this.skills.set(skillName, level);
    this.game?.emit('player:skilleveled', { skill: skillName, level });
  }

  /**
   * Get skill level
   * @param {string} skillName - Skill name
   * @returns {number} Skill level
   */
  getSkillLevel(skillName) {
    return this.skills.get(skillName) || 0;
  }

  /**
   * Add experience
   * @param {number} amount - Experience amount
   */
  addExperience(amount) {
    this.experience += amount;
    this.game?.emit('player:experiencechanged', { experience: this.experience });
  }

  /**
   * Get save data
   * @returns {Object} Save data
   */
  getSaveData() {
    return {
      ...super.getSaveData(),
      money: this.money,
      experience: this.experience,
      level: this.level,
      armor: this.armor,
      wantedLevel: this.wantedLevel,
      stamina: this.stamina,
      inventory: Object.fromEntries(this.inventory),
      equipment: this.equipment,
      skills: Object.fromEntries(this.skills)
    };
  }

  /**
   * Restore from save data
   * @param {Object} saveData - Save data
   */
  restoreFromSave(saveData) {
    super.restoreFromSave(saveData);

    this.money = saveData.money || 0;
    this.experience = saveData.experience || 0;
    this.level = saveData.level || 1;
    this.armor = saveData.armor || 0;
    this.wantedLevel = saveData.wantedLevel || 0;
    this.stamina = saveData.stamina || 100;

    if (saveData.inventory) {
      this.inventory = new Map(Object.entries(saveData.inventory));
    }

    if (saveData.equipment) {
      this.equipment = saveData.equipment;
    }

    if (saveData.skills) {
      this.skills = new Map(Object.entries(saveData.skills));
    }
  }

  /**
   * Get debug info
   * @returns {Object} Debug information
   */
  getDebugInfo() {
    return {
      ...super.getDebugInfo(),
      money: this.money,
      level: this.level,
      armor: this.armor,
      wantedLevel: this.wantedLevel,
      stamina: this.stamina,
      inventoryItems: this.inventory.size
    };
  }
}

/**
 * Utility: Clamp number between min and max
 * @private
 */
Math.clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export default Player;
