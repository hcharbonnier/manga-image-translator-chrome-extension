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
    colorize: false,
    apiUrl: '',
    status: '',
    target_language: 'ENG'
  }, function(items) {
    document.getElementById('enabled').checked = items.enabled;
    document.getElementById('colorize').checked = items.colorize; // Restore colorize option
    document.getElementById('apiUrl').value = items.apiUrl;
    document.getElementById('status').value = items.status;
    document.getElementById('statusSpan').innerHTML = items.status;
    document.getElementById('target_language').value = items.target_language;

    // Update the icon after restoring the options
    updateIcon(items.enabled);
  });
}

// Purge cache
function purgeCache() {
  chrome.storage.local.clear(function() {
    console.log('Cache purged');
    alert('Cache has been purged.');
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
    var colorizeCheckbox = document.getElementById('colorize');
    var apiUrlInput = document.getElementById('apiUrl');
    var targetLanguageSelect = document.getElementById('target_language');
    var submitButton = document.getElementById('submit');
    var purgeCacheButton = document.getElementById('purgeCache');

    enabledCheckbox.addEventListener('change', function() {
      submitButton.click();
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        tabs.forEach(function(tab) {
          chrome.tabs.reload(tab.id);
        });
      });
    });

    colorizeCheckbox.addEventListener('change', function() {
      submitButton.click();
    });
  
    apiUrlInput.addEventListener('change', function() {
      submitButton.click();
    });
  
    targetLanguageSelect.addEventListener('change', function() {
      submitButton.click();
    });
  
    purgeCacheButton.addEventListener('click', function() {
      chrome.storage.local.clear(function() {
        var error = chrome.runtime.lastError;
        if (error) {
          console.error(error);
        } else {
          console.log('Cache purged successfully.');
          alert('Cache purged successfully.');
        }
      });
    });
  });
  
  // Check if the API URL is valid
  document.addEventListener('DOMContentLoaded', function() {
    var apiUrlInput = document.getElementById('apiUrl');
    var statusInput = document.getElementById('status');
    var statusSpan = document.getElementById('statusSpan');
  
    apiUrlInput.addEventListener('input', function() {
      var apiUrl = apiUrlInput.value;
      fetch(`${apiUrl}/`)
        .then(response => {
          if (response.ok) {
            statusSpan.textContent = 'API URL is valid';
            statusSpan.style.color = 'green';
          } else {
            statusSpan.textContent = 'API URL is invalid';
            statusSpan.style.color = 'red';
          }
        })
        .catch(error => {
          statusSpan.textContent = 'API URL is invalid';
          statusSpan.style.color = 'red';
        });
    });
  });
  
  function restoreOptions() {
    chrome.storage.sync.get({
      enabled: false,
      colorize: false,
      apiUrl: '',
      target_language: 'ENG'
    }, function(items) {
      document.getElementById('enabled').checked = items.enabled;
      document.getElementById('colorize').checked = items.colorize;
      document.getElementById('apiUrl').value = items.apiUrl;
      document.getElementById('target_language').value = items.target_language;
    });
  }
  
  function saveOptions(event) {
    event.preventDefault();
    var enabled = document.getElementById('enabled').checked;
    var colorize = document.getElementById('colorize').checked
    var apiUrl = document.getElementById('apiUrl').value;
    var target_language = document.getElementById('target_language').value;
  
    chrome.storage.sync.set({
      enabled: enabled,
      colorize: colorize,
      apiUrl: apiUrl,
      target_language: target_language
    }, function() {
      console.log('Options saved.');
    });
  }
