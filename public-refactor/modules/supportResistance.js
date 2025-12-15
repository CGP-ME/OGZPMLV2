/**
 * Draws Support and Resistance lines on a Chart.js instance.
 * Identifies key price levels based on recent highs and lows.
 * @param {Chart} chart - The Chart.js instance to draw on.
 */
export function drawSupportResistance(chart) {
  const candles = chart.data.datasets[0].data; // Assuming price data is the first dataset
  const labels = chart.data.labels;
  if (!candles || candles.length < 30) return; // Need sufficient data

  // Simple: find common highs/lows in the last 50 bars
  const slice = candles.slice(-50); // Analyze last 50 candles for local S/R
  const supports = [];
  const resistances = [];

  // Iterate through the slice to find local highs and lows
  for (let i = 2; i < slice.length - 2; i++) { // Look at 2 bars before and 2 bars after
    const prev = slice[i - 1], cur = slice[i], next = slice[i + 1];
    
    // Local low (potential support)
    if (cur < prev && cur < next) { // Simple check for a trough
      supports.push(cur);
    }

    // Local high (potential resistance)
    if (cur > prev && cur > next) { // Simple check for a peak
      resistances.push(cur);
    }
  }

  /**
   * Calculates the average of an array of numbers.
   * @param {Array<number>} arr - The array of numbers.
   * @returns {number} The average.
   */
  const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;

  /**
   * Groups nearby price levels into unique zones and averages them.
   * @param {Array<number>} arr - Array of price levels.
   * @param {number} threshold - Maximum allowed difference (in price units) to merge levels.
   * @returns {Array<number>} Array of unique, averaged price zones.
   */
  const uniqueZones = (arr, threshold = 0.5) => { // Threshold for merging nearby levels
    arr.sort((a, b) => a - b); // Sort to group nearby values
    const zones = [];
    let group = [];

    if (arr.length === 0) return zones;

    group.push(arr[0]); // Start with the first element

    for (let i = 1; i < arr.length; i++) {
      // If current price is within threshold of the last price in the group, add to group
      if (Math.abs(arr[i] - group[group.length - 1]) <= threshold) {
        group.push(arr[i]);
      } else {
        // Otherwise, average the current group and start a new one
        zones.push(avg(group));
        group = [arr[i]];
      }
    }
    zones.push(avg(group)); // Add the last group
    return zones;
  };

  const supportLevels = uniqueZones(supports);
  const resistanceLevels = uniqueZones(resistances);

  // Remove old S/R lines from the chart to prevent duplicates
  chart.data.datasets = chart.data.datasets.filter(ds => 
    !ds.label?.startsWith("Support") && !ds.label?.startsWith("Resistance")
  );

  // Draw new support lines
  supportLevels.forEach((lvl, i) => {
    chart.data.datasets.push({
      label: `Support ${i + 1}`,
      data: Array(labels.length).fill(lvl), // Fill across all labels
      borderColor: 'blue', // Support lines are typically blue/green
      borderDash: [3, 3], // Dashed line
      pointRadius: 0, // No points on the line
      fill: false,
      tension: 0.1,
      borderWidth: 1
    });
  });

  // Draw new resistance lines
  resistanceLevels.forEach((lvl, i) => {
    chart.data.datasets.push({
      label: `Resistance ${i + 1}`,
      data: Array(labels.length).fill(lvl), // Fill across all labels
      borderColor: 'deepskyblue', // Resistance lines are typically red/orange
      borderDash: [3, 3],
      pointRadius: 0,
      fill: false,
      tension: 0.1,
      borderWidth: 1
    });
  });

  chart.update(); // Update the chart to display the new lines
}

// Note: The global window assignments are handled by complete-integration.js now.
// This file exports the function for modular import.
