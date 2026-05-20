// OGZProfileExporter.js - Export/Import Hitch command chains as profiles
// Save your winning strategies and replay them anytime!

const fs = require('fs').promises;
const path = require('path');

class OGZProfileExporter {
  constructor(hitchNLP) {
    this.hitch = hitchNLP;
    this.profilesPath = path.join(process.cwd(), 'profiles', 'hitch');
    this.ensureProfileDirectory();
  }

  async ensureProfileDirectory() {
    await fs.mkdir(this.profilesPath, { recursive: true });
  }

  /**
   * Export top performing commands as a profile
   */
  async exportTopCommandsAsProfile(profileName, options = {}) {
    const {
      timeframe = 'weekly',  // daily, weekly, all-time
      minProfit = 2,         // minimum % profit to include
      maxCommands = 10       // max commands to export
    } = options;

    console.log(`📦 Exporting top commands to profile: ${profileName}`);

    // Get command history
    const history = await this.hitch.logger.getCommandHistory();
    
    // Filter and sort by profit
    const profitableCommands = history
      .filter(cmd => {
        if (!cmd.impact?.updates || cmd.impact.updates.length === 0) return false;
        
        const finalUpdate = cmd.impact.updates[cmd.impact.updates.length - 1];
        return finalUpdate.percentChange >= minProfit;
      })
      .sort((a, b) => {
        const aProfit = a.impact.updates[a.impact.updates.length - 1].percentChange;
        const bProfit = b.impact.updates[b.impact.updates.length - 1].percentChange;
        return bProfit - aProfit;
      })
      .slice(0, maxCommands);

    // Create profile structure
    const profile = {
      name: profileName,
      version: '1.0',
      created: new Date().toISOString(),
      description: `Top ${profitableCommands.length} profitable commands from ${timeframe} trading`,
      metadata: {
        totalProfit: this.calculateTotalProfit(profitableCommands),
        avgProfit: this.calculateAvgProfit(profitableCommands),
        timeframe: timeframe,
        commandCount: profitableCommands.length
      },
      commands: profitableCommands.map(cmd => ({
        input: cmd.input,
        sequence: cmd.id,
        impact: {
          percentChange: cmd.impact.updates[cmd.impact.updates.length - 1].percentChange,
          trades: cmd.impact.updates[cmd.impact.updates.length - 1].tradesExecuted
        },
        interpretation: cmd.results?.applied || [],
        timestamp: cmd.timestamp
      })),
      // Execution order (can be customized)
      executionChain: profitableCommands.map(cmd => cmd.input),
      // Conditional logic
      conditions: this.extractConditions(profitableCommands)
    };

    // Save profile
    const filename = `${profileName.toLowerCase().replace(/\s+/g, '_')}.ogzprofile`;
    const filepath = path.join(this.profilesPath, filename);
    
    await fs.writeFile(filepath, JSON.stringify(profile, null, 2));
    
    console.log(`✅ Profile exported: ${filepath}`);
    console.log(`📊 Contains ${profile.commands.length} commands with ${profile.metadata.avgProfit.toFixed(2)}% avg profit`);
    
    return {
      success: true,
      filepath: filepath,
      profile: profile
    };
  }

  /**
   * Import and execute a profile
   */
  async importAndExecuteProfile(profileNameOrPath, options = {}) {
    const {
      dryRun = false,        // Test without executing
      sequential = true,     // Execute commands in order
      delayBetween = 1000   // Delay between commands (ms)
    } = options;

    console.log(`📥 Importing profile: ${profileNameOrPath}`);

    // Load profile
    let profile;
    try {
      const filepath = profileNameOrPath.includes('.ogzprofile') 
        ? profileNameOrPath 
        : path.join(this.profilesPath, `${profileNameOrPath}.ogzprofile`);
        
      const content = await fs.readFile(filepath, 'utf8');
      profile = JSON.parse(content);
    } catch (error) {
      throw new Error(`Failed to load profile: ${error.message}`);
    }

    console.log(`📋 Profile: ${profile.name}`);
    console.log(`📊 Expected avg profit: ${profile.metadata.avgProfit.toFixed(2)}%`);
    console.log(`🎯 Commands to execute: ${profile.commands.length}`);

    if (dryRun) {
      console.log('\n🧪 DRY RUN - Commands that would be executed:');
      profile.executionChain.forEach((cmd, i) => {
        console.log(`  ${i + 1}. ${cmd}`);
      });
      return { success: true, dryRun: true, profile };
    }

    // Execute profile
    const results = {
      profile: profile.name,
      executed: [],
      failed: [],
      totalTime: 0
    };

    const startTime = Date.now();

    for (const command of profile.executionChain) {
      console.log(`\n🎯 Executing: "${command}"`);
      
      try {
        const result = await this.hitch.processCommand(command, {
          source: 'profile',
          profileName: profile.name
        });
        
        results.executed.push({
          command: command,
          success: result.success,
          commandId: result.commandId
        });
        
        if (!result.success) {
          console.log(`⚠️ Command failed: ${result.error}`);
        }
        
      } catch (error) {
        results.failed.push({
          command: command,
          error: error.message
        });
        console.error(`❌ Error executing command: ${error.message}`);
      }
      
      // Delay between commands
      if (sequential && delayBetween > 0) {
        await new Promise(resolve => setTimeout(resolve, delayBetween));
      }
    }

    results.totalTime = Date.now() - startTime;
    
    console.log('\n📊 Profile Execution Summary:');
    console.log(`✅ Executed: ${results.executed.length}`);
    console.log(`❌ Failed: ${results.failed.length}`);
    console.log(`⏱️ Total time: ${(results.totalTime / 1000).toFixed(1)}s`);
    
    return results;
  }

