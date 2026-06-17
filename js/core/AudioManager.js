/**
 * AUDIOMANAGER.JS - Audio/Sound System
 * 
 * Manages:
 * - Sound effect playback
 * - Background music
 * - Audio volume control
 * - Audio groups (master, music, sfx)
 * - Spatial audio (3D positional)
 * - Audio pooling
 * 
 * @module AudioManager
 */

export class AudioManager {
  /**
   * Creates the audio manager
   * @param {Game} game - Game engine reference
   * @param {Object} config - Configuration
   */
  constructor(game, config = {}) {
    this.game = game;

    this.config = {
      enabled: true,
      masterVolume: 1,
      musicVolume: 0.7,
      sfxVolume: 1,
      poolSize: 32,
      ...config
    };

    // Audio context
    this.audioContext = null;
    this.masterGain = null;
    this.musicGain = null;
    this.sfxGain = null;

    // Audio pool
    this.audioPool = [];
    this.activeAudio = new Map(); // id -> audio
    this.sounds = new Map(); // name -> AudioBuffer
    this.music = new Map(); // name -> Audio element

    // Current music
    this.currentMusic = null;
    this.musicFadeOutTimer = null;

    // Spatial audio
    this.listener = null;
    this.spatialAudioEnabled = false;

    this.initializeAudio();
    console.log('AudioManager initialized', this.config);
  }

  /**
   * Initialize audio context
   * @private
   */
  initializeAudio() {
    if (!this.config.enabled) return;

    try {
      // Create audio context
      const audioCtx = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new audioCtx();

      // Create gain nodes
      this.masterGain = this.audioContext.createGain();
      this.musicGain = this.audioContext.createGain();
      this.sfxGain = this.audioContext.createGain();

      // Connect hierarchy
      this.musicGain.connect(this.masterGain);
      this.sfxGain.connect(this.masterGain);
      this.masterGain.connect(this.audioContext.destination);

      // Set volumes
      this.setMasterVolume(this.config.masterVolume);
      this.setMusicVolume(this.config.musicVolume);
      this.setSFXVolume(this.config.sfxVolume);

      // Setup spatial audio
      this.listener = this.audioContext.listener;

      console.log('Audio context initialized');
    } catch (error) {
      console.warn('Audio context not available:', error);
      this.config.enabled = false;
    }
  }

  /**
   * Initialize system
   */
  initialize(game) {
    this.game = game;
  }

