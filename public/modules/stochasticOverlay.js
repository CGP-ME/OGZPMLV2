// 📊 STOCHASTIC OSCILLATOR MODULE - PRECISION SIGNALS
// Momentum indicator for perfect entries and exits

let stochasticLastValue = 50; // Internal state for crossover detection

/**
 * Updates the Stochastic Oscillator display in the UI.
 * @param {number} stochastic - The %K value of the Stochastic Oscillator.
 * @param {number} signal - The %D (signal line) value.
 */
export function updateStochasticDisplay(stochastic, signal) {
  const elem = document.getElementById('stochastic-display');
  if (!elem) return;

  // Parse values
  const k = parseFloat(stochastic || 0).toFixed(1);
  const d = parseFloat(signal || stochastic || 0).toFixed(1);
  const diff = (k - d).toFixed(1);

  // Clear and update
  elem.innerHTML = 'Stochastic: ';
  
  const span = document.createElement('span');
  span.style.fontWeight = 'bold';
  span.style.transition = 'all 0.3s ease';
  
  // Determine market condition
  let condition = '';
  let color = '';
  let signal_strength = '';
  
  if (k > 80 && d > 80) {
    condition = 'OVERBOUGHT';
    color = '#ff3333';
    signal_strength = '⚠️';
  } else if (k < 20 && d < 20) {
    condition = 'OVERSOLD';
    color = '#00ff00';
    signal_strength = '🎯';
  } else if (k > d && diff > 5) {
    condition = 'BULLISH';
    color = '#00ff00';
    signal_strength = '📈';
  } else if (k < d && diff < -5) {
    condition = 'BEARISH';
    color = '#ff3333';
    signal_strength = '📉';
  } else {
    condition = 'NEUTRAL';
    color = '#ffff00';
    signal_strength = '➖';
  }
  
  // Format display
  span.textContent = `K:${k} D:${d} (${diff > 0 ? '+' : ''}${diff}) ${signal_strength} ${condition}`;
  span.style.color = color;
  
  // Add glow effect for extreme conditions
  if (k > 80 || k < 20) {
    span.style.textShadow = `0 0 10px ${color}`;
  }
  
  elem.appendChild(span);
  
  // Trigger alerts for extreme conditions using the global showNotification alias
  if (k < 20 && stochasticLastValue > 20) {
    // Crossed into oversold
    if (window.showNotification) { // Assumes showNotification is aliased to showPopup
      window.showNotification('🎯 Stochastic OVERSOLD - Potential BUY signal!', 'info');
    }
  } else if (k > 80 && stochasticLastValue < 80) {
    // Crossed into overbought
    if (window.showNotification) { // Assumes showNotification is aliased to showPopup
      window.showNotification('⚠️ Stochastic OVERBOUGHT - Consider taking profits!', 'warning');
    }
  }
  
  // Store last value for crossover detection
  stochasticLastValue = k;
}

/**
 * Calculates the Stochastic Oscillator (%K and %D) for a given set of candles.
 * This is a backup calculation, ideally the backend provides these values.
 * @param {Array<Object>} candles - Array of candle objects with high, low, and close properties.
 * @param {number} period - The lookback period for the calculation.
 * @returns {Object} An object containing the %K (k) and %D (d) values.
 */
export function calculateStochastic(candles, period = 14) {
  if (!candles || candles.length < period) return { k: 50, d: 50 }; // Return neutral if insufficient data
  
  const recent = candles.slice(-period);
  const highs = recent.map(c => c.high || c.close); // Use close if high is missing
  const lows = recent.map(c => c.low || c.close);   // Use close if low is missing
  const close = candles[candles.length - 1].close || candles[candles.length - 1]; // Current close price
  
  const highest = Math.max(...highs);
  const lowest = Math.min(...lows);
  
  const k = highest !== lowest ? 
    ((close - lowest) / (highest - lowest)) * 100 : 50; // Avoid division by zero
  
  // Simple 3-period SMA for %D (signal line)
  // For a more complete calculation, you would need historical %K values
  // For now, we'll return %K as %D, or implement a basic SMA if needed.
  // A more robust implementation would calculate a SMA of the last 3 K values.
  const d = k; // Simplified for now, assuming backend provides full D
  
  return { k, d };
}

// Note: The global window assignments are handled by complete-integration.js now.
// This file exports the functions for modular import.
