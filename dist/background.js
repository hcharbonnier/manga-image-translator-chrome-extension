let items = {};
chrome.storage.sync.get({
  colorize: false,
  translate: true,
  target_language: 'ENG',
  apiUrl: '',
  enabledWebsites: {},
}, function (fetchedItems) {
  items = fetchedItems;

  function updateIcon(tabId) {
    chrome.tabs.get(tabId, (tab) => {
      if (!tab) return;

      const domain = new URL(tab.url).hostname;
      const isEnabled = items.enabledWebsites[domain] || false;
      const iconPath = isEnabled ? 'icons/128x128.png' : 'icons/128x128-disabled.png';

      chrome.action.setIcon({ path: iconPath, tabId });
    });
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
    if (changeInfo.status === 'complete' && tab.active) {
      updateIcon(tabId);
      const urlObj = new URL(tab.url);
      const domain = urlObj.hostname;

      if (items.enabledWebsites[domain]) {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          args: [items, tab],
          function: async (items, tab) => {

            if (!items.translate && !items.colorize) {
              console.log('Both translate and colorize are disabled. Doing nothing.');
              return;
            }

            const proxyUrls = [
              'https://api.codetabs.com/v1/proxy/?quest=', //best
              'https://api.cors.lol/?url=', //best
              'https://corsproxy.io/?',
              'https://api.allorigins.win/raw?url=' //slow
            ];

            const domain = new URL(tab.url).hostname.split('.').slice(-2).join('.');
            let startwait = 300;
            switch (domain) {
              case 'hitomi.la':
                startwait = 700;
                break;
              case 'nhentai.net':
                startwait = 100;
                break;
              case 'klmanga.com':
                startwait = 1000;
                break;
              case 'klz9.com':
                startwait = 1000;
                break;
            }

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
              if (!img.src || img.src.startsWith('chrome://')) {
                throw new Error('Cannot fetch chrome:// URL or img.src is undefined.');
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
                });
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

            async function submitImageToApi(apiUrl, target_language, colorize, translate, img, imageBlob) {
              if (!imageBlob) {
                return { taskId: "0", status: "error" };
              }

              const colorizer = colorize ? "mc2" : "none";
              const translator = translate ? "nllb_big" : "original";

              console.log(`Posting image to API ${apiUrl}`);

              const config = {
                detector: {
                  detector: "default",
                  detection_size: 1536
                },
                inpainter: {
                  inpainter: "default"
                },
                ocr: {
                  ocr: "48px",
                  use_mocr_merge: false
                },
                render: {
                  direction: "auto",
                  font_size_offset: 5,
                  font_size_minimum: 15
                },
                colorizer: {
                  colorizer: colorizer,
                  colorization_size: img.naturalHeight,
                  denoise_sigma: 10
                },
                translator: {
                  translator: translator,
                  target_lang: target_language
                }
              };

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

            async function generateCacheKeys(img, blob) {
              const urlObj = new URL(img.dataset.originalSrc);
              const domain = urlObj.hostname.split('.').slice(-2).join('.');

              const params = `${items.translate ? items.target_language : 'none'}_${items.colorize ? 'colorized' : 'original'}`;
              const hash = await calculateBlobHash(blob);
              const cacheKey0 = `${domain}${urlObj.pathname}${urlObj.search}_${params}`;
              const cacheKey1 = `${hash}_${params}`;

              return [cacheKey0, cacheKey1];
            }

            async function generateProcessingCacheKey(img) {
              const urlObj = new URL(img.dataset.originalSrc);
              const domain = urlObj.hostname.split('.').slice(-2).join('.');

              const params = `${items.translate ? items.target_language : 'none'}_${items.colorize ? 'colorized' : 'original'}`;
              const cacheKey0 = `${domain}${urlObj.pathname}${urlObj.search}_${params}_processing`;
              return [cacheKey0];
            }

            async function checkCacheForImage(img, blob) {
              const cacheKeys = await generateCacheKeys(img, blob);
              console.log(`cachekeys: ${cacheKeys}`);

              for (const cacheKey of cacheKeys) {
                console.log(`looking in cache for key cacheKey: ${cacheKey}`);
                const result = await new Promise((resolve) => {
                  chrome.storage.local.get(cacheKey, (data) => {
                    resolve(data);
                  });
                });
                if (result[cacheKey]) {
                  return { found: true, key: cacheKey, value: result[cacheKey] };
                }
              }
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
                      updateImageSource(img, objectUrl);
                      updateImageSourceSet(img, objectUrl);
                      img.setAttribute('data-translated', 'true'); // Mark image as translated

                      // Convert blob to base64 and store it
                      const base64Data = await convertBlobToBase64(new Blob([data], { type: 'application/octet-stream' }));
                      const cacheKeys = await generateCacheKeys(clonedImg, imgBlob);

                      for (const cacheKey of cacheKeys) {
                        chrome.storage.local.set({ [cacheKey]: base64Data });
                        console.log(`Storing translated image data for ${cacheKey}`);
                      }
                    } else if (statusCode >= 1 && statusCode <= 4) {
                      console.log(decodedData);
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
              const loadingDiv = document.createElement('div');
              Object.assign(loadingDiv.style, {
                position: 'absolute',
                top: `${img.offsetTop}px`,
                left: `${img.offsetLeft}px`,
                width: `${img.offsetWidth}px`,
                height: `${img.offsetHeight}px`,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                zIndex: 10000
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

            async function getImageBlob(img) {
              try {
                return await fetchImageBlob(img);
              } catch (error) {
                return await fetchImageWithRetry(img.src);
              }
            }

            async function submitImage(img, blob) {
              try {
                console.log("trying to submit blob...");
                const res = await submitImageToApi(`${items.apiUrl}/translate/with-form/image/stream`, items.target_language, items.colorize, items.translate, img, blob);
                console.log("submitted blob...");
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

            setTimeout(async function () {
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
                const rect = img.getBoundingClientRect();  // Get the bounding rectangle of the image. Useful to detect if the image is visible or not

                if (getPixelCount(img) > 300000 && rect.width > 0 && rect.height > 0 && !img.src.startsWith('chrome://') && !img.hasAttribute('data-translated') && !img.hasAttribute('data-processing')) {
                  // Store the original src in a data attribute
                  img.dataset.originalSrc = img.src;
                  const imgBlob = await getImageBlob(img);
                  const cache = await checkCacheForImage(img, imgBlob);
                  const cacheKey = cache.key;
                  const cache_processing = await checkProcessingCacheForImage(img);
                  if (cache.found) {
                    // Convert base64 to blob URL and use it
                    showLoadingSpinner(img, 'Getting from cache');
                    const base64Data = cache.value;
                    const blob = await (await fetch(base64Data)).blob();
                    const objectUrl = URL.createObjectURL(blob);
                    console.log(`Found translated image in cache for ${cacheKey}`);
                    updateImageSource(img, objectUrl);
                    updateImageSourceSet(img, objectUrl);
                    img.setAttribute('data-translated', 'true');
                    hideLoadingSpinner();
                  } else if (cache_processing) {
                    // Wait until the image is processed
                    console.log(`Image is being processed`);
                    hideLoadingSpinner();
                    showLoadingSpinner(img, 'Already processing<br> waiting for result.');
                    const interval = setInterval(async () => {
                      chrome.storage.local.get(cacheKey, async function (result) {
                        console.log(cacheKey);
                        if (result[cacheKey]) {
                          clearInterval(interval);
                          const base64Data = result[cacheKey];
                          const blob = await (await fetch(base64Data)).blob();
                          const objectUrl = URL.createObjectURL(blob);
                          console.log(`Found translated image in cache for ${cacheKey}`);
                          updateImageSource(img, objectUrl);
                          updateImageSourceSet(img, objectUrl);
                          img.setAttribute('data-translated', 'true');
                          hideLoadingSpinner();
                        }
                      });
                    }, 1000); // Check every second
                  } else {
                    // Mark the image as being processed
                    img.setAttribute('data-processing', 'true');
                    const processingKey = await generateProcessingCacheKey(img);
                    chrome.storage.local.set({ [processingKey]: true });
                    console.log(`Translation not found in cache for ${cacheKey}`);
                    console.log(`Processing image ${processingKey}...`);
                    hideLoadingSpinner();
                    showLoadingSpinner(img, 'Processing');
                    try {
                      const response = await submitImage(img, imgBlob);
                      await processApiResponse(response, img, imgBlob);
                    } catch (error) {
                      console.error('Error:', error);
                    } finally {
                      hideLoadingSpinner();
                      // Remove the processing attribute
                      img.removeAttribute('data-processing');
                      chrome.storage.local.remove(processingKey);
                    }
                  }
                }
              }
            }, startwait);
          }
        });
      }
    }
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'sync') {
      if (changes.enabledWebsites) {
        items.enabledWebsites = changes.enabledWebsites.newValue;
      }
      if (changes.colorize) {
        items.colorize = changes.colorize.newValue;
      }
      if (changes.translate) {
        items.translate = changes.translate.newValue;
      }
      if (changes.apiUrl) {
        items.apiUrl = changes.apiUrl.newValue;
      }
      if (changes.target_language) {
        items.target_language = changes.target_language.newValue;
      }
    }
  });
});