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
  let apiUrl = document.getElementById('apiUrl').value;
  let status = document.getElementById('status').value;
  let target_language = document.getElementById('target_language').value;
  let colorize = document.getElementById('colorize').checked;
  let translate = document.getElementById('translate').checked;

  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    let currentWebsite = new URL(tabs[0].url).hostname;

    chrome.storage.sync.get({ enabledWebsites: {} }, function (items) {
      let enabledWebsites = items.enabledWebsites;
      enabledWebsites[currentWebsite] = isEnabled;

      chrome.storage.sync.set({
        enabledWebsites: enabledWebsites,
        apiUrl: apiUrl,
        status: status,
        target_language: target_language,
        colorize: colorize,
        translate: translate
      }, function () {
        updateIcon(isEnabled);
      });
    });
  });
}

// Restores options from chrome.storage
function restoreOptions() {
  chrome.storage.sync.get({
    enabledWebsites: {},
    colorize: false,
    translate: true,
    apiUrl: '',
    status: '',
    target_language: 'ENG'
  }, function (items) {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      let currentWebsite = new URL(tabs[0].url).hostname;
      document.getElementById('enabled').checked = items.enabledWebsites[currentWebsite] || false;
      document.getElementById('colorize').checked = items.colorize;
      document.getElementById('translate').checked = items.translate;
      document.getElementById('apiUrl').value = items.apiUrl;
      document.getElementById('status').value = items.status;
      document.getElementById('target_language').value = items.target_language;
      document.getElementById('enabledLabel').textContent = `Enabled for ${currentWebsite}`;

      updateIcon(items.enabledWebsites[currentWebsite] || false);
    });
  });
}

// Purge cache
function purgeCache() {
  chrome.storage.local.clear(function () {
    var error = chrome.runtime.lastError;
    if (error) {
      console.error(error);
    } else {
      console.log('Cache purged successfully.');
    }
  });
}

// Reload tabs
function reloadTabs() {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    tabs.forEach(function (tab) {
      chrome.tabs.reload(tab.id);
    });
  });
}

// Event listeners
document.addEventListener('DOMContentLoaded', function () {
  restoreOptions();

  chrome.storage.sync.get({ enabledWebsites: {} }, function (items) {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      let currentWebsite = new URL(tabs[0].url).hostname;
      updateIcon(items.enabledWebsites[currentWebsite] || false);
    });
  });

  document.getElementById('optionsForm').addEventListener('submit', saveOptions);

  var enabledCheckbox = document.getElementById('enabled');
  var colorizeCheckbox = document.getElementById('colorize');
  var translateCheckbox = document.getElementById('translate');
  var apiUrlInput = document.getElementById('apiUrl');
  var targetLanguageSelect = document.getElementById('target_language');
  var submitButton = document.getElementById('submit');
  var purgeCacheButton = document.getElementById('purgeCache');

  enabledCheckbox.addEventListener('change', function () {
    submitButton.click();
    reloadTabs();
  });

  colorizeCheckbox.addEventListener('change', function () {
    submitButton.click();
    reloadTabs();
  });

  translateCheckbox.addEventListener('change', function () {
    submitButton.click();
    reloadTabs();
  });

  apiUrlInput.addEventListener('change', function () {
    submitButton.click();
  });

  targetLanguageSelect.addEventListener('change', function () {
    submitButton.click();
    reloadTabs();
  });

  purgeCacheButton.addEventListener('click', purgeCache);

  var statusSpan = document.getElementById('statusSpan');
  apiUrlInput.addEventListener('input', function () {
    var apiUrl = apiUrlInput.value;
    fetch(`${apiUrl}/`)
      .then(response => {
        if (response.ok) {
          statusSpan.textContent = 'API URL is valid';
          statusSpan.style.color = 'green';
          document.getElementById('status').value = 'API URL is valid';
        } else {
          statusSpan.textContent = 'API URL is invalid';
          statusSpan.style.color = 'red';
          document.getElementById('status').value = 'API URL is invalid';
        }
      })
      .catch(error => {
        statusSpan.textContent = 'API URL is invalid';
        statusSpan.style.color = 'red';
        document.getElementById('status').value = 'API URL is invalid';
      });
  });
});