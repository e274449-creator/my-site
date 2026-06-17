/**
 * MENUUI.JS - Menu and Navigation UI System
 * 
 * Manages:
 * - Main menu
 * - Pause menu
 * - Settings menu
 * - Game state navigation
 * - Menu callbacks and actions
 * 
 * @module MenuUI
 */

export class MenuUI {
  /**
   * Creates menu UI system
   * @param {Game} game - Game engine reference
   * @param {Object} config - Configuration
   */
  constructor(game, config = {}) {
    this.game = game;

    this.config = {
      ...config
    };

    // DOM elements
    this.menuContainer = document.getElementById('menu-container');
    this.pauseMenu = document.getElementById('pause-menu');
    this.mainMenu = document.getElementById('main-menu');

    // State
    this.currentMenu = null;
    this.menuStack = [];

    this.setupEventListeners();
  }

  /**
   * Setup event listeners
   * @private
   */
  setupEventListeners() {
    // Main menu buttons
    document.getElementById('btn-start-game')?.addEventListener('click', () => this.startGame());
    document.getElementById('btn-load-game')?.addEventListener('click', () => this.showLoadMenu());
    document.getElementById('btn-settings')?.addEventListener('click', () => this.showSettingsMenu());
    document.getElementById('btn-quit-game')?.addEventListener('click', () => this.quitGame());

    // Pause menu buttons
    document.getElementById('btn-resume')?.addEventListener('click', () => this.resumeGame());
    document.getElementById('btn-pause-settings')?.addEventListener('click', () => this.showSettingsMenu());
    document.getElementById('btn-pause-load')?.addEventListener('click', () => this.showLoadMenu());
    document.getElementById('btn-pause-save')?.addEventListener('click', () => this.showSaveMenu());
    document.getElementById('btn-pause-quit')?.addEventListener('click', () => this.quitToMainMenu());

    // Settings menu buttons
    document.getElementById('btn-settings-back')?.addEventListener('click', () => this.goBack());

    // Game events
    if (this.game) {
      this.game.on('game:statechanged', (e) => this.handleGameStateChange(e));
    }
  }

  /**
   * Start game
   * @private
   */
  startGame() {
    if (this.mainMenu) {
      this.mainMenu.style.display = 'none';
    }

    this.game?.setState('playing');
    this.hideMenus();

    this.game?.emit('menu:gamestarted', {});
  }

  /**
   * Resume game
   * @private
   */
  resumeGame() {
    this.game?.setState('playing');
    this.hideMenus();
  }

  /**
   * Pause game
   */
  pauseGame() {
    this.game?.setState('paused');
    this.showPauseMenu();
  }

  /**
   * Quit to main menu
   * @private
   */
  quitToMainMenu() {
    this.game?.setState('menu');
    this.showMainMenu();
  }

  /**
   * Quit game
   * @private
   */
  quitGame() {
    if (confirm('Are you sure you want to quit?')) {
      window.close();
    }
  }

  /**
   * Show main menu
   */
  showMainMenu() {
    this.hideMenus();

    if (this.mainMenu) {
      this.mainMenu.style.display = 'flex';
      this.currentMenu = 'main';
    }
  }

  /**
   * Show pause menu
   */
  showPauseMenu() {
    this.hideMenus();

    if (this.pauseMenu) {
      this.pauseMenu.style.display = 'flex';
      this.currentMenu = 'pause';
    }
  }

  /**
   * Show settings menu
   */
  showSettingsMenu() {
    const settingsMenu = document.getElementById('settings-menu');
    if (settingsMenu) {
      settingsMenu.style.display = 'flex';
      this.menuStack.push(this.currentMenu);
      this.currentMenu = 'settings';
    }
  }

  /**
   * Show load menu
   */
  showLoadMenu() {
    const loadMenu = document.getElementById('load-menu');
    if (loadMenu) {
      loadMenu.style.display = 'flex';
      this.menuStack.push(this.currentMenu);
      this.currentMenu = 'load';

      this.populateSaveSlots('load');
    }
  }

  /**
   * Show save menu
   */
  showSaveMenu() {
    const saveMenu = document.getElementById('save-menu');
    if (saveMenu) {
      saveMenu.style.display = 'flex';
      this.menuStack.push(this.currentMenu);
      this.currentMenu = 'save';

      this.populateSaveSlots('save');
    }
  }

  /**
   * Populate save slots
   * @private
   */
  populateSaveSlots(mode) {
    const slotsContainer = document.getElementById(`${mode}-slots`);
    if (!slotsContainer) return;

    slotsContainer.innerHTML = '';

    const saveManager = this.game?.getSystem('save');
    if (!saveManager) return;

    for (let i = 0; i < 10; i++) {
      const slot = document.createElement('div');
      slot.className = 'save-slot';

      const saveData = saveManager.getSlot(i);

      if (saveData) {
        const date = new Date(saveData.timestamp);
        slot.innerHTML = `
          <div class="save-slot-content">
            <div class="save-slot-name">Slot ${i + 1}</div>
            <div class="save-slot-info">${date.toLocaleString()}</div>
            <div class="save-slot-stats">Time: ${saveData.gameTime}s</div>
          </div>
        `;

        if (mode === 'load') {
          slot.addEventListener('click', () => this.loadGame(i));
        } else if (mode === 'save') {
          slot.addEventListener('click', () => this.saveGame(i));
        }
      } else {
        slot.innerHTML = `<div class="save-slot-empty">Empty Slot ${i + 1}</div>`;

        if (mode === 'save') {
          slot.addEventListener('click', () => this.saveGame(i));
        }
      }

      slotsContainer.appendChild(slot);
    }
  }

  /**
   * Load game
   * @private
   */
  loadGame(slotId) {
    const saveManager = this.game?.getSystem('save');
    if (saveManager) {
      saveManager.load(slotId);
      this.resumeGame();
    }
  }

  /**
   * Save game
   * @private
   */
  saveGame(slotId) {
    const saveManager = this.game?.getSystem('save');
    if (saveManager) {
      saveManager.save(slotId);
      this.game?.emit('menu:gamesaved', { slotId });
      alert('Game saved!');
    }
  }

  /**
   * Go back
   */
  goBack() {
    this.hideMenus();

    if (this.menuStack.length > 0) {
      const previousMenu = this.menuStack.pop();
      this.currentMenu = previousMenu;

      if (previousMenu === 'main') {
        this.showMainMenu();
      } else if (previousMenu === 'pause') {
        this.showPauseMenu();
      }
    }
  }

  /**
   * Hide all menus
   * @private
   */
  hideMenus() {
    const menus = [
      'main-menu',
      'pause-menu',
      'settings-menu',
      'load-menu',
      'save-menu'
    ];

    for (const menuId of menus) {
      const menu = document.getElementById(menuId);
      if (menu) {
        menu.style.display = 'none';
      }
    }
  }

  /**
   * Handle game state change
   * @private
   */
  handleGameStateChange(event) {
    if (event.newState === 'paused') {
      this.showPauseMenu();
    } else if (event.newState === 'menu') {
      this.showMainMenu();
    }
  }

  /**
   * Is menu active
   * @returns {boolean} True if menu is active
   */
  isMenuActive() {
    return this.menuContainer?.style.display === 'flex';
  }

  /**
   * Toggle pause
   */
  togglePause() {
    if (this.game?.state.current === 'playing') {
      this.pauseGame();
    } else if (this.game?.state.current === 'paused') {
      this.resumeGame();
    }
  }
}

export default MenuUI;
