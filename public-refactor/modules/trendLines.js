/**
 * Draws a simple trend line on a Chart.js instance.
 * This function calculates a trend line based on the min/max of recent data.
 * @param {Chart} chart - The Chart.js instance to draw on.
 * @param {string} direction - The direction of the trend ('up' or 'down').
 */
export function drawTrendLine(chart, direction = 'up') {
  const len = chart.data.labels.length;
  if (len < 20) return; // Need at least 20 data points to draw a meaningful trend line

  let x1, x2, y1, y2;

  // Define the start and end points for the trend line based on direction
  if (direction === 'up') {
    // For an uptrend, connect recent lows
    y1 = Math.min(...chart.data.datasets[0].data.slice(len - 20, len - 10)); // Low point in the earlier segment
    y2 = Math.min(...chart.data.datasets[0].data.slice(len - 10));          // Low point in the later segment
  } else {
    // For a downtrend, connect recent highs
    y1 = Math.max(...chart.data.datasets[0].data.slice(len - 20, len - 10)); // High point in the earlier segment
    y2 = Math.max(...chart.data.datasets[0].data.slice(len - 10));          // High point in the later segment
  }

  x1 = len - 20; // Start X-coordinate (index in data array)
  x2 = len;      // End X-coordinate (index in data array)

  // Calculate points for the trend line
  const trendData = Array(len).fill(null); // Initialize with nulls so it only draws where defined
  for (let i = x1; i <= x2; i++) {
    const slope = (y2 - y1) / (x2 - x1);
    trendData[i] = y1 + slope * (i - x1); // Linear interpolation
  }

  // Remove old trend lines from the chart to prevent duplicates
  chart.data.datasets = chart.data.datasets.filter(ds => !ds.label?.startsWith("Trend Line"));

  // Add the new trend line dataset
  chart.data.datasets.push({
    label: 'Trend Line',
    data: trendData,
    borderColor: direction === 'up' ? 'lime' : 'red', // Green for up, red for down
    borderDash: [5, 5], // Dashed line
    pointRadius: 0, // No points on the line
    borderWidth: 2,
    fill: false,
    tension: 0.1 // Slight curve for aesthetics
  });

  chart.update(); // Update the chart to display the new line
}

// Note: The global window assignments are handled by complete-integration.js now.
// This file exports the function for modular import.
