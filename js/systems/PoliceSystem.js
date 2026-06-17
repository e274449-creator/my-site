/**
 * POLICESYSTEM.JS - Police and Law Enforcement System
 * 
 * Manages:
 * - Police unit spawning and behavior
 * - Police pursuit mechanics
 * - Police communication/coordination
 * - Police stations and bases
 * - Police patrols
 * - Arrest mechanics
 * 
 * @module PoliceSystem
 */

import { NPC } from '../entities/NPC.js';

export class PoliceSystem {
  /**
   * Creates police system
   * @param {Game} game - Game engine reference
   * @param {Object} config - Configuration
   */
  constructor(game, config = {}) {
    this.game = game;

    this.config = {
      maxPoliceUnits: 20,
      pursuitRange: 400,
      policeSpeed: 180,
      accuracyByLevel: [0.3, 0.5, 0.6, 0.7, 0.75, 0.8],
      ...config
    };

    // Police units
    this.policeUnits = [];
    this.activeStations = new Map();
    this.patrols = [];

    // Pursuit tracking
    this.activePursuit = null;
    this.pursuitDuration = 0;
    this.pursuitMaxDuration = 300; // 5 minutes

    // Setup default stations
    this.setupDefaultStations();
  }

  /**
   * Setup default police stations
   * @private
   */
  setupDefaultStations() {
    this.registerStation({
      id: 'station_downtown',
      name: 'Downtown Station',
      x: 1000,
      y: 1000,
      strength: 'high',
      responseTime: 30
    });

    this.registerStation({
      id: 'station_north',
      name: 'North District Station',
      x: 2000,
      y: 500,
      strength: 'medium',
      responseTime: 60
    });

    this.registerStation({
      id: 'station_south',
      name: 'South District Station',
      x: 1500,
      y: 2500,
      strength: 'medium',
      responseTime: 45
    });
  }

  /**
   * Register police station
   * @param {Object} station - Station configuration
   */
  registerStation(station) {
    this.activeStations.set(station.id, {
      id: station.id,
      name: station.name,
      x: station.x,
      y: station.y,
      strength: station.strength,
      responseTime: station.responseTime,
      units: 0,
      maxUnits: 10,
      isOnAlert: false
    });
  }

  /**
   * Update police system
   * @param {number} deltaTime - Delta time in seconds
   */
  update(deltaTime) {
    this.updatePoliceUnits(deltaTime);
    this.updatePursuit(deltaTime);
  }

  /**
   * Update police units
   * @private
   */
  updatePoliceUnits(deltaTime) {
    for (let i = this.policeUnits.length - 1; i >= 0; i--) {
      const unit = this.policeUnits[i];

      if (unit.destroyed || !unit.active) {
        this.policeUnits.splice(i, 1);
        continue;
      }

      this.updatePoliceUnit(unit, deltaTime);
    }
  }

