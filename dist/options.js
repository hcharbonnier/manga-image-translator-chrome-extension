// Function to update the icon
function updateIcon(isEnabled) {
  chrome.action.setIcon({
    path: isEnabled ? 'icons/128x128.png' : 'icons/128x128-disabled.png'
  });
}

// Saves options to chrome.storage
function saveOptions(e) {
  e.preventDefault();
  let isEnabled = document.getElementById('enabled').checked;
  chrome.storage.sync.set({
    enabled: isEnabled,
    apiUrl: document.getElementById('apiUrl').value,
    status: document.getElementById('status').value,
    target_language: document.getElementById('target_language').value
  }, function() {
       updateIcon(isEnabled);
  });
}

// Restores options from chrome.storage
function restoreOptions() {
  chrome.storage.sync.get({
    enabled: true,
    apiUrl: '',
    status: '',
    target_language: 'ENG'
  }, function(items) {
    document.getElementById('enabled').checked = items.enabled;
    document.getElementById('apiUrl').value = items.apiUrl;
    document.getElementById('status').value = items.status;
    document.getElementById('statusSpan').innerHTML = items.status;
    document.getElementById('target_language').value = items.target_language;

    // Update the icon after restoring the options
    updateIcon(items.enabled);
  });
}
  
//Update the icon when the extension is loaded
document.addEventListener('DOMContentLoaded', function() {
  chrome.storage.sync.get({
    enabled: true
  }, function(items) {
    updateIcon(items.enabled);
  });
});

  document.addEventListener('DOMContentLoaded', restoreOptions);
  document.getElementById('optionsForm').addEventListener('submit', saveOptions);
  document.addEventListener('DOMContentLoaded', function() {
    var enabledCheckbox = document.getElementById('enabled');
    var apiUrlInput = document.getElementById('apiUrl');
    var targetLanguageSelect = document.getElementById('target_language');
    var submitButton = document.getElementById('submit');
  
    enabledCheckbox.addEventListener('change', function() {
      submitButton.click();
      //if (enabledCheckbox.checked) {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
          tabs.forEach(function(tab) {
            chrome.tabs.reload(tab.id);
          });
        });
      //}
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
    var statusInput = document.getElementById('status');
    var statusSpan = document.getElementById('statusSpan');
  
    apiUrlInput.addEventListener('input', function() {
      var apiUrl = apiUrlInput.value;
      fetch(`${apiUrl}/queue-size`)
        .then(response => response.json())
        .then(data => {
          if (!data.hasOwnProperty('size')) {
            var logMessage = '&#10060;';
            console.log(logMessage);
            statusSpan.innerHTML = logMessage;
            statusInput.value = logMessage;
          } else {
            var logMessage = '&#9989;';
            console.log(logMessage);
            statusSpan.innerHTML = logMessage;
            statusInput.value = logMessage;
          }
        })
        .catch(error => {
          var logMessage = '&#10060;';
          console.log(logMessage);
          statusSpan.innerHTML = logMessage;
          statusSpan.innerHTML = logMessage;
          statusInput.value = logMessage;
        });
    });
  });
