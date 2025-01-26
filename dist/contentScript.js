// content script

(async () => {
    function getStorageData(keys) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ type: 'getStorageData', keys }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(response);
                }
            });
            return true; // Keep the message channel open for sendResponse
        });
    }

    function getScreenshot() {
        if (!quickSettings.capture)
            return null;

        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ type: 'getScreenshot' }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else if (response.error) {
                    reject(new Error(response.error));
                } else {
                    resolve(response.screenshotUrl); // Ensure we resolve with the screenshot URL
                }
            });
            return true; // Keep the message channel open for sendResponse
        });
    }

    async function translateImage(image, screenshotUrl=null) {
        showLoadingSpinner(image, 'Looking for image in cache');
        // Placeholder for image translation logic
        const rect = image.getBoundingClientRect();  // Get the bounding rectangle of the image. Useful to detect if the image is visible or not
        // Store the original src in a data attribute
        image.dataset.originalSrc = image.src;
        let imgBlob;

        let cache = advancedSettings.disable_cache ? { found: false } : await checkCacheForImage(image.src);
        let cacheKey
        let cache_processing

        if (!cache.found) {
            try {
                imgBlob = await getImageBlob(image, screenshotUrl);
            } catch (error) {
                console.error('Error getting image blob:', error);
                return;
            }
            cache = advancedSettings.disable_cache ? { found: false } : await checkCacheForImage(imgBlob);
            cacheKey = cache.key;
            cache_processing = advancedSettings.disable_cache ? null : await checkProcessingCacheForImage(image);
        }
        hideLoadingSpinner(image);
        
        if (cache.found) {
            
            console.log(cache);
            console.log('Found in cache');

            // Convert base64 to blob URL and use it
            showLoadingSpinner(image, 'Getting from cache');
            const base64Data = cache.value;
            const blob = await (await fetch(base64Data)).blob();
            const objectUrl = URL.createObjectURL(blob);
            image.setAttribute('data-translated', 'true'); // Mark image as translated
            image.setAttribute('data-URLsource', image.src); // Mark image as translated
            image.setAttribute('data-URLtranslated', objectUrl); // Mark image as translated
            updateImageSource(image, objectUrl);
            updateImageSourceSet(image, objectUrl);
            hideLoadingSpinner(image);
        } else if (cache_processing) {
            console.log('Found in processing cache');
            // Wait until the image is processed
            hideLoadingSpinner(image);
            showLoadingSpinner(image, 'Already processing<br> waiting for result.');
            const interval = setInterval(async () => {
                cache = await checkCacheForImage(imgBlob);
                if (cache.found) { // Change 'result.found' to 'cache.found'
                    clearInterval(interval);
                    const blob = await (await fetch(cache.value)).blob(); // Fetch the blob from the cache value
                    const objectUrl = URL.createObjectURL(blob);
                    image.setAttribute('data-translated', 'true'); // Mark image as translated
                    image.setAttribute('data-URLsource', image.src); // Mark image as translated
                    image.setAttribute('data-URLtranslated', objectUrl); // Mark image as translated
                    updateImageSource(image, objectUrl);
                    updateImageSourceSet(image, objectUrl);

                    hideLoadingSpinner(image);
                }
            }, 500); // Check every second
        } else {
            console.log('Not found in cache');
            // Mark the image as being processed
            image.setAttribute('data-processing', 'true');
            const processingKey = await generateProcessingCacheKey(image);
            if (!advancedSettings.disable_cache) {
                chrome.storage.local.set({ [processingKey]: true });
            }
            hideLoadingSpinner(image);
            showLoadingSpinner(image, 'Processing');
            try {
                console.log('submitting image');
                const response = await submitImage(image, imgBlob);
                await processApiResponse(response, image, imgBlob);
            } catch (error) {
                console.error('Error:', error);
            } finally {
                hideLoadingSpinner(image);
                // Remove the processing attribute
                image.removeAttribute('data-processing');
                if (!advancedSettings.disable_cache) {
                    chrome.storage.local.remove(processingKey);
                }
            }
        }
    }

    async function getImageBlob(img, screenshotUrl=null) {
        if (quickSettings.capture) {
            console.log('Capturing image');
            blob = await captureImage(img, screenshotUrl);
            console.log('Image captured');
            console.log('blob:', blob);
            return blob;
        }
        try {
            return await fetchImageBlob(img);
        } catch (error) {
            try {
            return await fetchImageWithRetry(img.src);
            } catch (error) {
                console.error('Error fetching image:', error);
                showLoadingSpinner(img, 'Error fetching image');
                return Promise.reject(new Error('All fetch attempts failed'));
            }
        }
    }

    async function fetchImageBlob(img) {
        if (!img.src || !img.src.startsWith('http')) {
            throw new Error('Cannot fetch http* URL or img.src is undefined.');
        }

        const newImg = new Image();
        newImg.crossOrigin = "Anonymous";
        newImg.src = img.src;


        await new Promise((resolve, reject) => {
            newImg.onload = resolve;
            newImg.onerror = reject;
        });

        const canvas = document.createElement('canvas');
        canvas.width = newImg.naturalWidth;
        canvas.height = newImg.naturalHeight;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(newImg, 0, 0, canvas.width, canvas.height);

        return new Promise((resolve, reject) => {
            canvas.toBlob(blob => {
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error('Canvas to Blob conversion failed'));
                }
            }, 'image/jpeg', 1.0);
        });
    }

    async function fetchImageWithRetry(url) {
        if (url.startsWith('chrome://')) {
            return Promise.reject(new Error('Cannot fetch chrome:// URL'));
        }

        const fetchWithRetry = async (urlToFetch) => {
            const response = await fetch(urlToFetch);
            const blob = await response.blob();
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return blob;
        };

        try {const blob = await fetchImageInBackground(url);
            return blob;
            
        } catch (bgerror) {
            console.log('retry from the content script fetch');
            try {
                return await fetchWithRetry(url);
            } catch (error) {
                console.error('Error fetching image in content script:', error);
                
                return Promise.reject(new Error('All fetch attempts failed'));
            }
        }
    }

    async function fetchImageInBackground(url) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ type: 'fetchImage', url }, (response) => {
                if (chrome.runtime.lastError || response.error) {
                    reject(chrome.runtime.lastError || response.error);
                } else {
                    chrome.storage.local.get(response.key, (data) => {
                        const base64Data = data[response.key];
                        fetch(base64Data)
                            .then(res => res.blob())
                            .then(blob => {
                                // Delete the image from chrome.storage after reading it
                                chrome.storage.local.remove(response.key, () => {
                                    resolve(blob);
                                });
                            })
                            .catch(err => reject(err));
                    });
                }
            });
            return true; // Keep the message channel open for sendResponse
        });
    }

    function updateImageSource(image, newSrc) {
        image.src = newSrc;
    }

    function updateImageSourceSet(image, newSrc) {
        const pictureElement = image.parentElement;
        if (pictureElement && pictureElement.tagName === 'PICTURE') {
            const sources = pictureElement.getElementsByTagName('source');
            const url = new URL(newSrc);
            const extension = url.pathname.split('.').pop();
            const typeMap = {
                'jpg': 'image/jpeg',
                'jpeg': 'image/jpeg',
                'png': 'image/png',
                'webp': 'image/webp',
                'gif': 'image/gif',
                'svg': 'image/svg+xml',
                'avif': 'image/avif',
                'jxl': 'image/jxl'
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
            console.log('Capturing image');
            const rect = img.getBoundingClientRect();
            const devicePixelRatio = window.devicePixelRatio || 1;

            const image = new Image();
            image.src = screenshotUrl;
            console.log('Awaiting image load');
            await new Promise((resolve, reject) => {
                image.onload = resolve;
                image.onerror = reject;
            });
            console.log('Image loaded');

            if (image.width === 0 || image.height === 0) {
                throw new Error('Invalid image dimensions');
            }

            const canvas = document.createElement('canvas');
            canvas.width = image.width;
            canvas.height = image.height;
            const ctx = canvas.getContext('2d');
            ctx.scale(devicePixelRatio, devicePixelRatio);
            ctx.drawImage(image, 0, 0, image.width / devicePixelRatio, image.height / devicePixelRatio);

            const croppedCanvas = document.createElement('canvas');
            croppedCanvas.width = rect.width * devicePixelRatio;
            croppedCanvas.height = rect.height * devicePixelRatio;
            const croppedCtx = croppedCanvas.getContext('2d');
            croppedCtx.drawImage(
                canvas,
                rect.left * devicePixelRatio,
                rect.top * devicePixelRatio,
                rect.width * devicePixelRatio,
                rect.height * devicePixelRatio,
                0,
                0,
                rect.width * devicePixelRatio,
                rect.height * devicePixelRatio
            );

            return new Promise((resolve) => {
                croppedCanvas.toBlob(resolve, 'image/jpeg', 1.0);
            });
        } catch (error) {
            console.error('Error capturing image:', error);
            return Promise.reject(error);
        }
    }

    async function submitImageToApi(apiUrl, image, imageBlob) {
        if (!imageBlob) {
            return { taskId: "0", status: "error", statusText: "blob is null" };
        }
        const config = generateConfig(quickSettings, advancedSettings, image);

        const formData = new FormData();
        formData.append('image', imageBlob);
        formData.append('config', JSON.stringify(config));

        const response = await fetch(apiUrl, {
            method: 'POST',
            body: formData
        });
        return response;
    }

    async function calculateBlobHash(blob) {
        const arrayBuffer = await blob.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
        return Array.from(new Uint8Array(hashBuffer))
            .map(byte => byte.toString(16).padStart(2, '0'))
            .join('');
    }

    function generateConfig(quickSettings, advancedSettings, image) {
        const width = image.naturalWidth;
        const height = image.naturalHeight;
        const detection_size_raw = Math.max(height, width);
        const detection_size = Math.round(detection_size_raw/2)*2;
            return {
            detector: {
                detector: advancedSettings.detector.detector,
                detection_size: Math.min(advancedSettings.detector.detection_size,detection_size),
                text_threshold: advancedSettings.detector.text_threshold,
                det_rotate: advancedSettings.det_rotate,
                det_auto_rotate: advancedSettings.det_auto_rotate,
                det_invert: advancedSettings.det_invert,
                det_gamma_correct: advancedSettings.det_gamma_correct,
                box_threshold: advancedSettings.detector.box_threshold,
                unclip_ratio: advancedSettings.detector.unclip_ratio
            },
            colorizer: {
                colorizer: quickSettings.colorize ? 'mc2' : 'none',
                colorization_size: image.naturalHeight || 576,
                denoise_sigma: 30
            },
            inpainter: {
                inpainter: advancedSettings.inpainter.inpainter,
                inpainting_size: advancedSettings.inpainter.inpainting_size,
                inpainting_precision: advancedSettings.inpainter.inpainting_precision
            },
            ocr: {
                use_mocr_merge: advancedSettings.ocr.use_mocr_merge,
                ocr: advancedSettings.ocr.ocr,
                min_text_length: advancedSettings.ocr.min_text_length,
                ignore_bubble: advancedSettings.ocr.ignore_bubble
            },
            render: {
                renderer: advancedSettings.render.renderer,
                alignment: advancedSettings.render.alignment,
                disable_font_border: advancedSettings.render.disable_font_border,
                font_size_offset: advancedSettings.render.font_size_offset,
                font_size_minimum: advancedSettings.render.font_size_minimum,
                direction: advancedSettings.render.direction,
                uppercase: advancedSettings.render.uppercase,
                lowercase: advancedSettings.render.lowercase,
                gimp_font: advancedSettings.render.gimp_font,
                no_hyphenation: advancedSettings.render.no_hyphenation,
                font_color: advancedSettings.render.font_color || null,
                line_spacing: advancedSettings.render.line_spacing || null,
                font_size: advancedSettings.render.font_size || null
            },
            translator: {
                translator: advancedSettings.translator.translator,
                target_lang: quickSettings.target_language,
                no_text_lang_skip: advancedSettings.translator.no_text_lang_skip,
                skip_lang: null,
                gpt_config: null,
                translator_chain: null,
                selective_translation: null
            },
            upscale: {
                upscaler: advancedSettings.upscale.upscaler,
                revert_upscaling: advancedSettings.upscale.revert_upscaling,
                upscale_ratio: advancedSettings.upscale.upscale_ratio
            },
            kernel_size: advancedSettings.kernel_size,
            mask_dilation_offset: advancedSettings.mask_dilation_offset
        };
    }

    // Function to check if an image should be translated
    function shouldTranslateImage(image) {
        //showLoadingSpinner(image, 'Analyzing image');

        const min_pixel_count = 1000;
        const width = image.naturalWidth;
        const height = image.naturalHeight;
        const nb_pixels = (width * height); // Check if image size is greater than 500,000 pixels

        res=true

        // Check if the image or its parent has display: none
        let element = image;
        while (element) {
            if (getComputedStyle(element).display === 'none') {
                console.log('Image or its parent has display: none, don\'t translate');
                res=false;
                break;
            }
            element = element.parentElement;
        }

        console.log('shouldTranslateImage?: ', image.src);
        if (nb_pixels < min_pixel_count && nb_pixels > 0) {
            console.log('Image size:', nb_pixels);
            res=false
        }
        if (image.src.startsWith('chrome://')) {
            console.log('Image is a chrome:// URL');
            res=false
        }
        if (image.hasAttribute('data-translated') && image.getAttribute('data-URLtranslated') === image.src) {
            console.log('Image is already translated and URLtranslated is the same as src');
            res=false
        }
        if (image.hasAttribute('data-translated') && image.getAttribute('data-URLsource') === image.src) {
            console.log('Image is already translated and URLsource is the same as src');
            res=false
        }

        //hideLoadingSpinner(image);
        return res;
    }

    // Function to process new images
    async function processNewImages(images, screenshotUrl) {
        if (!Array.isArray(images)) {
            images = Array.from(images);
        }
        const promises = images.map(async (image) => {
            if (shouldTranslateImage(image)) {
                if (image.complete) {
                  translateImage(image, screenshotUrl);
                } else {
                    // image.onload = async () => translateImage(image);
                    translateImage(image, screenshotUrl);
                }
            } else {
                console.log('Image does not meet the criteria for translation:'+ image.src);
            }
        });
        await Promise.all(promises);
    }

    async function generateCacheKeys(input) {
        const settingsHash = await computeSettingsFingerprint(quickSettings, advancedSettings);
        if (input instanceof Blob) {
            const hash = await calculateBlobHash(input);
            return `${hash}_${settingsHash}`;
        } else if (typeof input === 'string') {
            const urlObj = new URL(input);
            const domain = urlObj.hostname.split('.').slice(-2).join('.');
            return `${domain}${urlObj.pathname}${urlObj.search}_${settingsHash}`;
        } else {
            throw new Error('Invalid input type');
        }
    }

    async function generateProcessingCacheKey(image) {
        const urlObj = new URL(image.dataset.originalSrc);
        const domain = urlObj.hostname.split('.').slice(-2).join('.');

        const settingsHash = await computeSettingsFingerprint(quickSettings, advancedSettings);
        const cacheKey0 = `${domain}${urlObj.pathname}${urlObj.search}_${settingsHash}_processing`;
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
            console.error('Error checking cache for image:', error);
            return { found: false, key: cacheKey, value: null }; // Ensure cacheKey is defined
        }
    }
    
    async function storeBlobInCache(blob, cacheKey) {
        try {
            const cache = await caches.open('my-cache-manga-translate');
            const response = new Response(blob);
            await cache.put(cacheKey, response);
            console.log(`Blob stored in cache with key: ${cacheKey}`);
        } catch (error) {
            console.error('Error storing blob in cache:', error);
        }
    }
    
    async function retrieveBlobFromCache(cacheKey) {
        try {
            const cache = await caches.open('my-cache-manga-translate');
            const response = await cache.match(cacheKey);
            if (response) {
                const blob = await response.blob();
                console.log(`Blob retrieved from cache with key: ${cacheKey}`);
                return blob;
            } else {
                console.log(`No cache entry found for key: ${cacheKey}`);
                return null;
            }
        } catch (error) {
            console.error('Error retrieving blob from cache:', error);
            return null;
        }
    }
    

    async function checkProcessingCacheForImage(image) {
        const cacheKey = await generateProcessingCacheKey(image);
        const result = await new Promise((resolve) => {
            chrome.storage.local.get(cacheKey, (data) => {
                resolve(data);
            });
        });
        return result[cacheKey] ? cacheKey : null;
    }

    async function processApiResponse(response, img, imgBlob) {
        if (response.ok) {
            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
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
                        const clonedImg = img.cloneNode(true);
                        const objectUrl = URL.createObjectURL(new Blob([data], { type: 'application/octet-stream' }));
                        img.setAttribute('data-translated', 'true'); // Mark image as translated
                        img.setAttribute('data-URLsource', img.src); // Mark image as translated
                        img.setAttribute('data-URLtranslated', objectUrl); // Mark image as translated
                        updateImageSource(img, objectUrl);
                        updateImageSourceSet(img, objectUrl);

                        const cacheKeys = [await generateCacheKeys(clonedImg.src), await generateCacheKeys(imgBlob)];

                        for (const cacheKey of cacheKeys) {
                            storeBlobInCache(new Blob([data], { type: 'application/octet-stream' }), cacheKey);
                        }
                    } else if (statusCode >= 1 && statusCode <= 4) {
                        hideLoadingSpinner(img);
                        showLoadingSpinner(img, decodedData);
                    }
                    buffer = buffer.slice(totalSize);
                }
            }
        } else {
            console.log(`Error on image ${img.src}: ${response.statusText}`);
        }
    }

    function showLoadingSpinner(img, txt) {
        const rect = img.getBoundingClientRect();
        // Check if the image is within the viewport
        if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) {
            console.log('Image is out of the viewport, not adding spinner');
            return;
        }

        const loadingDiv = document.createElement('div');
        Object.assign(loadingDiv.style, {
            position: 'absolute',
            top: `${rect.top + window.scrollY}px`,
            left: `${rect.left + window.scrollX}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 10000,
            pointerEvents: 'none' // Ensure the spinner does not block interactions with the image
        });

        const loadingTextDiv = loadingDiv.cloneNode(true);

        loadingDiv.className = 'spinner-manga';
        loadingTextDiv.className = 'spinner-text-manga';
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

        const style = document.createElement('style');
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

        return loadingDiv;
    }

    function hideLoadingSpinner(img) {
        const loadingDiv = document.getElementById(img.dataset.loadingDivId);
        if (loadingDiv) {
            loadingDiv.remove();
        }

        const loadingTextDiv = document.getElementById(`${img.dataset.loadingDivId}-text`);
        if (loadingTextDiv) {
            loadingTextDiv.remove();
        }
    }

    async function computeSettingsFingerprint(quickSettings, advancedSettings) {
        const quickSettingsString = JSON.stringify(quickSettings);
        const advancedSettingsString = JSON.stringify(advancedSettings);
        const encoder = new TextEncoder();
        const data = encoder.encode(quickSettingsString + advancedSettingsString);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(hashBuffer))
            .map(byte => byte.toString(16).padStart(2, '0'))
            .join('');
    }

    async function submitImage(img, blob) {
        try {
          const res = await submitImageToApi(`${quickSettings.apiUrl}/translate/with-form/image/stream`, img, blob);
          return res;
        } catch (error) {
          hideLoadingSpinner(img);
          return;
        }
      }

    function convertBlobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    async function wait_for_all_images_to_be_loaded(images) {
        // Add spinner to the top left corner
        const spinnerDiv = document.createElement('div');
        Object.assign(spinnerDiv.style, {
            position: 'fixed',
            top: '10px',
            left: '10px',
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            color: 'white',
            padding: '10px',
            borderRadius: '5px',
            zIndex: 10000,
            fontSize: '14px',
            textAlign: 'center'
        });
        spinnerDiv.innerText = 'Searching for images to translate...';
        document.body.appendChild(spinnerDiv);

        if (!Array.isArray(images)) {
            images = Array.from(images);
        }
        const promises = images.map(img => {
            console.log(`Waiting for image: ${img.src}`);
            return new Promise((resolve, reject) => {
                if (img.complete) {
                    checkImageSize(0);
                } else {
                    img.onload = function () {
                        checkImageSize(0);
                    }
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
                            if (img.naturalWidth === previousWidth && img.naturalHeight === previousHeight) {
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
            const images = document.getElementsByTagName('img');
            if (images.length === previousCount) {
                clearInterval(interval);
                console.log('DOM stabilized, calling wait_for_all_images_to_be_loaded');
                
                wait_for_all_images_to_be_loaded(images).then(callback);
                console.log('All images loaded and stable');
            } else {
                previousCount = images.length;
            }
        }, 50);
    }

    async function waitForAllImagesToLoad() {
        console.log('waitForAllImagesToLoad() called');
        const images = Array.from(document.images);
        const timeoutPromise = new Promise(resolve => setTimeout(resolve, 20000)); // 10 seconds timeout

        await Promise.race([
            Promise.all(images.map(img => {
                if (img.complete) {
                    return checkImageStability(img);
                }
                return new Promise(resolve => {
                    img.onload = () => checkImageStability(img).then(resolve);
                    img.onerror = resolve;
                });
            })),
            timeoutPromise
        ]);

        // console.log('All images loaded, sending allImagesLoaded message');
        // chrome.runtime.sendMessage({ type: 'allImagesLoaded' }, () => {
        //     if (chrome.runtime.lastError) {
        //         console.error('Error sending allImagesLoaded message:', chrome.runtime.lastError);
        //     } else {
        //         console.log('allImagesLoaded message sent successfully');
        //     }
        // });
    }

    function checkImageStability(img) {
        return new Promise(resolve => {
            let previousWidth = img.naturalWidth;
            let previousHeight = img.naturalHeight;
            const interval = setInterval(() => {
                if (img.naturalWidth === previousWidth && img.naturalHeight === previousHeight) {
                    clearInterval(interval);
                    resolve();
                } else {
                    previousWidth = img.naturalWidth;
                    previousHeight = img.naturalHeight;
                }
            }, 50);
        });
    }

    const { quickSettings, advancedSettings} = await getStorageData(['quickSettings', 'advancedSettings']);

    const proxyUrls = [
        'https://api.codetabs.com/v1/proxy/?quest=', //best
        'https://api.cors.lol/?url=', //best
        'https://corsproxy.io/?',
        'https://api.allorigins.win/raw?url=' //slow
    ];
    
    const domain = window.location.host;

    if (quickSettings.enabledWebsites[domain]) {
        console.log(`Starting translation process for domain: ${domain}`);

        waitForDomToStabilize(async () => {

            console.log('Initializing MutationObserver and processing existing images');
            // Mutation observer to detect new images
            const observer = new MutationObserver(async (mutations) => {
                let newImages = [];
                for (const mutation of mutations) {
                    if (mutation.type === 'childList') {
                        for (const node of mutation.addedNodes) {
                            if (node.tagName === 'IMG') {
                                newImages.push(node);
                            } else if (node.querySelectorAll) {
                                newImages.push(...Array.from(node.querySelectorAll('img')));
                            }
                        }
                    } else if (mutation.type === 'attributes' && mutation.attributeName === 'src' && mutation.target.tagName === 'IMG' && shouldTranslateImage(mutation.target)) {
                        newImages.push(mutation.target);
                    }
                }

                if (newImages.length != 0) {
                    console.log(`Detected ${newImages.length} new or modified images`);
                    await waitForAllImagesToLoad();
                    console.log('All images loaded');
                    const screenshotUrl = await getScreenshot();
                    await processNewImages(newImages, screenshotUrl);
                } else {
                    console.log('No new images to process');
                }
            });

            observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });

            // Process existing images on page load
            const existingImages = document.querySelectorAll('img');
            if (existingImages.length != 0) {
                console.log(`Processing ${existingImages.length} existing images`);
                const screenshotUrl = await getScreenshot();
                await processNewImages(existingImages, screenshotUrl);
            } else {
                console.log('No existing images to process');
            }

            // Wait for all images to load before sending the screenshot request            
        });
    } else {
        console.log('Manga reader not enabled for this website');
    }

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'purgeCache') {
          caches.delete('my-cache-manga-translate').then((success) => {
            if (success) {
              console.log('Cache purged successfully');
            } else {
              console.log('Cache purge failed');
              caches.keys().then((keys) => {
                console.log('Cache keys:', keys);
              });
            }
          });
        }
      });
})();