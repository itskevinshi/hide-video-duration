// In service-worker.js
chrome.runtime.onInstalled.addListener(() => {
    console.log("Service worker installed");
    // Initialize empty logs array
    chrome.storage.local.set({ logs: [] });
    chrome.storage.local.set({ hiddenToday: 0 });
    resetDailyStats();
  });
  
  const MAX_LOGS = 50;
  
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Service worker received message:", message);
    
    if (message.type === "log") {
      chrome.storage.local.get(['logs'], function(result) {
        const logs = result.logs || [];
        const timestamp = new Date().toLocaleTimeString();
        const newLog = `[${timestamp}] ${message.message}`;
        
        // Add new log at the beginning of the array
        logs.unshift(newLog);
        
        // Keep only last 100 logs
        const trimmedLogs = logs.slice(0, 100);
        
        chrome.storage.local.set({ logs: trimmedLogs }, () => {
          console.log("Log saved:", newLog);
          sendResponse({ success: true });
        });
      });
      
      // If the message indicates a video was hidden
      if (message.message.includes("Hiding duration for video")) {
        chrome.storage.local.get(['hiddenToday'], function(result) {
          const current = result.hiddenToday || 0;
          chrome.storage.local.set({ hiddenToday: current + 1 });
        });
      }
      
      // Return true to indicate we will send a response asynchronously
      return true;
    }
  });
  
  // Reset daily stats at midnight
  const resetDailyStats = () => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const timeUntilMidnight = tomorrow - now;
    
    setTimeout(() => {
      chrome.storage.local.set({ hiddenToday: 0 });
      resetDailyStats(); // Schedule next reset
    }, timeUntilMidnight);
  };
  