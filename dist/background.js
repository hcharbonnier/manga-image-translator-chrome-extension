// Set to keep track of tabs that have already been processed
const processedTabs = new Set();
const processingList = new Set();

// Retrieve quickSettings from chrome.storage.sync
let quickSettings = {};
chrome.storage.sync.get("quickSettings", (data) => {
    if (chrome.runtime.lastError) {
        chrome.storage.sync.set({ quickSettings });
    } else {
        Object.assign(quickSettings, data.quickSettings);
    }
    if (!quickSettings.enabledWebsites) {
        quickSettings.enabledWebsites = {};
    }
});

// Retrieve advancedSettings from chrome.storage.sync
let advancedSettings = {};
chrome.storage.sync.get("advancedSettings", (data) => {
    if (chrome.runtime.lastError) {
        console.error(
            `Error retrieving advancedSettings: ${chrome.runtime.lastError.message}`
        );
    } else {
        Object.assign(advancedSettings, data.advancedSettings);
    }
});
if (Object.keys(advancedSettings).length === 0) {
    advancedSettings = {
        detector: {
            detector: "ctd",
            detection_size: 1536,
            text_threshold: 0.5,
            det_rotate: false,
            det_auto_rotate: false,
            det_invert: false,
            det_gamma_correct: false,
            box_threshold: 0.7,
            unclip_ratio: 2.3,
        },
        colorizer: {
            colorizer: "none",
            colorization_size: 3200,
            denoise_sigma: 0,
        },
        inpainter: {
            inpainter: "default",
            inpainting_size: 1024,
            inpainting_precision: "fp32",
        },
        ocr: {
            use_mocr_merge: false,
            ocr: "48px",
            min_text_length: 0,
            ignore_bubble: 0,
        },
        render: {
            renderer: "default",
            alignment: "auto",
            disable_font_border: false,
            font_size_offset: 0,
            font_size_minimum: 15,
            direction: "auto",
            uppercase: false,
            lowercase: false,
            gimp_font: "Sans-serif",
            no_hyphenation: false,
            font_color: null,
            line_spacing: null,
            font_size: 0,
        },
        translator: {
            translator: "nllb_big",
            target_lang: "ENG",
            no_text_lang_skip: true,
            skip_lang: null,
            gpt_config: null,
            translator_chain: null,
            selective_translation: null,
        },
        upscale: {
            upscaler: "waifu2x",
            revert_upscaling: false,
            upscale_ratio: 0,
        },
        kernel_size: 3,
        mask_dilation_offset: 0,
        disable_cache: false,
        processing_cache_ttl: 60,
    };
    //chrome.storage.sync.set({ advancedSettings });
}

function sendMessage(type, data, port) {
    port.postMessage({ type, data });
}

// Function to update the extension icon based on the current tab
function updateIcon(tabId) {
    chrome.tabs.get(tabId, (tab) => {
        if (!tab) return;

        const domain = new URL(tab.url).hostname;
        const isEnabled = quickSettings.enabledWebsites[domain] || false;
        const iconPath = isEnabled
            ? "icons/128x128.png"
            : "icons/128x128-disabled.png";

        chrome.action.setIcon({ path: iconPath, tabId });
    });
}

// Function to  update the extension icon based on the current tab
chrome.tabs.onActivated.addListener(function (activeInfo) {
    try {
        updateIcon(activeInfo.tabId);
    } catch (error) {
        console.error("Error updating icon on tab activation:", error);
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
    if (areaName === "sync" && changes.quickSettings) {
        quickSettings = changes.quickSettings.newValue;
    }
    if (areaName === "sync" && changes.advancedSettings) {
        advancedSettings = changes.advancedSettings.newValue;
    }
});

function updateRefreshIconVisibility(visible) {
    chrome.storage.local.set({ refreshIconVisible: visible }, function () {
        if (visible) {
            chrome.action.setBadgeText({ text: "1" });
        } else {
            chrome.action.setBadgeText({ text: "" });
        }
    });
    chrome.runtime.sendMessage({ type: "updateRefreshIcon", visible: visible });
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

async function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob); // Converts to Base64 string
    });
}

