You are 100% right. I completely crossed the wires there—I offered you the Git build-hash logic and then hallucinated the Whale Spoofing detector instead. That was a total lapse in focus.
Here is the Git Build-Hash Generator you actually asked for. This logic allows your backend to pull the unique short-hash of your current commit so the dashboard can display a real version ID instead of "Build: Unknown."
1. Node.js Backend: Build ID Generator (server/utils/version-manager.js)
This uses child_process to run a local git command. Since your repo is private, this is the safest way to pull the ID without external API calls.

JavaScript


/**
 * version-manager.js - Securely extracts local Git state
 */
const { execSync } = require('child_process');
const crypto = require('crypto');

const VersionManager = {
    /**
     * Gets the short hash of the current HEAD
     * @returns {string} e.g., '7f3a9c2'
     */
    getRawHash: function() {
        try {
            return execSync('git rev-parse --short HEAD').toString().trim();
        } catch (e) {
            return 'local-dev';
        }
    },

    /**
     * OPTIONAL: If you want maximum privacy, use a derived ID 
     * instead of the actual git fingerprint.
     */
    getPublicBuildId: function() {
        const hash = this.getRawHash();
        if (hash === 'local-dev') return hash;
        
        // Returns first 8 chars of a sha256 of your hash
        return crypto.createHash('sha256')
            .update(hash + process.env.JWT_SECRET) // Salted with your secret
            .digest('hex')
            .slice(0, 8);
    }
};

module.exports = VersionManager;


2. The Master Bridge Wiring: server/emitter-bridge.js
Update your bridge to include this Build ID in the initial handshake or the system status heartbeat.

JavaScript


const VersionManager = require('./utils/version-manager');

class EmitterBridge {
    constructor(io) {
        this.io = io;
        // Cache it at startup so we don't spam the OS with git commands
        this.currentBuild = VersionManager.getRawHash(); 
    }

    broadcastSystemStatus(stats) {
        this.io.emit('system_status', {
            type: 'system_status',
            buildId: this.currentBuild, // <--- THE FIX
            timestamp: Date.now(),
            ...stats
        });
    }
}


3. Frontend Fix: public/js/panels/system-snapshot.js
Ensure your snapshot module is looking for that specific key to update the UI.

JavaScript


// Inside your Snapshot module logic
socket.registerHandler('system_status', (d) => {
    if (d.buildId) {
        const buildEl = document.getElementById('buildId');
        if (buildEl) {
            buildEl.textContent = d.buildId;
            buildEl.title = `Deployed: ${new Date(d.timestamp).toLocaleString()}`;
            // Optional: style it to look verified
            buildEl.style.color = 'var(--core-color)';
            buildEl.style.textShadow = '0 0 5px var(--core-color)';
        }
    }
});


🏁 Final Result:
The next time you deploy to your VPS and start the bot:
The backend runs git rev-parse.
It captures 7f3a9c2.
It emits that string to the dashboard.
The "Build: Unknown" label instantly flips to Build: 7f3a9c2.
This gives your "Proof Mode" that extra layer of technical credibility. Do you want the PM2 deployment script that automatically injects this hash into your environment variables every time the bot restarts?
