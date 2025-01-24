(async () => {
  let data = {};

  let quickSettings = {};
  data = await chrome.storage.sync.get("quickSettings");
  Object.assign(quickSettings, data.quickSettings);

  let advancedSettings = {};
  data = await chrome.storage.sync.get("advancedSettings");
  Object.assign(advancedSettings, data.advancedSettings);

  if ( Object.keys(advancedSettings).length === 0) {
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
        font_size: null
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
      capture: false,
      disable_cache: false,
    };
    chrome.storage.sync.set({ advancedSettings });
  }

  function updateIcon(tabId) {
    chrome.tabs.get(tabId, (tab) => {
      if (!tab) return;

      const domain = new URL(tab.url).hostname;
      const isEnabled = quickSettings.enabledWebsites[domain] || false;
      const iconPath = isEnabled ? 'icons/128x128.png' : 'icons/128x128-disabled.png';

      chrome.action.setIcon({ path: iconPath, tabId });
    });
  }

  async function getScreenshot() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return await chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 100 });
  }

  chrome.tabs.onActivated.addListener(function (activeInfo) {
    try {
      updateIcon(activeInfo.tabId);
    } catch (error) {
      console.error('Error updating icon on tab activation:', error);
    }
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url) {
      updateIcon(tabId);
    }

    chrome.scripting.executeScript({
      target: { tabId: tabId },
      function: async () => {
        function isImageOnScreen(imgElement) {
          console.log('isImageOnScreen called');
                return new Promise((resolve) => {
                    if (!imgElement || !(imgElement instanceof HTMLElement)) {
                        throw new Error("Invalid image element provided.");
                    }
            
                    const observer = new IntersectionObserver((entries) => {
                        const entry = entries[0]; // We are observing only one element
                        resolve(entry.isIntersecting); // Resolve with true if it's on screen, false otherwise
                        observer.disconnect(); // Stop observing after we get the result
                    });
            
                    observer.observe(imgElement);
                });
              }            
  
              async function wait_for_all_images_to_be_loaded(images) {
                console.log('wait_for_all_images_to_be_loaded called');
                for (const img of images) {
                  console.log(`Waiting for image: ${img.src}`);
                  // Wait for the image to be fully loaded and stable
                  await new Promise((resolve, reject) => {
                    if (img.complete) {
                      if (isImageOnScreen(img)) {
                        // while (!isImageOnScreen(img)) {}
                      }
                      checkImageSize(0);
                    } else {
                      img.onload = function() {
                        // while (!isImageFullyDisplayed(img)) {}
                        checkImageSize(0);
                      }
                      img.onerror = function() {
                        console.error(`Image failed to load: ${img.src}`);
                        reject();
                      }
                    }
  
                    function checkImageSize(i) {
                      if (i > 10) {
                        console.log(`Failed to check image size: ${img.src}`);
                        resolve();
                        return;
                      }
                      console.log(`Checking image size(${i}): ${img.src}`);
                      let previousWidth = img.naturalWidth;
                      let previousHeight = img.naturalHeight;
                      if (previousWidth === 0 && previousHeight === 0) {
                        setTimeout(() => {
                          checkImageSize(i+1);
                        }, 100);
                      } else {                        
                        const interval = setInterval(() => {
                          if (img.naturalWidth === previousWidth && img.naturalHeight === previousHeight ) {
                            clearInterval(interval);
                            resolve();
                          } else {
                            previousWidth = img.naturalWidth;
                            previousHeight = img.naturalHeight;
                          }
                        }, 100);
                      }
                    }
  
                    function isImageFullyDisplayed(img) {
                      if (!img.complete || img.naturalWidth === 0) {
                          console.log(`Image not loaded or is broken`);
                          return false; // Image not loaded or is broken
                      }
                  
                      const style = window.getComputedStyle(img);
                      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
                          return false; // Image is hidden
                      }
                  
                      const rect = img.getBoundingClientRect();
                      const fullyVisible = 
                          rect.top >= 0 &&
                          rect.left >= 0 &&
                          rect.bottom <= window.innerHeight &&
                          rect.right <= window.innerWidth;
                  
                      if (!fullyVisible) {
                          return false; // Image is outside the viewport
                      }
                  
                      let currentElement = img;
                      while (currentElement && currentElement !== document.body) {
                          const style = window.getComputedStyle(currentElement);
                          if (style.overflow === "hidden" || style.overflow === "scroll") {
                              const parentRect = currentElement.getBoundingClientRect();
                              if (
                                  rect.top < parentRect.top ||
                                  rect.bottom > parentRect.bottom ||
                                  rect.left < parentRect.left ||
                                  rect.right > parentRect.right
                              ) {
                                  return false; // Image is clipped by a parent container
                              }
                          }
                          currentElement = currentElement.parentElement;
                      }
                  
                      return true; // Image is fully loaded, visible, and not clipped
                    }
                  });
                }
              }

        // Listen for messages from the background script
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
          if (message.action === "waitForImages") {
            const images = document.getElementsByTagName('img');
            wait_for_all_images_to_be_loaded(images).then(() => {
              console.log('All images loaded');
              sendResponse({ allImagesLoaded: true });
            });
            return true; // Keep the message channel open for asynchronous response
          }
        });
      }
    });

    if (changeInfo.status === 'complete' && tab.active) {
      updateIcon(tabId);
      const urlObj = new URL(tab.url);
      const domain = urlObj.hostname;

      if (quickSettings.enabledWebsites[domain]) {
        let startwait = 500;
          switch (domain) {
            case 'hitomi.la':
              startwait = 100;
              break;
            case 'nhentai.net':
              startwait = 100;
              break;
            case 'hentaifox.com':
              startwait = 500;
              break;
            case 'klmanga.com':
              startwait = 100;
              break;
            case 'klz9.com':
              startwait = 100;
              break;
          }

        console.log(`Tab enabled: ${domain}`);

        setTimeout(async function () {
          chrome.tabs.sendMessage(tab.id, { action: "waitForImages" }, async (response) => {
            console.log('waitForImages response:', response);
            if (response?.allImagesLoaded) {
              console.log('All images loaded message received');
              async function getScreenshot_if_needed(advancedSettings) {
                if (advancedSettings.capture)
                  return getScreenshot();
                else
                  return null;
              }
              console.log('getScreenshot_if_needed called');
              await getScreenshot_if_needed(advancedSettings).then(screenshotUrl => {
                console.log('getScreenshot_if_needed then called');
                chrome.scripting.executeScript({
                  target: { tabId: tab.id },
                  args: [quickSettings, advancedSettings, tab, screenshotUrl],
                  function: async (quickSettings, advancedSettings, tab, screenshotUrl) => {
                    
                    const domain = new URL(tab.url).hostname.split('.').slice(-2).join('.');
                    

                    console.log(`domain: ${domain}`);

                    

                      console.log('setTimeout function called');
                      const proxyUrls = [
                        'https://api.codetabs.com/v1/proxy/?quest=', //best
                        'https://api.cors.lol/?url=', //best
                        'https://corsproxy.io/?',
                        'https://api.allorigins.win/raw?url=' //slow
                      ];

                      function getPixelCount(img) {
                        return img.naturalWidth * img.naturalHeight;
                      }

                      function updateImageSource(img, newSrc) {
                        img.src = newSrc;
                      }

                      function updateImageSourceSet(img, newSrc) {
                        const pictureElement = img.parentElement;
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

                      async function fetchImageBlob(img) {
                        if (!img.src || ! img.src.startsWith('http')) {
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

                        try {
                          return await fetchWithRetry(url);
                        } catch {
                          for (const proxyUrl of proxyUrls) {
                            try {
                              return await fetchWithRetry(proxyUrl + url);
                            } catch {
                              // Continue to the next proxy URL
                            }
                          }
                          return Promise.reject(new Error('All fetch attempts failed'));
                        }
                      }

                      async function captureImage(img, screenshotUrl) {
                        const rect = img.getBoundingClientRect();
                        const devicePixelRatio = window.devicePixelRatio || 1;
                      
                        const image = new Image();
                        image.src = screenshotUrl;
                        await new Promise((resolve) => (image.onload = resolve));
                      
                        console.log('Pixel ratio:', devicePixelRatio);
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
                      }

                      async function getImageBlob(img) {
                        if (advancedSettings.capture) {
                          return await captureImage(img, screenshotUrl);
                        }
                        try {
                          return await fetchImageBlob(img);
                        } catch (error) {
                          return await fetchImageWithRetry(img.src);
                        }
                      }

                      function generateConfig(quickSettings, advancedSettings, img) {
                        return {
                          detector: {
                            detector: advancedSettings.detector.detector,
                            detection_size: advancedSettings.detector.detection_size,
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
                            colorization_size: img.naturalHeight || 576,
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

                      async function submitImageToApi(apiUrl, img, imageBlob) {
                        if (!imageBlob) {
                          return { taskId: "0", status: "error" };
                        }
                        const config = generateConfig(quickSettings, advancedSettings, img);

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

                      async function computeSettingsFingerprint(quickSettings, advancedSettings) {
                        const quickSettingsString = JSON.stringify(quickSettings);
                        const advancedSettingsString = JSON.stringify(advancedSettings);
                        const encoder = new TextEncoder();
                        const data = encoder.encode(quickSettingsString+advancedSettingsString);
                        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
                        return Array.from(new Uint8Array(hashBuffer))
                          .map(byte => byte.toString(16).padStart(2, '0'))
                          .join('');
                      }

                      async function generateCacheKeys(img, blob) {
                        const urlObj = new URL(img.dataset.originalSrc);
                        const domain = urlObj.hostname.split('.').slice(-2).join('.');

                        const settingsHash = await computeSettingsFingerprint(quickSettings, advancedSettings);
                        const hash = await calculateBlobHash(blob);
                        const cacheKey0 = `${domain}${urlObj.pathname}${urlObj.search}_${settingsHash}`;
                        const cacheKey1 = `${hash}_${settingsHash}`;

                        return [cacheKey0, cacheKey1];
                      }

                      async function generateProcessingCacheKey(img) {
                        const urlObj = new URL(img.dataset.originalSrc);
                        const domain = urlObj.hostname.split('.').slice(-2).join('.');

                        const settingsHash = await computeSettingsFingerprint(quickSettings, advancedSettings);
                        const cacheKey0 = `${domain}${urlObj.pathname}${urlObj.search}_${settingsHash}_processing`;
                        return [cacheKey0];
                      }

                      async function checkCacheForImage(img, blob) {
                        console.log('checkCacheForImage called');
                        const cacheKeys = await generateCacheKeys(img, blob);
                        console.log('cacheKeys:', cacheKeys);
                        for (const cacheKey of cacheKeys) {
                          const result = await new Promise((resolve) => {
                            chrome.storage.local.get(cacheKey, (data) => {
                              resolve(data);
                            });
                          });
                          if (result[cacheKey]) {
                            console.log('found in cache');
                            return { found: true, key: cacheKey, value: result[cacheKey] };
                          }
                        }
                        console.log('not found in cache');
                        return { found: false, key: cacheKeys[0], value: null };
                      }

                      async function checkProcessingCacheForImage(img) {
                        const cacheKeys = await generateProcessingCacheKey(img);

                        for (const cacheKey of cacheKeys) {
                          const result = await new Promise((resolve) => {
                            chrome.storage.local.get(cacheKey, (data) => {
                              resolve(data);
                            });
                          });
                          if (result[cacheKey]) {
                            return cacheKey;
                          }
                        }
                        return null;
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

                                // Convert blob to base64 and store it
                                const base64Data = await convertBlobToBase64(new Blob([data], { type: 'application/octet-stream' }));
                                const cacheKeys = await generateCacheKeys(clonedImg, imgBlob);

                                for (const cacheKey of cacheKeys) {
                                  chrome.storage.local.set({ [cacheKey]: base64Data });
                                }
                              } else if (statusCode >= 1 && statusCode <= 4) {
                                hideLoadingSpinner();
                                showLoadingSpinner(img, decodedData);
                              }
                              buffer = buffer.slice(totalSize);
                            }
                          }
                        } else {
                          console.error(response.statusText);
                        }
                      }

                      function showLoadingSpinner(img, txt) {
                        const rect = img.getBoundingClientRect();
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
                      
                        document.body.appendChild(loadingDiv);
                        document.body.appendChild(loadingTextDiv);
                        document.head.appendChild(style);
                      
                        return loadingDiv;
                      }
                      

                      function hideLoadingSpinner() {
                        const loadingDiv = document.querySelector('.spinner-manga');
                        if (loadingDiv) {
                          loadingDiv.remove();
                        }

                        const loadingTextDiv = document.querySelector('.spinner-text-manga');
                        if (loadingTextDiv) {
                          loadingTextDiv.remove();
                        }
                      }

                      async function submitImage(img, blob) {
                        try {
                          const res = await submitImageToApi(`${quickSettings.apiUrl}/translate/with-form/image/stream`, img, blob);
                          return res;
                        } catch (error) {
                          hideLoadingSpinner();
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

                      async function processImage(img) {
                        const rect = img.getBoundingClientRect();  // Get the bounding rectangle of the image. Useful to detect if the image is visible or not

                        if ( getPixelCount(img) > 700000
                          && ! img.src.startsWith('chrome://')
                          && ! ( img.hasAttribute('data-translated') && img.hasAttribute('data-URLtranslated')== img.src )
                          && ! ( img.hasAttribute('data-translated') && img.hasAttribute('data-URLsource')== img.src )
                          && ! img.hasAttribute('data-processing')) {

                          // Store the original src in a data attribute
                          img.dataset.originalSrc = img.src;
                          const imgBlob = await getImageBlob(img);
                          const cache = advancedSettings.disable_cache ? { found: false } : await checkCacheForImage(img, imgBlob);
                          const cacheKey = cache.key;
                          const cache_processing = advancedSettings.disable_cache ? null : await checkProcessingCacheForImage(img);
                          if (cache.found) {
                            // Convert base64 to blob URL and use it
                            showLoadingSpinner(img, 'Getting from cache');
                            const base64Data = cache.value;
                            const blob = await (await fetch(base64Data)).blob();
                            const objectUrl = URL.createObjectURL(blob);
                            img.setAttribute('data-translated', 'true'); // Mark image as translated
                            img.setAttribute('data-URLsource', img.src); // Mark image as translated
                            img.setAttribute('data-URLtranslated', objectUrl); // Mark image as translated
                            updateImageSource(img, objectUrl);
                            updateImageSourceSet(img, objectUrl);
                            hideLoadingSpinner();
                          } else if (cache_processing) {
                            // Wait until the image is processed
                            hideLoadingSpinner();
                            showLoadingSpinner(img, 'Already processing<br> waiting for result.');
                            const interval = setInterval(async () => {
                              chrome.storage.local.get(cacheKey, async function (result) {
                                if (result[cacheKey]) {
                                  clearInterval(interval);
                                  const base64Data = result[cacheKey];
                                  const blob = await (await fetch(base64Data)).blob();
                                  const objectUrl = URL.createObjectURL(blob);
                                  img.setAttribute('data-translated', 'true'); // Mark image as translated
                                  img.setAttribute('data-URLsource', img.src); // Mark image as translated
                                  img.setAttribute('data-URLtranslated', objectUrl); // Mark image as translated
                                  updateImageSource(img, objectUrl);
                                  updateImageSourceSet(img, objectUrl);
      
                                  hideLoadingSpinner();
                                }
                              });
                            }, 1000); // Check every second
                          } else {
                            // Mark the image as being processed
                            img.setAttribute('data-processing', 'true');
                            const processingKey = await generateProcessingCacheKey(img);
                            if (!advancedSettings.disable_cache) {
                              chrome.storage.local.set({ [processingKey]: true });
                            }
                            hideLoadingSpinner();
                            showLoadingSpinner(img, 'Processing');
                            try {
                              await new Promise(resolve => setTimeout(resolve, 100)); // Wait for 100 ms before processing
                              const response = await submitImage(img, imgBlob);
                              await processApiResponse(response, img, imgBlob);
                            } catch (error) {
                              console.error('Error:', error);
                            } finally {
                              hideLoadingSpinner();
                              // Remove the processing attribute
                              img.removeAttribute('data-processing');
                              if (!advancedSettings.disable_cache) {
                                chrome.storage.local.remove(processingKey);
                              }
                            }
                          }
                        } else {
                          console.log('Image skipped:', img.src);
                          console.log('Pixel count:', getPixelCount(img));
                          console.log('Image visible:', rect.top >= 0 && rect.left >= 0 && rect.bottom <= window.innerHeight && rect.right <= window.innerWidth);
                          console.log('Image loaded:', img.complete);
                          console.log('Image translated:', img.hasAttribute('data-translated'));
                          console.log('Image processing:', img.hasAttribute('data-processing'));
                        }
                      }

                      const images = document.getElementsByTagName('img');

                      const uniqueUrls = new Set();
                      const images_uniq = [];

                      for (const img of images) {
                        const imgUrl = img.src;

                        // Add the image to images_uniq if the URL is not already in the set
                        if (!uniqueUrls.has(imgUrl)) {
                          uniqueUrls.add(imgUrl);
                          images_uniq.push(img);
                        }
                      }

                      for (const img of images_uniq) {
                        await processImage(img);
                      }
                  }
                });
              });
            } else {
              console.error("Failed to capture screenshot.");
            }
          });
        }, startwait);
      }
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
    chrome.storage.local.set({ refreshIconVisible: visible }, function() {
      if (visible) {
        chrome.action.setBadgeText({ text: '1' });
      } else {
        chrome.action.setBadgeText({ text: '' });
      }
    });
    chrome.runtime.sendMessage({ type: 'updateRefreshIcon', visible: visible });
  }

  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === 'setBadgeText') {
      chrome.action.setBadgeText({ text: request.text }, () => {
        if (chrome.runtime.lastError) {
          console.error('Error setting badge text:', chrome.runtime.lastError);
        }
      });
    } else if (request.type === 'settings-updated') {
      chrome.storage.sync.get(null, (newItems) => {
        quickSettings = newItems.quickSettings || quickSettings;
        advancedSettings = newItems.advancedSettings || advancedSettings;
        updateRefreshIconVisibility(true);
      });
    } else if (request.type === 'hideRefreshIcon') {
      updateRefreshIconVisibility(false);
    } else if (request.type === 'reloadCurrentTab') {
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        chrome.tabs.reload(tabs[0].id, function() {
          updateRefreshIconVisibility(false);
        });
      });
    } else if (request.type === 'settings-modified') {
      updateRefreshIconVisibility(true);
    }
  });
})();
