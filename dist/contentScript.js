// content script

(async () => {
    let port = chrome.runtime.connect({ name: "MangaTranslator" });

    port.onDisconnect.addListener(() => {
        console.error("Connection lost! Retrying...");
        reconnect();
    });

    function reconnect() {
        setTimeout(() => {
            port = chrome.runtime.connect({ name: "mainConnection" });
            console.log("Reconnected successfully!");
        }, 1000); // Wait 1 second before retrying
    }

    function sendMessage(type, data) {
        port.postMessage({ type, data });
    }

    function sendMessageandWait(type, data, timeout = 5000) {
        return new Promise((resolve, reject) => {
            if (!port) {
                reject(new Error("Port is undefined, connection may be lost"));
                return;
            }

            function handleResponse(response) {
                // console.log("Response received:", response);
                // console.log("Response type:", response.type);
                if (response.type === type + "_response") {
                    // Utilise un type unique pour filtrer les réponses
                    // console.log("Response data:", response.data);
                    port.onMessage.removeListener(handleResponse); // Nettoie le listener
                    resolve(response.data);
                }
            }

            port.onMessage.addListener(handleResponse);
            port.postMessage({ type, data });

            // Timeout pour éviter un blocage infini
            setTimeout(() => {
                port.onMessage.removeListener(handleResponse);
                reject(
                    new Error(`Timeout: No response received for '${type}'`)
                );
            }, timeout);
        });
    }

    port.onMessage.addListener((message) => {
        switch (message.type) {
            case "translationSubmitted":
                const originalSrc = message.data.originalSrc;
                const cacheKey = message.data.cacheKey;

                const uint8Array = new Uint8Array(
                    Object.values(message.data.uint8Array)
                );
                const arrayBuffer = uint8Array.buffer; // ✅ Now correctly defined
                const imageBlob = new Blob([arrayBuffer], {
                    type: "application/octet-stream",
                }); // Use stored MIME type

                const img = document.querySelector(`img[src="${originalSrc}"]`);
                if (img) {
                    const objectUrl = URL.createObjectURL(imageBlob); // Convert Blob to URL
                    img.setAttribute("data-translated", "true"); // Mark image as translated
                    img.setAttribute("data-URLsource", img.src); // Mark image as translated
                    img.setAttribute("data-URLtranslated", objectUrl); // Mark image as translated

                    updateImageSource(img, objectUrl);
                    updateImageSourceSet(img, objectUrl);
                    img.removeAttribute("data-processing");
                    storeBlobInCache(imageBlob, cacheKey);

                    if (!advancedSettings.disable_cache) {
                        checkProcessingCacheForImage(img).then((result) => {
                            sendMessage("removeProcessingKey", {
                                cacheKey: result,
                            });
                        });
                    }
                    hideLoadingSpinner(img);
                }
                break;

            case "updateLoadingSpinner":
                const originalSrcSpinner = message.data.originalSrc;
                const imgSpinner = document.querySelector(
                    `img[src="${originalSrcSpinner}"]`
                );
                hideLoadingSpinner(imgSpinner);
                updateLoadingSpinner(
                    originalSrcSpinner,
                    message.data.decodedData
                );
                break;

            default:
                console.log("Unknown message typea:", message.type);
        }
    });

    function getStorageData(keys) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(
                { type: "getStorageData", keys },
                (response) => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                    } else {
                        resolve(response);
                    }
                }
            );
            return true; // Keep the message channel open for sendResponse
        });
    }

    async function getScreenshot() {
        if (!quickSettings.capture) return null;

        const response = await sendMessageandWait("getScreenshot", null);
        screenshotUrl = response.screenshotUrl;
        return screenshotUrl;
    }

    async function translateImage(image, screenshotUrl = null) {
        hideLoadingSpinner(image);
        showLoadingSpinner(image, "Looking for image in cache");
        // Placeholder for image translation logic
        const rect = image.getBoundingClientRect(); // Get the bounding rectangle of the image. Useful to detect if the image is visible or not
        // Store the original src in a data attribute
        image.dataset.originalSrc = image.src;
        let imgBlob;

        // console.log("AA:" + image.src);
        let cache = advancedSettings.disable_cache
            ? { found: false }
            : await checkCacheForImage(image.src);
        let cacheKey;
        let cache_processing;

        if (!cache.found) {
            try {
                image.setAttribute("data-processing", "true");
                imgBlob = await getImageBlob(image, screenshotUrl);
            } catch (error) {
                console.error("Error getting image blob:", error);
                hideLoadingSpinner(image); // Ensure spinner is hidden on error
                return;
            }
            // console.log("BB:" + image.src);
            // console.log("BB blob size:" + imgBlob.size);

            cache = advancedSettings.disable_cache
                ? { found: false }
                : await checkCacheForImage(imgBlob);

            cacheKey = cache.key;
            // console.log("BB cacheKey:" + cacheKey);

            cache_processing = advancedSettings.disable_cache
                ? null
                : await checkProcessingCacheForImage(image);
            // console.log("BB cache_processing:" + cache_processing);
        }
        hideLoadingSpinner(image);

        if (cache.found) {
            // console.log(cache);
            console.log("Found in cache");

            // Convert base64 to blob URL and use it
            showLoadingSpinner(image, "Getting from cache");
            const base64Data = cache.value;
            const blob = await (await fetch(base64Data)).blob();
            const objectUrl = URL.createObjectURL(blob);
            image.setAttribute("data-translated", "true"); // Mark image as translated
            image.setAttribute("data-URLsource", image.src); // Mark image as translated
            image.setAttribute("data-URLtranslated", objectUrl); // Mark image as translated
            updateImageSource(image, objectUrl);
            updateImageSourceSet(image, objectUrl);
            hideLoadingSpinner(image);
        } else if (cache_processing) {
            console.log("Found in processing cache");
            // Wait until the image is processed
            hideLoadingSpinner(image);
            showLoadingSpinner(
                image,
                "Already processing<br> waiting for result."
            );
            const interval = setInterval(async () => {
                // console.log("CC:" + image.src);
                cache = await checkCacheForImage(imgBlob);
                if (cache.found) {
                    // Change 'result.found' to 'cache.found'
                    clearInterval(interval);
                    const blob = await (await fetch(cache.value)).blob(); // Fetch the blob from the cache value
                    const objectUrl = URL.createObjectURL(blob);
                    image.setAttribute("data-translated", "true"); // Mark image as translated
                    image.setAttribute("data-URLsource", image.src); // Mark image as translated
                    image.setAttribute("data-URLtranslated", objectUrl); // Mark image as translated
                    updateImageSource(image, objectUrl);
                    updateImageSourceSet(image, objectUrl);

                    hideLoadingSpinner(image);
                }
            }, 500); // Check every second
        } else {
            console.log("Not found in cache");
            // Mark the image as being processed
            image.setAttribute("data-processing", "true");
            const processingKey = await generateProcessingCacheKey(image);
            if (!advancedSettings.disable_cache) {
                const timestamp = Date.now();
                await sendMessageandWait("storeProcessingKey", {
                    processingKey,
                    timestamp,
                });
            }
            hideLoadingSpinner(image);
            showLoadingSpinner(image, "Processing");
            try {
                submitImage(image, imgBlob, cacheKey);
                //await processApiResponse(response, image, imgBlob);
            } catch (error) {
                console.error("Error:", error);
            }
        }
    }

    async function getImageBlob(img, screenshotUrl = null) {
        if (quickSettings.capture) {
            // if (isImageFullyVisible(img)) {
            //     return await captureImage(img, screenshotUrl);
            // } else {
            let blob = await captureFullImage(img);
            // console.log("EE:" + blob);
            // console.log("EE blob size:" + blob.size);
            return blob;
            //}
        }
        try {
            return await fetchImageBlob(img);
        } catch (error) {
            try {
                return await fetchImageWithRetry(img.src);
            } catch (error) {
                showLoadingSpinner(img, "Error fetching image");
                return Promise.reject(new Error("All fetch attempts failed"));
            }
        }
    }

    function isImageFullyVisible(img) {
        const rect = img.getBoundingClientRect();
        return rect.top >= 0 && rect.bottom <= window.innerHeight;
    }

    async function fetchImageBlob(img) {
        if (!img.src || !img.src.startsWith("http")) {
            throw new Error("Cannot fetch http* URL or img.src is undefined.");
        }

        const newImg = new Image();
        newImg.crossOrigin = "Anonymous";
        newImg.src = img.src;

        await new Promise((resolve, reject) => {
            newImg.onload = resolve;
            newImg.onerror = reject;
        });

        const canvas = document.createElement("canvas");
        canvas.width = newImg.naturalWidth;
        canvas.height = newImg.naturalHeight;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(newImg, 0, 0, canvas.width, canvas.height);

        return new Promise((resolve, reject) => {
            canvas.toBlob(
                (blob) => {
                    if (blob) {
                        resolve(blob);
                    } else {
                        reject(new Error("Canvas to Blob conversion failed"));
                    }
                },
                "image/jpeg",
                1.0
            );
        });
    }

    async function fetchImageWithRetry(url) {
        if (url.startsWith("chrome://")) {
            return Promise.reject(new Error("Cannot fetch chrome:// URL"));
        }

        const fetchWithRetry = async (urlToFetch) => {
            const response = await fetch(urlToFetch);
            const blob = await response.blob();
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return blob;
        };

        try {
            const blob = await fetchImageInBackground(url);
            return blob;
        } catch (bgerror) {
            try {
                return await fetchWithRetry(url);
            } catch (error) {
                return Promise.reject(new Error("All fetch attempts failed"));
            }
        }
    }

    async function fetchImageInBackground(url) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(
                { type: "fetchImage", url },
                (response) => {
                    if (chrome.runtime.lastError || response.error) {
                        reject(chrome.runtime.lastError || response.error);
                    } else {
                        chrome.storage.local.get(response.key, (data) => {
                            const base64Data = data[response.key];
                            fetch(base64Data)
                                .then((res) => res.blob())
                                .then((blob) => {
                                    // Delete the image from chrome.storage after reading it
                                    chrome.storage.local.remove(
                                        response.key,
                                        () => {
                                            if (chrome.runtime.lastError) {
                                                console.error(
                                                    "Error removing image from storage:",
                                                    chrome.runtime.lastError
                                                );
                                            }
                                            resolve(blob);
                                        }
                                    );
                                })
                                .catch((err) => reject(err));
                        });
                    }
                }
            );
            return true; // Keep the message channel open for sendResponse
        });
    }

    function updateImageSource(image, newSrc) {
        image.src = newSrc;
    }

    function updateImageSourceSet(image, newSrc) {
        const pictureElement = image.parentElement;
        if (pictureElement && pictureElement.tagName === "PICTURE") {
            const sources = pictureElement.getElementsByTagName("source");
            const url = new URL(newSrc);
            const extension = url.pathname.split(".").pop();
            const typeMap = {
                jpg: "image/jpeg",
                jpeg: "image/jpeg",
                png: "image/png",
                webp: "image/webp",
                gif: "image/gif",
                svg: "image/svg+xml",
                avif: "image/avif",
                jxl: "image/jxl",
            };
            const newType = typeMap[extension];
            for (const source of sources) {
                source.srcset = newSrc;
                if (newType) {
                    source.type = newType;
                }
            }
        }
    }

    async function captureImage(img, screenshotUrl) {
        try {
            const rect = img.getBoundingClientRect();
            const devicePixelRatio = window.devicePixelRatio || 1;

            // Clamp coordinates to viewport
            const x = Math.max(0, rect.left);
            const y = Math.max(0, rect.top);
            const maxRight = Math.min(rect.right, window.innerWidth);
            const maxBottom = Math.min(rect.bottom, window.innerHeight);
            const visibleWidth = maxRight - x;
            const visibleHeight = maxBottom - y;

            const image = new Image();
            image.src = screenshotUrl;
            await new Promise((resolve, reject) => {
                image.onload = resolve;
                image.onerror = reject;
            });

            if (image.width === 0 || image.height === 0) {
                throw new Error("Invalid image dimensions");
            }

            const canvas = document.createElement("canvas");
            canvas.width = image.width;
            canvas.height = image.height;
            const ctx = canvas.getContext("2d");
            ctx.scale(devicePixelRatio, devicePixelRatio);
            ctx.drawImage(
                image,
                0,
                0,
                image.width / devicePixelRatio,
                image.height / devicePixelRatio
            );

            const croppedCanvas = document.createElement("canvas");
            croppedCanvas.width = visibleWidth * devicePixelRatio;
            croppedCanvas.height = visibleHeight * devicePixelRatio;
            const croppedCtx = croppedCanvas.getContext("2d");
            croppedCtx.drawImage(
                canvas,
                x * devicePixelRatio,
                y * devicePixelRatio,
                visibleWidth * devicePixelRatio,
                visibleHeight * devicePixelRatio,
                0,
                0,
                visibleWidth * devicePixelRatio,
                visibleHeight * devicePixelRatio
            );

            return new Promise((resolve) => {
                croppedCanvas.toBlob(resolve, "image/jpeg", 1.0);
            });
        } catch (error) {
            console.error("Error capturing image:", error);
            return Promise.reject(error);
        }
    }

    async function captureFullImage(img) {
        console.log("Starting captureFullImage for:", img.src);
        const rect = img.getBoundingClientRect();
        const devicePixelRatio = window.devicePixelRatio || 1;
        const totalHeight = rect.height;
        const totalWidth = rect.width;
        let capturedHeight = 0;
        const canvas = document.createElement("canvas");
        canvas.width = totalWidth * devicePixelRatio;
        canvas.height = totalHeight * devicePixelRatio;
        const ctx = canvas.getContext("2d");

        // Scroll the image to the top of the screen if possible
        window.scrollTo(0, rect.top + window.scrollY);
        await new Promise((resolve) => setTimeout(resolve, 50)); // Wait for scroll to complete

        while (capturedHeight < totalHeight) {
            console.log(`Capturing screenshot at height: ${capturedHeight}`);

            // Hide spinner and its text before taking screenshot
            const spinnerId = img.dataset.loadingDivId;
            const spinner = document.getElementById(spinnerId);
            const spinnerText = document.getElementById(`${spinnerId}-text`);
            if (spinner) {
                spinner.style.display = "none";
            }
            if (spinnerText) {
                spinnerText.style.display = "none";
            }

            // Wait 50ms after hiding the spinner
            await new Promise((resolve) => setTimeout(resolve, 50));

            const screenshotUrl = await getScreenshot();

            // Re-enable spinner and its text after taking screenshot
            if (spinner) {
                spinner.style.display = "flex";
            }
            if (spinnerText) {
                spinnerText.style.display = "flex";
            }

            // Download the full screenshot
            const fullScreenshotBlob = await fetch(screenshotUrl).then((res) =>
                res.blob()
            );

            const partialBlob = await captureImage(img, screenshotUrl);
            const image = new Image();
            image.src = URL.createObjectURL(partialBlob);
            await new Promise((resolve) => {
                image.onload = resolve;
                image.onerror = (error) => {
                    console.error("Error loading partial image:", error);
                    resolve();
                };
            });

            const partialHeightPx = image.height / devicePixelRatio;
            ctx.drawImage(
                image,
                0,
                0,
                totalWidth * devicePixelRatio,
                Math.min(totalHeight - capturedHeight, window.innerHeight) *
                    devicePixelRatio,
                0,
                capturedHeight * devicePixelRatio,
                totalWidth * devicePixelRatio,
                Math.min(totalHeight - capturedHeight, window.innerHeight) *
                    devicePixelRatio
            );

            capturedHeight += partialHeightPx; // Replaced window.innerHeight
            if (capturedHeight < totalHeight) {
                window.scrollBy(0, window.innerHeight);
                await new Promise((resolve) => setTimeout(resolve, 501)); // Wait for scroll to complete & Respect Chrome rate limit
            } else {
                // Crop the part of the image which is already on the previous partial screenshot
                const remainingHeight =
                    totalHeight - capturedHeight + partialHeightPx;
                ctx.drawImage(
                    image,
                    0,
                    partialHeightPx - remainingHeight * devicePixelRatio,
                    totalWidth * devicePixelRatio,
                    remainingHeight * devicePixelRatio,
                    0,
                    capturedHeight * devicePixelRatio -
                        remainingHeight * devicePixelRatio,
                    totalWidth * devicePixelRatio,
                    remainingHeight * devicePixelRatio
                );

                // Additional cropping if we couldn't scroll as much as predicted
                if (capturedHeight > totalHeight) {
                    const excessHeight = capturedHeight - totalHeight;
                    ctx.clearRect(
                        0,
                        totalHeight * devicePixelRatio,
                        totalWidth * devicePixelRatio,
                        excessHeight * devicePixelRatio
                    );
                }
            }
        }

        return new Promise((resolve) => {
            canvas.toBlob(
                (blob) => {
                    resolve(blob);
                },
                "image/jpeg",
                1.0
            );
        });
    }

    async function submitImageToBackground(apiUrl, image, imageBlob, cacheKey) {
        if (!imageBlob) {
            return { taskId: "0", status: "error", statusText: "blob is null" };
        }

        const config = generateConfig(quickSettings, advancedSettings, image);
        const originalSrc = image.src;

        // ✅ Convert Blob to ArrayBuffer and then to Uint8Array
        const arrayBuffer = await imageBlob.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        try {
            const response = await sendMessage("submitImage", {
                apiUrl,
                uint8Array,
                config,
                originalSrc,
                imageType: imageBlob.type,
                cacheKey,
            });
            return response;
        } catch (error) {
            console.error("Error sending message:", error);
            return { taskId: "0", status: "error", statusText: error.message };
        }
    }

    async function calculateBlobHash(blob) {
        const arrayBuffer = await blob.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
        return Array.from(new Uint8Array(hashBuffer))
            .map((byte) => byte.toString(16).padStart(2, "0"))
            .join("");
    }

    function generateConfig(quickSettings, advancedSettings, image) {
        const width = image.naturalWidth;
        const height = image.naturalHeight;
        const detection_size_raw = Math.max(height, width);
        const detection_size = Math.round(detection_size_raw / 2) * 2;
        return {
            detector: {
                detector: advancedSettings.detector.detector,
                detection_size: Math.min(
                    advancedSettings.detector.detection_size,
                    detection_size
                ),
                text_threshold: advancedSettings.detector.text_threshold,
                det_rotate: advancedSettings.det_rotate,
                det_auto_rotate: advancedSettings.det_auto_rotate,
                det_invert: advancedSettings.det_invert,
                det_gamma_correct: advancedSettings.det_gamma_correct,
                box_threshold: advancedSettings.detector.box_threshold,
                unclip_ratio: advancedSettings.detector.unclip_ratio,
            },
            colorizer: {
                colorization_size: advancedSettings.colorizer.colorization_size,
                denoise_sigma: advancedSettings.colorizer.denoise_sigma,
                colorizer: quickSettings.colorize ? "mc2" : "none",
            },
            inpainter: {
                inpainter: advancedSettings.inpainter.inpainter,
                inpainting_size: advancedSettings.inpainter.inpainting_size,
                inpainting_precision:
                    advancedSettings.inpainter.inpainting_precision,
            },
            ocr: {
                use_mocr_merge: advancedSettings.ocr.use_mocr_merge,
                ocr: advancedSettings.ocr.ocr,
                min_text_length: advancedSettings.ocr.min_text_length,
                ignore_bubble: advancedSettings.ocr.ignore_bubble,
            },
            render: {
                renderer: advancedSettings.render.renderer,
                alignment: advancedSettings.render.alignment,
                disable_font_border:
                    advancedSettings.render.disable_font_border,
                font_size_offset: advancedSettings.render.font_size_offset,
                font_size_minimum: advancedSettings.render.font_size_minimum,
                direction: advancedSettings.render.direction,
                uppercase: advancedSettings.render.uppercase,
                lowercase: advancedSettings.render.lowercase,
                gimp_font: advancedSettings.render.gimp_font,
                no_hyphenation: advancedSettings.render.no_hyphenation,
                font_color: advancedSettings.render.font_color || null,
                line_spacing: advancedSettings.render.line_spacing || null,
                font_size: advancedSettings.render.font_size || null,
            },
            translator: {
                translator: advancedSettings.translator.translator,
                target_lang: quickSettings.target_language,
                no_text_lang_skip:
                    advancedSettings.translator.no_text_lang_skip,
                skip_lang: null,
                gpt_config: null,
                translator_chain: null,
                selective_translation: null,
            },
            upscale: {
                upscaler: advancedSettings.upscale.upscaler,
                revert_upscaling: advancedSettings.upscale.revert_upscaling,
                upscale_ratio: advancedSettings.upscale.upscale_ratio,
            },
            kernel_size: advancedSettings.kernel_size,
            mask_dilation_offset: advancedSettings.mask_dilation_offset,
        };
    }

    // Function to check if an image should be translated
    function shouldTranslateImage(image) {
        //showLoadingSpinner(image, 'Analyzing image');

        const min_pixel_count = 700000;
        const width = image.naturalWidth;
        const height = image.naturalHeight;
        const nb_pixels = width * height; // Check if image size is greater than 500,000 pixels

        res = true;

        // Check if the image or its parent has display: none
        let element = image;
        while (element) {
            if (getComputedStyle(element).display === "none") {
                res = false;
                break;
            }
            element = element.parentElement;
        }

        if (nb_pixels < min_pixel_count && nb_pixels > 0) {
            res = false;
        }
        if (image.src.startsWith("chrome://")) {
            res = false;
        }
        if (
            image.hasAttribute("data-translated") &&
            image.getAttribute("data-URLtranslated") === image.src
        ) {
            res = false;
        }
        if (
            image.hasAttribute("data-translated") &&
            image.getAttribute("data-URLsource") === image.src
        ) {
            res = false;
        }

        if (
            image.hasAttribute("data-processing") &&
            image.getAttribute("data-processing") == true
        ) {
            res = false;
        }

        //hideLoadingSpinner(image);
        return res;
    }

    // Function to process new images
    async function processNewImages(images, screenshotUrl) {
        if (!Array.isArray(images)) {
            images = Array.from(images);
        }

        if (quickSettings.capture) {
            for (const image of images) {
                if (image.src) {
                    if (shouldTranslateImage(image)) {
                        if (image.complete) {
                            // console.log("DDa:" + image.src);
                            await translateImage(image, screenshotUrl);
                        } else {
                            // console.log("DDb:" + image.src);
                            image.onload = async () => {
                                await translateImage(image, screenshotUrl);
                            };
                        }
                    } else {
                        console.log(
                            "Image does not meet the criteria for translation:" +
                                image.src
                        );
                    }
                }
            }
        } else {
            const promises = images.map(async (image) => {
                if (shouldTranslateImage(image)) {
                    if (image.complete) {
                        translateImage(image, screenshotUrl);
                    } else {
                        translateImage(image, screenshotUrl);
                    }
                } else {
                    console.log(
                        "Image does not meet the criteria for translation:" +
                            image.src
                    );
                }
            });
            await Promise.all(promises);
        }
    }

    async function generateCacheKeys(input) {
        // console.log("Generating cache keys for input:", input);
        const settingsHash = await computeSettingsFingerprint(
            quickSettings,
            advancedSettings
        );
        if (input instanceof Blob) {
            const hash = await calculateBlobHash(input);
            return `${hash}_${settingsHash}`;
        } else if (typeof input === "string") {
            const urlObj = new URL(input);
            const domain = urlObj.hostname.split(".").slice(-2).join(".");
            return `${domain}${urlObj.pathname}${urlObj.search}_${settingsHash}`;
        } else {
            throw new Error("Invalid input type");
        }
    }

    async function generateProcessingCacheKey(image) {
        const urlObj = new URL(image.dataset.originalSrc);
        const domain = urlObj.hostname.split(".").slice(-2).join(".");

        const settingsHash = await computeSettingsFingerprint(
            quickSettings,
            advancedSettings
        );
        const cacheKey0 = `processing_${domain}${urlObj.pathname}${urlObj.search}_${settingsHash}`;
        return cacheKey0; // Return a single string instead of an array
    }

    async function checkCacheForImage(input) {
        let cacheKey;
        try {
            cacheKey = await generateCacheKeys(input);
            const result = await retrieveBlobFromCache(cacheKey);
            if (result) {
                const objectUrl = URL.createObjectURL(result);
                return { found: true, key: cacheKey, value: objectUrl };
            }
            return { found: false, key: cacheKey, value: null };
        } catch (error) {
            console.error("Error checking cache for image:", error);
            return { found: false, key: cacheKey, value: null }; // Ensure cacheKey is defined
        }
    }

    async function storeBlobInCache(blob, cacheKey) {
        try {
            const cache = await caches.open("my-cache-manga-translate");
            const response = new Response(blob);
            await cache.put(cacheKey, response);
            // console.log(`Blob stored in cache with key: ${cacheKey}`);
        } catch (error) {
            console.error("Error storing blob in cache:", error);
        }
    }

    async function retrieveBlobFromCache(cacheKey) {
        try {
            const cache = await caches.open("my-cache-manga-translate");
            const response = await cache.match(cacheKey);
            if (response) {
                const blob = await response.blob();
                // console.log(`Blob retrieved from cache with key: ${cacheKey}`);
                return blob;
            } else {
                //console.log(`No cache entry found for key: ${cacheKey}`);
                return null;
            }
        } catch (error) {
            console.error("Error retrieving blob from cache:", error);
            return null;
        }
    }

    async function checkProcessingCacheForImage(image) {
        const cacheKey = await generateProcessingCacheKey(image);
        // console.log("Checking processing cache. key:", cacheKey);
        if (!cacheKey) {
            console.error("Failed to generate cacheKey");
            return null;
        }
        try {
            const response = await sendMessageandWait("checkProcessingCache", {
                cacheKey,
            });
            // console.log("Processing cache response:", response);
            if (response !== undefined) {
                return response.cacheKey;
            } else {
                console.error("Invalid response received:", response);
                return null;
            }
        } catch (error) {
            console.error("Error checking processing cache:", error);
            return null;
        }
    }

    function showLoadingSpinner(img, txt) {
        const rect = img.getBoundingClientRect();
        // Check if the image is within the viewport
        if (
            rect.bottom < 0 ||
            rect.top > window.innerHeight ||
            rect.right < 0 ||
            rect.left > window.innerWidth
        ) {
            return;
        }

        const loadingDiv = document.createElement("div");
        Object.assign(loadingDiv.style, {
            position: "absolute",
            top: `${rect.top + window.scrollY}px`,
            left: `${rect.left + window.scrollX}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 10000,
            pointerEvents: "none", // Ensure the spinner does not block interactions with the image
        });

        const loadingTextDiv = loadingDiv.cloneNode(true);

        loadingDiv.className = "spinner-manga";
        loadingTextDiv.className = "spinner-text-manga";
        loadingDiv.innerHTML = `
        <div style="
        border: 16px solid #f3f3f3;
        border-top: 16px solid #3498db;
        border-radius: 50%;
        width: 120px;
        height: 120px;
        animation: spin 4s linear infinite;
        "></div>
        `;

        loadingTextDiv.innerHTML = `
        <div style="
        color: white;
        text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000;
        ">
        <p>${txt}</p>
        </div>
        `;

        const style = document.createElement("style");
        style.innerHTML = `
        @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
        }
        `;

        img.dataset.loadingDivId = `spinner-${Date.now()}`;
        loadingDiv.id = img.dataset.loadingDivId;
        loadingTextDiv.id = `${img.dataset.loadingDivId}-text`;

        document.body.appendChild(loadingDiv);
        document.body.appendChild(loadingTextDiv);
        document.head.appendChild(style);

        // Add an intersection observer to hide the spinner when the image is not visible
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) {
                    hideLoadingSpinner(img);
                }
            });
        });

        observer.observe(img);

        return loadingDiv;
    }

    function hideLoadingSpinner(img) {
        const loadingDiv = document.getElementById(img.dataset.loadingDivId);
        if (loadingDiv) {
            loadingDiv.remove();
        }

        const loadingTextDiv = document.getElementById(
            `${img.dataset.loadingDivId}-text`
        );
        if (loadingTextDiv) {
            loadingTextDiv.remove();
        }
    }

    function updateLoadingSpinner(originalSrc, message) {
        const img = document.querySelector(`img[src="${originalSrc}"]`);
        if (img) {
            hideLoadingSpinner(img);
            showLoadingSpinner(img, message);
        }
    }
    async function computeSettingsFingerprint(quickSettings, advancedSettings) {
        const quickSettingsString = JSON.stringify(quickSettings);
        const advancedSettingsString = JSON.stringify(advancedSettings);
        const encoder = new TextEncoder();
        const data = encoder.encode(
            quickSettingsString + advancedSettingsString
        );
        const hashBuffer = await crypto.subtle.digest("SHA-256", data);
        return Array.from(new Uint8Array(hashBuffer))
            .map((byte) => byte.toString(16).padStart(2, "0"))
            .join("");
    }

    async function submitImage(img, blob, cacheKey) {
        try {
            const res = await submitImageToBackground(
                `${quickSettings.apiUrl}/translate/with-form/image/stream`,
                img,
                blob,
                cacheKey
            );
            return res;
        } catch (error) {
            hideLoadingSpinner(img);
            return;
        }
    }

    function blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob); // Converts to Base64 string
        });
    }

    async function wait_for_all_images_to_be_loaded(images) {
        // Add spinner to the top left corner
        const spinnerDiv = document.createElement("div");
        Object.assign(spinnerDiv.style, {
            position: "fixed",
            top: "10px",
            left: "10px",
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            color: "white",
            padding: "10px",
            borderRadius: "5px",
            zIndex: 10000,
            fontSize: "14px",
            textAlign: "center",
        });
        spinnerDiv.innerText = "Searching for images to translate...";
        document.body.appendChild(spinnerDiv);

        if (!Array.isArray(images)) {
            images = Array.from(images);
        }
        const promises = images.map((img) => {
            console.log(`Waiting for image: ${img.src}`);
            return new Promise((resolve, reject) => {
                if (img.complete) {
                    checkImageSize(0);
                } else {
                    img.onload = function () {
                        checkImageSize(0);
                    };
                }

                function checkImageSize(i) {
                    if (i > 6) {
                        console.log(`Failed to check image size: ${img.src}`);
                        resolve();
                        return;
                    }
                    let previousWidth = img.naturalWidth;
                    let previousHeight = img.naturalHeight;
                    if (previousWidth === 0 && previousHeight === 0) {
                        setTimeout(() => {
                            checkImageSize(i + 1);
                        }, 50);
                    } else {
                        const interval = setInterval(() => {
                            if (
                                img.naturalWidth === previousWidth &&
                                img.naturalHeight === previousHeight
                            ) {
                                clearInterval(interval);
                                resolve();
                            } else {
                                previousWidth = img.naturalWidth;
                                previousHeight = img.naturalHeight;
                            }
                        }, 50);
                    }
                }
            });
        });
        await Promise.all(promises);

        // Remove spinner after all images are loaded
        spinnerDiv.remove();
    }

    function waitForDomToStabilize(callback) {
        let previousCount = 0;
        const interval = setInterval(() => {
            const images = document.getElementsByTagName("img");
            if (images.length === previousCount) {
                clearInterval(interval);
                console.log(
                    "DOM stabilized, calling wait_for_all_images_to_be_loaded"
                );

                wait_for_all_images_to_be_loaded(images).then(callback);
                console.log("All images loaded and stable");
            } else {
                previousCount = images.length;
            }
        }, 50);
    }

    async function waitForAllImagesToLoad() {
        // console.log("waitForAllImagesToLoad() called");
        const images = Array.from(document.images);
        const timeoutPromise = new Promise((resolve) =>
            setTimeout(resolve, 20000)
        ); // 10 seconds timeout

        await Promise.race([
            Promise.all(
                images.map((img) => {
                    if (img.complete) {
                        return checkImageStability(img);
                    }
                    return new Promise((resolve) => {
                        img.onload = () =>
                            checkImageStability(img).then(resolve);
                        img.onerror = resolve;
                    });
                })
            ),
            timeoutPromise,
        ]);
    }

    function checkImageStability(img) {
        return new Promise((resolve) => {
            let previousWidth = img.naturalWidth;
            let previousHeight = img.naturalHeight;
            const interval = setInterval(() => {
                if (
                    img.naturalWidth === previousWidth &&
                    img.naturalHeight === previousHeight
                ) {
                    clearInterval(interval);
                    resolve();
                } else {
                    previousWidth = img.naturalWidth;
                    previousHeight = img.naturalHeight;
                }
            }, 50);
        });
    }

    const { quickSettings, advancedSettings } = await getStorageData([
        "quickSettings",
        "advancedSettings",
    ]);

    const proxyUrls = [
        "https://api.codetabs.com/v1/proxy/?quest=", //best
        "https://api.cors.lol/?url=", //best
        "https://corsproxy.io/?",
        "https://api.allorigins.win/raw?url=", //slow
    ];

    const domain = window.location.host;

    if (quickSettings.enabledWebsites[domain]) {
        console.log(`Starting translation process for domain: ${domain}`);

        waitForDomToStabilize(async () => {
            console.log(
                "Initializing MutationObserver and processing existing images"
            );

            // Process existing images on page load
            const existingImages = document.querySelectorAll("img");
            if (existingImages.length != 0) {
                console.log(
                    `Processing ${existingImages.length} existing images`
                );
                //const screenshotUrl = await getScreenshot();
                const screenshotUrl = null;
                await processNewImages(existingImages, screenshotUrl);
            }

            // Wait for all images to load before sending the screenshot request
            console.log("Existing images processed, starting MutationObserver");

            // Mutation observer to detect new images
            const observer = new MutationObserver(async (mutations) => {
                let newImages = [];
                for (const mutation of mutations) {
                    if (mutation.type === "childList") {
                        for (const node of mutation.addedNodes) {
                            if (node.tagName === "IMG") {
                                newImages.push(node);
                            } else if (node.querySelectorAll) {
                                newImages.push(
                                    ...Array.from(node.querySelectorAll("img"))
                                );
                            }
                        }
                    } else if (
                        mutation.type === "attributes" &&
                        mutation.attributeName === "src" &&
                        mutation.target.tagName === "IMG" &&
                        shouldTranslateImage(mutation.target)
                    ) {
                        console;
                        newImages.push(mutation.target);
                    }
                }

                //Buggy with capture for now
                if (newImages.length != 0) {
                    console.log(
                        `Detected ${newImages.length} new or modified images`
                    );
                    await waitForAllImagesToLoad();
                    //const screenshotUrl = await getScreenshot();
                    const screenshotUrl = null;
                    await processNewImages(newImages, screenshotUrl);
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ["src"],
            });
        });
    }

    chrome.runtime.onMessage.addListener(
        async (message, sender, sendResponse) => {
            if (message.type === "purgeCache") {
                caches.delete("my-cache-manga-translate").then((success) => {
                    if (success) {
                        console.log("Cache purged successfully");
                    } else {
                        console.log("Cache purge failed");
                        caches.keys().then((keys) => {
                            console.log("Cache keys:", keys);
                        });
                    }

                    sendMessage("removeAllProcessingKeys", {});
                });
            }
        }
    );
})();
