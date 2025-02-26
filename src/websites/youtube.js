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

  const ensureTimelineHidden = () => {
    const style = document.getElementById("hide-timeline-css");
    if (!style && lastVideoTitle) {
      processVideo();
    }
  };

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

    observePlayerElement();
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
      // Check if extension context is still valid
      if (!chrome.runtime?.id) {
        console.log('Extension context invalid - skipping thumbnail processing');
        return;
      }

      const { keywords = ['masters'], hideThumbnails = true } = await chrome.storage.sync.get(['keywords', 'hideThumbnails']);
      
      if (!hideThumbnails) {
        const elements = document.querySelectorAll('[processed-duration]');
        for (const el of elements) {
          try {
            const timeStatus = el.querySelector('ytd-thumbnail-overlay-time-status-renderer, .ytp-videowall-still-info-duration');
            if (timeStatus && timeStatus.style) {
              timeStatus.style.cssText = '';
            }
            el.removeAttribute('processed-duration');
          } catch (err) {
            console.log('Skipping element due to error:', err);
            continue;
          }
        }
        return;
      }
      
      const thumbnails = document.querySelectorAll(`
        ytd-thumbnail:not([processed-duration]),
        ytd-rich-item-renderer:not([processed-duration]),
        ytd-compact-video-renderer:not([processed-duration])
      `);
      
      for (const thumbnail of thumbnails) {
        try {
          const timeStatus = thumbnail.querySelector('ytd-thumbnail-overlay-time-status-renderer');
          if (!timeStatus || !timeStatus.style) continue;

          const title = getThumbnailTitle(thumbnail);
          if (!title) continue;

          const titleLower = title.toLowerCase();
          const shouldHide = keywords.some(keyword => titleLower.includes(keyword.toLowerCase()));
          
          thumbnail.setAttribute('processed-duration', shouldHide ? 'hidden' : 'shown');
          
          if (shouldHide) {
            timeStatus.style.cssText = 'display: none !important; visibility: hidden !important;';
          }
        } catch (err) {
          console.log('Skipping thumbnail due to error:', err);
          continue;
        }
      }
    } catch (error) {
      console.error('Error processing thumbnails:', error);
      // If extension context is invalid, clear interval
      if (!chrome.runtime?.id) {
        console.log('Extension context invalid - clearing intervals');
        clearInterval(thumbnailInterval);
        clearInterval(timelineInterval);
      }
    }
  };

  const resetThumbnails = () => {
    try {
      const elements = document.querySelectorAll('[processed-duration]');
      for (const el of elements) {
        try {
          const timeStatus = el.querySelector('ytd-thumbnail-overlay-time-status-renderer');
          if (timeStatus && timeStatus.style) {
            timeStatus.style.cssText = '';
          }
          el.removeAttribute('processed-duration');
        } catch (err) {
          console.log('Error resetting thumbnail:', err);
          continue;
        }
      }
    } catch (error) {
      console.error('Error in resetThumbnails:', error);
    }
  };

  const init = () => {
    console.log("Initializing YouTube script");
    
    setTimeout(() => {
      processVideo();
      processThumbnails();
      observePlayer();
    }, 1500);
    
    const observer = new MutationObserver((mutations) => {
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
  };

  if (document.readyState === "complete" || document.readyState === "interactive") {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init);
  }

  window.addEventListener("yt-navigate-start", resetThumbnails);
  window.addEventListener("yt-navigate-finish", () => {
    setTimeout(() => {
      resetThumbnails();
      clearPreviousInjection();
      processVideo();
      processThumbnails();
      observePlayer();
    }, 1000);
  });

  // Store interval IDs so we can clear them if needed
  const thumbnailInterval = setInterval(processThumbnails, 5000);
  const timelineInterval = setInterval(ensureTimelineHidden, 1000);

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'refreshKeywords') {
      resetThumbnails();
      processVideo();
      processThumbnails();
    } else if (message.type === 'refreshSettings') {
      chrome.storage.sync.get(['hideThumbnails'], (result) => {
        if ('hideThumbnails' in result) {
          processThumbnails();
        } else {
          processVideo();
        }
      });
    }
  });
})();