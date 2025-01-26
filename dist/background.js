// Set to keep track of tabs that have already been processed
const processedTabs = new Set();
const imagesDownloadQueue = new Set();

// Retrieve quickSettings from chrome.storage.sync
let quickSettings = {};
chrome.storage.sync.get("quickSettings", (data) => {
    if (chrome.runtime.lastError) {
        chrome.storage.sync.set({ advancedSettings });
    } else {
        Object.assign(quickSettings, data.quickSettings);
    }
});

// Retrieve advancedSettings from chrome.storage.sync
let advancedSettings = {};
chrome.storage.sync.get("advancedSettings", (data) => {
    if (chrome.runtime.lastError) {
        console.error(`Error retrieving advancedSettings: ${chrome.runtime.lastError.message}`);
    } else {
        Object.assign(advancedSettings, data.advancedSettings);
    }
});
if (Object.keys(advancedSettings).length === 0) {
    advancedSettings = {
        detector: {
            detector: 'default',
            detection_size: 1536,
            text_threshold: 0.5,
            det_rotate: false,
            det_auto_rotate: false,
            det_invert: false,
            det_gamma_correct: false,
            box_threshold: 0.7,
            unclip_ratio: 2.3
        },
        colorizer: {
            colorizer: 'none',
            colorization_size: 1838,
            denoise_sigma: 30
        },
        inpainter: {
            inpainter: 'default',
            inpainting_size: 1024,
            inpainting_precision: 'fp32'
        },
        ocr: {
            use_mocr_merge: false,
            ocr: 'mocr',
            min_text_length: 0,
            ignore_bubble: 0
        },
        render: {
            renderer: 'default',
            alignment: 'auto',
            disable_font_border: false,
            font_size_offset: 0,
            font_size_minimum: 15,
            direction: 'auto',
            uppercase: false,
            lowercase: false,
            gimp_font: 'Sans-serif',
            no_hyphenation: false,
            font_color: null,
            line_spacing: null,
            font_size: 0
        },
        translator: {
            translator: 'nllb_big',
            target_lang: 'ENG',
            no_text_lang_skip: false,
            skip_lang: null,
            gpt_config: null,
            translator_chain: null,
            selective_translation: null
        },
        upscale: {
            upscaler: 'waifu2x',
            revert_upscaling: false,
            upscale_ratio: 0
        },
        kernel_size: 3,
        mask_dilation_offset: 0,
        disable_cache: false,
    };
    //chrome.storage.sync.set({ advancedSettings });
}

// Function to update the extension icon based on the current tab
function updateIcon(tabId) {
    chrome.tabs.get(tabId, (tab) => {
        if (!tab) return;

        const domain = new URL(tab.url).hostname;
        const isEnabled = quickSettings.enabledWebsites[domain] || false;
        const iconPath = isEnabled ? 'icons/128x128.png' : 'icons/128x128-disabled.png';

        chrome.action.setIcon({ path: iconPath, tabId });
    });
}

// Function to  update the extension icon based on the current tab
chrome.tabs.onActivated.addListener(function (activeInfo) {
    try {
        updateIcon(activeInfo.tabId);
    } catch (error) {
        console.error('Error updating icon on tab activation:', error);
    }
});

// Update the extension icon when a new tab is created
chrome.tabs.onCreated.addListener((tab) => {
    updateIcon(tab.id);
});

// Update the extension icon when the URL of a tab changes
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url) {
        updateIcon(tabId);
    }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'sync' && changes.quickSettings) {
        quickSettings = changes.quickSettings.newValue;
    }
    if (areaName === 'sync' && changes.advancedSettings) {
        advancedSettings = changes.advancedSettings.newValue;
    }
});

function updateRefreshIconVisibility(visible) {
    chrome.storage.local.set({ refreshIconVisible: visible }, function () {
        if (visible) {
            chrome.action.setBadgeText({ text: '1' });
        } else {
            chrome.action.setBadgeText({ text: '' });
        }
    });
    chrome.runtime.sendMessage({ type: 'updateRefreshIcon', visible: visible });
}

const downloadQueue = [];
let isDownloading = false;

async function processDownloadQueue() {
    if (isDownloading || downloadQueue.length === 0) {
        return;
    }

    isDownloading = true;
    const { url, sendResponse } = downloadQueue.shift();

    try {
        const response = await fetch(url);
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64Data = reader.result;
            const storageKey = `image_${Date.now()}`;
            chrome.storage.local.set({ [storageKey]: base64Data }, () => {
                sendResponse({ key: storageKey, type: blob.type });
                isDownloading = false;
                processDownloadQueue();
            });
        };
        reader.readAsDataURL(blob);
    } catch (error) {
        sendResponse({ error: error.message });
        isDownloading = false;
        processDownloadQueue();
    }
}

// let allImagesLoaded = false;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Received message:', message);
    if (message.action === 'setBadgeText') {
        chrome.action.setBadgeText({ text: message.text }, () => {
            if (chrome.runtime.lastError) {
                console.error('Error setting badge text:', chrome.runtime.lastError);
            }
        });
    } else if (message.type === 'settings-updated') {
        chrome.storage.sync.get(null, (newItems) => {
            quickSettings = newItems.quickSettings || quickSettings;
            advancedSettings = newItems.advancedSettings || advancedSettings;
            updateRefreshIconVisibility(true);
        });
    } else if (message.type === 'hideRefreshIcon') {
        updateRefreshIconVisibility(false);
    } else if (message.type === 'reloadCurrentTab') {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            chrome.tabs.reload(tabs[0].id, function () {
                updateRefreshIconVisibility(false);
            });
        });
    } else if (message.type === 'settings-modified') {
        updateRefreshIconVisibility(true);
    } else if (message.type === 'fetchImage') {
        downloadQueue.push({ url: message.url, sendResponse });
        processDownloadQueue();
        return true; // Keep the message channel open for sendResponse
    } else if (message.type === 'getStorageData') {
        const keys = message.keys;
        chrome.storage.sync.get(keys, (data) => {
            sendResponse(data);
        });
        return true; // Keep the message channel open for sendResponse
    } else if (message.type === 'getScreenshot') {
        console.log('Taking screenshot');
        chrome.tabs.captureVisibleTab(null, {}, (dataUrl) => {
            if (chrome.runtime.lastError) {
                sendResponse({ error: chrome.runtime.lastError.message });
            } else {
                sendResponse({ screenshotUrl: dataUrl });
            }
        });
        return true; // Keep the message channel open for sendResponse
    }
    return true; // Ensure the message channel is kept open for all cases
});

// Listener for web navigation to handle page navigation
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
    const tabId = details.tabId;
    if (processedTabs.has(tabId)) {
        processedTabs.delete(tabId);
    }
}, { url: [{ schemes: ['http', 'https'] }] });

// Listener for tab removal to clean up processedTabs set
chrome.tabs.onRemoved.addListener((tabId) => {
    processedTabs.delete(tabId);
});
