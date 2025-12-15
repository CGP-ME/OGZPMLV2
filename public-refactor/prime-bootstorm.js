// ✅ PRIME BOOTSTORM UNCHAINED - INTEGRATED LAUNCH SEQUENCE
// This version integrates with your main OGZ Prime system

document.addEventListener("DOMContentLoaded", () => {
    // Store the original page content before bootstorm takes over
    const originalContent = document.body.innerHTML;
    const originalStyles = document.body.style.cssText;
    
    const body = document.body;
    body.style.backgroundColor = "black";
    body.innerHTML = "";
  
    // Create Bootstorm Container
    const bootstorm = document.createElement("div");
    bootstorm.id = "bootstorm";
    bootstorm.style.position = "absolute";
    bootstorm.style.top = 0;
    bootstorm.style.left = 0;
    bootstorm.style.width = "100%";
    bootstorm.style.height = "100%";
    bootstorm.style.backgroundColor = "#000";
    bootstorm.style.overflow = "hidden";
    bootstorm.style.zIndex = "10000";
    body.appendChild(bootstorm);
  
    // Enhanced Error Messages for Trading Bot
    const errorMessages = [
      "Fatal Sparkle Overflow",
      "Market Data Breach: CONTAINED",
      "Chaotic Nostalgia Detected",
      "Prime Core Breach: Contained", 
      "Critical Win95 Boot Failure",
      "Risk Management: ACTIVATING",
      "WebSocket Allocation: SPARKLING",
      "Binance API: HANDSHAKING",
      "Chart.js: RENDERING DREAMS",
      "Indicator Modules: LOADING",
      "Trading Engine: AWAKENING",
      "Profit Sensors: CALIBRATING"
    ];
  
    function createErrorPopup() {
      const popup = document.createElement("div");
      popup.style.position = "absolute";
      popup.style.top = Math.random() * (window.innerHeight - 150) + "px";
      popup.style.left = Math.random() * (window.innerWidth - 250) + "px";
      popup.style.width = "250px";
      popup.style.height = "120px";
      popup.style.backgroundColor = "#cccccc";
      popup.style.border = "3px outset #cccccc";
      popup.style.color = "#000";
      popup.style.fontFamily = "MS Sans Serif, sans-serif";
      popup.style.fontSize = "11px";
      popup.style.padding = "10px";
      popup.style.boxShadow = "2px 2px 4px rgba(0,0,0,0.5)";
      
      // Add window title bar
      const titleBar = document.createElement("div");
      titleBar.style.backgroundColor = "#0080ff";
      titleBar.style.color = "white";
      titleBar.style.padding = "2px 5px";
      titleBar.style.fontSize = "11px";
      titleBar.style.fontWeight = "bold";
      titleBar.style.marginBottom = "8px";
      titleBar.innerText = "OGZ Prime System Alert";
      
      const message = document.createElement("div");
      message.innerText = errorMessages[Math.floor(Math.random() * errorMessages.length)];
      
      popup.appendChild(titleBar);
      popup.appendChild(message);
      bootstorm.appendChild(popup);
      
      // Remove popup after random time
      setTimeout(() => {
        if (popup.parentNode) popup.remove();
      }, 2000 + Math.random() * 3000);
    }
  
    // Create random error popups every 200ms for more chaos
    const popupInterval = setInterval(() => {
      createErrorPopup();
    }, 200);
  
    // Optional Dial-Up Screech (with fallback)
    const dialup = new Audio('https://www.soundjay.com/phone/dial-up-modem-01.mp3');
    dialup.volume = 0.15;
    dialup.play().catch(e => console.warn("Dialup sound failed - probably better for your ears anyway."));
  
    // PRIME CORE TEXT with loading sequence
    const primeCoreText = document.createElement("div");
    primeCoreText.style.position = "absolute";
    primeCoreText.style.top = "40%";
    primeCoreText.style.left = "50%";
    primeCoreText.style.transform = "translate(-50%, -50%)";
    primeCoreText.style.color = "lime";
    primeCoreText.style.fontSize = "2.5rem";
    primeCoreText.style.fontFamily = "Courier New, monospace";
    primeCoreText.style.opacity = 0;
    primeCoreText.style.textAlign = "center";
    primeCoreText.innerHTML = "PRIME CORE INITIALIZING...<br><span style='font-size: 1.2rem; color: cyan;'>Trading Systems: LOADING</span>";
    bootstorm.appendChild(primeCoreText);
    
    // Progress bar
    const progressContainer = document.createElement("div");
    progressContainer.style.position = "absolute";
    progressContainer.style.top = "60%";
    progressContainer.style.left = "50%";
    progressContainer.style.transform = "translate(-50%, -50%)";
    progressContainer.style.width = "400px";
    progressContainer.style.height = "30px";
    progressContainer.style.border = "2px solid lime";
    progressContainer.style.backgroundColor = "#001100";
    
    const progressBar = document.createElement("div");
    progressBar.style.width = "0%";
    progressBar.style.height = "100%";
    progressBar.style.backgroundColor = "lime";
    progressBar.style.transition = "width 0.3s";
    
    progressContainer.appendChild(progressBar);
    bootstorm.appendChild(progressContainer);
  
    // Fade in PRIME CORE text
    setTimeout(() => {
      primeCoreText.style.transition = "opacity 2s";
      primeCoreText.style.opacity = 1;
    }, 1000);
    
    // Progress bar animation
    let progress = 0;
    const progressInterval = setInterval(() => {
      progress += Math.random() * 15;
      if (progress > 100) progress = 100;
      progressBar.style.width = progress + "%";
      
      if (progress >= 100) {
        clearInterval(progressInterval);
        primeCoreText.innerHTML = "PRIME CORE ONLINE<br><span style='font-size: 1.2rem; color: cyan;'>Launching Trading Interface...</span>";
      }
    }, 200);
  
    // BOOTSTORM COMPLETE --> Transition to XP phase
    setTimeout(() => {
      clearInterval(popupInterval);
      if (dialup) dialup.pause();
      loadXPLoginScreen();
    }, 6000);
  
    // XP LOGIN PHASE
    function loadXPLoginScreen() {
      bootstorm.innerHTML = "";
      bootstorm.style.background = "linear-gradient(to bottom, #1e90ff, #0066cc)";
  
      const welcome = document.createElement("div");
      welcome.innerHTML = "Welcome Commander<br><span style='font-size: 2rem; color: #ffff99;'>OGZ Prime Valhalla</span>";
      welcome.style.color = "white";
      welcome.style.fontFamily = "Tahoma, Geneva, sans-serif";
      welcome.style.fontSize = "3rem";
      welcome.style.position = "absolute";
      welcome.style.top = "45%";
      welcome.style.left = "50%";
      welcome.style.transform = "translate(-50%, -50%)";
      welcome.style.textAlign = "center";
      welcome.style.textShadow = "2px 2px 4px rgba(0,0,0,0.8)";
  
      bootstorm.appendChild(welcome);
      
      // Add Windows XP startup sound effect placeholder
      console.log("🎵 *Windows XP startup sound*");
  
      setTimeout(() => {
        loadHeartbeatPhase();
      }, 3000);
    }
    
    // HEARTBEAT PHASE - Final transition
    function loadHeartbeatPhase() {
      bootstorm.innerHTML = "";
      bootstorm.style.background = "radial-gradient(circle, #000 0%, #001a33 50%, #000 100%)";
      
      // Heartbeat effect
      const heartbeat = document.createElement("div");
      heartbeat.innerHTML = "♥ TRADING ENGINE ONLINE ♥";
      heartbeat.style.position = "absolute";
      heartbeat.style.top = "50%";
      heartbeat.style.left = "50%";
      heartbeat.style.transform = "translate(-50%, -50%)";
      heartbeat.style.color = "#ff0080";
      heartbeat.style.fontSize = "3rem";
      heartbeat.style.fontFamily = "Arial Black, sans-serif";
      heartbeat.style.textAlign = "center";
      heartbeat.style.animation = "heartbeat 1.5s infinite";
      
      // Add heartbeat CSS animation
      const heartbeatStyle = document.createElement("style");
      heartbeatStyle.textContent = `
        @keyframes heartbeat {
          0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
          25% { transform: translate(-50%, -50%) scale(1.1); opacity: 0.8; }
          50% { transform: translate(-50%, -50%) scale(1.2); opacity: 0.6; }
          75% { transform: translate(-50%, -50%) scale(1.1); opacity: 0.8; }
        }
      `;
      document.head.appendChild(heartbeatStyle);
      
      bootstorm.appendChild(heartbeat);
      
      // Final countdown and launch
      let countdown = 3;
      const countdownElement = document.createElement("div");
      countdownElement.style.position = "absolute";
      countdownElement.style.top = "65%";
      countdownElement.style.left = "50%";
      countdownElement.style.transform = "translate(-50%, -50%)";
      countdownElement.style.color = "cyan";
      countdownElement.style.fontSize = "2rem";
      countdownElement.style.fontFamily = "Courier New, monospace";
      countdownElement.style.textAlign = "center";
      bootstorm.appendChild(countdownElement);
      
      const countdownInterval = setInterval(() => {
        countdownElement.textContent = `Launching in ${countdown}...`;
        countdown--;
        
        if (countdown < 0) {
          clearInterval(countdownInterval);
          launchMainDashboard();
        }
      }, 1000);
    }
    
    // LAUNCH MAIN DASHBOARD
    function launchMainDashboard() {
      // Restore original page content
      body.innerHTML = originalContent;
      body.style.cssText = originalStyles;
      
      // Add the OGZ Prime classes
      body.classList.add('ogzp-valhalla');
      
      // Clear bootstorm flag to allow complete-integration.js to run
      window.OGZ_BOOTSTORM_ACTIVE = false;
      
      // Trigger the main OGZ Prime initialization
      console.log("🚀 Bootstorm complete - Launching OGZ Prime Valhalla!");
      
      // Import and run the complete integration script
      const integrationScript = document.createElement('script');
      integrationScript.src = './complete-integration.js';
      integrationScript.type = 'module';
      integrationScript.onload = () => {
        console.log("✅ Main trading dashboard loaded successfully!");
        
        // Add a success notification after everything loads
        setTimeout(() => {
          if (window.showNotification) {
            window.showNotification('🚀 OGZ Prime Valhalla Edition Ready for Trading!', 'success');
          }
        }, 2000);
      };
      document.head.appendChild(integrationScript);
    }
});

// Prevent the original complete-integration.js from auto-running during bootstorm
window.OGZ_BOOTSTORM_ACTIVE = true;
