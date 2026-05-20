// streamdeck/StreamDeckProfile.js  
// ONE BUTTON TO RULE THEM ALL!

class StreamDeckProfile {
  constructor(ogzPrime) {
    this.ogzPrime = ogzPrime;
    this.connected = false;
    this.device = null;

    // Map your 15 buttons here
    this.buttonMap = {
      0: 'buy',
      1: 'sell',
      2: 'kill',
      // … fill out the rest …
    };
  }

  connect(device) {
    this.device = device;
    this.connected = true;
    console.log('🎮 Stream Deck connected');
    device.on('down', keyIndex => this.handleKeyDown(keyIndex));
  }

  handleKeyDown(keyIndex) {
    const action = this.buttonMap[keyIndex];
    if (!action) return;
    switch (action) {
      case 'buy':
        this.ogzPrime.executeManualBuy();
        break;
      case 'sell':
        this.ogzPrime.executeManualSell();
        break;
      case 'kill':
        this.ogzPrime.shutdown();
        break;
      // add more cases…
    }
    console.log(`🎮 Button ${keyIndex} => ${action}`);
  }
}

module.exports = StreamDeckProfile;
