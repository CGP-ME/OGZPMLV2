/**
 * PersistentPatternMap - Pattern Memory that Actually Remembers!
 * CHANGE 631: Because a Map() that forgets everything is worthless
 */

const fs = require('fs');
const path = require('path');

class PersistentPatternMap extends Map {
  constructor(filePath = './pattern_memory.json') {
    super();
    this.filePath = filePath;
    this.backupPath = filePath.replace('.json', '.backup.json');
    this.saveInterval = null;
    this.isDirty = false;

    // Load existing patterns from disk
    this.load();

    // Auto-save every 30 seconds if dirty
    this.saveInterval = setInterval(() => {
      if (this.isDirty) {
        this.save();
      }
    }, 30000);

    console.log(`📚 Pattern memory initialized with ${this.size} existing patterns`);
  }

  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
        Object.entries(data).forEach(([key, value]) => {
          super.set(key, value);
        });
        console.log(`✅ Loaded ${this.size} patterns from disk`);
      }
    } catch (err) {
      console.error('Failed to load patterns:', err);
      // Try backup
      if (fs.existsSync(this.backupPath)) {
        try {
          const backup = JSON.parse(fs.readFileSync(this.backupPath, 'utf8'));
          Object.entries(backup).forEach(([key, value]) => {
            super.set(key, value);
          });
          console.log(`✅ Recovered ${this.size} patterns from backup`);
        } catch (backupErr) {
          console.error('Backup also failed:', backupErr);
        }
      }
    }
  }

  save() {
    try {
      // Convert Map to object for JSON
      const data = {};
      this.forEach((value, key) => {
        data[key] = value;
      });

      // Backup existing file
      if (fs.existsSync(this.filePath)) {
        fs.copyFileSync(this.filePath, this.backupPath);
      }

      // Save new data
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
      this.isDirty = false;
      console.log(`💾 Saved ${this.size} patterns to disk`);
    } catch (err) {
      console.error('Failed to save patterns:', err);
    }
  }

  // Override Map methods to mark as dirty
  set(key, value) {
    this.isDirty = true;
    return super.set(key, value);
  }

  delete(key) {
    this.isDirty = true;
    return super.delete(key);
  }

  clear() {
    this.isDirty = true;
    return super.clear();
  }

  // Clean up on exit
  destroy() {
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
    }
    if (this.isDirty) {
      this.save();
    }
  }
}

module.exports = PersistentPatternMap;