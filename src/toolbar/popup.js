document.addEventListener("DOMContentLoaded", () => {
    const logContainer = document.getElementById("logContainer");
    console.log("Popup opened"); // Debug line
    
    chrome.storage.local.get({ logs: [] }, function (data) {
        console.log("Retrieved logs:", data.logs); // Debug line
        const logs = data.logs;
        logContainer.innerHTML = logs.length
            ? logs.map(log => `<p>${log}</p>`).join("")
            : "<p>No logs available.</p>";
    });
});
