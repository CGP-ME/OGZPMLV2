// 🏆 Anonymous Leaderboard Uploader
export async function uploadLeaderboardStats({ pnl = 0, winrate = 0, trades = 0, streak = 0 }) {
  try {
    const payload = {
      id: getAnonID(),  // Fully anonymous unique ID
      timestamp: Date.now(),
      pnl,
      winrate,
      trades,
      streak
    };

    const res = await fetch('https://your-server.com/api/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error('Upload failed');
    console.log('🏁 Leaderboard stats uploaded!');
  } catch (err) {
    console.warn('⚠️ Leaderboard upload error:', err.message);
  }
}

function getAnonID() {
  let id = localStorage.getItem('ogzAnonID');
  if (!id) {
    id = 'ogz-' + crypto.randomUUID();
    localStorage.setItem('ogzAnonID', id);
  }
  return id;
}
