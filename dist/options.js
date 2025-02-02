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
    chrome.tabs.sendMessage(tabs[0].id, { type: 'purgeCache' });
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
  document.getElementById('enabled').addEventListener('change', updateRefreshIconVisibility);
  document.getElementById('colorize').addEventListener('change', updateRefreshIconVisibility);
  document.getElementById('target_language').addEventListener('change', updateRefreshIconVisibility);

  // Add event listener to purge cache button
  document.getElementById('purgeCache').addEventListener('click', purgeCache);

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