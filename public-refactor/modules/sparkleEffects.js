// ✨ SPARKLE EFFECT MODULE - VALHALLA EDITION
// Celebrates your wins with visual glory!

/**
 * Triggers a single sparkle burst effect at a target element's position.
 * @param {HTMLElement} target - The HTML element to position the sparkle near.
 * @param {string} type - The type of sparkle (e.g., 'buy', 'sell', 'default').
 */
export function triggerSparkleEffect(target, type = 'default') {
  if (!target) return;

  const sparkle = document.createElement('div');
  sparkle.className = 'sparkle-burst ' + type;
  sparkle.style.position = 'absolute';
  sparkle.style.pointerEvents = 'none'; // Ensure it doesn't interfere with clicks
  sparkle.style.zIndex = '9999';
  
  // Position relative to target element
  const rect = target.getBoundingClientRect();
  sparkle.style.top = `${rect.top + window.scrollY - 10}px`;
  sparkle.style.left = `${rect.left + rect.width / 2}px`;
  
  // Sparkle styling
  sparkle.style.width = '20px';
  sparkle.style.height = '20px';
  sparkle.style.borderRadius = '50%';
  sparkle.style.background = type === 'buy' ? '#00ff00' : type === 'sell' ? '#ff3333' : '#9d71c7';
  sparkle.style.boxShadow = `0 0 20px 8px ${sparkle.style.background}`;
  sparkle.style.animation = 'sparkleFade 0.8s ease-out forwards';

  document.body.appendChild(sparkle);

  setTimeout(() => {
    sparkle.remove();
  }, 800); // Remove after animation completes
}

/**
 * Triggers a larger sparkle explosion effect, typically for big wins.
 */
export function triggerSparkleExplosion() {
  const colors = ['#00ff00', '#ffd700', '#ff69b4', '#00bfff', '#ff00ff'];
  // Use the chart container or body as a fallback for explosion area
  const container = document.querySelector('.chart-container') || document.body;
  
  for (let i = 0; i < 20; i++) {
    setTimeout(() => {
      const sparkle = document.createElement('div');
      sparkle.className = 'sparkle-particle';
      sparkle.style.position = 'absolute';
      sparkle.style.width = '8px';
      sparkle.style.height = '8px';
      sparkle.style.borderRadius = '50%';
      sparkle.style.background = colors[Math.floor(Math.random() * colors.length)];
      sparkle.style.boxShadow = `0 0 10px 4px ${sparkle.style.background}`;
      // Random position within the container
      sparkle.style.left = Math.random() * 100 + '%';
      sparkle.style.top = Math.random() * 100 + '%';
      sparkle.style.animation = 'sparkleExplosion 1.5s ease-out forwards';
      sparkle.style.zIndex = '9999';
      sparkle.style.pointerEvents = 'none';
      
      container.appendChild(sparkle);
      
      setTimeout(() => sparkle.remove(), 1500); // Remove after animation completes
    }, i * 50); // Stagger the sparkles
  }
}

// Note: The global window assignments are handled by complete-integration.js now.
// This file exports the functions for modular import.
