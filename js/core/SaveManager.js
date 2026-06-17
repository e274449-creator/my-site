/**
 * SAVEMANAGER.JS - Game Save/Load System
 * 
 * Manages:
 * - Game state persistence
 * - Save file management
 * - Autosave functionality
 * - Multiple save slots
 * - Save/load serialization
 * - Cloud storage integration (future)
 * 
 * @module SaveManager
 */

export class SaveManager {
  /**
   * Creates the save manager
   * @param {Game} game - Game engine reference
   * @param {Object} config - Configuration
   */
  constructor(game, config = {}) {
    this.game = game;

    this.config = {
      storageKey: 'openworld-game-saves',
      maxSlots: 10,
      autosaveInterval: 300000, // 5 minutes
      enableAutosave: true,
      useLocalStorage: true,
      ...config
    };

    // Save data
    this.saves = new Map(); // slotId -> save data
    this.currentSlot = -1;
    this.autosaveSlot = 0;

    // Autosave tracking
    this.lastAutosaveTime = 0;
    this.autosaveTimer = null;

    // Save metadata
    this.metadata = new Map();

    // Load existing saves
    this.loadSavesFromStorage();

    console.log('SaveManager initialized', this.config);
  }

  /**
   * Initialize save manager
   */
  initialize(game) {
    this.game = game;
    
    if (this.config.enableAutosave) {
      this.startAutosave();
    }
  }

  /**
   * Create new save data
   * @returns {Object} Save data template
   */
  createSaveData() {
    return {
      timestamp: Date.now(),
      gameTime: this.game?.state?.elapsedTime || 0,
      playerData: {},
      worldData: {},
      questData: {},
      inventoryData: [],
      statData: {},
      locationData: {}
    };
  }

  /**
   * Save game to slot
   * @param {number} slotId - Save slot (0 to maxSlots-1)
   * @param {Object} customData - Additional data to save
   * @returns {boolean} True if save successful
   */
  save(slotId, customData = {}) {
    if (slotId < 0 || slotId >= this.config.maxSlots) {
      console.error(`Invalid save slot: ${slotId}`);
      return false;
    }

    try {
      const saveData = this.createSaveData();

      // Gather data from all systems
      if (this.game.getSystem('player')) {
        saveData.playerData = this.game.getSystem('player').getSaveData?.() || {};
      }

      if (this.game.getSystem('world')) {
        saveData.worldData = this.game.getSystem('world').getSaveData?.() || {};
      }

      if (this.game.getSystem('inventory')) {
        saveData.inventoryData = this.game.getSystem('inventory').getSaveData?.() || [];
      }

      // Merge custom data
      Object.assign(saveData, customData);

      // Store save
      this.saves.set(slotId, saveData);
      this.updateMetadata(slotId, saveData);
      this.currentSlot = slotId;

      // Persist to storage
      this.savesToStorage();

      this.game.emit('save:created', { slotId, data: saveData });
      console.log(`Game saved to slot ${slotId}`);

      return true;
    } catch (error) {
      console.error('Save failed:', error);
      this.game.emit('save:error', { slotId, error });
      return false;
    }
  }

  /**
   * Load game from slot
   * @param {number} slotId - Save slot
   * @returns {boolean} True if load successful
   */
  load(slotId) {
    if (slotId < 0 || slotId >= this.config.maxSlots) {
      console.error(`Invalid save slot: ${slotId}`);
      return false;
    }

    const saveData = this.saves.get(slotId);
    if (!saveData) {
      console.error(`Save slot ${slotId} is empty`);
      return false;
    }

    try {
      this.currentSlot = slotId;

      // Restore data to all systems
      if (this.game.getSystem('player')) {
        this.game.getSystem('player').restoreFromSave?.(saveData.playerData);
      }

      if (this.game.getSystem('world')) {
        this.game.getSystem('world').restoreFromSave?.(saveData.worldData);
      }

      if (this.game.getSystem('inventory')) {
        this.game.getSystem('inventory').restoreFromSave?.(saveData.inventoryData);
      }

      this.game.emit('save:loaded', { slotId, data: saveData });
      console.log(`Game loaded from slot ${slotId}`);

      return true;
    } catch (error) {
      console.error('Load failed:', error);
      this.game.emit('save:error', { slotId, error });
      return false;
    }
  }

