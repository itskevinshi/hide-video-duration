(() => {
  const sendLog = async (message) => {
    console.log("Sending log:", message);
    try {
      const response = await chrome.runtime.sendMessage({ 
        type: "log", 
        message 
      });
      console.log("Log response:", response);
    } catch (error) {
      console.error("Error sending log:", error);
    }
  };

  const getVideoTitle = () => {
    if (!location.href.includes("watch")) return "";
    const infoRenderer = document.querySelector("ytd-video-primary-info-renderer") || 
                        document.querySelector("ytd-watch-flexy");
    if (!infoRenderer) return "";

    const titleElement = infoRenderer.shadowRoot?.querySelector("h1 yt-formatted-string") ||
                        infoRenderer.querySelector("h1 yt-formatted-string");
    return titleElement?.textContent.trim() || "";
  };

  const clearPreviousInjection = () => {
    document.getElementById("hide-timeline-css")?.remove();
    document.querySelectorAll(".custom-seek-button").forEach(button => button.remove());
  };

  const createSeekButton = (text, duration) => {
    const button = document.createElement("span");
    button.classList.add("custom-seek-button");
    button.innerText = text.replace(" ", "\u2009"); // Thin space
    button.style.cssText = "cursor: pointer; user-select: none; margin: 0 7px;";
    button.addEventListener("click", () => {
      const video = document.querySelector(".html5-main-video");
      if (video?.currentTime) video.currentTime += duration;
    });
    return button;
  };

  const hideTimelineAndAddButtons = async () => {
    clearPreviousInjection();

    const { showCurrentTime = false } = await chrome.storage.sync.get('showCurrentTime');
    
    // Create more specific and persistent CSS
    const style = document.createElement("style");
    style.id = "hide-timeline-css";
    style.textContent = `
      /* Main player controls */
      .ytp-chrome-bottom .ytp-progress-bar-container,
      .ytp-chrome-bottom .ytp-time-separator,
      .ytp-chrome-bottom .ytp-time-duration,
      ${!showCurrentTime ? '.ytp-chrome-bottom .ytp-time-current,' : ''} 
      
      /* Mini player */
      .ytp-miniplayer-controls .ytp-time-display,
      
      /* General time displays */
      .video-time,
      ytd-thumbnail-overlay-time-status-renderer,
      ytd-video-preview ytd-thumbnail-overlay-time-status-renderer,
      ytd-rich-grid-media ytd-thumbnail-overlay-time-status-renderer,
      ytd-compact-video-renderer ytd-thumbnail-overlay-time-status-renderer,
      .ytp-videowall-still-info-duration { 
        display: none !important; 
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
      
      /* Ensure the progress bar container is fully hidden */
      .ytp-progress-bar-container {
        height: 0 !important;
        min-height: 0 !important;
        padding: 0 !important;
        margin: 0 !important;
        border: none !important;
      }`;
    document.head.appendChild(style);

    const timeContainer = document.querySelector(".ytp-time-duration")?.parentNode;
    if (!timeContainer) return;

    const buttons = [
      ["-30m", -1800],
      ["-10m", -600],
      ["-1m", -60],
      ["-10s", -10],
      ["+10s", 10],
      ["+1m", 60],
      ["+10m", 600],
      ["+30m", 1800]
    ].forEach(([text, duration]) => {
      timeContainer.appendChild(createSeekButton(text, duration));
    });

    sendLog("Timeline hidden and seek buttons added");
  };

  // Add a function to ensure timeline stays hidden
  const ensureTimelineHidden = () => {
    const style = document.getElementById("hide-timeline-css");
    if (!style && lastVideoTitle) {
      // If our style is missing but we have a video title, reapply
      processVideo();
    }
  };

  // More aggressive checking for player changes
  const observePlayer = () => {
    const playerObserver = new MutationObserver(() => {
      ensureTimelineHidden();
    });

    const observePlayerElement = () => {
      const player = document.querySelector('.html5-video-player');
      if (player) {
        playerObserver.observe(player, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['class', 'style']
        });
      }
    };

    // Initial observation
    observePlayerElement();

    // Re-establish observation if player changes
    setInterval(observePlayerElement, 1000);
  };

  let lastVideoTitle = "";

  const processVideo = async () => {
    const videoTitle = getVideoTitle();
    console.log("Processing video, title:", videoTitle);
    console.log("Last title:", lastVideoTitle);
    
    if (!videoTitle) {
      console.log("No video title found");
      return;
    }
    
    if (videoTitle === lastVideoTitle) {
      console.log("Same title as before, skipping");
      return;
    }

    lastVideoTitle = videoTitle;

    try {
      const result = await chrome.storage.sync.get('keywords');
      const keywords = result.keywords || ['masters'];
      console.log("Current keywords:", keywords);
      
      const titleLower = videoTitle.toLowerCase();
      const shouldHide = keywords.some(keyword => titleLower.includes(keyword.toLowerCase()));
      
      if (shouldHide) {
        await sendLog(`Hiding duration for video: ${videoTitle}`);
        hideTimelineAndAddButtons();
      } else {
        await sendLog(`No keywords matched for: ${videoTitle}`);
        clearPreviousInjection();
      }
    } catch (error) {
      console.error("Error processing video:", error);
    }
  };

  const getThumbnailTitle = (thumbnail) => {
    const titleElement = thumbnail.closest('ytd-video-renderer')?.querySelector('#video-title') ||
                        thumbnail.closest('ytd-grid-video-renderer')?.querySelector('#video-title') ||
                        thumbnail.closest('ytd-compact-video-renderer')?.querySelector('#video-title') ||
                        thumbnail.closest('ytd-rich-item-renderer')?.querySelector('#video-title');
    return titleElement?.textContent.trim() || '';
  };

  const processThumbnails = async () => {
    try {
      // Get all settings at once
      const { keywords = ['masters'], hideThumbnails = true } = await chrome.storage.sync.get(['keywords', 'hideThumbnails']);
      
      // If thumbnail hiding is disabled, reset any hidden thumbnails and exit
      if (!hideThumbnails) {
        document.querySelectorAll('[processed-duration]').forEach(el => {
          el.removeAttribute('processed-duration');
          const timeStatus = el.querySelector('ytd-thumbnail-overlay-time-status-renderer, .ytp-videowall-still-info-duration');
          if (timeStatus) {
            timeStatus.style.cssText = '';
          }
        });
        return;
      }
      
      const thumbnails = document.querySelectorAll(`
        ytd-thumbnail:not([processed-duration]),
        ytd-rich-item-renderer:not([processed-duration]),
        ytd-compact-video-renderer:not([processed-duration]),
        .ytp-videowall-still:not([processed-duration])
      `);
      
      for (const thumbnail of thumbnails) {
        const timeStatus = thumbnail.querySelector('ytd-thumbnail-overlay-time-status-renderer, .ytp-videowall-still-info-duration');
        if (!timeStatus) continue;

        const title = getThumbnailTitle(thumbnail);
        if (!title) continue;

        const titleLower = title.toLowerCase();
        const shouldHide = keywords.some(keyword => titleLower.includes(keyword.toLowerCase()));
        
        // Mark as processed regardless of whether we hide it
        thumbnail.setAttribute('processed-duration', shouldHide ? 'hidden' : 'shown');
        
        if (shouldHide) {
          timeStatus.style.cssText = 'display: none !important';
          await sendLog(`Hiding thumbnail duration for: ${title}`);
        }
      }
    } catch (error) {
      console.error('Error processing thumbnails:', error);
    }
  };

  const resetThumbnails = () => {
    // Remove processed flag and restore visibility
    document.querySelectorAll('[processed-duration]').forEach(el => {
      el.removeAttribute('processed-duration');
    });
    
    // Reset all possible timestamp elements
    document.querySelectorAll('ytd-thumbnail-overlay-time-status-renderer, .ytp-videowall-still-info-duration').forEach(el => {
      el.style.cssText = '';
    });
    
    // Also remove the global CSS if it was applied
    clearPreviousInjection();
  };

  const init = () => {
    console.log("Initializing YouTube script");
    
    // Initial processing with delay to ensure content is loaded
    setTimeout(() => {
      processVideo();
      processThumbnails();
      observePlayer(); // Add player observation
    }, 1500); // Increased from 500ms to 1500ms
    
    // Create observer for content changes
    const observer = new MutationObserver((mutations) => {
      // Check if navigation occurred
      const navigationMutation = mutations.some(mutation => 
        mutation.target.nodeName === 'TITLE' || 
        mutation.target.id === 'content' ||
        mutation.target.id === 'page-manager'
      );

      if (navigationMutation) {
        console.log("Navigation detected, resetting state...");
        resetThumbnails();
      }

      processVideo();
      processThumbnails();
    });
    
    observer.observe(document.body, { 
      subtree: true, 
      childList: true,
      attributeFilter: ['title']
    });
    
    console.log("Observer set up");
  };

  if (document.readyState === "complete" || document.readyState === "interactive") {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init);
  }

  // Handle YouTube spa navigation
  window.addEventListener("yt-navigate-start", resetThumbnails);
  window.addEventListener("yt-navigate-finish", () => {
    setTimeout(() => {
      // First reset everything
      resetThumbnails();
      clearPreviousInjection();
      // Then reprocess based on current page
      processVideo();
      processThumbnails();
      observePlayer(); // Re-establish player observation
    }, 1000); // Increased from 500ms to 1000ms
  });

  // Process thumbnails less frequently to reduce CPU usage
  setInterval(processThumbnails, 2000);

  // Add periodic check for timeline visibility
  setInterval(ensureTimelineHidden, 1000);

  // Add message listener for keyword updates
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'refreshKeywords' || message.type === 'refreshSettings') {
      resetThumbnails();
      processVideo();
      processThumbnails();
    }
  });
})();
