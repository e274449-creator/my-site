/**
 * MISSIONUI.JS - Mission Display System
 * 
 * Manages:
 * - Mission list display
 * - Objective tracking
 * - Mission progress
 * - Mission markers on map
 * - Mission notifications
 * 
 * @module MissionUI
 */

export class MissionUI {
  /**
   * Creates mission UI system
   * @param {Game} game - Game engine reference
   * @param {Object} config - Configuration
   */
  constructor(game, config = {}) {
    this.game = game;

    this.config = {
      ...config
    };

    this.missionPanel = document.getElementById('missions-panel');
    this.isVisible = false;

    this.setupEventListeners();
  }

  /**
   * Setup event listeners
   * @private
   */
  setupEventListeners() {
    document.getElementById('btn-missions')?.addEventListener('click', () => this.toggle());

    if (this.game) {
      this.game.on('mission:activated', () => this.refresh());
      this.game.on('mission:completed', () => this.refresh());
      this.game.on('mission:failed', () => this.refresh());
      this.game.on('mission:objectiveprogress', () => this.refresh());
    }
  }

  /**
   * Update mission UI
   */
  update() {
    if (this.isVisible) {
      this.refresh();
    }
  }

  /**
   * Refresh mission display
   */
  refresh() {
    if (!this.missionPanel) return;

    const missions = this.game?.getSystem('mission');
    if (!missions) return;

    const activeMissions = missions.getActiveMissions();

    // Clear panel
    this.missionPanel.innerHTML = '';

    // Display active missions
    for (const mission of activeMissions) {
      const missionElement = this.createMissionElement(mission);
      this.missionPanel.appendChild(missionElement);
    }

    if (activeMissions.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.className = 'mission-empty';
      emptyMsg.textContent = 'No active missions';
      this.missionPanel.appendChild(emptyMsg);
    }
  }

  /**
   * Create mission element
   * @private
   */
  createMissionElement(mission) {
    const element = document.createElement('div');
    element.className = 'mission-item';
    element.dataset.missionId = mission.id;

    // Mission header
    const header = document.createElement('div');
    header.className = 'mission-header';

    const title = document.createElement('div');
    title.className = 'mission-title';
    title.textContent = mission.name;

    const difficulty = document.createElement('div');
    difficulty.className = `mission-difficulty difficulty-${mission.difficulty}`;
    difficulty.textContent = mission.difficulty.toUpperCase();

    header.appendChild(title);
    header.appendChild(difficulty);

    // Description
    const desc = document.createElement('div');
    desc.className = 'mission-description';
    desc.textContent = mission.description;

    // Objectives
    const objectivesContainer = document.createElement('div');
    objectivesContainer.className = 'mission-objectives';

    for (const objective of mission.objectives) {
      const objElement = document.createElement('div');
      objElement.className = `mission-objective ${objective.completed ? 'completed' : 'active'}`;

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = objective.completed;
      checkbox.disabled = true;

      const label = document.createElement('label');
      label.textContent = objective.description;

      const progress = document.createElement('div');
      progress.className = 'objective-progress';

      if (!objective.completed) {
        const progressBar = document.createElement('div');
        progressBar.className = 'progress-bar';
        progressBar.style.width = objective.progress + '%';
        progress.appendChild(progressBar);
      }

      objElement.appendChild(checkbox);
      objElement.appendChild(label);
      objElement.appendChild(progress);

      objectivesContainer.appendChild(objElement);
    }

    // Reward info
    const reward = document.createElement('div');
    reward.className = 'mission-reward';
    reward.innerHTML = `
      <span>$${mission.reward.money || 0}</span>
      <span>+${mission.reward.experience || 0} XP</span>
    `;

    element.appendChild(header);
    element.appendChild(desc);
    element.appendChild(objectivesContainer);
    element.appendChild(reward);

    return element;
  }

  /**
   * Toggle mission panel
   */
  toggle() {
    this.isVisible ? this.hide() : this.show();
  }

  /**
   * Show mission panel
   */
  show() {
    if (this.missionPanel) {
      this.missionPanel.style.display = 'block';
      this.isVisible = true;
      this.refresh();
    }
  }

  /**
   * Hide mission panel
   */
  hide() {
    if (this.missionPanel) {
      this.missionPanel.style.display = 'none';
      this.isVisible = false;
    }
  }
}

export default MissionUI;
