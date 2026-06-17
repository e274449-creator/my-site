/**
 * WANTEDSYSTEM.JS - Wanted Level Management System
 * 
 * Manages:
 * - Police heat system
 * - Wanted level progression (0-6 stars)
 * - Heat decay mechanics
 * - Wanted notifications
 * - Police dispatch based on wanted level
 * - Heat sources (crimes, violence, etc.)
 * 
 * @module WantedSystem
 */

export class WantedSystem {
  /**
   * Creates wanted system
   * @param {Game} game - Game engine reference
   * @param {Object} config - Configuration
   */
  constructor(game, config = {}) {
    this.game = game;

    this.config = {
      maxWantedLevel: 6,
      decayRate: [10, 15, 20, 30, 45, 60], // Seconds to decay each level
      heatToNextLevel: 100,
      ...config
    };

    // Heat tracking
    this.playerHeat = 0;
    this.wantedLevel = 0;
    this.decayTimer = 0;
    this.isBeingSeen = false;

    // Police response
    this.activePolice = [];
    this.policeDispatchTimer = 0;
    this.policeDispatchCooldown = 1; // Seconds

    // Heat sources and tracking
    this.heatSources = [];
    this.crimeLog = [];
  }

  /**
   * Update wanted system
   * @param {number} deltaTime - Delta time in seconds
   */
  update(deltaTime) {
    this.updateHeatDecay(deltaTime);
    this.updatePoliceResponse(deltaTime);
  }

  /**
   * Update heat decay
   * @private
   */
  updateHeatDecay(deltaTime) {
    if (this.wantedLevel === 0) return;

    if (!this.isBeingSeen) {
      this.decayTimer += deltaTime;

      const decayRate = this.config.decayRate[this.wantedLevel - 1] || 60;
      if (this.decayTimer >= decayRate) {
        this.decreaseWantedLevel();
        this.decayTimer = 0;
      }
    } else {
      // Reset decay when being seen
      this.decayTimer = 0;
    }

    this.isBeingSeen = false;
  }

  /**
   * Update police response
   * @private
   */
  updatePoliceResponse(deltaTime) {
    this.policeDispatchTimer += deltaTime;

    if (this.policeDispatchTimer >= this.policeDispatchCooldown) {
      this.policeDispatchTimer = 0;

      // Dispatch police based on wanted level
      if (this.wantedLevel > 0) {
        this.considerPoliceDispatch();
      }
    }
  }

  /**
   * Add heat
   * @param {number} amount - Heat amount
   * @param {string} source - Heat source (crime, violence, etc.)
   */
  addHeat(amount, source = 'unknown') {
    this.playerHeat += amount;

    // Log crime
    this.crimeLog.push({
      type: source,
      heat: amount,
      time: this.game?.state?.time || 0
    });

    // Check for level up
    while (this.playerHeat >= this.config.heatToNextLevel &&
           this.wantedLevel < this.config.maxWantedLevel) {
      this.increaseWantedLevel();
    }

    this.game?.emit('wanted:heatadded', {
      source,
      amount,
      totalHeat: this.playerHeat,
      wantedLevel: this.wantedLevel
    });

    console.log(`Heat added: +${amount} (${source}), Total: ${this.playerHeat}`);
  }

  /**
   * Decrease wanted level
   */
  decreaseWantedLevel() {
    if (this.wantedLevel > 0) {
      this.wantedLevel -= 1;
      this.playerHeat = Math.max(0, this.playerHeat - this.config.heatToNextLevel);
      this.decayTimer = 0;

      this.game?.emit('wanted:levelchanged', {
        level: this.wantedLevel,
        direction: 'decrease'
      });

      console.log(`Wanted level decreased: ${this.wantedLevel}`);
    }
  }

  /**
   * Increase wanted level
   */
  increaseWantedLevel() {
    if (this.wantedLevel < this.config.maxWantedLevel) {
      this.wantedLevel += 1;
      this.playerHeat -= this.config.heatToNextLevel;

      this.game?.emit('wanted:levelchanged', {
        level: this.wantedLevel,
        direction: 'increase'
      });

      console.log(`Wanted level increased: ${this.wantedLevel}`);
    }
  }

