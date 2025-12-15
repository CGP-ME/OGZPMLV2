// ✅ Fibonacci Overlay Module

/**
 * Draws Fibonacci retracement levels on a Chart.js instance.
 * Calculates levels based on a defined high and low price.
 * @param {Chart} chart - The Chart.js instance to draw on.
 * @param {number} high - The swing high price.
 * @param {number} low - The swing low price.
 */
export function drawFibonacciLevels(chart, high, low) {
  // Standard Fibonacci retracement levels
  const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
  const fibLines = [];

  levels.forEach(level => {
    // Calculate the price for each Fibonacci level
    const price = low + (high - low) * level;
    fibLines.push({
      label: `Fib ${level}`, // Label for the legend
      data: Array(chart.data.labels.length).fill(price), // Fill across all data points
      borderColor: 'rgba(0, 191, 255, 0.5)', // Light blue with transparency
      borderDash: [4, 4], // Dashed line style
      pointRadius: 0, // No points on the line
      fill: false,
      tension: 0.1, // Slight curve for aesthetics
      borderWidth: 1.2
    });
  });

  // Clear old Fibonacci lines from the chart to prevent duplicates
  chart.data.datasets = chart.data.datasets.filter(ds => !ds.label?.startsWith("Fib"));

  // Add new Fibonacci lines to the chart
  chart.data.datasets.push(...fibLines);
  chart.update(); // Update the chart to display the new lines
}

// Note: The global window assignments are handled by complete-integration.js now.
// This file exports the function for modular import.
