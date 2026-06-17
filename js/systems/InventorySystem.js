/**
 * INVENTORYSYSTEM.JS - Inventory Management System
 * 
 * Manages:
 * - Item storage and organization
 * - Item stacking/quantities
 * - Item categories (weapon, armor, consumable, key, etc.)
 * - Weight/capacity system
 * - Item use/consumption
 * - Item properties and effects
 * 
 * @module InventorySystem
 */

export class InventorySystem {
  /**
   * Creates inventory system
   * @param {Game} game - Game engine reference
   * @param {Object} config - Configuration
   */
  constructor(game, config = {}) {
    this.game = game;

    this.config = {
      maxSlots: 20,
      maxWeight: 100,
      ...config
    };

    // Item definitions
    this.itemDefinitions = new Map();
    this.setupDefaultItems();

    // Player inventories
    this.playerInventories = new Map(); // playerId -> inventory
  }

  /**
   * Setup default item definitions
   * @private
   */
  setupDefaultItems() {
    // Weapons
    this.registerItem('pistol', {
      name: 'Pistol',
      type: 'weapon',
      weight: 1.5,
      damage: 10,
      ammo: 'bullet',
      value: 100
    });

    this.registerItem('rifle', {
      name: 'Rifle',
      type: 'weapon',
      weight: 3,
      damage: 25,
      ammo: 'bullet',
      value: 300
    });

    // Consumables
    this.registerItem('medkit', {
      name: 'Medical Kit',
      type: 'consumable',
      weight: 0.5,
      effect: 'heal',
      amount: 50,
      value: 50
    });

    this.registerItem('ammo_box', {
      name: 'Ammo Box',
      type: 'ammo',
      weight: 1,
      ammoType: 'bullet',
      amount: 30,
      value: 25
    });

    // Armor
    this.registerItem('leather_jacket', {
      name: 'Leather Jacket',
      type: 'armor',
      weight: 2,
      armor: 20,
      value: 80
    });

    this.registerItem('body_armor', {
      name: 'Body Armor',
      type: 'armor',
      weight: 4,
      armor: 40,
      value: 200
    });

    // Key items
    this.registerItem('safe_key', {
      name: 'Safe Key',
      type: 'key',
      weight: 0.1,
      value: 0,
      unique: true
    });

    // Valuables
    this.registerItem('gold_bar', {
      name: 'Gold Bar',
      type: 'valuable',
      weight: 1,
      value: 500
    });

    this.registerItem('diamond', {
      name: 'Diamond',
      type: 'valuable',
      weight: 0.1,
      value: 1000
    });
  }

  /**
   * Register item definition
   * @param {string} itemId - Item identifier
   * @param {Object} definition - Item definition
   */
  registerItem(itemId, definition) {
    this.itemDefinitions.set(itemId, {
      id: itemId,
      name: definition.name || itemId,
      type: definition.type || 'misc',
      weight: definition.weight || 0,
      stackable: definition.stackable !== false,
      maxStack: definition.maxStack || 99,
      value: definition.value || 0,
      ...definition
    });
  }

  /**
   * Get item definition
   * @param {string} itemId - Item identifier
   * @returns {Object} Item definition
   */
  getItemDefinition(itemId) {
    return this.itemDefinitions.get(itemId);
  }

  /**
   * Create inventory for player
   * @param {string} playerId - Player identifier
   * @returns {Object} Inventory object
   */
  createInventory(playerId) {
    const inventory = {
      owner: playerId,
      slots: [],
      weight: 0,
      maxSlots: this.config.maxSlots,
      maxWeight: this.config.maxWeight
    };

    // Initialize empty slots
    for (let i = 0; i < this.config.maxSlots; i++) {
      inventory.slots.push(null);
    }

    this.playerInventories.set(playerId, inventory);
    return inventory;
  }

  /**
   * Get player inventory
   * @param {string} playerId - Player identifier
   * @returns {Object} Inventory object
   */
  getInventory(playerId) {
    if (!this.playerInventories.has(playerId)) {
      this.createInventory(playerId);
    }
    return this.playerInventories.get(playerId);
  }

  /**
   * Add item to inventory
   * @param {string} playerId - Player identifier
   * @param {string} itemId - Item identifier
   * @param {number} count - Item count
   * @returns {Object} Result {success, added, message}
   */
  addItem(playerId, itemId, count = 1) {
    const inventory = this.getInventory(playerId);
    const itemDef = this.getItemDefinition(itemId);

    if (!itemDef) {
      return { success: false, added: 0, message: `Unknown item: ${itemId}` };
    }

    const totalWeight = itemDef.weight * count;
    if (inventory.weight + totalWeight > inventory.maxWeight) {
      return { success: false, added: 0, message: 'Inventory too heavy' };
    }

    let remaining = count;
    let added = 0;

    // Try to stack with existing items
    if (itemDef.stackable) {
      for (let i = 0; i < inventory.slots.length; i++) {
        const slot = inventory.slots[i];
        if (slot && slot.id === itemId) {
          const canAdd = Math.min(remaining, itemDef.maxStack - slot.count);
          slot.count += canAdd;
          inventory.weight += itemDef.weight * canAdd;
          added += canAdd;
          remaining -= canAdd;

          if (remaining === 0) break;
        }
      }
    }

    // Add to empty slots
    if (remaining > 0) {
      for (let i = 0; i < inventory.slots.length; i++) {
        if (inventory.slots[i] === null) {
          const count = Math.min(remaining, itemDef.maxStack);
          inventory.slots[i] = {
            id: itemId,
            count: count,
            slotIndex: i
          };
          inventory.weight += itemDef.weight * count;
          added += count;
          remaining -= count;

          if (remaining === 0) break;
        }
      }
    }

    if (added > 0) {
      this.game?.emit('inventory:itemadded', { playerId, itemId, count: added });
    }

    return {
      success: added > 0,
      added,
      message: `Added ${added} ${itemDef.name}(s) to inventory`
    };
  }

