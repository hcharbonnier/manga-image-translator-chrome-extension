(async () => {
    let mainMessageBoxID = "mainMessageBox";
    let keyboardDisabled = false;
    let port = chrome.runtime.connect({ name: "MangaTranslator" });
    let mainObserverStarted = false;
    let observer;
    let imagesToCapture = [];
    let imagesCaptured = [];
    let translatedCapturedImages = [];

    function disableKeyboard() {
        if (!keyboardDisabled) {
            document.addEventListener("keydown", preventKeyAction);
            keyboardDisabled = true;
            console.log("Keyboard disabled.");
        }
    }

    function enableKeyboard() {
        if (keyboardDisabled) {
            document.removeEventListener("keydown", preventKeyAction);
            keyboardDisabled = false;
            console.log("Keyboard enabled.");
        }
    }

    function preventKeyAction(event) {
        event.preventDefault();
    }

    port.onDisconnect.addListener(() => {
        console.error("Connection lost! Retrying...");
        reconnect();
    });

    function reconnect() {
        setTimeout(() => {
            port = chrome.runtime.connect({ name: "mainConnection" });
            console.log("Reconnected successfully!");
        }, 500); // Wait 0.5 second before retrying
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
                if (response.type === type + "_response") {
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

    port.onMessage.addListener(async (message) => {
        switch (message.type) {
            case "translationResult":
                const originalSrc = message.data.originalSrc;
                const cacheKeys = message.data.cacheKeys;
                const startTime = Date.now();

                async function fetchImageResult() {
                    //look if a cachekey in cacheKeys is in the cache
                    for (const cacheKey of cacheKeys) {
                        const result = await new Promise((resolve, reject) => {
                            chrome.storage.local.get(cacheKey, (data) => {
                                if (data[cacheKey]) {
                                    resolve(data[cacheKey]);
                                } else {
                                    reject(new Error("Image result not found"));
                                }
                            });
                        });
                        return result;
                    }
                }

                async function retryFetchImageResult() {
                    const timeout = advancedSettings.processing_cache_ttl * 1000;
                    const interval = 500;
                    const endTime = startTime + timeout;

                    while (Date.now() < endTime) {
                        try {
                            const result = await fetchImageResult();
                            return result;
                        } catch (error) {
                            await new Promise((resolve) => setTimeout(resolve, interval));
                        }
                    }
                    throw new Error("Timeout: Image result not found");
                }

                try {

                    const result = await retryFetchImageResult();
                    const imageBlob = await (await fetch(result)).blob();
                    const objectUrl = URL.createObjectURL(imageBlob);
                    let list_src = document.querySelectorAll(`img[src="${originalSrc}"]`);
                    list_original_src = document.querySelectorAll(`img[data-original-src="${originalSrc}"]`);

                    all_images = document.querySelectorAll("img");
                    //real_image contient l'image réelle, pas le placeholder
                    real_image = list_original_src.length > 0 ? list_original_src : list_src;
                    img = real_image[0];
                    if (img) {
                        img.setAttribute("imagetranslated", "true");
                        img.setAttribute("sourceURL", img.src);
                        img.setAttribute("translatedURL", objectUrl);
                        translatedCapturedImages.push({img: img, objectUrl: objectUrl});
                        for (const cacheKey of cacheKeys)
                            storeBlobInCache(imageBlob, cacheKey);
                        //delete cacheKey from storage after 2s, but don't wait for it to finish
                        setTimeout(() => {
                            for (const cacheKey of cacheKeys)
                                chrome.storage.local.remove(cacheKey);
                        }, 2000);
                    }
                    deleteMessagebox(originalSrc);
                } catch (error) {
                    console.error("Error fetching image result:", error);
                }
                break;

            case "updateTranslationProgress":
                const imgSpinner = document.querySelector(
                    `img[data-original-src="${message.data.originalSrc}"]`
                );
                var message_txt =
                    message.data.decodedData != "finished"
                        ? message.data.decodedData
                        : "Fetching result";

                // if message_txt is castable as an integer, it's the prosition in queue
                if (!isNaN(parseInt(message_txt))) {
                    message_txt = `Position in queue: ${message_txt}`;
                }
                
                messagebox({
                    txt: message_txt,
                    img: imgSpinner,
                    id: imgSpinner.src,
                });
                break;

            default:
                console.log("Unknown message type:", message.type);
        }
    });

    function getImageCoveringPixels(imgElement, side) {
        const rect = imgElement.getBoundingClientRect();
        const imgHeight = rect.height;
        const imgWidth = rect.width;
    
        switch (side) {
            case "top":
                if (rect.top >= 0) return 0; // Fully visible
                return Math.min(-rect.top, imgHeight); // Partially visible, return hidden pixels within viewport
    
            case "bottom":
                if (rect.bottom <= window.innerHeight) return 0; // Fully visible
                return Math.min(rect.bottom - window.innerHeight, imgHeight); // Partially visible, return hidden pixels within viewport
    
            case "left":
                if (rect.left >= 0) return 0; // Fully visible
                return Math.min(-rect.left, imgWidth); // Partially visible, return hidden pixels within viewport
    
            case "right":
                if (rect.right <= window.innerWidth) return 0; // Fully visible
                return Math.min(rect.right - window.innerWidth, imgWidth); // Partially visible, return hidden pixels within viewport
    
            default:
                throw new Error("Invalid side parameter. Use 'top', 'bottom', 'left', or 'right'.");
        }
    }

    function getHiddenPixels(img, side) {
        if (!img || !["top", "bottom", "left", "right"].includes(side)) return null;
    
        const rect = img.getBoundingClientRect();
        const viewport = {
            width: window.innerWidth,
            height: window.innerHeight
        };
    
        const step = 1; // Step size for scanning pixels
        let hiddenPixels = 0;
    
        // Function to check if a point is within the viewport
        function isInViewport(x, y) {
            return x >= 0 && x < viewport.width && y >= 0 && y < viewport.height;
        }
    
        // Function to check if a point is covered
        function isCovered(x, y) {
            if (!isInViewport(x, y)) return false; // Ignore out-of-viewport pixels
            const element = document.elementFromPoint(x, y);
            return element && element !== img && !img.contains(element);
        }
    
        if (side === "top") {
            for (let y = rect.top; y < rect.bottom; y += step) {
                if (isInViewport(rect.left + rect.width / 2, y) && isCovered(rect.left + rect.width / 2, y)) {
                    hiddenPixels++;
                } else {
                    break;
                }
            }
        } else if (side === "bottom") {
            for (let y = rect.bottom; y > rect.top; y -= step) {
                if (isInViewport(rect.left + rect.width / 2, y) && isCovered(rect.left + rect.width / 2, y)) {
                    hiddenPixels++;
                } else {
                    break;
                }
            }
        } else if (side === "left") {
            for (let x = rect.left; x < rect.right; x += step) {
                if (isInViewport(x, rect.top + rect.height / 2) && isCovered(x, rect.top + rect.height / 2)) {
                    hiddenPixels++;
                } else {
                    break;
                }
            }
        } else if (side === "right") {
            for (let x = rect.right; x > rect.left; x -= step) {
                if (isInViewport(x, rect.top + rect.height / 2) && isCovered(x, rect.top + rect.height / 2)) {
                    hiddenPixels++;
                } else {
                    break;
                }
            }
        }
        return hiddenPixels;
    }

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
        let messageboxID = messagebox({
            txt: "Fetching source image",
            img: image,
            id: image.src,
        });
        // Get the bounding rectangle of the image. Useful to detect if the image is visible or not
        const rect = image.getBoundingClientRect();
        // Store the original src in a data attribute
        image.dataset.originalSrc = image.src;
        let imgBlob;
        let cache = { found: false }
        let cacheKeys;

        if (quickSettings.capture) {
            cacheKeys = advancedSettings.disable_cache ? null : await generateCacheKeys({ src: image.dataset.originalSrc });
        } else {
            imgBlob = await getImageBlob(image, screenshotUrl);
            cacheKeys = advancedSettings.disable_cache ? null : await generateCacheKeys({ src: image.src ,  blob: imgBlob});
        }

        //check if one of the cache keys is in the cache
        cache = advancedSettings.disable_cache
                ? { found: false }
                : await checkCacheForImage(cacheKeys);

        if (cache.found) {
            // Convert base64 to blob URL and use it
            messagebox({
                txt: "Getting from cache",
                img: image,
                id: image.src,
            });
            const base64Data = cache.value;
            const blob = await (await fetch(base64Data)).blob();
            const objectUrl = URL.createObjectURL(blob);
            image.setAttribute("imagetranslated", "true"); // Mark image as translated
            image.setAttribute("sourceURL", image.src); // Keep trace of the original source
            image.setAttribute("translatedURL", objectUrl); // Keep trace of the translated source
            updateImageSource(image, objectUrl);
            updateImageSourceSet(image, objectUrl);
            deleteMessagebox(image.dataset.originalSrc);
        } else {
            if (quickSettings.capture) {
                try {
                    hideDiv(messageboxID);
                    hideDiv(mainMessageBoxID);
                    imgBlob = await getImageBlob(image, screenshotUrl);
                    showDiv(messageboxID);
                    showDiv(mainMessageBoxID);
                } catch (error) {
                    console.error("Error getting image blob:", error);
                    deleteMessagebox(image.dataset.originalSrc);
                    return;
                }
            }
            
            messagebox({
                txt: "Processing...",
                img: image,
                id: image.src,
            });

            try {
                submitImage(image, imgBlob, cacheKeys);
            } catch (error) {
                console.error("Error:", error);
            }
        }
    }

    async function getImageBlob(img, screenshotUrl = null) {
        if (quickSettings.capture) {
            let capturedImage
            imagesToCapture.push(img);
            while (imagesCaptured[img.src] === undefined) {
                await new Promise((resolve) => setTimeout(resolve, 100));
            }
            capturedImage = imagesCaptured[img.src];
            imagesCaptured[img.src]=undefined;

            return capturedImage;
        }

        try {
            return await fetchImageBlob(img);
        } catch (error) {
            try {
                return await fetchImageWithRetry(img.src);
            } catch (error) {
                messagebox(
                    "Error fetching image",
                    null,
                    null,
                    img,
                    0,
                    0,
                    img.src
                );
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

    async function captureImage(img, screenshotUrl, crop_px = 0, crop_side = false) {
        try {
            const rect = img.getBoundingClientRect();
            const devicePixelRatio = window.devicePixelRatio || 1;

            // Clamp coordinates to viewport
            let x = Math.max(0, rect.left);
            let y = Math.max(0, rect.top);
            let maxRight = Math.min(rect.right, window.innerWidth);
            let maxBottom = Math.min(rect.bottom, window.innerHeight);
            let visibleWidth = maxRight - x;
            let visibleHeight = maxBottom - y;

            // Adjust coordinates based on crop_px and crop_side
            if (crop_px > 0) {
                switch (crop_side) {
                    case "top":
                        y += crop_px;
                        visibleHeight -= crop_px;
                        break;
                    case "bottom":
                        visibleHeight -= crop_px;
                        break;
                    case "left":
                        x += crop_px;
                        visibleWidth -= crop_px;
                        break;
                    case "right":
                        visibleWidth -= crop_px;
                        break;
                    default:
                        throw new Error("Invalid crop_side parameter. Use 'top', 'bottom', 'left', or 'right'.");
                }
            }

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

    async function captureFullImageWorker() {
        setInterval(async () => {
            let img;
            // Check if there are any images to capture
            if (imagesToCapture.length === 0) {
                return;
            }

            // Get the next image to capture
            img = imagesToCapture.shift();
            console.log("Capturing image:", img.src);

            // Disable scrolling, keyboard, and scrollbar
            disableScrolling();
            disableKeyboard();
            //disableScrollbar();

            const rect = img.getBoundingClientRect();
            const devicePixelRatio = window.devicePixelRatio || 1;
            const totalHeight = rect.height;
            const totalWidth = rect.width;
            let capturedHeight = 0;

            // Create a canvas to draw the captured image
            const canvas = document.createElement("canvas");
            canvas.width = totalWidth * devicePixelRatio;
            canvas.height = totalHeight * devicePixelRatio;
            const ctx = canvas.getContext("2d");
            let topHiddenPixels;

            // Add a page mask and message box
            const pageMaskID = addPageMask();
            const messageBoxID = messagebox({
                txt: "Capturing images...",
            });

            // Scroll the image to the top of the screen if possible
            const wantToScroll = rect.top + window.scrollY;
            window.scrollTo(0, wantToScroll);
            console.log("AAA_Want to scroll:", wantToScroll);
            topHiddenPixels = getHiddenPixels(img, "top");
            await waitUntilScrollCompletes(wantToScroll);
            await new Promise((resolve) => setTimeout(resolve, 200));

            // If image is partially hidden at the top, scroll to reveal the top part (ie: hidden by a menu)

            console.log("AAA_Capturing image:", img.src);
            // Capture the image in parts
            while (capturedHeight < totalHeight) {
                console.log("AAA_Continuing, captured not finished for image:", img.src);

                hideDiv(pageMaskID);
                hideDiv(messageBoxID);

                // Wait 50ms after hiding the spinner
                await new Promise((resolve) => setTimeout(resolve, 50));
                const screenshotUrl = await getScreenshot();

                showDiv(pageMaskID);
                showDiv(messageBoxID);

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
                    Math.min(totalHeight - capturedHeight, window.innerHeight) * devicePixelRatio,
                    0,
                    capturedHeight * devicePixelRatio,
                    totalWidth * devicePixelRatio,
                    Math.min(totalHeight - capturedHeight, window.innerHeight) * devicePixelRatio
                );

                capturedHeight += partialHeightPx; // Replaced window.innerHeight
                if (capturedHeight < totalHeight) {
                    window.scrollBy(0, window.innerHeight);
                } else {
                    await new Promise((resolve) => setTimeout(resolve, 501)); // Wait for scroll to complete & Respect Chrome rate limit
                    // Crop the part of the image which is already on the previous partial screenshot
                    const remainingHeight = totalHeight - capturedHeight + partialHeightPx;
                    ctx.drawImage(
                        image,
                        0,
                        partialHeightPx - remainingHeight * devicePixelRatio,
                        totalWidth * devicePixelRatio,
                        remainingHeight * devicePixelRatio,
                        0,
                        capturedHeight * devicePixelRatio - remainingHeight * devicePixelRatio,
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

            // Restore scrolling, keyboard, and scrollbar
            restoreScrolling();
            enableKeyboard();
            enableScrollbar();
            removePageMask(pageMaskID);
            deleteMessagebox(messageBoxID);

            // Store the captured image
            imagesCaptured[img.src] = new Promise((resolve) => {
                canvas.toBlob(resolve, "image/jpeg", 1.0);
            });
        }, 100);
    }

    async function submitImageToBackground(apiUrl, image, imageBlob, cacheKeys) {
        if (!imageBlob) {
            return { taskId: "0", status: "error", statusText: "blob is null" };
        }

        const config = generateConfig(quickSettings, advancedSettings, image);
        const originalSrc = image.src;

        const arrayBuffer = await imageBlob.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        try {
            const response = await sendMessage("submitImage", {
                apiUrl,
                uint8Array,
                config,
                originalSrc,
                imageType: imageBlob.type,
                cacheKeys,
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

        const min_pixel_count = 700000;

        const width = image.naturalWidth;
        const height = image.naturalHeight;
        const nb_pixels = width * height; // Check if image size is greater than 700,000 pixels


        if (! isVisible(image)) { //check hidden tips in style, etc..
            console.log("Image is not visible");
            return false;
        }
        if (image.clientWidth === 0 || image.clientHeight === 0) {
            console.log("Image has 0 width or height");
            return false;
        }
        if (nb_pixels < min_pixel_count) {
            console.log("Image is too small:" + nb_pixels + " pixels");
            return false;
        } else {
            console.log("Image size (" + image.src + "):" + nb_pixels);
        }
        if (image.src.startsWith("chrome://")) {
            return false;
        }
        if (
            image.hasAttribute("imagetranslated") &&
            image.getAttribute("translatedURL") === image.src
        ) {
            console.log("Image has already been translated");
            return false;
        }
        if (
            image.hasAttribute("imagetranslated") &&
            image.getAttribute("sourceURL") === image.src
        ) {
            //should be true? maybe...
            console.error("Image has been translated but sourceURL is the same as src!!");
            return true;
        }

        // Check if the image or its parent has display: none
        let element = image;
        while (element) {
            if (getComputedStyle(element).display === "none") {
                console.log("Image or parent has display: none");
                return false;
            }
            element = element.parentElement;
        }

        return true;
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
                            await translateImage(image, screenshotUrl);
                        } else {
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

                //window.scrollTo(0, 0);
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

    async function generateCacheKeys({ src= null ,  blob=null} = {}) {

        let cacheKeys = [];
        const settingsHash = await computeSettingsFingerprint(
            quickSettings,
            advancedSettings
        );
        if (src) {
            const urlObj = new URL(src);
            const domain = urlObj.hostname.split(".").slice(-2).join(".");
            cacheKeys.push(`${domain}${urlObj.pathname}${urlObj.search}_${settingsHash}`);
        }
        if (blob) {
            //blob = await fetchImageBlob(input);
            const hash = await calculateBlobHash(blob);
            cacheKeys.push(`${hash}_${settingsHash}`);
        }

        return cacheKeys;
    }

    async function checkCacheForImage(cacheKeys) {
        let cacheKey;
        try {
            for (cacheKey of cacheKeys) {
                const result = await retrieveBlobFromCache(cacheKey);
                if (result) {
                    const objectUrl = URL.createObjectURL(result);
                    return { found: true, key: cacheKey, value: objectUrl };
                }
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
                return blob;
            } else {
                return null;
            }
        } catch (error) {
            console.error("Error retrieving blob from cache:", error);
            return null;
        }
    }

    function addPageMask() {
        const mask = document.createElement("div");
        mask.style.position = "fixed";
        mask.style.top = "0";
        mask.style.left = "0";
        mask.style.width = "100%";
        mask.style.height = "100%";
        mask.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
        mask.style.zIndex = "9999";
        mask.id = `mask-${Date.now()}`;
        document.body.appendChild(mask);
        return mask.id;
    }

    function removePageMask(id) {
        const mask = document.getElementById(id);
        if (mask) {
            mask.remove();
        }
    }

    function disableScrollbar() {
        if (mainObserverStarted) observer.disconnect();
        document.body.style.overflow = "hidden"; // Hide scrollbar
        document.body.classList.add("hide-scrollbar");
        const style = document.createElement("style");
        style.innerHTML = `
            .hide-scrollbar::-webkit-scrollbar {
                display: none;
            }
        `;
        style.id = "hide-scrollbar-style";
        document.head.appendChild(style);
        if (mainObserverStarted) startObserver();
    }

    function enableScrollbar() {
        if (mainObserverStarted) observer.disconnect();
        document.body.style.overflow = "";
        document.body.classList.remove("hide-scrollbar");
        const style = document.getElementById("hide-scrollbar-style");
        if (style) {
            style.remove();
        }
        if (mainObserverStarted) startObserver();
    }

    function preventScroll(event) {
        event.preventDefault(); // Block scrolling
    }

    function disableScrolling() {
        window.addEventListener("wheel", preventScroll, { passive: false });
        window.addEventListener("DOMMouseScroll", preventScroll, {
            passive: false,
        }); // Firefox
        window.addEventListener("touchmove", preventScroll, { passive: false }); // Mobile devices
    }

    function restoreScrolling() {
        window.removeEventListener("wheel", preventScroll, { passive: false });
        window.removeEventListener("DOMMouseScroll", preventScroll, {
            passive: false,
        }); // Firefox
        window.removeEventListener("touchmove", preventScroll, {
            passive: false,
        }); // Mobile
    }

    function hideDiv(id) {
        const div = document.getElementById(id);
        if (div) {
            div.style.display = "none";
        }
    }

    function showDiv(id) {
        const div = document.getElementById(id);
        if (div) {
            div.style.display = "block";
        }
    }

    function observeImageVisibility(image, messageboxId) {
        if ('IntersectionObserver' in window) {
            const observer = new IntersectionObserver(entries => {
                entries.forEach(entry => {
                    if (!entry.isIntersecting) {
                        deleteMessagebox(messageboxId);
                        observer.disconnect();
                    }
                });
            });
            observer.observe(image);
        }
    }

    function messagebox({
        txt,
        bg_color = "rgba(0, 0, 0, 0.9)",
        txt_color = "white",
        img = null,
        top = 0,
        left = 0,
        id = `messagebox-${Date.now()}`,
        delay = 0,
    } = {}) {

        if (img) {
            //look for the real image, not the placeholder
            const list_src = document.querySelectorAll(`img[src="${img.src}"]`);
            const list_original_src = document.querySelectorAll(`img[data-original-src="${img.dataset.originalSrc}"]`);

            // console.log("list_src:", list_src);
            // console.log("list_original_src:", list_original_src);
            //real_image contient l'image réelle, pas le placeholder
            const real_image = list_original_src.length > 0 ? list_original_src : list_src;
            img=real_image[0];
            let rect;
            try {
                rect = img.getBoundingClientRect();
            }
            catch (error) {
                console.error("Error getting bounding rect:", error);
                return;
            }
                top = rect.top + window.scrollY; // Adjust top relative to the page
                left = rect.left + window.scrollX; // Adjust left relative to the page
                // top = window.scrollY + top;
                // left = window.scrollX + left
            }

        // si le div existe déjà on met à jour le text
        let messageboxDiv = document.getElementById(id);

        if (messageboxDiv) {
            messageboxDiv.innerText = txt;
        } else {
            messageboxDiv = document.createElement("div");
            Object.assign(messageboxDiv.style, {
                position: "absolute",
                top: `${top}px`,
                left: `${left}px`,
                backgroundColor: bg_color,
                color: txt_color,
                padding: "10px",
                borderRadius: "5px",
                zIndex: 10000,
                fontSize: "14px",
                textAlign: "center",
            });
            messageboxDiv.innerText = txt;
            messageboxDiv.id = id;
            document.body.appendChild(messageboxDiv);
            if (img) {
                observeImageVisibility(img, messageboxDiv.id);
            }
        }
        if (delay > 0) {
            setTimeout(() => {
                deleteMessagebox(messageboxDiv.id);
            }, delay);
        }
        return messageboxDiv.id;
    }

    function deleteMessagebox(id=null) {
        
        if (!id) {
            const messageboxes = document.querySelectorAll("[id^='messagebox-']");
            messageboxes.forEach((messagebox) => {
                messagebox.remove();
            });
            console.error("All messageboxes deleted");
            return;
        }

        const messageboxDiv = document.getElementById(id);
        if (messageboxDiv) {
            messageboxDiv.remove();
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

    async function submitImage(img, blob, cacheKeys) {
        try {
            const res = await submitImageToBackground(
                `${quickSettings.apiUrl}/translate/with-form/image/stream`,
                img,
                blob,
                cacheKeys
            );
            return res;
        } catch (error) {
            deleteMessagebox(img.dataset.originalSrc);
            return;
        }
    }

    function waitForDomToStabilize() {
        return new Promise((resolve) => {
            messagebox({ txt: "Waiting for DOM to stabilize", id: mainMessageBoxID });
            let previousCount = -1;
            const interval = setInterval(() => {
                const images = document.getElementsByTagName("img");
                if (images.length === previousCount) {
                    clearInterval(interval);
                    deleteMessagebox(mainMessageBoxID);
                    wait_for_all_images_to_be_loaded(images).then(() => {
                        resolve();
                    });
                } else {
                    previousCount = images.length;
                }
            }, 50);
        });
    }

    async function wait_for_all_images_to_be_loaded(images) {
        // Add spinner to the top left corner
        if (!Array.isArray(images)) {
            images = Array.from(images);
        }
        const promises = images.map((img) => {
            return new Promise((resolve, reject) => {
                if (img.complete) {
                    checkImageSize(0);
                } else {
                    img.onload = function () {
                        checkImageSize(0);
                    };
                    img.onerror = function () {
                        resolve();
                    }

                    //log images  that are not loaded, nor errored, nor disconnected
                    setTimeout(() => {
                        if (!img.complete && !img.onerror && !img.onDisconnect) {
                            console.log(`Image not loaded: ${img.src}`);
                            resolve();
                        }
                    }, 5000);
                }

                function checkImageSize(i) {
                    console.log(`Checking image size: ${img.src}`);
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
    }

    async function waitForAllImagesToLoad() {
        const images = Array.from(document.images);
        await wait_for_all_images_to_be_loaded(images);
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

    function waitUntilScrollCompletes(targetY, threshold = 2) {
        return new Promise((resolve) => {
            function checkPosition() {
                const currentScrollY = window.scrollY;
                if (Math.abs(currentScrollY - targetY) <= threshold) {
                    resolve();
                } else {
                    const currentScrollY = window.scrollY;
                    requestAnimationFrame(checkPosition);
                }
            }
            checkPosition();
        });
    }

    function isVisible(img) {
        const style = window.getComputedStyle(img);
        return (
            img.offsetWidth > 0 && img.offsetHeight > 0 && // Not zero-sized
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            parseFloat(style.opacity) > 0 &&
            img.getBoundingClientRect().width > 0 // Not clipped out
        );
    }

    function startObserver() {
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["src", "class","style", "hidden"],
        });
        mainObserverStarted = true;
    }

    const domain = window.location.host;
    const { quickSettings, advancedSettings } = await getStorageData([
        "quickSettings",
        "advancedSettings",
    ]);

    async function imageReplacerWorker() {
        setInterval(async () => {
            if (translatedCapturedImages.length === 0) {
                return;
            }
            if (quickSettings.capture && imagesToCapture.length != 0) {
                return;
            }
            const {img, objectUrl} = translatedCapturedImages.shift();
            updateImageSource(img, objectUrl);
            updateImageSourceSet(img, objectUrl);
        }, 10);
    }

    if (quickSettings.enabledWebsites[domain]) {
        // Run the capture function to capture in the background
        captureFullImageWorker();
        imageReplacerWorker();

        console.log(`Starting translation process for domain: ${domain}`);

        await waitForDomToStabilize();

        console.log(
            "Initializing MutationObserver and processing existing images"
        );

        // Process existing images on page load
        const existingImages = document.querySelectorAll("img");
        if (existingImages.length != 0) {
            const screenshotUrl = null;
            await processNewImages(existingImages, screenshotUrl);
        }

        // Mutation observer to detect new images
        observer = new MutationObserver(async (mutations) => {
            let newImages = [];
            for (const mutation of mutations) {
                if (mutation.type === "childList") {
                    for (const node of mutation.addedNodes) {
                        if (node.tagName === "IMG"){
                            newImages.push(node);
                        } else if (node.querySelectorAll) {
                            newImages.push(
                                ...Array.from(node.querySelectorAll("img"))
                            );
                        }
                    }
                }

                if (mutation.type === "attributes") {
                    if (mutation.attributeName === "src" && mutation.target.tagName === "IMG") {
                        newImages.push(mutation.target);
                    } else if (mutation.attributeName === "class" && (mutation.target.tagName === "IMG" || mutation.target.querySelectorAll)){
                        const target = mutation.target;
                        if (target.tagName === "IMG") {
                            newImages.push(target);
                        } else if (target.querySelectorAll) {
                            const images = target.querySelectorAll("img");
                            for (const img of images) {
                                newImages.push(img);
                            }
                        }
                    }
                }                
            }

            //Buggy with capture for now
            if (newImages.length != 0) {
                //deduplicate images
                newImages = newImages.filter((img, index) => newImages.indexOf(img) === index);
                messagebox({ txt: "Processing new image(s)", id: mainMessageBoxID, delay: 3000 });
                await waitForAllImagesToLoad();
                //const screenshotUrl = await getScreenshot();
                const screenshotUrl = null;
                await processNewImages(newImages, screenshotUrl);
            }
        });

        startObserver();
    }

    chrome.runtime.onMessage.addListener(
        (message, sender, sendResponse) => {
            if (message.type === "forceTranslate") {
                let imgsrc=message.data
                const img = document.querySelector(`img[src="${imgsrc}"]`);
                if (imgsrc.startsWith("http")) {
                    console.log("Forcing translation of image:", imgsrc);
                    
                    if (img) {
                        console.log("Forcing translation of image:", imgsrc);
                        translateImage(img, null);
                    } else {
                        console.error("Image not found:", imgsrc);
                    }
                } else {
                    messagebox({ txt: "Image source is not a valid URL!", img: img , delay: 3000 });
                    console.error("Image source is not a valid URL:", imgsrc);
                }
                //forceTranslate
                console.log("Forcing translation of all images");
                console.log(message);
            }
            if (message.type === "purgeCache") {
                (async () => {
                    const success = await caches.delete("my-cache-manga-translate");
                    if (success) {
                        const res =  await sendMessageandWait("removeAllProcessingKeys", {});
                        sendResponse("Cache purged");
                    } else {
                        sendResponse("Cache purge failed");
                    }
                })();
                return true; // Keep the message channel open for sendResponse
            }
        }
    );
})();