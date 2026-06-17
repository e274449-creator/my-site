/**
 * INVENTORYUI.JS - Inventory Display System
 * 
 * Manages:
 * - Inventory grid display
 * - Item dragging/reorganization
 * - Item tooltips
 * - Item usage
 * - Weight/capacity visualization
 * 
 * @module InventoryUI
 */

export class InventoryUI {
  /**
   * Creates inventory UI system
   * @param {Game} game - Game engine reference
   * @param {Object} config - Configuration
   */
  constructor(game, config = {}) {
    this.game = game;

    this.config = {
      ...config
    };

    this.inventoryContainer = document.getElementById('inventory-panel');
    this.slotTemplate = document.querySelector('.inventory-slot-template');
    this.isVisible = false;

    this.setupEventListeners();
  }

  /**
   * Setup event listeners
   * @private
   */
  setupEventListeners() {
    document.getElementById('btn-inventory')?.addEventListener('click', () => this.toggle());

    if (this.game) {
      this.game.on('inventory:itemadded', () => this.refresh());
      this.game.on('inventory:itemremoved', () => this.refresh());
    }
  }

  /**
   * Update inventory UI
   */
  update() {
    if (this.isVisible) {
      this.refresh();
    }
  }

  /**
   * Refresh inventory display
   */
  refresh() {
    if (!this.inventoryContainer) return;

    const inventory = this.game?.getSystem('inventory');
    const player = this.game?.world?.getEntitiesByType('player')[0];

    if (!inventory || !player) return;

    const inventoryInfo = inventory.getInventoryInfo(player.id);

    // Clear slots
    const slots = this.inventoryContainer.querySelectorAll('.inventory-slot');
    slots.forEach(slot => slot.remove());

    // Render inventory slots
    for (let i = 0; i < inventoryInfo.slotsTotal; i++) {
      const slot = document.createElement('div');
      slot.className = 'inventory-slot';
      slot.dataset.slotIndex = i;

      const item = inventoryInfo.items.find(it => it.slotIndex === i);

      if (item) {
        slot.classList.add('filled');
        slot.innerHTML = `
          <div class="inventory-slot-item">
            <div class="inventory-slot-icon">${item.name[0]}</div>
            <div class="inventory-slot-count">${item.count > 1 ? item.count : ''}</div>
            <div class="inventory-slot-name">${item.name}</div>
          </div>
        `;

        // Add click handler for item use
        slot.addEventListener('click', () => this.useItem(inventory, player.id, i, item.itemId));
      }

      this.inventoryContainer.appendChild(slot);
    }

    // Update weight info
    const weightBar = document.getElementById('inventory-weight');
    if (weightBar) {
      const weightPercent = (inventoryInfo.weight / inventoryInfo.maxWeight) * 100;
      weightBar.style.width = weightPercent + '%';
    }

    const weightText = document.getElementById('inventory-weight-text');
    if (weightText) {
      weightText.textContent = `${inventoryInfo.weight.toFixed(1)}/${inventoryInfo.maxWeight} kg`;
    }
  }

  /**
   * Use item
   * @private
   */
  useItem(inventory, playerId, slotIndex, itemId) {
    const result = inventory.useItem(playerId, slotIndex);

    if (result.success) {
      this.game?.emit('inventory:itemused', { itemId });
    }

    this.refresh();
  }

  /**
   * Toggle inventory
   */
  toggle() {
    this.isVisible ? this.hide() : this.show();
  }

  /**
   * Show inventory
   */
  show() {
    if (this.inventoryContainer) {
      this.inventoryContainer.style.display = 'grid';
      this.isVisible = true;
      this.refresh();
    }
  }

  /**
   * Hide inventory
   */
  hide() {
    if (this.inventoryContainer) {
      this.inventoryContainer.style.display = 'none';
      this.isVisible = false;
    }
  }
}

export default InventoryUI;
