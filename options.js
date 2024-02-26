// Saves options to chrome.storage
function saveOptions(e) {
    e.preventDefault();
    chrome.storage.sync.set({
      enabled: document.getElementById('enabled').checked,
      apiUrl: document.getElementById('apiUrl').value,
      apiKey: document.getElementById('apiKey').value,
      target_language: document.getElementById('target_language').value
    });
  }
  
  // Restores options from chrome.storage
  function restoreOptions() {
    chrome.storage.sync.get({
      enabled: true,
      apiUrl: '',
      apiKey: '',
      target_language: 'ENG'
        }, function(items) {
      document.getElementById('enabled').checked = items.enabled;
      document.getElementById('apiUrl').value = items.apiUrl;
      document.getElementById('apiKey').value = items.apiKey;
      document.getElementById('target_language').value = items.target_language;
    });
  }
  
  document.addEventListener('DOMContentLoaded', restoreOptions);
  document.getElementById('optionsForm').addEventListener('submit', saveOptions);