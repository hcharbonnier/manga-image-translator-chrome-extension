let items = {};
chrome.storage.sync.get({
  enabled: false,
  colorize: false,
  translate: true,
  target_language: 'ENG',
  apiUrl: '',
}, function(fetchedItems) {
  items = fetchedItems;
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    console.log('Tab updated', tabId, changeInfo, tab);
    console.log('Items1:', items);    

    if (changeInfo.status === 'complete' && tab.active && items.enabled) {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        args: [items, tab],
        function: async (items, tab) => {
          const proxyUrls = [
            'https://corsproxy.io/?',
            'https://api.codetabs.com/v1/proxy/?quest=',
          ];

          const urlObj = new URL(tab.url);
          const parts = urlObj.hostname.split('.');
          const domain = parts.slice(-2).join('.');
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

          function replaceImage(img, newSrc) {
            img.src = newSrc;
          }

          function replaceSourceSet(img, newSrc) {
            let pictureElement = img.parentElement;
            if (pictureElement && pictureElement.tagName === 'PICTURE') {
              let sources = pictureElement.getElementsByTagName('source');
              let url = new URL(newSrc);
              let extension = url.pathname.split('.').pop();
              let typeMap = {
                'jpg': 'image/jpeg',
                'jpeg': 'image/jpeg',
                'png': 'image/png',
                'webp': 'image/webp',
                'gif': 'image/gif',
                'svg': 'image/svg+xml',
                'avif': 'image/avif',
                'jxl': 'image/jxl'
              };
              let newType = typeMap[extension];
              for (let source of sources) {
                source.srcset = newSrc;
                if (newType) {
                  source.type = newType;
                }
              }
            }
          }

          async function getImageBlob(img) {
            if (!img.src || img.src.startsWith('chrome://')) {
              throw new Error('Cannot fetch chrome:// URL or img.src is undefined.')
            }
          
            var newImg = new Image();
            newImg.crossOrigin = "Anonymous";
            newImg.src = img.src;
          
            var canvas = document.createElement('canvas');
            canvas.width = newImg.naturalWidth;
            canvas.height = newImg.naturalHeight;
          
            var ctx = canvas.getContext('2d');
            ctx.drawImage(newImg, 0, 0, canvas.width, canvas.height);
          
            return new Promise((resolve, reject) => {
              canvas.toBlob(blob => {
                if (blob) {
                  resolve(blob);
                } else {
                  reject('Canvas to Blob conversion failed');
                }
              });
            });
          }

          function fetchImage(url) {
            if (url.startsWith('chrome://')) {
              return Promise.reject('Cannot fetch chrome:// URL');
            }

            const fetchWithRetry = (urlToFetch) => {
              return fetch(urlToFetch)
                .then(response => {
                  return response.blob().then(blob => {
                    if (!response.ok) {
                      throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    return blob;
                  });
                });
            };

            return fetchWithRetry(url).catch(() => {
              // Retry with each proxy URL if the initial fetch fails
              let promise = Promise.reject();
              for (const proxyUrl of proxyUrls) {
                promise = promise.catch(() => fetchWithRetry(proxyUrl + url));
              }
              return promise;
            });
          }

          async function submitImage(apiUrl, target_language, colorize, translate,img, imageBlob) {
            if (!imageBlob) {
              return { taskId: "0", status: "error" };
            }

            let colorizer = "none";
            if (colorize) {
              colorizer = "mc2"
            }

            let translator = "original";
            if (translate) {
              translator = "offline";
            }

            console.log("Posting image to API" + apiUrl);
          
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

          async function hashBlob(blob) {
            console.log("Image blob :size " + blob.size);
            const arrayBuffer = await blob.arrayBuffer();
            const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
            return Array.prototype.map.call(new Uint8Array(hashBuffer), x => ('00' + x.toString(16)).slice(-2)).join('');
          }

          async function get_cache_keys(img, blob) {
            const urlObj = new URL(img.dataset.originalSrc);
            const parts = urlObj.hostname.split('.');
            const domain = parts.slice(-2).join('.');

            params=`${items.translate ? items.target_language : 'none'}_${items.colorize ? 'colorized' : 'original'}`
            hash=await hashBlob(blob);
            const cacheKey0 = `${domain}${urlObj.pathname}${urlObj.search}_${params}`;
            const cacheKey1 = `${hash}_${params}`;
            console.log("cachekey0: " + cacheKey0);
            console.log("cachekey1: " + cacheKey1);
            return([cacheKey0, cacheKey1]);
          }

          async function get_cache_key_processing(img) {
            const urlObj = new URL(img.dataset.originalSrc);
            const parts = urlObj.hostname.split('.');
            const domain = parts.slice(-2).join('.');

            params=`${items.translate ? items.target_language : 'none'}_${items.colorize ? 'colorized' : 'original'}`
            const cacheKey0 = `${domain}${urlObj.pathname}${urlObj.search}_${params}_processing`;
            return([cacheKey0]);
          }

          async function getCache(img, blob) {
            let cacheKeys = await get_cache_keys(img, blob);
            console.log("cachekeys: " + cacheKeys);
            for (let cacheKey of cacheKeys) {
              console.log("looking in cache for key cacheKey: " + cacheKey);
              let result = await new Promise((resolve) => {
                chrome.storage.local.get(cacheKey, function(data) {
                  resolve(data);
                });
              });
              if (result[cacheKey]) {
                return { found: true , key: cacheKey, value: result[cacheKey] };
              }
            }
            return { found: false , key: cacheKeys[0], value: null };
          }

          async function getCacheProcessing(img) {
            let cacheKeys = await get_cache_key_processing(img);
            for (let cacheKey of cacheKeys) {
              let result = await new Promise((resolve) => {
                chrome.storage.local.get(cacheKey, function(data) {
                  resolve(data);
                });
              });
              if (result[cacheKey]) {
                return cacheKey;
              }
            }
            return null;
          }

          async function process(response, img, imgBlob) {
            console.log("Processing response...");
            console.log("blob size2: " + imgBlob.size);
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
                  if (buffer.length < totalSize) {
                    break;
                  }

                  const statusCode = buffer[0];
                  const data = buffer.slice(5, totalSize);
                  const decodedData = decoder.decode(data);

                  if (statusCode === 0) {
                    const clonedImg = img.cloneNode(true);
                    const objectUrl = URL.createObjectURL(new Blob([data], { type: 'application/octet-stream' }));
                    replaceImage(img, objectUrl);
                    replaceSourceSet(img, objectUrl);
                    // Convert blob to base64 and store it
                    const base64Data = await blobToBase64(new Blob([data], { type: 'application/octet-stream' }));

                    let cacheKeys = await get_cache_keys(clonedImg, imgBlob);
                    for (let cacheKey of cacheKeys) {
                      chrome.storage.local.set({ [cacheKey]: base64Data });
                      console.log(`Storing translated image data for ${cacheKey}`);
                    }

                  } else if (statusCode >= 1 && statusCode <= 4) {
                    console.log(decodedData);
                    hideLoading();
                    const loadingDiv = showLoading(img, decodedData);
                  }
                  buffer = buffer.slice(totalSize);
                }
              }
            } else {
              console.error(response.statusText);
            }
          }

          function showLoading(img,txt) {
            let loadingDiv = document.createElement('div');
            loadingDiv.style.position = 'absolute';
            loadingDiv.style.top = img.offsetTop + 'px';
            loadingDiv.style.left = img.offsetLeft + 'px';
            loadingDiv.style.width = img.offsetWidth + 'px';
            loadingDiv.style.height = img.offsetHeight + 'px';
            loadingDiv.style.display = 'flex';
            loadingDiv.style.justifyContent = 'center';
            loadingDiv.style.alignItems = 'center';
            loadingDiv.style.zIndex = 10000;
            let loadingTextDiv = loadingDiv.cloneNode(true);

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
            let style = document.createElement('style');
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

          function hideLoading() {
            let loadingDiv = document.body.querySelector('.spinner-manga');
            if (loadingDiv) {
              loadingDiv.parentNode.removeChild(loadingDiv);
            }

            let loadingTextDiv = document.body.querySelector('.spinner-text-manga');
            if (loadingTextDiv) {
              loadingTextDiv.parentNode.removeChild(loadingTextDiv);
            }
          }

          async function GetImage(img) {
            try {
              blob = await getImageBlob(img);
              return blob;
            } catch (error) {
              blob = await fetchImage(img.src);
              return blob;
            }
          }

          async function submit(img,blob) {
            try {
              console.log("trying to submit blob...");
              const res = await submitImage(`${items.apiUrl}/translate/with-form/image/stream`, items.target_language, items.colorize, items.translate, img, blob);
              console.log("submitted blob...");
              return res;
            } catch (error) {
              hideLoading(img);
              return;
            }
          }

          function blobToBase64(blob) {
            return new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
          }

          setTimeout(async function() {
            const images = document.getElementsByTagName('img');
            const uniqueUrls = new Set();
            const images_uniq= [];

            for (let img of images) {
              const imgUrl = img.src;
          
              // Add the image to images_uniq if the URL is not already in the set
            if (!uniqueUrls.has(imgUrl)) {
                uniqueUrls.add(imgUrl);
                images_uniq.push(img);
              }
            }

            for (let img of images_uniq) {

              const rect = img.getBoundingClientRect();  // Get the bounding rectangle of the image. Usefull to detect if the image is visible or not

              console.log(`Image found at coordinates: top=${rect.top}, left=${rect.left}, width=${rect.width}, height=${rect.height}`);
              if (getPixelCount(img) > 300000 &&  rect.width > 0 && rect.height > 0 && !img.src.startsWith('chrome://')  && !img.hasAttribute('data-processing')) {
                // Store the original src in a data attribute
                img.dataset.originalSrc = img.src;
                imgBlob=await GetImage(img);
                const cache = await getCache(img, imgBlob);
                let cacheKey = cache.key;
                const cache_processing = await getCacheProcessing(img);
                if (cache.found) {
                  // Convert base64 to blob URL and use it
                  const base64Data = cache.value;
                  const blob = await (await fetch(base64Data)).blob();
                  const objectUrl = URL.createObjectURL(blob);
                  console.log(`Found translated image in cache for ${cacheKey}`);
                  replaceImage(img, objectUrl);
                  replaceSourceSet(img, objectUrl);
                } else if (cache_processing){
                  // Wait until the image is processed
                  console.log(`Image is being processed`);
                  hideLoading();
                  let loadingDiv = showLoading(img,'Already processing<br> waiting for result: ' + cacheKey);
                  const interval = setInterval(async () => {
                    chrome.storage.local.get(cacheKey, async function(result) {
                      console.log(cacheKey);
                      if (result[cacheKey]) {
                        clearInterval(interval);
                        const base64Data = result[cacheKey];
                        const blob = await (await fetch(base64Data)).blob();
                        const objectUrl = URL.createObjectURL(blob);
                        console.log(`Found translated image in cache for ${cacheKey}`);
                        replaceImage(img, objectUrl);
                        replaceSourceSet(img, objectUrl);
                        hideLoading();
                      }
                    });
                  }, 1000); // Check every second
                } else {
                  // Mark the image as being processed
                  img.setAttribute('data-processing', 'true');
                  const processingKey = await get_cache_key_processing(img);
                  chrome.storage.local.set({ [processingKey]: true });
                  console.log(`Translation not found in cache for ${cacheKey}`);
                  console.log(`Processing image ${processingKey}...`);
                  hideLoading();
                  let loadingDiv = showLoading(img,'Processing');
                  try {
                    const response = await submit(img, imgBlob);
                    await process(response, img, imgBlob);
                  } catch (error) {
                    console.error('Error:', error);
                  } finally {
                    hideLoading();
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
  });

  chrome.storage.onChanged.addListener(function(changes, areaName) {
    if (areaName === 'sync' && changes.enabled) {
      items.enabled = changes.enabled.newValue;
    }
    if (areaName === 'sync' && changes.colorize) {
      items.colorize = changes.colorize.newValue;
    }
    if (areaName === 'sync' && changes.translate) {
      items.translate = changes.translate.newValue;
    }
    if (areaName === 'sync' && changes.apiUrl) {
      items.apiUrl = changes.apiUrl.newValue;
    }
    if (areaName === 'sync' && changes.target_language) {
      items.target_language = changes.target_language.newValue;
    }
  });
});