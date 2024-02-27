// Saves options to chrome.storage
function saveOptions(e) {
  e.preventDefault();
  let isEnabled = document.getElementById('enabled').checked;
  chrome.storage.sync.set({
    enabled: isEnabled,
    apiUrl: document.getElementById('apiUrl').value,
    target_language: document.getElementById('target_language').value
  }, function() {
    // Update the icon after saving the options
    chrome.action.setIcon({
      path: isEnabled ? 'icons/128x128.png' : 'icons/128x128-disabled.png'
    });
  });
}

// Restores options from chrome.storage
function restoreOptions() {
  chrome.storage.sync.get({
    enabled: true,
    apiUrl: '',
    target_language: 'ENG'
  }, function(items) {
    document.getElementById('enabled').checked = items.enabled;
    document.getElementById('apiUrl').value = items.apiUrl;
    document.getElementById('target_language').value = items.target_language;

    // Update the icon after restoring the options
    chrome.browserAction.setIcon({
      path: items.enabled ? 'icons/128x128.png' : 'icons/128x128-disabled.png'
    });
  });
}
  
  document.addEventListener('DOMContentLoaded', restoreOptions);
  document.getElementById('optionsForm').addEventListener('submit', saveOptions);