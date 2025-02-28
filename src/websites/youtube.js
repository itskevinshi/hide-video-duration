(() => {
  let styleElement = null;
  let lastVideoId = null;
  let playerObserver = null;
  let thumbnailStyles = null;

  // Utility function to get video ID from URL
  const getVideoId = () => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('v');
  };

  const clearInjectedElements = () => {
    styleElement?.remove();
    styleElement = null;
    document.querySelectorAll(".custom-seek-button").forEach(btn => btn.remove());
  };

  const injectStyles = async () => {
    const { showCurrentTime = false } = await chrome.storage.sync.get('showCurrentTime');
    
    styleElement = document.createElement("style");
    styleElement.id = "yt-duration-hider";
    styleElement.textContent = `
      .ytp-time-duration,
      .ytp-time-separator,
      .ytp-progress-bar-container,
      ${!showCurrentTime ? '.ytp-time-current,' : ''}
      .ytp-tooltip {
        display: none !important;
      }
    `;
    document.head.appendChild(styleElement);
  };

  const injectThumbnailStyles = () => {
    if (thumbnailStyles) return;
    thumbnailStyles = document.createElement("style");
    thumbnailStyles.id = "yt-thumbnail-duration-hider";
    thumbnailStyles.textContent = `
      .thumbnail-duration-hidden ytd-thumbnail-overlay-time-status-renderer {
        display: none !important;
      }
    `;
    document.head.appendChild(thumbnailStyles);
  };

  const processThumbnails = async () => {
    const { enabled = true } = await chrome.storage.sync.get('enabled');
    if (!enabled) {
      document.querySelectorAll('.thumbnail-duration-hidden').forEach(el => {
        el.classList.remove('thumbnail-duration-hidden');
      });
      return;
    }

    try {
      const { keywords = ['masters'], hideThumbnails = true } = await chrome.storage.sync.get(['keywords', 'hideThumbnails']);
      if (!hideThumbnails) {
        document.querySelectorAll('.thumbnail-duration-hidden').forEach(el => {
          el.classList.remove('thumbnail-duration-hidden');
        });
        return;
      }

      injectThumbnailStyles();

      const thumbnails = document.querySelectorAll(`
        ytd-rich-item-renderer:not([processed-duration]),
        ytd-video-renderer:not([processed-duration]),
        ytd-compact-video-renderer:not([processed-duration])
      `);

      thumbnails.forEach(thumbnail => {
        const titleEl = thumbnail.querySelector('#video-title');
        if (!titleEl) return;

        const title = titleEl.textContent.toLowerCase();
        const shouldHide = keywords.some(kw => title.includes(kw.toLowerCase()));
        
        thumbnail.setAttribute('processed-duration', '');
        if (shouldHide) {
          thumbnail.classList.add('thumbnail-duration-hidden');
        }
      });
    } catch (error) {
      console.error('Error processing thumbnails:', error);
    }
  };

  const addSeekButtons = () => {
    const timeDisplay = document.querySelector(".ytp-time-display");
    if (!timeDisplay) return;

    const buttonContainer = document.createElement("div");
    buttonContainer.className = "custom-seek-buttons";
    buttonContainer.style.cssText = "display: inline-flex; margin: 0 0 0 20px;"; // Added left margin
    
    [
      ["-30m", -1800],
      ["-10m", -600],
      ["-1m", -60],
      ["-10s", -10],
      ["+10s", 10],
      ["+1m", 60],
      ["+10m", 600],
      ["+30m", 1800]
    ].forEach(([text, offset]) => {
      const button = document.createElement("button");
      button.className = "custom-seek-button ytp-button";
      button.textContent = text;
      button.onclick = () => {
        const video = document.querySelector("video");
        if (video) video.currentTime += offset;
      };
      buttonContainer.appendChild(button);
    });

    timeDisplay.appendChild(buttonContainer);
  };

  const setupVideoPage = async () => {
    const { enabled = true } = await chrome.storage.sync.get('enabled');
    if (!enabled) {
      clearInjectedElements();
      return;
    }

    const videoId = getVideoId();
    if (!videoId || videoId === lastVideoId) return;
    
    lastVideoId = videoId;
    
    try {
      const { keywords = ['masters'] } = await chrome.storage.sync.get('keywords');
      const title = document.title.toLowerCase();
      
      if (keywords.some(kw => title.includes(kw.toLowerCase()))) {
        clearInjectedElements();
        await injectStyles();
        addSeekButtons();
        
        if (!playerObserver) {
          playerObserver = new MutationObserver((mutations) => {
            if (!document.getElementById("yt-duration-hider")) {
              injectStyles();
            }
          });

          const player = document.querySelector('.html5-video-player');
          if (player) {
            playerObserver.observe(player, {
              childList: true,
              subtree: true,
              attributes: false
            });
          }
        }
      } else {
        clearInjectedElements();
      }
    } catch (error) {
      console.error('Error setting up video page:', error);
    }
  };

  // Initialize thumbnail observer
  const thumbnailObserver = new MutationObserver(() => {
    processThumbnails();
  });

  // Start observing for thumbnail changes
  const observeThumbnails = () => {
    thumbnailObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false
    });
  };

  // Initialize
  const init = () => {
    setupVideoPage();
    processThumbnails();
    observeThumbnails();
  };

  // Monitor navigation
  window.addEventListener('yt-navigate-finish', () => {
    lastVideoId = null;
    setupVideoPage();
    processThumbnails();
  });

  // Handle messages from popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'extensionState') {
      if (!message.enabled) {
        clearInjectedElements();
        document.querySelectorAll('.thumbnail-duration-hidden').forEach(el => {
          el.classList.remove('thumbnail-duration-hidden');
        });
      } else {
        setupVideoPage();
        processThumbnails();
      }
      return;
    }
    if (message.type === 'refreshKeywords' || message.type === 'refreshSettings') {
      document.querySelectorAll('[processed-duration]').forEach(el => {
        el.removeAttribute('processed-duration');
        el.classList.remove('thumbnail-duration-hidden');
      });
      setupVideoPage();
      processThumbnails();
    }
  });

  init();
})();