  /**
   * Remove item from inventory
   * @param {string} playerId - Player identifier
   * @param {string} itemId - Item identifier
   * @param {number} count - Item count
   * @returns {Object} Result {success, removed, message}
   */
  removeItem(playerId, itemId, count = 1) {
    const inventory = this.getInventory(playerId);
    const itemDef = this.getItemDefinition(itemId);

    if (!itemDef) {
      return { success: false, removed: 0, message: `Unknown item: ${itemId}` };
    }

    let remaining = count;
    let removed = 0;

    // Remove from slots
    for (let i = inventory.slots.length - 1; i >= 0; i--) {
      const slot = inventory.slots[i];
      if (slot && slot.id === itemId) {
        const removeCount = Math.min(remaining, slot.count);
        slot.count -= removeCount;
        inventory.weight -= itemDef.weight * removeCount;
        removed += removeCount;
        remaining -= removeCount;

        if (slot.count <= 0) {
          inventory.slots[i] = null;
        }

        if (remaining === 0) break;
      }
    }

    if (removed > 0) {
      this.game?.emit('inventory:itemremoved', { playerId, itemId, count: removed });
    }

    return {
      success: removed > 0,
      removed,
      message: `Removed ${removed} ${itemDef.name}(s) from inventory`
    };
  }

  /**
   * Get item count
   * @param {string} playerId - Player identifier
   * @param {string} itemId - Item identifier
   * @returns {number} Item count
   */
  getItemCount(playerId, itemId) {
    const inventory = this.getInventory(playerId);
    let count = 0;

    for (const slot of inventory.slots) {
      if (slot && slot.id === itemId) {
        count += slot.count;
      }
    }

    return count;
  }

  /**
   * Use item
   * @param {string} playerId - Player identifier
   * @param {number} slotIndex - Slot index
   * @returns {Object} Result
   */
  useItem(playerId, slotIndex) {
    const inventory = this.getInventory(playerId);
    const slot = inventory.slots[slotIndex];

    if (!slot) {
      return { success: false, message: 'Empty slot' };
    }

    const itemDef = this.getItemDefinition(slot.id);
    if (!itemDef) {
      return { success: false, message: 'Unknown item' };
    }

    // Apply item effect
    this.game?.emit('inventory:itemused', {
      playerId,
      itemId: slot.id,
      itemDef,
      slotIndex
    });

    // Remove consumable
    if (itemDef.type === 'consumable') {
      const result = this.removeItem(playerId, slot.id, 1);
      return {
        success: result.success,
        message: `Used ${itemDef.name}`
      };
    }

    return { success: true, message: `Used ${itemDef.name}` };
  }

  /**
   * Get inventory info
   * @param {string} playerId - Player identifier
   * @returns {Object} Inventory info
   */
  getInventoryInfo(playerId) {
    const inventory = this.getInventory(playerId);

    const items = [];
    for (let i = 0; i < inventory.slots.length; i++) {
      const slot = inventory.slots[i];
      if (slot) {
        const def = this.getItemDefinition(slot.id);
        items.push({
          slotIndex: i,
          itemId: slot.id,
          name: def?.name || slot.id,
          count: slot.count,
          type: def?.type || 'misc'
        });
      }
    }

    return {
      owner: playerId,
      items,
      slotsUsed: items.length,
      slotsTotal: inventory.maxSlots,
      weight: inventory.weight,
      maxWeight: inventory.maxWeight,
      weightPercent: (inventory.weight / inventory.maxWeight) * 100
    };
  }

  /**
   * Get inventory total value
   * @param {string} playerId - Player identifier
   * @returns {number} Total value
   */
  getInventoryValue(playerId) {
    const inventory = this.getInventory(playerId);
    let value = 0;

    for (const slot of inventory.slots) {
      if (slot) {
        const def = this.getItemDefinition(slot.id);
        if (def) {
          value += def.value * slot.count;
        }
      }
    }

    return value;
  }

  /**
   * Clear inventory
   * @param {string} playerId - Player identifier
   */
  clearInventory(playerId) {
    const inventory = this.getInventory(playerId);
    inventory.slots.fill(null);
    inventory.weight = 0;
  }

  /**
   * Get save data
   * @returns {Object} Save data
   */
  getSaveData() {
    const saves = {};
    for (const [playerId, inventory] of this.playerInventories) {
      saves[playerId] = {
        slots: inventory.slots,
        weight: inventory.weight
      };
    }
    return saves;
  }

  /**
   * Restore from save data
   * @param {Object} saveData - Save data
   */
  restoreFromSave(saveData) {
    for (const [playerId, data] of Object.entries(saveData)) {
      const inventory = this.getInventory(playerId);
      inventory.slots = data.slots;
      inventory.weight = data.weight;
    }
  }
}

export default InventorySystem;
