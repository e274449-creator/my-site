/**
 * HUD.JS - Heads-Up Display System
 * 
 * Manages:
 * - Health/armor bars
 * - Money display
 * - Wanted level stars
 * - Time display
 * - Minimap
 * - Objectives
 * - Weapon display
 * - Status notifications
 * 
 * @module HUD
 */

export class HUD {
  /**
   * Creates HUD system
   * @param {Game} game - Game engine reference
   * @param {Object} config - Configuration
   */
  constructor(game, config = {}) {
    this.game = game;

    this.config = {
      elementOpacity: 0.8,
      hudMargin: 20,
      ...config
    };

    // DOM elements
    this.elements = {
      health: null,
      healthBar: null,
      armor: null,
      armorBar: null,
      money: null,
      wanted: null,
      wantedStars: null,
      time: null,
      minimap: null,
      objectives: null,
      weapon: null,
      notifications: null
    };

    // Notifications queue
    this.notificationQueue = [];

    this.cacheElements();
    this.setupEventListeners();
  }

  /**
   * Cache DOM elements
   * @private
   */
  cacheElements() {
    this.elements.health = document.getElementById('hud-health-value');
    this.elements.healthBar = document.getElementById('hud-health-bar');
    this.elements.armor = document.getElementById('hud-armor-value');
    this.elements.armorBar = document.getElementById('hud-armor-bar');
    this.elements.money = document.getElementById('hud-money');
    this.elements.wanted = document.getElementById('hud-wanted');
    this.elements.wantedStars = document.getElementById('hud-wanted-stars');
    this.elements.time = document.getElementById('hud-time');
    this.elements.minimap = document.getElementById('hud-minimap');
    this.elements.objectives = document.getElementById('hud-objectives');
    this.elements.weapon = document.getElementById('hud-weapon');
    this.elements.notifications = document.getElementById('hud-notifications');
  }

  /**
   * Setup event listeners
   * @private
   */
  setupEventListeners() {
    if (this.game) {
      this.game.on('player:health-changed', (e) => this.updateHealth(e));
      this.game.on('player:money-changed', (e) => this.updateMoney(e));
      this.game.on('wanted:levelchanged', (e) => this.updateWantedLevel(e));
      this.game.on('mission:objectivecompleted', (e) => this.addNotification(`Objective: ${e.objective.description}`));
      this.game.on('player:itemused', (e) => this.addNotification(`Used: ${e.itemDef?.name || e.itemId}`));
    }
  }

  /**
   * Update HUD
   * @param {number} deltaTime - Delta time in seconds
   */
  update(deltaTime) {
    if (!this.game?.world) return;

    const player = this.game.world.getEntitiesByType('player')[0];
    if (!player) return;

    this.updatePlayerStats(player);
    this.updateGameTime();
    this.updateMinimap();
    this.updateNotifications();
  }

  /**
   * Update player stats
   * @private
   */
  updatePlayerStats(player) {
    // Health
    if (this.elements.healthBar) {
      const healthPercent = (player.health / player.maxHealth) * 100;
      this.elements.healthBar.style.width = healthPercent + '%';
    }

    if (this.elements.health) {
      this.elements.health.textContent = `${Math.floor(player.health)}/${player.maxHealth}`;
    }

    // Armor
    if (this.elements.armorBar && player.armor !== undefined) {
      const armorPercent = (player.armor / (player.maxArmor || 100)) * 100;
      this.elements.armorBar.style.width = armorPercent + '%';
    }

    if (this.elements.armor && player.armor !== undefined) {
      this.elements.armor.textContent = Math.floor(player.armor);
    }

    // Money
    if (this.elements.money) {
      this.elements.money.textContent = `$${player.money}`;
    }

    // Wanted level
    const wanted = this.game?.getSystem('wanted');
    if (wanted && this.elements.wanted) {
      const level = wanted.getWantedLevel();
      this.elements.wanted.textContent = level;

      if (this.elements.wantedStars) {
        this.elements.wantedStars.innerHTML = '★'.repeat(level) + '☆'.repeat(6 - level);
      }
    }

    // Stamina
    if (player.stamina !== undefined) {
      const staminaPercent = (player.stamina / player.maxStamina) * 100;
      const staminaBar = document.getElementById('hud-stamina-bar');
      if (staminaBar) {
        staminaBar.style.width = staminaPercent + '%';
      }
    }
  }