  /**
   * Update single police unit
   * @private
   */
  updatePoliceUnit(unit, deltaTime) {
    if (!this.game?.world) return;

    const player = this.game.world.getEntitiesByType('player')[0];
    if (!player) return;

    // Check distance to player
    const dx = player.x - unit.x;
    const dy = player.y - unit.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < this.config.pursuitRange) {
      // Start pursuit
      if (!unit.isPursuing) {
        unit.isPursuing = true;
        unit.pursuitTarget = player;

        this.game?.emit('police:pursuit', {
          unit,
          target: player
        });
      }

      // Chase player
      if (unit.isPursuing && distance > 30) {
        const direction = Math.atan2(dy, dx);
        unit.velocityX = Math.cos(direction) * this.config.policeSpeed;
        unit.velocityY = Math.sin(direction) * this.config.policeSpeed;

        // Try to shoot
        if (distance < 200 && Math.random() < 0.02) {
          this.policeShoot(unit, player);
        }
      } else if (distance <= 30) {
        // Attempt arrest
        this.attemptArrest(unit, player);
      }
    } else {
      // End pursuit
      unit.isPursuing = false;
      unit.pursuitTarget = null;
    }
  }

  /**
   * Update pursuit
   * @private
   */
  updatePursuit(deltaTime) {
    if (this.activePursuit) {
      this.pursuitDuration += deltaTime;

      if (this.pursuitDuration > this.pursuitMaxDuration) {
        this.endPursuit();
      }
    }
  }

  /**
   * Spawn police unit
   * @param {number} x - X position
   * @param {number} y - Y position
   * @param {Object} config - Police config
   * @returns {NPC} Police unit entity
   */
  spawnPoliceUnit(x, y, config = {}) {
    if (this.policeUnits.length >= this.config.maxPoliceUnits) {
      return null;
    }

    const policeUnit = new NPC({
      name: config.name || `Police Unit ${this.policeUnits.length}`,
      x,
      y,
      faction: 'police',
      role: config.role || 'patrol',
      moveSpeed: this.config.policeSpeed,
      visionRange: this.config.pursuitRange,
      health: config.health || 50,
      maxHealth: config.maxHealth || 50,
      armor: config.armor || 20
    });

    // Police-specific properties
    policeUnit.isPursuing = false;
    policeUnit.pursuitTarget = null;
    policeUnit.accuracy = this.config.accuracyByLevel[config.level || 0] || 0.5;
    policeUnit.level = config.level || 1;
    policeUnit.stationId = config.stationId || null;

    // Add to world
    if (this.game?.world) {
      this.game.world.addEntity(policeUnit);
      policeUnit.game = this.game;
      policeUnit.world = this.game.world;
    }

    this.policeUnits.push(policeUnit);

    this.game?.emit('police:unitspawned', {
      unit: policeUnit,
      location: { x, y }
    });

    return policeUnit;
  }

  /**
   * Police shoot
   * @private
   */
  policeShoot(unit, target) {
    // Ranged attack chance based on accuracy
    const accuracy = unit.accuracy || 0.5;

    if (Math.random() < accuracy) {
      // Hit
      target.takeDamage(15);

      this.game?.emit('police:fired', {
        unit,
        target,
        hit: true,
        damage: 15
      });
    } else {
      // Miss
      this.game?.emit('police:fired', {
        unit,
        target,
        hit: false,
        damage: 0
      });
    }
  }

  /**
   * Attempt arrest
   * @private
   */
  attemptArrest(unit, player) {
    // Arrest probability increases with more police units nearby
    const nearbyPolice = this.policeUnits.filter(p => {
      const dx = p.x - unit.x;
      const dy = p.y - unit.y;
      return Math.sqrt(dx * dx + dy * dy) < 100;
    }).length;

    const arrestChance = 0.3 * nearbyPolice;

    if (Math.random() < arrestChance) {
      this.arrestPlayer(player);
    }
  }

  /**
   * Arrest player
   * @private
   */
  arrestPlayer(player) {
    this.game?.emit('police:arrested', {
      player,
      location: { x: player.x, y: player.y }
    });

    console.log('Player arrested!');

    // End pursuit
    this.endPursuit();

    // Return player to station or jail
    // TODO: Implement jail mechanics
  }

  /**
   * Start pursuit
   * @param {Entity} target - Pursuit target
   */
  startPursuit(target) {
    if (this.activePursuit) {
      return; // Already in pursuit
    }

    const wantedLevel = this.game?.getSystem('wanted')?.getWantedLevel() || 0;
    const unitsToDispatch = Math.min(1 + Math.floor(wantedLevel / 2), 5);

    this.activePursuit = {
      target,
      startTime: this.game?.state?.time || 0,
      unitsDispatched: 0
    };

    this.pursuitDuration = 0;

    // Spawn police units
    for (let i = 0; i < unitsToDispatch; i++) {
      setTimeout(() => {
        const angle = (Math.PI * 2 / unitsToDispatch) * i;
        const distance = 300;
        const x = target.x + Math.cos(angle) * distance;
        const y = target.y + Math.sin(angle) * distance;

        this.spawnPoliceUnit(x, y, {
          level: Math.min(wantedLevel, 5),
          stationId: 'station_downtown'
        });
      }, i * 500); // Stagger spawning
    }

    this.game?.emit('police:pursuitstarted', {
      target,
      unitsDispatched: unitsToDispatch,
      wantedLevel
    });

    console.log(`Police pursuit started! ${unitsToDispatch} units dispatched.`);
  }

  /**
   * End pursuit
   */
  endPursuit() {
    if (!this.activePursuit) return;

    this.game?.emit('police:pursuitended', {
      duration: this.pursuitDuration
    });

    // Remove police units
    for (const unit of this.policeUnits) {
      if (unit.isPursuing) {
        unit.destroy();
      }
    }

    this.activePursuit = null;
    console.log('Police pursuit ended');
  }

  /**
   * Get active pursuit
   * @returns {Object} Active pursuit info
   */
  getActivePursuit() {
    return this.activePursuit;
  }

  /**
   * Get police units count
   * @returns {number} Number of active police units
   */
  getPoliceUnitsCount() {
    return this.policeUnits.length;
  }

  /**
   * Get police units
   * @returns {Array} Police units
   */
  getPoliceUnits() {
    return [...this.policeUnits];
  }

  /**
   * Get station
   * @param {string} stationId - Station identifier
   * @returns {Object} Station info
   */
  getStation(stationId) {
    return this.activeStations.get(stationId);
  }

  /**
   * Get all stations
   * @returns {Array} Stations
   */
  getStations() {
    return Array.from(this.activeStations.values());
  }

  /**
   * Get save data
   * @returns {Object} Save data
   */
  getSaveData() {
    return {
      policeUnits: this.policeUnits.map(u => u.getSaveData()),
      activePursuit: this.activePursuit,
      pursuitDuration: this.pursuitDuration
    };
  }

  /**
   * Restore from save data
   * @param {Object} saveData - Save data
   */
  restoreFromSave(saveData) {
    // Clear existing units
    this.policeUnits = [];

    // Recreate units from save (would need entity factory pattern in production)
    // For now, just restore state
    this.activePursuit = saveData.activePursuit || null;
    this.pursuitDuration = saveData.pursuitDuration || 0;
  }
}

export default PoliceSystem;
