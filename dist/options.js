// Function to update the icon
function updateIcon(isEnabled) {
  chrome.action.setIcon({
    path: isEnabled ? 'icons/128x128.png' : 'icons/128x128-disabled.png'
  });
}

// Function to update the visibility of the refresh icon
function updateRefreshIconVisibility() {
  chrome.runtime.sendMessage({ type: 'settings-updated' });
}

// Function to hide the refresh icon
function hideRefreshIcon() {
  chrome.runtime.sendMessage({ type: 'hideRefreshIcon' });
}

// Function to handle messages for updating the refresh icon visibility
function handleRefreshIconMessage(request) {
  if (request.type === 'updateRefreshIcon') {
    document.getElementById('refresh_page').style.display = request.visible ? 'block' : 'none';
  }
}

// Function to toggle form visibility
function toggleFormVisibility(isEnabled) {
  const formElements = document.querySelectorAll('#optionsForm input, #optionsForm select, #optionsForm label:not(#enabledLabel), #purgeCache, #advancedSettings, #apiUrlLabel');
  formElements.forEach(element => {
    element.style.display = isEnabled ? 'block' : 'none';
  });
}

// Debounce function to delay API URL validation
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// Function to validate the API URL
function validateApiUrl() {
  const apiUrl = document.getElementById('apiUrl').value;
  fetch(`${apiUrl}/queue-size`, { method: 'POST' })
    .then(response => {
      return response.json();
    })
    .then(data => {
      const parsedData = parseInt(data);
      if (!isNaN(parsedData)) {
        document.getElementById('statusSpan').textContent = 'API URL is valid';
        document.getElementById('statusSpan').style.color = 'green';
      } else {
        document.getElementById('statusSpan').textContent = 'Invalid API response';
        document.getElementById('statusSpan').style.color = 'red';
      }
    })
    .catch(error => {
      document.getElementById('statusSpan').textContent = error.message;
      document.getElementById('statusSpan').style.color = 'red';
      console.error('Error validating API URL:', error);
    });
}

// Debounced version of the validateApiUrl function
const debouncedValidateApiUrl = debounce(validateApiUrl, 1000);

// Saves options to chrome.storage
function saveOptions(e) {
  if (e) e.preventDefault();
  let isEnabled = document.getElementById('enabled').checked;
  let apiUrl = document.getElementById('apiUrl').value;
  let status = document.getElementById('status').value;
  let target_language = document.getElementById('target_language').value;
  let colorize = document.getElementById('colorize').checked;
  let capture = document.getElementById('capture').checked;

  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    let currentWebsite = new URL(tabs[0].url).hostname;

    chrome.storage.sync.get('quickSettings', function (data) {
      let quickSettings = data.quickSettings || {};
      quickSettings.enabledWebsites = quickSettings.enabledWebsites || {};
      quickSettings.enabledWebsites[currentWebsite] = isEnabled;
      quickSettings.apiUrl = apiUrl;
      quickSettings.status = status;
      quickSettings.target_language = target_language;
      quickSettings.colorize = colorize;
      quickSettings.capture = capture;

      chrome.storage.sync.set({ quickSettings }, function () {
        updateIcon(isEnabled);
        updateRefreshIconVisibility();
        toggleFormVisibility(isEnabled);
        chrome.runtime.sendMessage({ type: 'settings-updated' });
        chrome.runtime.sendMessage({ type: 'settings-modified' }); // Added message to background.js
      });
    });
  });
}

// Restores options from chrome.storage
function restoreOptions() {
  chrome.storage.sync.get('quickSettings', function (data) {
    const items = data.quickSettings || {
      enabledWebsites: {},
      colorize: false,
      apiUrl: '',
      status: '',
      target_language: 'ENG',
      capture: false
    };

    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      let currentWebsite = new URL(tabs[0].url).hostname;
      document.getElementById('enabled').checked = items.enabledWebsites[currentWebsite] || false;
      document.getElementById('colorize').checked = items.colorize;
      document.getElementById('apiUrl').value = items.apiUrl;
      document.getElementById('status').value = items.status;
      document.getElementById('target_language').value = items.target_language;
      document.getElementById('capture').checked = items.capture;
      document.getElementById('enabledLabel').textContent = `Enabled for ${currentWebsite}`;

      updateIcon(items.enabledWebsites[currentWebsite] || false);
      toggleFormVisibility(items.enabledWebsites[currentWebsite] || false);

      // Restore the state of the refresh icon
      chrome.storage.local.get('refreshIconVisible', function (data) {
        if (data.refreshIconVisible) {
          document.getElementById('refresh_page').style.display = 'block';
        } else {
          document.getElementById('refresh_page').style.display = 'none';
        }
      });
    });
  });
}

// Purge cache
function purgeCache() {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      updateRefreshIconVisibility();
      chrome.tabs.sendMessage(tabs[0].id, { type: 'purgeCache' }, (response) => {
          if (chrome.runtime.lastError) {
              console.error("Error sending message:", chrome.runtime.lastError);
          } else {
              const purgeCacheButton = document.getElementById('purgeCache');
              const successMessage = document.createElement('span');
              successMessage.textContent = 'Cache purged successfully!';
              successMessage.style.color = 'green';
              purgeCacheButton.replaceWith(successMessage);
          }
      });
  });
}

// Event listeners
document.addEventListener('DOMContentLoaded', function () {
  restoreOptions();

  // Add event listeners to save settings in real-time
  const inputs = document.querySelectorAll('#optionsForm input, #optionsForm select');
  inputs.forEach(input => {
    input.addEventListener('change', saveOptions);
  });

  // Add event listener to reset button
//  document.getElementById('refresh_icon').addEventListener('click', resetOptions);

  // Add event listener to refresh icon if it exists
  const refreshPage = document.getElementById('refresh_page');
  if (refreshPage) {
    refreshPage.addEventListener('click', function () {
      chrome.runtime.sendMessage({ type: 'reloadCurrentTab' });
      chrome.runtime.sendMessage({ type: 'hideRefreshIcon' });
      chrome.storage.local.set({ refreshIconVisible: false });
      window.close();
    });
  }

  // Show the refresh icon when needed
  document.getElementById('enabled').addEventListener('change', function() {
    updateRefreshIconVisibility();
    toggleFormVisibility(this.checked);
  });
  document.getElementById('colorize').addEventListener('change', updateRefreshIconVisibility);
  document.getElementById('target_language').addEventListener('change', updateRefreshIconVisibility);

  // Add event listener to purge cache button
  document.getElementById('purgeCache').addEventListener('click', purgeCache);

  // Add event listener to API URL input for validation
  document.getElementById('apiUrl').addEventListener('input', function() {
    debouncedValidateApiUrl();
  });

  chrome.runtime.onMessage.addListener(handleRefreshIconMessage);
});

document.addEventListener('DOMContentLoaded', function() {
  const refreshPage = document.getElementById('refresh_page');

  function updateRefreshIconVisibility() {
    // Logic to determine if the refresh icon should be visible
    // For example, if any setting is changed, show the refresh icon
    refreshPage.style.display = 'block';
  }

  // Add event listeners to all settings inputs
  const inputs = document.querySelectorAll('#optionsForm input, #optionsForm select');
  inputs.forEach(input => {
    input.addEventListener('change', updateRefreshIconVisibility);
  });

  // Initial check
  chrome.storage.local.get('refreshIconVisible', function(data) {
    if (data.refreshIconVisible) {
      refreshPage.style.display = 'block';
    }
  });
});