  /**
   * List available profiles
   */
  async listProfiles() {
    const files = await fs.readdir(this.profilesPath);
    const profiles = [];
    
    for (const file of files) {
      if (file.endsWith('.ogzprofile')) {
        try {
          const content = await fs.readFile(path.join(this.profilesPath, file), 'utf8');
          const profile = JSON.parse(content);
          
          profiles.push({
            filename: file,
            name: profile.name,
            created: profile.created,
            commands: profile.commands.length,
            avgProfit: profile.metadata.avgProfit,
            description: profile.description
          });
        } catch (error) {
          console.error(`Error reading profile ${file}:`, error);
        }
      }
    }
    
    return profiles.sort((a, b) => b.avgProfit - a.avgProfit);
  }

  /**
   * Create profile from specific command IDs
   */
  async createCustomProfile(profileName, commandIds, description = '') {
    const history = await this.hitch.logger.getCommandHistory();
    
    const selectedCommands = commandIds
      .map(id => history.find(cmd => cmd.id === id))
      .filter(Boolean);
    
    if (selectedCommands.length === 0) {
      throw new Error('No valid commands found with provided IDs');
    }
    
    const profile = {
      name: profileName,
      version: '1.0',
      created: new Date().toISOString(),
      description: description || `Custom profile with ${selectedCommands.length} selected commands`,
      metadata: {
        totalProfit: this.calculateTotalProfit(selectedCommands),
        avgProfit: this.calculateAvgProfit(selectedCommands),
        commandCount: selectedCommands.length,
        custom: true
      },
      commands: selectedCommands.map(cmd => ({
        input: cmd.input,
        sequence: cmd.id,
        impact: cmd.impact?.updates ? {
          percentChange: cmd.impact.updates[cmd.impact.updates.length - 1]?.percentChange || 0,
          trades: cmd.impact.updates[cmd.impact.updates.length - 1]?.tradesExecuted || 0
        } : null
      })),
      executionChain: selectedCommands.map(cmd => cmd.input)
    };
    
    const filename = `${profileName.toLowerCase().replace(/\s+/g, '_')}.ogzprofile`;
    const filepath = path.join(this.profilesPath, filename);
    
    await fs.writeFile(filepath, JSON.stringify(profile, null, 2));
    
    return {
      success: true,
      filepath: filepath,
      profile: profile
    };
  }

  /**
   * Helper methods
   */
  calculateTotalProfit(commands) {
    return commands.reduce((sum, cmd) => {
      if (!cmd.impact?.updates || cmd.impact.updates.length === 0) return sum;
      return sum + cmd.impact.updates[cmd.impact.updates.length - 1].percentChange;
    }, 0);
  }

  calculateAvgProfit(commands) {
    if (commands.length === 0) return 0;
    return this.calculateTotalProfit(commands) / commands.length;
  }

  extractConditions(commands) {
    const conditions = new Set();
    
    commands.forEach(cmd => {
      if (cmd.results?.applied) {
        cmd.results.applied.forEach(result => {
          if (result.type === 'rule' && result.rule) {
            conditions.add(JSON.stringify(result.rule));
          }
        });
      }
    });
    
    return Array.from(conditions).map(c => JSON.parse(c));
  }
}

// React Component for UI
const ProfileManager = ({ ogzPrime }) => {
  const [profiles, setProfiles] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [exportName, setExportName] = React.useState('');
  
  const exporter = React.useMemo(() => 
    new OGZProfileExporter(ogzPrime.hitch), [ogzPrime]
  );
  
  const loadProfiles = async () => {
    const profileList = await exporter.listProfiles();
    setProfiles(profileList);
  };
  
  const handleExport = async () => {
    if (!exportName) return;
    setLoading(true);
    
    try {
      await exporter.exportTopCommandsAsProfile(exportName, {
        minProfit: 1,
        maxCommands: 10
      });
      await loadProfiles();
      setExportName('');
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const handleExecute = async (filename) => {
    setLoading(true);
    try {
      const result = await exporter.importAndExecuteProfile(filename);
      console.log('Profile executed:', result);
    } catch (error) {
      console.error('Execution failed:', error);
    } finally {
      setLoading(false);
    }
  };
  
  React.useEffect(() => {
    loadProfiles();
  }, []);
  
  return (
    <div style={{ padding: '20px', background: '#000', color: '#00ff00' }}>
      <h3>📦 OGZ Profile Manager</h3>
      
      <div style={{ marginBottom: '20px' }}>
        <input
          type="text"
          value={exportName}
          onChange={(e) => setExportName(e.target.value)}
          placeholder="Profile name..."
          style={{ marginRight: '10px' }}
        />
        <button onClick={handleExport} disabled={loading}>
          Export Top Commands
        </button>
      </div>
      
      <div>
        <h4>Available Profiles:</h4>
        {profiles.map(profile => (
          <div key={profile.filename} style={{ marginBottom: '10px', padding: '10px', border: '1px solid #00ff00' }}>
            <strong>{profile.name}</strong> - {profile.commands} commands, {profile.avgProfit.toFixed(2)}% avg profit
            <button onClick={() => handleExecute(profile.filename)} style={{ marginLeft: '10px' }}>
              Execute
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

module.exports = { OGZProfileExporter, ProfileManager };
