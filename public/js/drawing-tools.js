/**
 * drawing-tools.js - Chart Interaction Layer
 * Interactive hooks for LightweightCharts with tvChart access fix
 */
(function(OGZ) {
    'use strict';

    let activeTool = null;

    const DrawingTools = {
        init: function() {
            console.log('[DrawingTools] Initialized.');
        },

        activateTool: function(toolType, el) {
            const chartMod = OGZ.get('Chart');
            if (!chartMod) return;

            // UI Toggle
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            if (el) el.classList.add('active');

            activeTool = toolType;
            console.log('[DrawingTools] Active Tool:', toolType);
        },

        clearAll: function() {
            console.log('[DrawingTools] Clearing all drawings.');
            activeTool = null;
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        }
    };

    OGZ.register('DrawingTools', DrawingTools);

    // Legacy global wrappers for onclick handlers in HTML
    window.activateDrawingTool = (type, el) => {
        if (OGZ.get('DrawingTools')) OGZ.get('DrawingTools').activateTool(type, el);
    };
    window.clearDrawings = () => {
        if (OGZ.get('DrawingTools')) OGZ.get('DrawingTools').clearAll();
    };
})(window.OGZ);