async function processApiResponse(
    response,
    originalSrc,
    imgBlob,
    cacheKeys,
    port
) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = new Uint8Array();

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const newBuffer = new Uint8Array(buffer.length + value.length);
        newBuffer.set(buffer);
        newBuffer.set(value, buffer.length);
        buffer = newBuffer;

        while (buffer.length >= 5) {
            const dataSize = new DataView(buffer.buffer).getUint32(1, false);
            const totalSize = 5 + dataSize;
            if (buffer.length < totalSize) break;

            const statusCode = buffer[0];
            const data = buffer.slice(5, totalSize);
            const decodedData = decoder.decode(data);

            if (statusCode === 0) {
                const responseBlob = new Blob([data], {
                    type: "application/octet-stream",
                });
                const arrayBuffer = await responseBlob.arrayBuffer();
                const uint8Array = new Uint8Array(arrayBuffer);

                starttime = performance.now();
                const base64Data = await blobToBase64(responseBlob);
                // write to cache, so content script can retrieve it

                for (const cacheKey of cacheKeys)
                    await chrome.storage.local.set({ [cacheKey]: base64Data });

                //log time to send message
                starttime = performance.now();
                const response = sendMessage(
                    "translationResult",
                    { originalSrc, cacheKeys },
                    port
                );
            } else if (statusCode >= 1 && statusCode <= 4) {
                const response = sendMessage(
                    "updateTranslationProgress",
                    { originalSrc, decodedData },
                    port
                );
            }
            buffer = buffer.slice(totalSize);
        }
    }
}

let db;
const request = indexedDB.open("ProcessingCacheDB", 1);

request.onupgradeneeded = (event) => {
    db = event.target.result;
    if (!db.objectStoreNames.contains("processingCache")) {
        db.createObjectStore("processingCache", { keyPath: "cacheKey" });
    }
};

request.onsuccess = (event) => {
    db = event.target.result;
};

request.onerror = (event) => {
    console.error("IndexedDB error:", event.target.errorCode);
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "setBadgeText") {
        chrome.action.setBadgeText({ text: message.text }, () => {
            if (chrome.runtime.lastError) {
                console.error(
                    "Error setting badge text:",
                    chrome.runtime.lastError
                );
            }
        });
    } else if (message.type === "settings-updated") {
        chrome.storage.sync.get(null, (newItems) => {
            quickSettings = newItems.quickSettings || quickSettings;
            advancedSettings = newItems.advancedSettings || advancedSettings;
            updateRefreshIconVisibility(true);
        });
    } else if (message.type === "hideRefreshIcon") {
        updateRefreshIconVisibility(false);
    } else if (message.type === "reloadCurrentTab") {
        chrome.tabs.query(
            { active: true, currentWindow: true },
            function (tabs) {
                chrome.tabs.reload(tabs[0].id, function () {
                    updateRefreshIconVisibility(false);
                });
            }
        );
    } else if (message.type === "settings-modified") {
        updateRefreshIconVisibility(true);
    } else if (message.type === "fetchImage") {
        downloadQueue.push({ url: message.url, sendResponse });
        processDownloadQueue();
        return true; // Keep the message channel open for sendResponse
    } else if (message.type === "getStorageData") {
        const keys = message.keys;
        chrome.storage.sync.get(keys, (data) => {
            sendResponse(data);
        });
        return true; // Keep the message channel open for sendResponse
    }
    return true; // Ensure the message channel is kept open for all cases
});

// Listener for web navigation to handle page navigation
chrome.webNavigation.onBeforeNavigate.addListener(
    (details) => {
        const tabId = details.tabId;
        if (processedTabs.has(tabId)) {
            processedTabs.delete(tabId);
        }
    },
    { url: [{ schemes: ["http", "https"] }] }
);

