// UNIFIED WEBSOCKET CONNECTION - PORT 3010
console.log('🚀 Loading dashboard WebSocket connection...');

class DashboardConnection {
    constructor() {
        this.ws = null;
        this.priceData = [];
        this.connect();
    }

    connect() {
        console.log('Connecting to wss://ogzprime.com/ws...');
        this.ws = new WebSocket('wss://ogzprime.com/ws');

        this.ws.onopen = () => {
            console.log('✅ Connected to unified WebSocket!');
            document.getElementById('ws-status').textContent = '🟢 WebSocket Live';
        };

        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            
            // Update price
            if (data.price) {
                document.getElementById('price-ticker').textContent = 
                    `BTC: $${data.price.toLocaleString()}`;
                
                // Add to chart
                this.priceData.push({time: new Date(), price: data.price});
                if (this.priceData.length > 100) this.priceData.shift();
                if (window.updateChartData) window.updateChartData(this.priceData);
            }

            // Update bot status
            if (data.confidence !== undefined) {
                document.getElementById('bot1-confidence').textContent = `${data.confidence}%`;
                document.getElementById('bot1-balance').textContent = `$${data.balance}`;
            }
        };

        this.ws.onerror = () => console.error('WebSocket error');
        this.ws.onclose = () => setTimeout(() => this.connect(), 5000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.dashboardConnection = new DashboardConnection();
});
