/**
 * theme-customizer.js - Persistent Theme State
 * Supports Cyberpunk/Matrix/Hacker themes with accent color
 */
(function(OGZ) {
    'use strict';

    const Theme = {
        init: function() {
            const saved = localStorage.getItem('ogz_theme');
            if (saved) {
                try { this.applyTheme(JSON.parse(saved)); }
                catch (e) { console.warn('[Theme] Failed to load saved theme:', e); }
            }
        },

        applyTheme: function(config) {
            const root = document.documentElement;
            if (config.accentColor) root.style.setProperty('--ml-color', config.accentColor);
            if (config.themeName) document.body.className = `tier-ml theme-${config.themeName}`;
            localStorage.setItem('ogz_theme', JSON.stringify(config));
        },

        reset: function() {
            localStorage.removeItem('ogz_theme');
            window.location.reload();
        }
    };

    OGZ.register('Theme', Theme);
})(window.OGZ);