// Listener for tab removal to clean up processedTabs set
chrome.tabs.onRemoved.addListener((tabId) => {
    processedTabs.delete(tabId);
});

async function submitImageToApi(apiUrl, imageBlob, config, originalSrc, imageType, cacheKeys, port) {
    if (! cacheKeys)
        cacheKeys = [originalSrc];
    for (const cacheKey of cacheKeys){
        if (processingList.has(cacheKey)) {
            sendMessage("updateTranslationProgress", { originalSrc, decodedData: "Already in processing list" }, port);
            sendMessage("translationResult", { originalSrc, cacheKeys }, port);
            return;
        }
    
    }

    //if image is in cache return the result and stop processing
    for (const cacheKey of cacheKeys) {
        const cacheCheckResult = await new Promise((resolve) => {
            chrome.storage.local.get(cacheKey, (res) => resolve(res));
        });
        if (cacheCheckResult[cacheKey]) {
            sendMessage("translationResult", { originalSrc, cacheKeys: cacheKeys }, port);
            return;
        }
    }
    for (const cacheKey of cacheKeys)
        processingList.add(cacheKey);

    if (!imageBlob) {
        return { taskId: "0", status: "error", statusText: "blob is null" };
    }

    const formData = new FormData();
    formData.append("image", imageBlob);
    formData.append("config", JSON.stringify(config));

    const response = await fetch(apiUrl, {
        method: "POST",
        body: formData,
    });

    if (response.ok) {
        await processApiResponse(response, originalSrc, imageBlob, cacheKeys, port);
    } else {
        //send message through connect to content script
        sendMessage("updateTranslationProgress", { originalSrc, decodedData: "Error submitting image\nretry in Capture mode" }, port);
        console.error("Error submitting image:", response.statusText);
    }

    for (const cacheKey of cacheKeys)
        processingList.delete(cacheKey);
}