  /**
   * Update game time
   * @private
   */
  updateGameTime() {
    if (!this.elements.time) return;

    const gameTime = this.game?.state?.time || 0;
    const hours = Math.floor((gameTime / 3600) % 24);
    const minutes = Math.floor((gameTime / 60) % 60);

    this.elements.time.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  /**
   * Update minimap
   * @private
   */
  updateMinimap() {
    if (!this.elements.minimap) return;

    const canvas = this.elements.minimap;
    if (!(canvas instanceof HTMLCanvasElement)) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear minimap
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!this.game?.world) return;

    const player = this.game.world.getEntitiesByType('player')[0];
    if (!player) return;

    const scale = 0.1; // 10% of world scale on minimap
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    // Draw visible entities
    const entities = this.game.world.entities || [];
    for (const entity of entities) {
      const miniX = centerX + (entity.x - player.x) * scale;
      const miniY = centerY + (entity.y - player.y) * scale;

      // Check if on minimap
      if (miniX < 0 || miniX > canvas.width || miniY < 0 || miniY > canvas.height) {
        continue;
      }

      // Draw entity
      let color = '#0099ff';
      let size = 2;

      if (entity === player) {
        color = '#00ff00';
        size = 4;
      } else if (entity.type === 'npc') {
        color = entity.faction === 'police' ? '#ff0000' : '#ffff00';
      }

      ctx.fillStyle = color;
      ctx.fillRect(miniX - size / 2, miniY - size / 2, size, size);
    }

    // Draw player indicator
    ctx.fillStyle = '#00ff00';
    ctx.fillRect(centerX - 2, centerY - 2, 4, 4);
  }

  /**
   * Update health
   * @param {Object} event - Event data
   */
  updateHealth(event) {
    const healthPercent = (event.health / event.maxHealth) * 100;

    if (this.elements.healthBar) {
      this.elements.healthBar.style.width = healthPercent + '%';
    }

    if (this.elements.health) {
      this.elements.health.textContent = `${Math.floor(event.health)}/${event.maxHealth}`;
    }
  }

  /**
   * Update money
   * @param {Object} event - Event data
   */
  updateMoney(event) {
    if (this.elements.money) {
      this.elements.money.textContent = `$${event.money}`;
    }

    // Show notification
    this.addNotification(`Money: ${event.delta > 0 ? '+' : ''}$${event.delta}`, event.delta > 0 ? 'success' : 'warning');
  }

  /**
   * Update wanted level
   * @param {Object} event - Event data
   */
  updateWantedLevel(event) {
    if (this.elements.wanted) {
      this.elements.wanted.textContent = event.level;
    }

    if (this.elements.wantedStars) {
      this.elements.wantedStars.innerHTML = '★'.repeat(event.level) + '☆'.repeat(6 - event.level);
    }

    const direction = event.direction === 'increase' ? 'increased' : 'decreased';
    this.addNotification(`Wanted Level ${direction}!`, event.direction === 'increase' ? 'warning' : 'success');
  }

  /**
   * Add notification
   * @param {string} message - Notification message
   * @param {string} type - Notification type (info, warning, success, error)
   */
  addNotification(message, type = 'info') {
    if (!this.elements.notifications) return;

    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;

    this.elements.notifications.appendChild(notification);

    // Auto-remove after 3 seconds
    setTimeout(() => {
      notification.classList.add('fade-out');
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  /**
   * Update notifications
   * @private
   */
  updateNotifications() {
    // Managed by CSS animations
  }

  /**
   * Show/hide HUD
   * @param {boolean} visible - Visibility
   */
  setVisible(visible) {
    const hudContainer = document.getElementById('hud-container');
    if (hudContainer) {
      hudContainer.style.display = visible ? 'flex' : 'none';
    }
  }

  /**
   * Get HUD visibility
   * @returns {boolean} Visible
   */
  isVisible() {
    const hudContainer = document.getElementById('hud-container');
    return hudContainer ? hudContainer.style.display !== 'none' : true;
  }
}

export default HUD;
