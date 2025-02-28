(() => {
  const sendLog = async (message) => {
    console.log("[Hide YT Duration] Embedded:", message);
    try {
      const response = await chrome.runtime.sendMessage({ 
        type: "log", 
        message 
      });
      console.log("[Hide YT Duration] Log response:", response);
    } catch (error) {
      console.error("[Hide YT Duration] Error sending log:", error);
    }
  };

  const isYouTubeEmbed = () => {
    const isYouTubePlayer = window.location.hostname.includes('youtube.com') || 
                           window.location.hostname.includes('youtube-nocookie.com');
    const isEmbed = window.location.pathname.startsWith('/embed/');
    return isYouTubePlayer && isEmbed;
  };

  const getVideoId = () => {
    if (window.location.pathname.startsWith('/embed/')) {
      return window.location.pathname.split('/embed/')[1].split('?')[0];
    }
    return '';
  };

  const fetchVideoTitle = async (videoId) => {
    try {
      const response = await chrome.runtime.sendMessage({ 
        type: "getVideoInfo", 
        videoId 
      });
      return response?.title || '';
    } catch (error) {
      console.error("[Hide YT Duration] Error fetching video title:", error);
      return '';
    }
  };

  const clearPreviousInjection = () => {
    document.getElementById("hide-timeline-css")?.remove();
    document.querySelectorAll(".custom-seek-button").forEach(button => button.remove());
  };

  const createSeekButton = (text, duration) => {
    const button = document.createElement("span");
    button.classList.add("custom-seek-button");
    button.innerText = text.replace(" ", "\u2009"); // Thin space
    button.style.cssText = "cursor: pointer; user-select: none; margin: 0 7px; color: white; background: rgba(0,0,0,0.5); padding: 2px 5px; border-radius: 3px; font-size: 12px;";
    button.addEventListener("click", () => {
      const video = document.querySelector("video");
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
      .ytp-chrome-bottom .ytp-progress-bar-container,
      .ytp-chrome-bottom .ytp-time-separator,
      .ytp-chrome-bottom .ytp-time-duration,
      ${!showCurrentTime ? '.ytp-chrome-bottom .ytp-time-current,' : ''} 
      .ytp-ce-video-duration {
        display: none !important; 
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
      
      .ytp-progress-bar-container {
        height: 0 !important;
        min-height: 0 !important;
        padding: 0 !important;
        margin: 0 !important;
        border: none !important;
      }`;
    document.head.appendChild(style);

    const controlsRight = document.querySelector(".ytp-right-controls");
    if (controlsRight) {
      const buttonContainer = document.createElement("div");
      buttonContainer.style.cssText = "display: flex; align-items: center; margin-right: 10px;";
      
      [
        ["-30m", -1800],
        ["-10m", -600],
        ["-1m", -60],
        ["-10s", -10],
        ["+10s", 10],
        ["+1m", 60],
        ["+10m", 600],
        ["+30m", 1800]
      ].forEach(([text, duration]) => {
        buttonContainer.appendChild(createSeekButton(text, duration));
      });
      
      controlsRight.parentNode.insertBefore(buttonContainer, controlsRight);
    }

    setTimeout(() => {
      const controlsLeft = document.querySelector(".ytp-left-controls");
      if (controlsLeft && !document.querySelector('.custom-seek-buttons')) {
        const buttonContainer = document.createElement("div");
        buttonContainer.className = 'custom-seek-buttons';
        buttonContainer.style.cssText = "display: flex; align-items: center; margin: 0 10px 0 20px;"; // Added left margin

        [
          ["-30m", -1800],
          ["-10m", -600],
          ["-1m", -60],
          ["-10s", -10],
          ["+10s", 10],
          ["+1m", 60],
          ["+10m", 600],
          ["+30m", 1800]
        ].forEach(([text, duration]) => {
          buttonContainer.appendChild(createSeekButton(text, duration));
        });

        controlsLeft.parentNode.insertBefore(buttonContainer, controlsLeft.nextSibling);
      }
    }, 500);

    sendLog("Timeline hidden and seek buttons added to embedded video");
  };

  const processEmbeddedVideo = async () => {
    if (!isYouTubeEmbed()) return;
    
    const videoId = getVideoId();
    if (!videoId) {
      console.log("[Hide YT Duration] No video ID found in embed");
      return;
    }

    try {
      const videoTitle = await fetchVideoTitle(videoId);
      if (!videoTitle) {
        console.log("[Hide YT Duration] Could not get title for embedded video");
        return;
      }

      const result = await chrome.storage.sync.get('keywords');
      const keywords = result.keywords || ['masters'];
      
      const titleLower = videoTitle.toLowerCase();
      const shouldHide = keywords.some(keyword => titleLower.includes(keyword.toLowerCase()));
      
      if (shouldHide) {
        await sendLog(`Hiding duration for embedded video: ${videoTitle}`);
        hideTimelineAndAddButtons();

        const ensureTimelineHidden = () => {
          if (!document.getElementById("hide-timeline-css")) {
            hideTimelineAndAddButtons();
          }
        };
        
        const observer = new MutationObserver(ensureTimelineHidden);
        const player = document.querySelector('.html5-video-player');
        if (player) {
          observer.observe(player, {
            childList: true,
            subtree: true,
            attributes: true
          });
        }
        
        setInterval(ensureTimelineHidden, 1000);
      } else {
        await sendLog(`No keywords matched for embedded video: ${videoTitle}`);
        clearPreviousInjection();
      }
    } catch (error) {
      console.error("[Hide YT Duration] Error processing embedded video:", error);
    }
  };

  const init = () => {
    console.log("[Hide YT Duration] Checking for embedded YouTube video");
    
    if (isYouTubeEmbed()) {
      console.log("[Hide YT Duration] YouTube embed detected");
      
      setTimeout(() => {
        processEmbeddedVideo();
      }, 1500);
      
      window.addEventListener("load", processEmbeddedVideo);
      setInterval(processEmbeddedVideo, 3000);
    }
  };

  if (document.readyState === "complete" || document.readyState === "interactive") {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init);
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'refreshKeywords' || message.type === 'refreshSettings') {
      processEmbeddedVideo();
    }
  });
})();
