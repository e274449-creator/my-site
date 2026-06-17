/**
 * ASSETLOADER.JS - Asset Management System
 * 
 * Handles:
 * - Loading images, audio, JSON files
 * - Asset caching and pooling
 * - Batch loading with progress tracking
 * - Asset preloading
 * - Memory management
 * - Asset validation
 * 
 * @module AssetLoader
 */

export class AssetLoader {
  /**
   * Creates the asset loader
   * @param {Game} game - Game engine reference
   * @param {Object} config - Configuration
   */
  constructor(game, config = {}) {
    this.game = game;

    this.config = {
      assetPath: './assets',
      imagePath: './assets/images',
      audioPath: './assets/audio',
      dataPath: './assets/data',
      cacheBuster: null,
      ...config
    };

    // Asset storage
    this.assets = new Map(); // name -> asset
    this.assetType = new Map(); // name -> type (image, audio, json, etc.)
    this.assetStatus = new Map(); // name -> status (pending, loaded, failed)

    // Loading tracking
    this.loadingQueue = [];
    this.loadingCount = 0;
    this.totalToLoad = 0;

    // Batch loading
    this.batches = new Map();
    this.currentBatch = null;

    console.log('AssetLoader initialized', this.config);
  }

  /**
   * Load image asset
   * @param {string} name - Asset identifier
   * @param {string} path - Image file path
   * @returns {Promise<HTMLImageElement>}
   */
  loadImage(name, path) {
    return new Promise((resolve, reject) => {
      if (this.assets.has(name)) {
        resolve(this.assets.get(name));
        return;
      }

      this.markLoading(name);

      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        this.assets.set(name, img);
        this.assetType.set(name, 'image');
        this.markLoaded(name);
        resolve(img);
      };

      img.onerror = () => {
        this.markFailed(name);
        reject(new Error(`Failed to load image: ${path}`));
      };

      const fullPath = this.getAssetPath(path);
      img.src = fullPath;
    });
  }

  /**
   * Load audio asset
   * @param {string} name - Asset identifier
   * @param {string} path - Audio file path
   * @returns {Promise<HTMLAudioElement>}
   */
  loadAudio(name, path) {
    return new Promise((resolve, reject) => {
      if (this.assets.has(name)) {
        resolve(this.assets.get(name));
        return;
      }

      this.markLoading(name);

      const audio = new Audio();
      audio.crossOrigin = 'anonymous';

      audio.addEventListener('canplaythrough', () => {
        this.assets.set(name, audio);
        this.assetType.set(name, 'audio');
        this.markLoaded(name);
        resolve(audio);
      });

      audio.addEventListener('error', () => {
        this.markFailed(name);
        reject(new Error(`Failed to load audio: ${path}`));
      });

      const fullPath = this.getAssetPath(path);
      audio.src = fullPath;
    });
  }

  /**
   * Load JSON data
   * @param {string} name - Asset identifier
   * @param {string} path - JSON file path
   * @returns {Promise<Object>}
   */
  async loadJSON(name, path) {
    if (this.assets.has(name)) {
      return this.assets.get(name);
    }

    this.markLoading(name);

    try {
      const fullPath = this.getAssetPath(path);
      const response = await fetch(fullPath);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      this.assets.set(name, data);
      this.assetType.set(name, 'json');
      this.markLoaded(name);

      return data;
    } catch (error) {
      this.markFailed(name);
      throw error;
    }
  }

  /**
   * Load text file
   * @param {string} name - Asset identifier
   * @param {string} path - Text file path
   * @returns {Promise<string>}
   */
  async loadText(name, path) {
    if (this.assets.has(name)) {
      return this.assets.get(name);
    }

    this.markLoading(name);

    try {
      const fullPath = this.getAssetPath(path);
      const response = await fetch(fullPath);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const text = await response.text();
      this.assets.set(name, text);
      this.assetType.set(name, 'text');
      this.markLoaded(name);

      return text;
    } catch (error) {
      this.markFailed(name);
      throw error;
    }
  }

  /**
   * Load generic asset (auto-detect type)
   * @param {string} name - Asset identifier
   * @param {string} path - Asset file path
   * @returns {Promise<*>}
   */
  async loadAsset(name, path) {
    const ext = path.split('.').pop().toLowerCase();

    switch (ext) {
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
      case 'webp':
        return this.loadImage(name, path);

      case 'mp3':
      case 'wav':
      case 'ogg':
      case 'webm':
        return this.loadAudio(name, path);

      case 'json':
        return this.loadJSON(name, path);

      case 'txt':
        return this.loadText(name, path);

      default:
        throw new Error(`Unknown asset type: ${ext}`);
    }
  }

  /**
   * Start a batch load
   * @param {string} batchName - Batch identifier
   * @returns {Object} Batch loader
   */
  startBatch(batchName) {
    const batch = {
      name: batchName,
      assets: [],
      loaded: 0,
      failed: 0
    };

    this.batches.set(batchName, batch);
    this.currentBatch = batch;

    return {
      add: (name, path) => {
        batch.assets.push({ name, path });
        return this;
      },
      load: () => this.executeBatch(batchName)
    };
  }

  /**
   * Execute batch load
   * @param {string} batchName - Batch identifier
   * @returns {Promise<Object>}
   */
  async executeBatch(batchName) {
    const batch = this.batches.get(batchName);
    if (!batch) {
      throw new Error(`Batch not found: ${batchName}`);
    }

    const promises = batch.assets.map(({ name, path }) =>
      this.loadAsset(name, path)
        .then(() => {
          batch.loaded++;
          this.emitLoadProgress(batchName, batch);
        })
        .catch((error) => {
          batch.failed++;
          console.error(`Failed to load asset ${name}:`, error);
          this.emitLoadProgress(batchName, batch);
        })
    );

    try {
      const results = await Promise.allSettled(promises);
      this.game?.emit('assets:batchloaded', { batch: batchName, batch });
      return batch;
    } catch (error) {
      this.game?.emit('assets:batchfailed', { batch: batchName, error });
      throw error;
    }
  }

  /**
   * Emit load progress event
   * @private
   */
  emitLoadProgress(batchName, batch) {
    const progress = (batch.loaded + batch.failed) / batch.assets.length;
    this.game?.emit('assets:progress', { batch: batchName, progress });
  }

  /**
   * Preload common assets
   * @returns {Promise<void>}
   */
  async preloadCommonAssets() {
    const loader = this.startBatch('common');

    // Add common UI textures
    loader.add('ui-cursor', 'images/ui/cursor.png');
    loader.add('ui-button', 'images/ui/button.png');

    // Add common fonts (if needed)
    // loader.add('font-default', 'fonts/default.ttf');

    return loader.load();
  }

  /**
   * Get loaded asset
   * @param {string} name - Asset identifier
   * @returns {*} Asset data
   */
  get(name) {
    const asset = this.assets.get(name);
    if (!asset) {
      console.warn(`Asset not found: ${name}`);
    }
    return asset;
  }

  /**
   * Check if asset is loaded
   * @param {string} name - Asset identifier
   * @returns {boolean} True if loaded
   */
  has(name) {
    return this.assets.has(name);
  }

  /**
   * Unload asset
   * @param {string} name - Asset identifier
   */
  unload(name) {
    this.assets.delete(name);
    this.assetType.delete(name);
    this.assetStatus.delete(name);
  }

  /**
   * Unload batch
   * @param {string} batchName - Batch identifier
   */
  unloadBatch(batchName) {
    const batch = this.batches.get(batchName);
    if (batch) {
      for (const { name } of batch.assets) {
        this.unload(name);
      }
      this.batches.delete(batchName);
    }
  }

  /**
   * Clear all assets
   */
  clearAll() {
    this.assets.clear();
    this.assetType.clear();
    this.assetStatus.clear();
    this.batches.clear();
  }

  /**
   * Mark asset as loading
   * @private
   */
  markLoading(name) {
    this.assetStatus.set(name, 'pending');
    this.loadingCount++;
    this.totalToLoad++;
  }

  /**
   * Mark asset as loaded
   * @private
   */
  markLoaded(name) {
    this.assetStatus.set(name, 'loaded');
    this.loadingCount--;
    this.game?.emit('asset:loaded', { name });
  }

  /**
   * Mark asset as failed
   * @private
   */
  markFailed(name) {
    this.assetStatus.set(name, 'failed');
    this.loadingCount--;
    this.game?.emit('asset:failed', { name });
  }

  /**
   * Get asset path with cache buster
   * @private
   */
  getAssetPath(path) {
    let fullPath = path.startsWith('http') ? path : this.config.assetPath + '/' + path;

    if (this.config.cacheBuster) {
      fullPath += (fullPath.includes('?') ? '&' : '?') + 'v=' + this.config.cacheBuster;
    }

    return fullPath;
  }

  /**
   * Get loading progress
   * @returns {number} Progress 0-1
   */
  getLoadProgress() {
    if (this.totalToLoad === 0) return 1;
    return (this.totalToLoad - this.loadingCount) / this.totalToLoad;
  }

  /**
   * Get asset statistics
   * @returns {Object} Statistics
   */
  getStats() {
    let totalSize = 0;
    let imageCount = 0;
    let audioCount = 0;
    let jsonCount = 0;
    let otherCount = 0;

    for (const [name, type] of this.assetType) {
      switch (type) {
        case 'image':
          imageCount++;
          break;
        case 'audio':
          audioCount++;
          break;
        case 'json':
          jsonCount++;
          break;
        default:
          otherCount++;
      }
    }

    return {
      totalAssets: this.assets.size,
      imageCount,
      audioCount,
      jsonCount,
      otherCount,
      memoryUsage: totalSize
    };
  }

  /**
   * Get debug info
   * @returns {Object} Debug information
   */
  getDebugInfo() {
    return {
      ...this.getStats(),
      loadingCount: this.loadingCount,
      totalToLoad: this.totalToLoad,
      progress: this.getLoadProgress(),
      batches: this.batches.size
    };
  }
}

export default AssetLoader;
