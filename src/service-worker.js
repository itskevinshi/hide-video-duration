// In service-worker.js
// Initialize on install
chrome.runtime.onInstalled.addListener((details) => {
  console.log("Service worker installed");
  if (details.reason === 'install') {
    // Set default settings on installation
    chrome.storage.sync.set({
      keywords: ['masters'],
      hideThumbnails: true,
      showCurrentTime: false,
      enabled: true // Add enabled state
    });
    chrome.storage.local.set({ logs: [], hiddenToday: 0 });
    console.log('Extension installed with default settings');
  }
  resetDailyStats();
});

const MAX_LOGS = 50;

// Handle fetching YouTube video info
async function fetchYouTubeVideoInfo(videoId) {
  try {
    const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`);
    const html = await response.text();
    
    const titleMatch = html.match(/<meta name="title" content="([^"]+)"/);
    if (titleMatch && titleMatch[1]) {
      return {
        title: titleMatch[1],
        success: true
      };
    }
    
    const titleTagMatch = html.match(/<title>([^<]+)<\/title>/);
    if (titleTagMatch && titleTagMatch[1]) {
      let title = titleTagMatch[1].replace(/ - YouTube$/, '');
      return {
        title: title,
        success: true
      };
    }
    
    return { success: false, title: '' };
  } catch (error) {
    console.error('Error fetching YouTube info:', error);
    return { success: false, error: error.message };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Service worker received message:", message);
  
  if (message.type === "log") {
    chrome.storage.local.get(['logs'], function(result) {
      const logs = result.logs || [];
      const timestamp = new Date().toLocaleTimeString();
      const newLog = `[${timestamp}] ${message.message}`;
      
      logs.unshift(newLog);
      const trimmedLogs = logs.slice(0, 100);
      
      chrome.storage.local.set({ logs: trimmedLogs }, () => {
        console.log("Log saved:", newLog);
        sendResponse({ success: true });
      });
    });
    
    if (message.message.includes("Hiding duration for video")) {
      chrome.storage.local.get(['hiddenToday'], function(result) {
        const current = result.hiddenToday || 0;
        chrome.storage.local.set({ hiddenToday: current + 1 });
      });
    }
    return true;
  }

  if (message.type === "getVideoInfo") {
    fetchYouTubeVideoInfo(message.videoId).then(sendResponse);
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
    resetDailyStats();
  }, timeUntilMidnight);
};