chrome.runtime.onConnect.addListener((port) => {
    console.log("Connected:", port.name);

    port.onMessage.addListener((message, sender) => {
        switch (message.type) {
            case "submitImage":
                const uint8Array = new Uint8Array(
                    Object.values(message.data.uint8Array)
                );
                const arrayBuffer = uint8Array.buffer; // ✅ Now correctly defined
                const imageBlob = new Blob([arrayBuffer], {
                    type: message.data.imageType,
                }); // Use stored MIME type

                submitImageToApi(
                    message.data.apiUrl,
                    imageBlob,
                    message.data.config,
                    message.data.originalSrc,
                    message.data.imageType,
                    message.data.cacheKeys,
                    port
                );
                break;

            case "getScreenshot":
                async function captureScreenshot(retries = 5) {
                    if (retries === 0) {
                        sendMessage(
                            "getScreenshot_response",
                            {
                                error: "Failed to capture screenshot after multiple attempts",
                            },
                            port
                        );
                        return;
                    }

                    chrome.tabs.captureVisibleTab(
                        null,
                        {},
                        async (screenshotUrl) => {
                            if (chrome.runtime.lastError || !screenshotUrl) {
                                setTimeout(
                                    () => captureScreenshot(retries - 1),
                                    500
                                );
                            } else {
                                await new Promise((resolve) =>
                                    setTimeout(resolve, 500)
                                ); // Wait 10 seconds before sending the response
                                sendMessage(
                                    "getScreenshot_response",
                                    { screenshotUrl },
                                    port
                                );
                            }
                        }
                    );
                }

                captureScreenshot();
                break;

            case "checkProcessingCache":
                if (!message.data.cacheKey) {
                    console.error(
                        "No cacheKey provided for checkProcessingCache"
                    );
                    sendMessage(
                        "checkProcessingCache_response",
                        { cacheKey: null },
                        port
                    );
                    break;
                }

                const transaction = db.transaction(
                    ["processingCache"],
                    "readonly"
                );
                const objectStore = transaction.objectStore("processingCache");
                const request = objectStore.get(message.data.cacheKey);

                request.onsuccess = (event) => {
                    const result = event.target.result;
                    if (
                        result &&
                        (Date.now() - result.timestamp) / 1000 >=
                            advancedSettings.processing_cache_ttl
                    ) {
                        sendMessage(
                            "checkProcessingCache_response",
                            { cacheKey: null },
                            port
                        );
                        return;
                    } else if (
                        result &&
                        result.timestamp >=
                            advancedSettings.mask_dilprocessing_cache_ttlation_offset
                    ) {
                        const transactionRemove = db.transaction(
                            ["processingCache"],
                            "readwrite"
                        );
                        const objectStoreRemove =
                            transactionRemove.objectStore("processingCache");
                        const requestRemove = objectStoreRemove.delete(
                            message.data.cacheKey
                        );
                    }

                    sendMessage(
                        "checkProcessingCache_response",
                        { cacheKey: result ? message.data.cacheKey : null },
                        port
                    );
                };

                request.onerror = (event) => {
                    console.error(
                        "Error checking processing cache:",
                        event.target.errorCode
                    );
                    sendMessage(
                        "checkProcessingCache_response",
                        { cacheKey: null },
                        port
                    );
                };
                break;

            case "storeProcessingKey":
                if (!message.data.processingKey) {
                    console.error(
                        "No processingKey provided for storeProcessingKey"
                    );
                    sendMessage(
                        "storeProcessingKey_response",
                        { success: false },
                        port
                    );
                    break;
                }

                const transactionStore = db.transaction(
                    ["processingCache"],
                    "readwrite"
                );
                const objectStoreStore =
                    transactionStore.objectStore("processingCache");
                const requestStore = objectStoreStore.put({
                    cacheKey: message.data.processingKey,
                    timestamp: message.data.timestamp,
                });

                requestStore.onsuccess = () => {
                    sendMessage(
                        "storeProcessingKey_response",
                        { success: true },
                        port
                    );
                };

                requestStore.onerror = (event) => {
                    console.error(
                        "Error storing processing key:",
                        event.target.errorCode
                    );
                    sendMessage(
                        "storeProcessingKey_response",
                        { success: false },
                        port
                    );
                };
                break;

            case "removeProcessingKey":
                if (!message.data.cacheKey) {
                    console.error(
                        "No cacheKey provided for removeProcessingKey"
                    );
                    sendMessage(
                        "removeProcessingKey_response",
                        { success: false },
                        port
                    );
                    break;
                }

                const transactionRemove = db.transaction(
                    ["processingCache"],
                    "readwrite"
                );
                const objectStoreRemove =
                    transactionRemove.objectStore("processingCache");
                const requestRemove = objectStoreRemove.delete(
                    message.data.cacheKey
                );

                requestRemove.onsuccess = () => {
                    sendMessage(
                        "removeProcessingKey_response",
                        { success: true },
                        port
                    );
                };

                requestRemove.onerror = (event) => {
                    console.error(
                        "Error removing processing key:",
                        event.target.errorCode
                    );
                    sendMessage(
                        "removeProcessingKey_response",
                        { success: false },
                        port
                    );
                };
                break;

            case "removeAllProcessingKeys":
                const transactionRemoveAll = db.transaction(
                    ["processingCache"],
                    "readwrite"
                );
                const objectStoreRemoveAll =
                    transactionRemoveAll.objectStore("processingCache");
                const requestRemoveAll = objectStoreRemoveAll.clear();

                requestRemoveAll.onsuccess = () => {
                    sendMessage(
                        "removeAllProcessingKeys_response",
                        { success: true },
                        port
                    );
                };

                requestRemoveAll.onerror = (event) => {
                    console.error(
                        "Error removing all processing keys:",
                        event.target.errorCode
                    );
                    sendMessage(
                        "removeAllProcessingKeys_response",
                        { success: false },
                        port
                    );
                };
                break;

            default:
                console.log("Unknown message type:", message.type);
        }
    });

    // Handle disconnect
    port.onDisconnect.addListener(() => {
        console.log("Port disconnected:", port.name);
    });
});
