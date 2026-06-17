/**
 * NPC.JS - Non-Player Character Class
 * 
 * Extended entity with:
 * - AI state machine
 * - Dialogue system
 * - Relationship tracking
 * - Daily routines/schedules
 * - Pathfinding
 * - Faction affiliation
 * 
 * @module NPC
 */

import { Entity } from './Entity.js';

export class NPC extends Entity {
  /**
   * Creates NPC entity
   * @param {Object} config - NPC configuration
   */
  constructor(config = {}) {
    super({
      ...config,
      type: 'npc',
      name: config.name || 'NPC',
      width: 20,
      height: 30,
      health: 50,
      maxHealth: 50,
      mass: 1
    });

    // NPC properties
    this.faction = config.faction || 'civilian';
    this.role = config.role || 'pedestrian';
    this.personality = config.personality || 'neutral';

    // AI state
    this.aiState = 'idle'; // idle, walk, patrol, chase, interact
    this.aiTarget = null;
    this.aiPath = [];
    this.aiPathIndex = 0;

    // Movement
    this.moveSpeed = config.moveSpeed || 80;
    this.direction = Math.random() * Math.PI * 2;
    this.idleTimer = 0;
    this.idleDuration = Math.random() * 5 + 2;

    // Dialogue
    this.dialogues = new Map(); // key -> dialogue text
    this.lastDialogue = null;
    this.isInDialogue = false;

    // Relationships
    this.relationships = new Map(); // entityId -> relationship value
    this.reputation = 0;

    // Schedule
    this.schedule = config.schedule || [];
    this.currentScheduleIndex = 0;
    this.scheduleTimer = 0;

    // Detection
    this.visionRange = config.visionRange || 200;
    this.detectedEntities = [];

    // Behavior
    this.patrol = config.patrol || false;
    this.patrolPoints = config.patrolPoints || [];
    this.patrolIndex = 0;

    console.log('NPC created:', this.name);
  }

  /**
   * Update NPC
   * @param {number} deltaTime - Delta time in seconds
   */
  update(deltaTime) {
    super.update(deltaTime);

    if (!this.active) return;

    // Update AI
    this.updateAI(deltaTime);

    // Update detection
    this.updateDetection();

    // Update schedule
    this.updateSchedule(deltaTime);
  }

  /**
   * Update AI
   * @private
   */
  updateAI(deltaTime) {
    switch (this.aiState) {
      case 'idle':
        this.updateIdleState(deltaTime);
        break;
      case 'walk':
      case 'patrol':
        this.updateWalkState(deltaTime);
        break;
      case 'chase':
        this.updateChaseState(deltaTime);
        break;
      case 'interact':
        this.updateInteractState(deltaTime);
        break;
    }
  }

  /**
   * Update idle state
   * @private
   */
  updateIdleState(deltaTime) {
    this.idleTimer += deltaTime;

    if (this.idleTimer >= this.idleDuration) {
      // Choose random idle duration for next time
      this.idleDuration = Math.random() * 5 + 2;
      this.idleTimer = 0;

      // Random chance to walk
      if (Math.random() < 0.3) {
        this.startRandomWalk();
      }
    }

    // Slow velocity decay
    this.velocityX *= 0.95;
    this.velocityY *= 0.95;
  }

  /**
   * Update walk state
   * @private
   */
  updateWalkState(deltaTime) {
    this.velocityX = Math.cos(this.direction) * this.moveSpeed;
    this.velocityY = Math.sin(this.direction) * this.moveSpeed;

    // Random chance to stop walking
    if (Math.random() < 0.01) {
      this.setAIState('idle');
    }

    // Avoid boundaries
    const mapManager = this.game?.getSystem('map');
    if (mapManager) {
      const dims = mapManager.getDimensions();

      if (this.x < 50 || this.x > dims.width - 50 ||
          this.y < 50 || this.y > dims.height - 50) {
        // Turn around
        this.direction += Math.PI;
      }
    }
  }