  /**
   * Load sound file
   * @param {string} name - Sound identifier
   * @param {string} url - Audio file URL
   * @returns {Promise<AudioBuffer>}
   */
  async loadSound(name, url) {
    if (!this.audioContext) return null;

    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

      this.sounds.set(name, audioBuffer);
      console.log(`Sound loaded: ${name}`);

      return audioBuffer;
    } catch (error) {
      console.error(`Failed to load sound ${name}:`, error);
      return null;
    }
  }

  /**
   * Load music file
   * @param {string} name - Music identifier
   * @param {string} url - Audio file URL
   * @returns {Promise<void>}
   */
  async loadMusic(name, url) {
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      audio.loop = true;

      audio.addEventListener('canplaythrough', () => {
        this.music.set(name, audio);
        console.log(`Music loaded: ${name}`);
        resolve();
      });

      audio.addEventListener('error', () => {
        console.error(`Failed to load music ${name}`);
        reject();
      });

      audio.src = url;
    });
  }

  /**
   * Play sound effect
   * @param {string} name - Sound identifier
   * @param {Object} options - Play options
   * @returns {Promise<string>} Audio ID
   */
  async playSound(name, options = {}) {
    if (!this.config.enabled || !this.audioContext) return null;

    const audioBuffer = this.sounds.get(name);
    if (!audioBuffer) {
      console.warn(`Sound not found: ${name}`);
      return null;
    }

    const audioId = Math.random().toString(36).substr(2, 9);

    try {
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;

      // Create gain node for individual volume control
      const gainNode = this.audioContext.createGain();
      gainNode.gain.value = options.volume !== undefined ? options.volume : 1;

      // Setup panning if available
      const panNode = this.audioContext.createStereoPanner();
      panNode.pan.value = options.pan || 0;

      // Connect audio graph
      source.connect(panNode);
      panNode.connect(gainNode);
      gainNode.connect(this.sfxGain);

      // Setup spatial audio if enabled
      if (options.spatial && this.spatialAudioEnabled) {
        const panner = this.audioContext.createPanner();
        panner.positionX.value = options.x || 0;
        panner.positionY.value = options.y || 0;
        panner.positionZ.value = options.z || 0;
        gainNode.disconnect();
        gainNode.connect(panner);
        panner.connect(this.sfxGain);
      }

      // Play sound
      source.playbackRate.value = options.playbackRate || 1;
      source.start(0, options.offset || 0);

      // Track audio
      const audioData = {
        id: audioId,
        source,
        gainNode,
        startTime: this.audioContext.currentTime,
        duration: audioBuffer.duration
      };

      this.activeAudio.set(audioId, audioData);

      // Auto-cleanup when finished
      const duration = (audioBuffer.duration / (options.playbackRate || 1)) * 1000;
      setTimeout(() => {
        this.stopSound(audioId);
      }, duration);

      return audioId;
    } catch (error) {
      console.error(`Failed to play sound ${name}:`, error);
      return null;
    }
  }

  /**
   * Stop sound effect
   * @param {string} audioId - Audio identifier
   */
  stopSound(audioId) {
    const audioData = this.activeAudio.get(audioId);
    if (audioData) {
      try {
        audioData.source.stop();
      } catch (error) {
        // Already stopped
      }
      this.activeAudio.delete(audioId);
    }
  }

  /**
   * Stop all sounds
   */
  stopAllSounds() {
    for (const audioId of this.activeAudio.keys()) {
      this.stopSound(audioId);
    }
  }

  /**
   * Play music
   * @param {string} name - Music identifier
   * @param {Object} options - Play options
   */
  playMusic(name, options = {}) {
    const audio = this.music.get(name);
    if (!audio) {
      console.warn(`Music not found: ${name}`);
      return;
    }

    // Fade out current music
    if (this.currentMusic && this.currentMusic !== audio) {
      this.fadeOutMusic(options.fadeOut || 1);
    }

    try {
      audio.loop = options.loop !== false;
      audio.volume = options.volume !== undefined ? options.volume : 1;
      audio.play().catch(() => {
        console.warn('Music playback failed');
      });

      this.currentMusic = audio;
      this.game?.emit('audio:musicstarted', { name });

      console.log(`Music playing: ${name}`);
    } catch (error) {
      console.error(`Failed to play music ${name}:`, error);
    }
  }

  /**
   * Stop current music
   */
  stopMusic() {
    if (this.currentMusic) {
      this.currentMusic.pause();
      this.currentMusic.currentTime = 0;
      this.currentMusic = null;
    }
  }

  /**
   * Fade out music
   * @param {number} duration - Fade duration in seconds
   */
  fadeOutMusic(duration = 1) {
    if (!this.currentMusic) return;

    const startVolume = this.currentMusic.volume;
    const startTime = Date.now();

    const fadeInterval = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      const progress = Math.min(elapsed / duration, 1);

      this.currentMusic.volume = startVolume * (1 - progress);

      if (progress >= 1) {
        this.stopMusic();
        clearInterval(fadeInterval);
      }
    }, 50);

    this.musicFadeOutTimer = fadeInterval;
  }

  /**
   * Set master volume
   * @param {number} volume - Volume level (0-1)
   */
  setMasterVolume(volume) {
    this.config.masterVolume = Math.max(0, Math.min(volume, 1));
    if (this.masterGain) {
      this.masterGain.gain.value = this.config.masterVolume;
    }
  }

  /**
   * Set music volume
   * @param {number} volume - Volume level (0-1)
   */
  setMusicVolume(volume) {
    this.config.musicVolume = Math.max(0, Math.min(volume, 1));
    if (this.musicGain) {
      this.musicGain.gain.value = this.config.musicVolume;
    }
  }

  /**
   * Set SFX volume
   * @param {number} volume - Volume level (0-1)
   */
  setSFXVolume(volume) {
    this.config.sfxVolume = Math.max(0, Math.min(volume, 1));
    if (this.sfxGain) {
      this.sfxGain.gain.value = this.config.sfxVolume;
    }
  }

  /**
   * Get master volume
   * @returns {number} Volume level
   */
  getMasterVolume() {
    return this.config.masterVolume;
  }

  /**
   * Get music volume
   * @returns {number} Volume level
   */
  getMusicVolume() {
    return this.config.musicVolume;
  }

  /**
   * Get SFX volume
   * @returns {number} Volume level
   */
  getSFXVolume() {
    return this.config.sfxVolume;
  }

  /**
   * Mute all audio
   */
  mute() {
    if (this.masterGain) {
      this.masterGain.gain.value = 0;
    }
  }

  /**
   * Unmute audio
   */
  unmute() {
    if (this.masterGain) {
      this.masterGain.gain.value = this.config.masterVolume;
    }
  }

  /**
   * Enable spatial audio (3D audio)
   * @param {boolean} enabled - Enable/disable
   */
  setSpatialAudio(enabled) {
    this.spatialAudioEnabled = enabled;
  }

  /**
   * Update listener position for spatial audio
   * @param {number} x - Listener X
   * @param {number} y - Listener Y
   * @param {number} z - Listener Z
   */
  setListenerPosition(x, y, z = 0) {
    if (this.listener) {
      this.listener.positionX.value = x;
      this.listener.positionY.value = y;
      this.listener.positionZ.value = z;
    }
  }

  /**
   * Get number of active audio sources
   * @returns {number} Active audio count
   */
  getActiveAudioCount() {
    return this.activeAudio.size;
  }

  /**
   * Get debug info
   * @returns {Object} Debug information
   */
  getDebugInfo() {
    return {
      enabled: this.config.enabled,
      masterVolume: this.config.masterVolume,
      musicVolume: this.config.musicVolume,
      sfxVolume: this.config.sfxVolume,
      soundsLoaded: this.sounds.size,
      musicLoaded: this.music.size,
      activeAudio: this.activeAudio.size,
      currentMusic: this.currentMusic?.src || 'None'
    };
  }
}

export default AudioManager;
