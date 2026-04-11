/**
 * theme-customizer.js - Persistent Theme State
 * Owns ALL theme-related DOM event binding. No inline onclick in HTML.
 */
(function(OGZ) {
    'use strict';

    const THEME_COLORS = {
        cyberpunk: '#ff00ff', matrix: '#00ff00', neon: '#ff6600',
        dark: '#888888', ocean: '#0077cc', sunset: '#ff4444',
        royal: '#8844ff', hacker: '#00ff88'
    };

    const Theme = {
        init: function() {
            // Restore saved theme
            const saved = localStorage.getItem('ogz_theme');
            if (saved) {
                try { this.applyTheme(JSON.parse(saved)); }
                catch (e) { console.warn('[Theme] Failed to load saved theme:', e); }
            }
            this.bindEvents();
        },

        bindEvents: function() {
            // Toggle panel
            const toggle = document.querySelector('.theme-toggle');
            if (toggle) toggle.addEventListener('click', () => this.togglePanel());

            // Theme preset buttons (use data-theme attribute)
            document.querySelectorAll('.theme-btn[data-theme]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const themeName = btn.getAttribute('data-theme');
                    this.applyTheme({ themeName, accentColor: THEME_COLORS[themeName] || '#ffd700' });
                });
            });

            // Accent color picker
            const colorInput = document.getElementById('accentColor');
            if (colorInput) colorInput.addEventListener('change', (e) => {
                const colorVal = document.getElementById('colorValue');
                if (colorVal) colorVal.textContent = e.target.value;
                document.documentElement.style.setProperty('--ml-color', e.target.value);
            });

            // Font select — applies to all text elements
            const fontSelect = document.getElementById('fontSelect');
            if (fontSelect) fontSelect.addEventListener('change', (e) => {
                document.documentElement.style.setProperty('font-family', e.target.value, 'important');
                document.body.style.fontFamily = e.target.value;
                // Also update panels and data displays
                document.querySelectorAll('.edge-panel, .panel-title, .edge-section, .stat-value, .indicator-bar')
                    .forEach(el => el.style.fontFamily = e.target.value);
            });

            // Animations toggle
            const animToggle = document.getElementById('animToggle');
            if (animToggle) animToggle.addEventListener('change', (e) => {
                document.body.style.animationPlayState = e.target.checked ? 'running' : 'paused';
            });

            // Save button
            const saveBtn = document.querySelector('.theme-actions button:first-child');
            if (saveBtn) saveBtn.addEventListener('click', () => this.save());

            // Reset button
            const resetBtn = document.querySelector('.theme-actions button:last-child');
            if (resetBtn) resetBtn.addEventListener('click', () => this.reset());
        },

        togglePanel: function() {
            const panel = document.getElementById('themePanel');
            if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        },

        applyTheme: function(config) {
            const root = document.documentElement;
            if (config.accentColor) root.style.setProperty('--ml-color', config.accentColor);
            if (config.themeName) document.body.className = `tier-ml theme-${config.themeName}`;
            localStorage.setItem('ogz_theme', JSON.stringify(config));
        },

        save: function() {
            const config = {
                accentColor: document.getElementById('accentColor')?.value || '#ffd700',
                themeName: document.querySelector('.theme-btn.active')?.getAttribute('data-theme') || 'dark',
                font: document.getElementById('fontSelect')?.value || 'monospace'
            };
            localStorage.setItem('ogz_theme', JSON.stringify(config));
            console.log('[Theme] Saved:', config);
        },

        reset: function() {
            localStorage.removeItem('ogz_theme');
            // Reset in place — no reload, no disconnect appearance
            const root = document.documentElement;
            root.style.setProperty('--ml-color', '#ffd700');
            root.style.setProperty('--profit-color', '#00ff88');
            root.style.setProperty('--loss-color', '#ff3366');
            document.body.className = 'tier-ml';
            const colorInput = document.getElementById('accentColor');
            if (colorInput) colorInput.value = '#ffd700';
            const colorVal = document.getElementById('colorValue');
            if (colorVal) colorVal.textContent = '#FFD700';
            console.log('[Theme] Reset to defaults');
        }
    };

    OGZ.register('Theme', Theme);
})(window.OGZ);