  /**
   * Update chase state
   * @private
   */
  updateChaseState(deltaTime) {
    if (!this.aiTarget || this.aiTarget.destroyed) {
      this.setAIState('idle');
      return;
    }

    // Calculate direction to target
    const dx = this.aiTarget.x - this.x;
    const dy = this.aiTarget.y - this.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < 50) {
      // Reached target
      this.setAIState('interact');
    } else {
      this.direction = Math.atan2(dy, dx);
      this.velocityX = Math.cos(this.direction) * this.moveSpeed * 1.5;
      this.velocityY = Math.sin(this.direction) * this.moveSpeed * 1.5;
    }
  }

  /**
   * Update interact state
   * @private
   */
  updateInteractState(deltaTime) {
    if (!this.aiTarget || this.aiTarget.destroyed) {
      this.setAIState('idle');
      return;
    }

    // Slow velocity
    this.velocityX *= 0.8;
    this.velocityY *= 0.8;
  }

  /**
   * Update detection
   * @private
   */
  updateDetection() {
    if (!this.world) return;

    // Get entities in vision range
    this.detectedEntities = this.world.getEntitiesInArea(
      this.x - this.visionRange,
      this.y - this.visionRange,
      this.visionRange * 2,
      this.visionRange * 2
    ).filter(e => e !== this && e.type !== 'npc');
  }

  /**
   * Update schedule
   * @private
   */
  updateSchedule(deltaTime) {
    if (this.schedule.length === 0) return;

    const current = this.schedule[this.currentScheduleIndex];
    this.scheduleTimer += deltaTime;

    if (current && this.scheduleTimer >= current.duration) {
      this.scheduleTimer = 0;
      this.currentScheduleIndex = (this.currentScheduleIndex + 1) % this.schedule.length;

      const next = this.schedule[this.currentScheduleIndex];
      if (next && next.action) {
        this.executeScheduleAction(next.action);
      }
    }
  }

  /**
   * Execute schedule action
   * @private
   */
  executeScheduleAction(action) {
    if (action === 'patrol') {
      if (this.patrolPoints.length > 0) {
        this.setAIState('patrol');
      }
    } else if (action === 'idle') {
      this.setAIState('idle');
    } else if (action === 'walk') {
      this.startRandomWalk();
    }
  }

  /**
   * Start random walk
   * @private
   */
  startRandomWalk() {
    this.direction = Math.random() * Math.PI * 2;
    this.setAIState('walk');
  }

  /**
   * Set AI state
   * @param {string} newState - New AI state
   */
  setAIState(newState) {
    if (this.aiState !== newState) {
      this.aiState = newState;
      this.game?.emit('npc:statechanged', { npc: this, state: newState });
    }
  }

  /**
   * Set AI target
   * @param {Entity} target - Target entity
   * @param {string} action - Action (chase, interact, etc.)
   */
  setAITarget(target, action = 'chase') {
    this.aiTarget = target;
    this.setAIState(action);
  }

  /**
   * Render NPC
   */
  render() {
    if (!this.visible) return;

    const renderer = this.game?.getSystem('renderer');
    if (!renderer) return;

    // Draw NPC body
    let color = '#0099ff'; // Default blue
    if (this.faction === 'police') {
      color = '#ff0000';
    } else if (this.faction === 'gang') {
      color = '#ffff00';
    }

    renderer.drawRect(this.x - 10, this.y - 15, 20, 30, {
      fill: color,
      layer: 'entities'
    });

    // Draw health bar
    if (this.health < this.maxHealth) {
      renderer.drawRect(this.x - 10, this.y - 20, 20, 2, {
        fill: '#333333',
        layer: 'entities'
      });

      renderer.drawRect(
        this.x - 10,
        this.y - 20,
        (this.health / this.maxHealth) * 20,
        2,
        {
          fill: '#00ff00',
          layer: 'entities'
        }
      );
    }

    // Draw name (debug)
    if (this.game?.config.debug) {
      renderer.drawText(this.name, this.x, this.y - 25, {
        font: 'mono',
        color: '#ffff00',
        align: 'center',
        layer: 'debug'
      });
    }
  }

  /**
   * Start dialogue with NPC
   * @param {Entity} with - Entity to dialogue with
   */
  startDialogue(with_entity) {
    this.isInDialogue = true;
    this.setAIState('interact');
    this.game?.emit('npc:dialogue', { npc: this, with: with_entity });
  }

  /**
   * End dialogue
   */
  endDialogue() {
    this.isInDialogue = false;
    this.setAIState('idle');
  }

  /**
   * Add dialogue
   * @param {string} key - Dialogue key
   * @param {string} text - Dialogue text
   */
  addDialogue(key, text) {
    this.dialogues.set(key, text);
  }

  /**
   * Get dialogue
   * @param {string} key - Dialogue key
   * @returns {string} Dialogue text
   */
  getDialogue(key) {
    return this.dialogues.get(key) || 'Hello there...';
  }

  /**
   * Set relationship with entity
   * @param {Entity} entity - Target entity
   * @param {number} value - Relationship value (-100 to 100)
   */
  setRelationship(entity, value) {
    this.relationships.set(entity.id, Math.clamp(value, -100, 100));
  }

  /**
   * Modify relationship
   * @param {Entity} entity - Target entity
   * @param {number} delta - Relationship change
   */
  modifyRelationship(entity, delta) {
    const current = this.relationships.get(entity.id) || 0;
    this.setRelationship(entity, current + delta);
  }

  /**
   * Get relationship with entity
   * @param {Entity} entity - Target entity
   * @returns {number} Relationship value
   */
  getRelationship(entity) {
    return this.relationships.get(entity.id) || 0;
  }

  /**
   * Get save data
   * @returns {Object} Save data
   */
  getSaveData() {
    return {
      ...super.getSaveData(),
      faction: this.faction,
      role: this.role,
      personality: this.personality,
      reputation: this.reputation,
      aiState: this.aiState,
      dialogues: Object.fromEntries(this.dialogues),
      relationships: Object.fromEntries(this.relationships),
      schedule: this.schedule
    };
  }

  /**
   * Restore from save data
   * @param {Object} saveData - Save data
   */
  restoreFromSave(saveData) {
    super.restoreFromSave(saveData);

    this.faction = saveData.faction || 'civilian';
    this.role = saveData.role || 'pedestrian';
    this.personality = saveData.personality || 'neutral';
    this.reputation = saveData.reputation || 0;
    this.aiState = saveData.aiState || 'idle';

    if (saveData.dialogues) {
      this.dialogues = new Map(Object.entries(saveData.dialogues));
    }

    if (saveData.relationships) {
      this.relationships = new Map(Object.entries(saveData.relationships));
    }

    if (saveData.schedule) {
      this.schedule = saveData.schedule;
    }
  }

  /**
   * Get debug info
   * @returns {Object} Debug information
   */
  getDebugInfo() {
    return {
      ...super.getDebugInfo(),
      faction: this.faction,
      role: this.role,
      aiState: this.aiState,
      target: this.aiTarget?.name || 'None',
      detected: this.detectedEntities.length
    };
  }
}

/**
 * Utility: Clamp number between min and max
 * @private
 */
Math.clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export default NPC;
