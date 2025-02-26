document.addEventListener("DOMContentLoaded", async () => {
    // Remove duplicate declaration
    const logContainer = document.getElementById("logContainer");
    const keywordsList = document.getElementById("keywordsList");
    const newKeywordInput = document.getElementById("newKeyword");
    const addKeywordBtn = document.getElementById("addKeyword");
    const logToggle = document.getElementById('logToggle');
  
    // Move updateStats function definition to the top
    const updateStats = async () => {
      const { hiddenToday = 0 } = await chrome.storage.local.get('hiddenToday');
      document.getElementById('activeVideos').textContent = 
        `${hiddenToday} video${hiddenToday !== 1 ? 's' : ''} hidden today`;
    };
  
    // Theme handling
    const initTheme = () => {
      const theme = localStorage.getItem('theme') || 'light';
      document.documentElement.setAttribute('data-theme', theme); // Changed from body to documentElement
      return theme;
    };
  
    const toggleTheme = () => {
      const currentTheme = document.documentElement.getAttribute('data-theme');
      const newTheme = currentTheme === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('theme', newTheme);
    };
  
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);
    initTheme();
  
    // Log visibility toggle
    const initLogVisibility = () => {
      const isVisible = localStorage.getItem('logVisible') !== 'false';
      logToggle.checked = isVisible;
      logContainer.classList.toggle('hidden', !isVisible);
      return isVisible;
    };
  
    logToggle.addEventListener('change', () => {
      const isVisible = logToggle.checked;
      logContainer.classList.toggle('hidden', !isVisible);
      localStorage.setItem('logVisible', isVisible);
    });
  
    // Update keyword count
    const updateKeywordCount = (keywords) => {
      const countElement = document.querySelector('.keyword-count');
      if (countElement) countElement.textContent = keywords.length;
    };
  
    // Load and render keywords
    async function loadKeywords() {
      try {
        const { keywords = ['masters'] } = await chrome.storage.sync.get('keywords');
        updateKeywordCount(keywords);
        
        keywordsList.innerHTML = keywords.map(keyword => `
          <div class="keyword-item">
            <span>${keyword}</span>
            <button data-keyword="${keyword}">Remove</button>
          </div>
        `).join('');
  
        // Add remove handlers
        keywordsList.querySelectorAll('button').forEach(btn => {
          btn.addEventListener('click', async () => {
            const keywordToRemove = btn.dataset.keyword;
            const result = await chrome.storage.sync.get('keywords');
            const currentKeywords = result.keywords || ['masters'];
            const newKeywords = currentKeywords.filter(k => k !== keywordToRemove);
            await chrome.storage.sync.set({ keywords: newKeywords });
            
            // Notify content script to refresh
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
              if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, { type: 'refreshKeywords' });
              }
            });
            
            loadKeywords();
          });
        });
      } catch (error) {
        console.error('Error loading keywords:', error);
      }
    }
  
    // Add new keyword handler
    addKeywordBtn.addEventListener('click', async () => {
      const keyword = newKeywordInput.value.trim().toLowerCase();
      if (!keyword) return;
  
      try {
        const result = await chrome.storage.sync.get('keywords');
        const currentKeywords = result.keywords || ['masters'];
        if (!currentKeywords.includes(keyword)) {
          const newKeywords = [...currentKeywords, keyword];
          await chrome.storage.sync.set({ keywords: newKeywords });
          
          // Notify content script to refresh
          chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            if (tabs[0]) {
              chrome.tabs.sendMessage(tabs[0].id, { type: 'refreshKeywords' });
            }
          });
          
          loadKeywords();
        }
        newKeywordInput.value = '';
      } catch (error) {
        console.error('Error adding keyword:', error);
      }
    });
  
    // Handle Enter key
    newKeywordInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') addKeywordBtn.click();
    });
  
    // Function to update logs
    const updateLogs = async () => {
      try {
        const { logs = [] } = await chrome.storage.local.get("logs");
        if (logs.length) {
          logContainer.innerHTML = logs.map(log => `<p>${log}</p>`).join("");
        } else {
          logContainer.innerHTML = "<p>No activity yet</p>";
        }
      } catch (error) {
        console.error('Error updating logs:', error);
        logContainer.innerHTML = "<p>Error loading logs</p>";
      }
    };
  
    // Add current time toggle handling
    const currentTimeToggle = document.getElementById('showCurrentTime');
    
    // Initialize current time toggle
    const initCurrentTimeToggle = async () => {
      const { showCurrentTime = false } = await chrome.storage.sync.get('showCurrentTime');
      currentTimeToggle.checked = showCurrentTime;
    };
  
    currentTimeToggle.addEventListener('change', async () => {
      const showCurrentTime = currentTimeToggle.checked;
      await chrome.storage.sync.set({ showCurrentTime });
      
      // Notify content script to refresh
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { type: 'refreshSettings' });
        }
      });
    });

    // Initialize settings toggles
    const initSettings = async () => {
      const settings = await chrome.storage.sync.get([
        'showCurrentTime',
        'hideThumbnails'
      ]);
      
      document.getElementById('showCurrentTime').checked = settings.showCurrentTime || false;
      document.getElementById('hideThumbnails').checked = settings.hideThumbnails !== false; // Default to true
    };

    // Add toggle handler for thumbnail durations
    document.getElementById('hideThumbnails').addEventListener('change', async (e) => {
      await chrome.storage.sync.set({ hideThumbnails: e.target.checked });
      
      // Notify content script to refresh
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { type: 'refreshSettings' });
        }
      });
    });

    // Initialize everything
    initLogVisibility();
    await loadKeywords();
    await updateLogs();
    await initSettings();
    await updateStats();
  
    // Set up intervals
    const logsInterval = setInterval(updateLogs, 2000);
    const statsInterval = setInterval(updateStats, 5000);
  
    // Clean up intervals when popup closes
    window.addEventListener('unload', () => {
      clearInterval(logsInterval);
      clearInterval(statsInterval);
    });
  });
