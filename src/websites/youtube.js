(function () {
  console.log("YouTube script initialized");

  // Function for sending log messages.
  function sendLog(message) {
    console.log("Attempting to send log:", message);
    chrome.runtime.sendMessage({ type: "log", message });
  }

  // Get the video title from the page.
  function getVideoTitle() {
    if (!location.href.includes("watch")) return "";
    let infoRenderer = document.querySelector("ytd-video-primary-info-renderer");
    if (!infoRenderer) {
      infoRenderer = document.querySelector("ytd-watch-flexy");
    }
    if (!infoRenderer) return "";

    // Try shadow DOM first, then fallback.
    let titleElement = infoRenderer.shadowRoot?.querySelector("h1 yt-formatted-string");
    if (!titleElement) {
      titleElement = infoRenderer.querySelector("h1 yt-formatted-string");
    }
    const title = titleElement ? titleElement.textContent.trim() : "";
    console.log("Found video title:", title);
    return title;
  }

  // Remove previously injected style and buttons if they exist.
  function clearPreviousInjection() {
    var styleElement = document.getElementById("hide-timeline-css");
    if (styleElement) {
      styleElement.remove();
    }
    var buttons = document.querySelectorAll(".custom-seek-button");
    buttons.forEach(function (button) {
      button.remove();
    });
  }

  // Hide timeline and add seek buttons on the video player.
  function hideTimelineAndAddButtons() {
    // Clear any previous injection.
    clearPreviousInjection();

    // Inject CSS style to hide timeline elements, with a unique ID.
    var style = document.createElement("style");
    style.id = "hide-timeline-css";
    style.innerText =
      ".ytp-progress-bar-container, .ytp-time-separator, .ytp-time-duration, .video-time { display: none !important; }";
    document.head.appendChild(style);

    // Function to adjust video playback.
    var seekVideo = function (amount) {
      var video = document.querySelector(".html5-main-video");
      if (!video || !Number.isFinite(video.currentTime)) return;
      video.currentTime += amount;
    };

    // Create a clickable button for seeking.
    var createButton = function (text, duration) {
      var el = document.createElement("span");
      el.classList.add("custom-seek-button"); // Mark for later removal.
      var thinSpace = " ";
      el.innerText = text.replace(" ", thinSpace);
      el.style.cursor = "pointer";
      el.style.userSelect = "none";
      el.style.webkitUserSelect = "none";
      el.addEventListener("click", function () {
        seekVideo(duration);
      });
      return el;
    };

    // Add a button to the video player's time container.
    var addButton = function (text, duration) {
      var buttonEl = createButton(text, duration);
      var timeDuration = document.querySelector(".ytp-time-duration");
      if (!timeDuration) {
        console.log("Could not find .ytp-time-duration element to add buttons");
        return;
      }
      var container = timeDuration.parentNode;
      if (duration < 0) {
        buttonEl.style.marginRight = "15px";
        var timeCurrent = document.querySelector(".ytp-time-current");
        container.insertBefore(buttonEl, timeCurrent);
      } else {
        buttonEl.style.marginLeft = "15px";
        container.appendChild(buttonEl);
      }
    };

    // Add seek buttons.
    addButton("-10 min", -600);
    addButton("-1 min", -60);
    addButton("-10 s", -10);
    addButton("+10 s", 10);
    addButton("+1 min", 60);
    addButton("+10 min", 600);

    sendLog("Injected CSS and buttons because title contains 'Masters'.");
  }

  // Track the last processed video title so that we only process when a new video loads.
  let lastVideoTitle = "";

  // Wait for the video title element to appear and then process it.
  function waitForVideoTitle() {
    let attempts = 0;
    const maxAttempts = 20;
    console.log("Starting to wait for video title");

    const interval = setInterval(() => {
      const videoTitle = getVideoTitle();
      console.log("Attempt " + (attempts + 1) + ": Title = \"" + videoTitle + "\"");

      if (videoTitle) {
        clearInterval(interval);
        if (videoTitle !== lastVideoTitle) {
          lastVideoTitle = videoTitle;
          sendLog("Video title found: " + videoTitle);
          if (videoTitle.toLowerCase().includes("masters")) {
            hideTimelineAndAddButtons();
          } else {
            sendLog("Video title does not contain 'Masters'. No changes applied.");
            // Optionally clear injection if navigating from a "Masters" video to a non-"Masters" video.
            clearPreviousInjection();
          }
        }
      } else if (++attempts >= maxAttempts) {
        clearInterval(interval);
        sendLog("Video title not found after waiting.");
      }
    }, 500);
  }

  // Process immediately if the document is already ready, else wait for DOMContentLoaded.
  if (document.readyState === "complete" || document.readyState === "interactive") {
    console.log("Document ready, starting immediately");
    waitForVideoTitle();
  } else {
    console.log("Document not ready, waiting for DOMContentLoaded");
    document.addEventListener("DOMContentLoaded", waitForVideoTitle);
  }

  // Listen for YouTube navigation events (SPA navigation) to run the title check again.
  window.addEventListener("yt-navigate-finish", () => {
    console.log("YouTube navigation finished, checking for video title again.");
    // Delay a bit to let the new page elements load.
    setTimeout(waitForVideoTitle, 500);
  });
})();