  /**
   * Delete save file
   * @param {number} slotId - Save slot
   * @returns {boolean} True if delete successful
   */
  deleteSave(slotId) {
    if (this.saves.has(slotId)) {
      this.saves.delete(slotId);
      this.metadata.delete(slotId);
      this.savesToStorage();

      this.game.emit('save:deleted', { slotId });
      console.log(`Save slot ${slotId} deleted`);

      return true;
    }

    return false;
  }

  /**
   * Check if save slot exists
   * @param {number} slotId - Save slot
   * @returns {boolean} True if save exists
   */
  hasSave(slotId) {
    return this.saves.has(slotId);
  }

  /**
   * Get save metadata
   * @param {number} slotId - Save slot
   * @returns {Object} Save metadata
   */
  getSaveMetadata(slotId) {
    return this.metadata.get(slotId) || null;
  }

  /**
   * Get all saves metadata
   * @returns {Array} Array of save metadata
   */
  getAllSavesMetadata() {
    const result = [];
    for (let i = 0; i < this.config.maxSlots; i++) {
      const meta = this.metadata.get(i);
      if (meta) {
        result.push({ slotId: i, ...meta });
      }
    }
    return result;
  }

  /**
   * Update save metadata
   * @private
   */
  updateMetadata(slotId, saveData) {
    const date = new Date(saveData.timestamp);
    this.metadata.set(slotId, {
      timestamp: saveData.timestamp,
      dateString: date.toLocaleString(),
      gameTime: saveData.gameTime,
      location: saveData.locationData?.name || 'Unknown'
    });
  }

  /**
   * Start autosave timer
   * @private
   */
  startAutosave() {
    this.autosaveTimer = setInterval(() => {
      this.autosave();
    }, this.config.autosaveInterval);
  }

  /**
   * Stop autosave timer
   */
  stopAutosave() {
    if (this.autosaveTimer) {
      clearInterval(this.autosaveTimer);
      this.autosaveTimer = null;
    }
  }

  /**
   * Perform autosave
   */
  autosave() {
    if (this.game.state.isRunning && !this.game.state.isPaused) {
      this.save(this.autosaveSlot);
      this.lastAutosaveTime = Date.now();
      console.log('Autosave performed');
    }
  }

  /**
   * Export save as JSON
   * @param {number} slotId - Save slot
   * @returns {string} JSON string
   */
  exportSave(slotId) {
    const saveData = this.saves.get(slotId);
    if (!saveData) return null;

    return JSON.stringify(saveData, null, 2);
  }

  /**
   * Import save from JSON
   * @param {number} slotId - Target save slot
   * @param {string} jsonString - JSON data
   * @returns {boolean} True if import successful
   */
  importSave(slotId, jsonString) {
    try {
      const saveData = JSON.parse(jsonString);
      this.saves.set(slotId, saveData);
      this.updateMetadata(slotId, saveData);
      this.savesToStorage();

      this.game.emit('save:imported', { slotId });
      console.log(`Save imported to slot ${slotId}`);

      return true;
    } catch (error) {
      console.error('Import failed:', error);
      return false;
    }
  }

  /**
   * Save all saves to storage
   * @private
   */
  savesToStorage() {
    if (!this.config.useLocalStorage) return;

    try {
      const savesData = {};
      for (const [slotId, saveData] of this.saves) {
        savesData[slotId] = saveData;
      }

      localStorage.setItem(this.config.storageKey, JSON.stringify(savesData));
    } catch (error) {
      console.error('Failed to save to storage:', error);
    }
  }

  /**
   * Load saves from storage
   * @private
   */
  loadSavesFromStorage() {
    if (!this.config.useLocalStorage) return;

    try {
      const stored = localStorage.getItem(this.config.storageKey);
      if (stored) {
        const savesData = JSON.parse(stored);
        for (const [slotId, saveData] of Object.entries(savesData)) {
          const id = parseInt(slotId);
          this.saves.set(id, saveData);
          this.updateMetadata(id, saveData);
        }
      }
    } catch (error) {
      console.error('Failed to load from storage:', error);
    }
  }

  /**
   * Clear all saves from storage
   */
  clearStorage() {
    if (this.config.useLocalStorage) {
      localStorage.removeItem(this.config.storageKey);
    }
    this.saves.clear();
    this.metadata.clear();
  }

  /**
   * Get debug info
   * @returns {Object} Debug information
   */
  getDebugInfo() {
    return {
      saveCount: this.saves.size,
      currentSlot: this.currentSlot,
      maxSlots: this.config.maxSlots,
      autosaveEnabled: this.config.enableAutosave,
      storageUsed: JSON.stringify(Array.from(this.saves.values())).length
    };
  }
}

export default SaveManager;
