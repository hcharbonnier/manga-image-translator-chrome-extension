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
  document.addEventListener('DOMContentLoaded', function() {
    var enabledCheckbox = document.getElementById('enabled');
    var apiUrlInput = document.getElementById('apiUrl');
    var targetLanguageSelect = document.getElementById('target_language');
    var submitButton = document.getElementById('submit');
  
    enabledCheckbox.addEventListener('change', function() {
      submitButton.click();
    });
  
    apiUrlInput.addEventListener('change', function() {
      submitButton.click();
    });
  
    targetLanguageSelect.addEventListener('change', function() {
      submitButton.click();
    });
  });

  // Check if the API URL is valid
  document.addEventListener('DOMContentLoaded', function() {
    var apiUrlInput = document.getElementById('apiUrl');
    var statusLabel = document.getElementById('status');
  
    apiUrlInput.addEventListener('input', function() {
      var apiUrl = apiUrlInput.value;
      fetch(`${apiUrl}/queue-size`)
        .then(response => response.json())
        .then(data => {
          if (!data.hasOwnProperty('size')) {
            var logMessage = '&#10060;';
            console.log(logMessage);
            statusLabel.innerHTML = logMessage;
          } else {
            var successMessage = '&#9989;';
            console.log(successMessage);
            statusLabel.innerHTML = successMessage;
          }
        })
        .catch(error => {
          var logMessage = '&#10060;';
          console.log(logMessage);
          statusLabel.innerHTML = logMessage;
        });
    });
  });