  /**
   * Set wanted level directly
   * @param {number} level - Wanted level (0-6)
   */
  setWantedLevel(level) {
    level = Math.max(0, Math.min(level, this.config.maxWantedLevel));

    if (level !== this.wantedLevel) {
      const diff = level - this.wantedLevel;

      if (diff > 0) {
        for (let i = 0; i < diff; i++) {
          this.increaseWantedLevel();
        }
      } else {
        for (let i = 0; i < -diff; i++) {
          this.decreaseWantedLevel();
        }
      }
    }
  }

  /**
   * Report crime
   * @param {Object} crime - Crime data
   */
  reportCrime(crime) {
    const heatMap = {
      'petty_theft': 20,
      'theft': 40,
      'robbery': 80,
      'assault': 50,
      'murder': 150,
      'kidnapping': 120,
      'arson': 100,
      'drug_dealing': 60,
      'evading_police': 80
    };

    const heat = heatMap[crime.type] || 50;
    this.addHeat(heat, crime.type);

    // Notify witnesses
    this.notifyNearbyWitnesses(crime.location || { x: 0, y: 0 });
  }

  /**
   * Notify nearby witnesses
   * @private
   */
  notifyNearbyWitnesses(location) {
    if (!this.game?.world) return;

    const witnessRange = 300;
    const witnesses = this.game.world.getEntitiesInArea(
      location.x - witnessRange,
      location.y - witnessRange,
      witnessRange * 2,
      witnessRange * 2
    ).filter(e => e.type === 'npc');

    for (const witness of witnesses) {
      // Chance to report
      if (Math.random() < 0.7) {
        this.isBeingSeen = true;
      }
    }
  }

  /**
   * Consider police dispatch
   * @private
   */
  considerPoliceDispatch() {
    if (!this.game?.world) return;

    const player = this.game.world.getEntitiesByType('player')[0];
    if (!player) return;

    // Dispatch probability based on wanted level
    const dispatchChance = (this.wantedLevel / this.config.maxWantedLevel) * 0.1;

    if (Math.random() < dispatchChance) {
      this.dispatchPolice(player.x, player.y);
    }
  }

  /**
   * Dispatch police
   * @private
   */
  dispatchPolice(x, y) {
    this.game?.emit('wanted:policeDispatched', {
      location: { x, y },
      wantedLevel: this.wantedLevel,
      policeUnits: Math.min(1 + Math.floor(this.wantedLevel / 2), 3)
    });

    console.log(`Police dispatched at wanted level ${this.wantedLevel}`);
  }

  /**
   * Clear wanted level (escape/hide)
   */
  clearWantedLevel() {
    this.wantedLevel = 0;
    this.playerHeat = 0;
    this.decayTimer = 0;

    this.game?.emit('wanted:cleared', {});
    console.log('Wanted level cleared');
  }

  /**
   * Set being seen status
   * @param {boolean} seen - Being seen
   */
  setBeingSeen(seen) {
    this.isBeingSeen = seen;

    if (seen) {
      // Add continuous heat while being seen
      this.addHeat(5, 'witnessed');
    }
  }

  /**
   * Get wanted level
   * @returns {number} Current wanted level
   */
  getWantedLevel() {
    return this.wantedLevel;
  }

  /**
   * Get heat info
   * @returns {Object} Heat information
   */
  getHeatInfo() {
    const decayRate = this.config.decayRate[this.wantedLevel - 1] || Infinity;
    const heatToNextLevel = this.config.heatToNextLevel;
    const currentHeatPercent = (this.playerHeat / heatToNextLevel) * 100;

    return {
      wantedLevel: this.wantedLevel,
      currentHeat: this.playerHeat,
      maxHeatPerLevel: heatToNextLevel,
      heatPercent: currentHeatPercent,
      decayTimeRemaining: decayRate - this.decayTimer,
      isBeingSeen: this.isBeingSeen
    };
  }

  /**
   * Get crime log
   * @param {number} limit - Max entries to return
   * @returns {Array} Crime entries
   */
  getCrimeLog(limit = 10) {
    return this.crimeLog.slice(-limit);
  }

  /**
   * Get save data
   * @returns {Object} Save data
   */
  getSaveData() {
    return {
      wantedLevel: this.wantedLevel,
      playerHeat: this.playerHeat,
      crimeLog: this.crimeLog
    };
  }

  /**
   * Restore from save data
   * @param {Object} saveData - Save data
   */
  restoreFromSave(saveData) {
    this.wantedLevel = saveData.wantedLevel || 0;
    this.playerHeat = saveData.playerHeat || 0;
    this.crimeLog = saveData.crimeLog || [];
  }
}

export default WantedSystem;
