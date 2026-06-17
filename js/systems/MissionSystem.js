/**
 * MISSIONSYSTEM.JS - Mission/Quest Management System
 * 
 * Manages:
 * - Mission/quest creation and tracking
 * - Mission objectives and progression
 * - Mission rewards
 * - Mission branching
 * - Mission state (active, completed, failed)
 * - Mission notifications
 * 
 * @module MissionSystem
 */

export class MissionSystem {
  /**
   * Creates mission system
   * @param {Game} game - Game engine reference
   * @param {Object} config - Configuration
   */
  constructor(game, config = {}) {
    this.game = game;

    this.config = {
      maxActiveMissions: 5,
      ...config
    };

    // Mission storage
    this.missions = new Map(); // missionId -> mission
    this.activeMissions = new Set();
    this.completedMissions = new Set();
    this.failedMissions = new Set();

    // Mission templates
    this.missionTemplates = new Map();
    this.setupDefaultMissions();
  }

  /**
   * Setup default mission templates
   * @private
   */
  setupDefaultMissions() {
    this.registerMissionTemplate('robbery', {
      name: 'Robbery',
      description: 'Rob a store for cash',
      type: 'crime',
      objectives: [
        { id: 'enter', description: 'Enter the store', type: 'location' },
        { id: 'disable_alarm', description: 'Disable the alarm', type: 'action' },
        { id: 'grab_loot', description: 'Grab the loot', type: 'collect' },
        { id: 'escape', description: 'Escape from the area', type: 'escape' }
      ],
      reward: { money: 500, experience: 100 },
      difficulty: 'medium'
    });

    this.registerMissionTemplate('escort', {
      name: 'Escort Mission',
      description: 'Escort NPC to safety',
      type: 'mission',
      objectives: [
        { id: 'meet', description: 'Meet the target', type: 'location' },
        { id: 'protect', description: 'Protect the target', type: 'protect' },
        { id: 'deliver', description: 'Deliver to safe location', type: 'location' }
      ],
      reward: { money: 300, experience: 75 },
      difficulty: 'medium'
    });

    this.registerMissionTemplate('delivery', {
      name: 'Package Delivery',
      description: 'Deliver package to destination',
      type: 'mission',
      objectives: [
        { id: 'get_package', description: 'Get the package', type: 'collect' },
        { id: 'deliver', description: 'Deliver package', type: 'location' }
      ],
      reward: { money: 100, experience: 25 },
      difficulty: 'easy'
    });

    this.registerMissionTemplate('assassination', {
      name: 'Assassination',
      description: 'Eliminate target',
      type: 'crime',
      objectives: [
        { id: 'locate', description: 'Locate the target', type: 'locate' },
        { id: 'eliminate', description: 'Eliminate the target', type: 'kill' }
      ],
      reward: { money: 1000, experience: 250 },
      difficulty: 'hard'
    });
  }

  /**
   * Register mission template
   * @param {string} templateId - Template identifier
   * @param {Object} template - Mission template
   */
  registerMissionTemplate(templateId, template) {
    this.missionTemplates.set(templateId, {
      id: templateId,
      ...template
    });
  }

  /**
   * Get mission template
   * @param {string} templateId - Template identifier
   * @returns {Object} Mission template
   */
  getMissionTemplate(templateId) {
    return this.missionTemplates.get(templateId);
  }

