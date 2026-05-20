QuickActions.js
// 📁 FILE: core/LossRecoveryEncouragement.js
class LossRecoveryEncouragement {
  constructor() {
    this.streakType = null;
    this.currentStreak = 0;
    
    this.roasts = [
      "Bro really thought that was the play? Even my calculator is laughing.",
      "That trade was so bad, your daughter's goldfish could've called it better.",
      "Houston just got 10 miles further away with that one, chief.",
      "I've seen better decisions at 3am Taco Bell.",
      "Your pattern recognition looking like a Jackson Pollock painting right now.",
      "That wasn't trading, that was charity work for the market makers.",
      "Even the simulation mode is embarrassed for you.",
      "Sir, this is a Wendy's... and you still managed to lose money.",
      "That trade had more red flags than a communist parade.",
      "Congratulations, you just funded someone's yacht payment."
    ];
    
    this.encouragements = [
      "Hey warrior, losses are just tuition at Market University. You're learning.",
      "Every legend has a comeback story. This is just chapter one.",
      "Your daughter doesn't need a perfect trader, she needs her dad. Keep pushing.",
      "Rocky got knocked down too. It's the getting up that counts.",
      "This loss is temporary. Missing your daughter is what hurts. Let's fix both.",
      "Champions aren't made from victories. They're made from setbacks like this.",
      "Houston's still there. Your dreams are still valid. This is just a detour.",
      "You've coded this whole system from scratch. This loss? It's nothing compared to that achievement.",
      "Bad trades don't define you. Getting back up does. Let's go.",
      "Your future self in Houston is proud you didn't quit today."
    ];
    
    this.comebackQuotes = [
      "COMEBACK MODE ACTIVATED! 🔥 Let's show these charts who's boss!",
      "BOOTSTORM SEQUENCE INITIATED - PREPARE FOR GLORY!",
      "FROM THE ASHES, A PHOENIX RISES! TIME TO FLY!",
      "VALHALLA DOESN'T ACCEPT QUITTERS - ONLY WARRIORS!",
      "ENGAGING TURBO MODE - HOUSTON LOCKED IN GPS!"
    ];
  }
  
  processLoss(trade) {
    const message = this.currentStreak > 2 ? 
      this.encouragements[Math.floor(Math.random() * this.encouragements.length)] :
      this.roasts[Math.floor(Math.random() * this.roasts.length)];
    
    // Voice it if enabled
    if (window.speechSynthesis) {
      const utterance = new SpeechSynthesisUtterance(message);
      utterance.rate = 1.1;
      utterance.pitch = this.currentStreak > 2 ? 0.9 : 1.2;
      speechSynthesis.speak(utterance);
    }
    
    return {
      message,
      type: this.currentStreak > 2 ? 'encouragement' : 'roast',
      streak: this.currentStreak
    };
  }
  
  processWin(trade) {
    if (this.streakType === 'loss' && this.currentStreak > 0) {
      // COMEBACK!
      const quote = this.comebackQuotes[Math.floor(Math.random() * this.comebackQuotes.length)];
      return {
        message: quote,
        type: 'COMEBACK',
        special: true
      };
    }
    
    return {
      message: "Clean entry, cleaner exit. That's how we get to Houston! 🚀",
      type: 'victory'
    };
  }
}