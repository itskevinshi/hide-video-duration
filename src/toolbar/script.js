chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
  var tab = tabs[0];
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["src/websites/youtube.js"],
  });
});