  /**
   * Create mission from template
   * @param {string} templateId - Template identifier
   * @param {Object} overrides - Override properties
   * @returns {Object} Created mission
   */
  createMission(templateId, overrides = {}) {
    const template = this.getMissionTemplate(templateId);
    if (!template) {
      console.error(`Mission template not found: ${templateId}`);
      return null;
    }

    const missionId = `mission_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const mission = {
      id: missionId,
      templateId,
      name: template.name,
      description: template.description,
      type: template.type,
      difficulty: template.difficulty,
      state: 'active',
      objectives: template.objectives.map(obj => ({
        ...obj,
        completed: false,
        progress: 0
      })),
      reward: template.reward,
      createdAt: Date.now(),
      completedAt: null,
      failedAt: null,
      giver: overrides.giver || null,
      targetId: overrides.targetId || null,
      locationId: overrides.locationId || null,
      ...overrides
    };

    this.missions.set(missionId, mission);
    return mission;
  }

  /**
   * Activate mission
   * @param {string} missionId - Mission identifier
   * @returns {boolean} True if activated
   */
  activateMission(missionId) {
    if (this.activeMissions.size >= this.config.maxActiveMissions) {
      this.game?.emit('mission:error', {
        missionId,
        message: 'Too many active missions'
      });
      return false;
    }

    const mission = this.missions.get(missionId);
    if (!mission) return false;

    this.activeMissions.add(missionId);
    mission.state = 'active';

    this.game?.emit('mission:activated', { missionId, mission });
    console.log(`Mission activated: ${mission.name}`);

    return true;
  }

  /**
   * Complete objective
   * @param {string} missionId - Mission identifier
   * @param {string} objectiveId - Objective identifier
   */
  completeObjective(missionId, objectiveId) {
    const mission = this.missions.get(missionId);
    if (!mission) return;

    const objective = mission.objectives.find(o => o.id === objectiveId);
    if (!objective) return;

    if (!objective.completed) {
      objective.completed = true;
      objective.progress = 100;

      this.game?.emit('mission:objectivecompleted', {
        missionId,
        objectiveId,
        objective
      });

      // Check if all objectives completed
      if (this.areAllObjectivesCompleted(missionId)) {
        this.completeMission(missionId);
      }
    }
  }

  /**
   * Update objective progress
   * @param {string} missionId - Mission identifier
   * @param {string} objectiveId - Objective identifier
   * @param {number} progress - Progress 0-100
   */
  updateObjectiveProgress(missionId, objectiveId, progress) {
    const mission = this.missions.get(missionId);
    if (!mission) return;

    const objective = mission.objectives.find(o => o.id === objectiveId);
    if (!objective) return;

    const clampedProgress = Math.max(0, Math.min(progress, 100));
    objective.progress = clampedProgress;

    if (clampedProgress >= 100 && !objective.completed) {
      this.completeObjective(missionId, objectiveId);
    }

    this.game?.emit('mission:objectiveprogress', {
      missionId,
      objectiveId,
      progress: clampedProgress
    });
  }

  /**
   * Check if all objectives completed
   * @private
   */
  areAllObjectivesCompleted(missionId) {
    const mission = this.missions.get(missionId);
    if (!mission) return false;

    return mission.objectives.every(o => o.completed);
  }

  /**
   * Complete mission
   * @param {string} missionId - Mission identifier
   * @returns {Object} Completion result
   */
  completeMission(missionId) {
    const mission = this.missions.get(missionId);
    if (!mission) return null;

    if (mission.state === 'completed') {
      return mission;
    }

    mission.state = 'completed';
    mission.completedAt = Date.now();
    this.activeMissions.delete(missionId);
    this.completedMissions.add(missionId);

    // Award rewards
    const rewards = this.awardRewards(missionId);

    this.game?.emit('mission:completed', {
      missionId,
      mission,
      rewards
    });

    console.log(`Mission completed: ${mission.name}`);

    return mission;
  }

  /**
   * Fail mission
   * @param {string} missionId - Mission identifier
   */
  failMission(missionId) {
    const mission = this.missions.get(missionId);
    if (!mission) return;

    if (mission.state === 'failed') {
      return;
    }

    mission.state = 'failed';
    mission.failedAt = Date.now();
    this.activeMissions.delete(missionId);
    this.failedMissions.add(missionId);

    this.game?.emit('mission:failed', { missionId, mission });
    console.log(`Mission failed: ${mission.name}`);
  }

  /**
   * Award mission rewards
   * @private
   */
  awardRewards(missionId) {
    const mission = this.missions.get(missionId);
    if (!mission) return null;

    const rewards = {
      money: mission.reward?.money || 0,
      experience: mission.reward?.experience || 0,
      items: mission.reward?.items || []
    };

    // Get player and award
    const player = this.game?.world?.getEntitiesByType('player')[0];
    if (player) {
      if (rewards.money > 0) {
        player.addMoney(rewards.money);
      }
      if (rewards.experience > 0) {
        player.addExperience(rewards.experience);
      }
      if (rewards.items.length > 0) {
        const inventory = this.game?.getSystem('inventory');
        for (const item of rewards.items) {
          inventory?.addItem(player.id, item.id, item.count || 1);
        }
      }
    }

    return rewards;
  }

  /**
   * Get mission
   * @param {string} missionId - Mission identifier
   * @returns {Object} Mission
   */
  getMission(missionId) {
    return this.missions.get(missionId);
  }

  /**
   * Get active missions
   * @returns {Array} Active missions
   */
  getActiveMissions() {
    const missions = [];
    for (const missionId of this.activeMissions) {
      const mission = this.missions.get(missionId);
      if (mission) missions.push(mission);
    }
    return missions;
  }

  /**
   * Get completed missions
   * @returns {Array} Completed missions
   */
  getCompletedMissions() {
    const missions = [];
    for (const missionId of this.completedMissions) {
      const mission = this.missions.get(missionId);
      if (mission) missions.push(mission);
    }
    return missions;
  }

  /**
   * Get failed missions
   * @returns {Array} Failed missions
   */
  getFailedMissions() {
    const missions = [];
    for (const missionId of this.failedMissions) {
      const mission = this.missions.get(missionId);
      if (mission) missions.push(mission);
    }
    return missions;
  }

  /**
   * Get all missions by type
   * @param {string} type - Mission type
   * @returns {Array} Missions
   */
  getMissionsByType(type) {
    const missions = [];
    for (const mission of this.missions.values()) {
      if (mission.type === type) {
        missions.push(mission);
      }
    }
    return missions;
  }

  /**
   * Get mission statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      totalMissions: this.missions.size,
      activeMissions: this.activeMissions.size,
      completedMissions: this.completedMissions.size,
      failedMissions: this.failedMissions.size
    };
  }

  /**
   * Get save data
   * @returns {Object} Save data
   */
  getSaveData() {
    const missions = [];
    for (const mission of this.missions.values()) {
      missions.push({
        ...mission,
        objectives: mission.objectives.map(o => ({
          ...o
        }))
      });
    }

    return {
      missions,
      activeMissions: Array.from(this.activeMissions),
      completedMissions: Array.from(this.completedMissions),
      failedMissions: Array.from(this.failedMissions)
    };
  }

  /**
   * Restore from save data
   * @param {Object} saveData - Save data
   */
  restoreFromSave(saveData) {
    this.missions.clear();
    this.activeMissions.clear();
    this.completedMissions.clear();
    this.failedMissions.clear();

    if (saveData.missions) {
      for (const missionData of saveData.missions) {
        this.missions.set(missionData.id, missionData);
      }
    }

    this.activeMissions = new Set(saveData.activeMissions || []);
    this.completedMissions = new Set(saveData.completedMissions || []);
    this.failedMissions = new Set(saveData.failedMissions || []);
  }
}

export default MissionSystem;
