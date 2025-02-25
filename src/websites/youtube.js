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
      .ytp-progress-bar-container, 
      .ytp-time-separator, 
      .ytp-time-duration,
      ${!showCurrentTime ? '.ytp-time-current,' : ''} 
      .video-time { 
        display: none !important; 
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

  const init = () => {
    console.log("Initializing YouTube script");
    processVideo();
    
    // Create observer for title changes
    const observer = new MutationObserver(() => {
      console.log("DOM mutation detected, checking video...");
      processVideo();
    });
    
    observer.observe(document.body, { 
      subtree: true, 
      childList: true 
    });
    
    console.log("Observer set up");
  };

  if (document.readyState === "complete" || document.readyState === "interactive") {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init);
  }

  window.addEventListener("yt-navigate-finish", () => setTimeout(processVideo, 500));

  // Add message listener for keyword updates
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'refreshKeywords' || message.type === 'refreshSettings') {
      processVideo();
    }
  });
})();
