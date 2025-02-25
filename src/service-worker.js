// In service-worker.js
chrome.runtime.onInstalled.addListener(() => {
    console.log("Service worker installed");
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    console.log("Message received:", msg);
    if (msg.type === "log") {
        chrome.storage.local.get({ logs: [] }, function (data) {
            const logs = data.logs;
            logs.push(msg.message);
            chrome.storage.local.set({ logs });
        });
    }
});
