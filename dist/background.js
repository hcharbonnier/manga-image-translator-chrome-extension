let items = {};
chrome.storage.sync.get({
  enabled: false,
  colorize: false,
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
          let startwait = 500;
          switch (domain) {
            case 'hitomi.la':
              startwait = 700;
              break;
            case 'nhentai.net':
              startwait = 500;
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
            if (img.src.startsWith('chrome://')) {
              throw new Error('Cannot fetch chrome:// URL');
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

          async function submitImage(apiUrl, target_language, colorize, imageBlob) {
            if (!imageBlob) {
              return { taskId: "0", status: "error" };
            }
            let colorizer = "none";
            if (colorize) {
              colorizer = "mc2"
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
              render: {
                direction: "auto",
                font_size_offset: 10,
                font_size_minimum: 20
              },
              colorizer: {
                colorizer: colorizer,
                colorization_size: 576,
                denoise_sigma: 30
              },
              translator: {
                translator: "offline",
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

          async function process(response, img) {
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
                    const objectUrl = URL.createObjectURL(new Blob([data], { type: 'application/octet-stream' }));
                    replaceImage(img, objectUrl);
                    replaceSourceSet(img, objectUrl);
                    img.setAttribute('data-translated', 'true'); // Mark image as translated
                    // Convert blob to base64 and store it
                    const base64Data = await blobToBase64(new Blob([data], { type: 'application/octet-stream' }));

                    const urlObj = new URL(img.dataset.originalSrc);
                    const parts = urlObj.hostname.split('.');
                    const domain = parts.slice(-2).join('.');
                    const cacheKey = `${domain}${urlObj.pathname}${urlObj.search}_${items.target_language}_${items.colorize ? 'colorized' : 'original'}`;

                    console.log(`Storing translated image data for ${cacheKey}`);

                    chrome.storage.local.set({ [cacheKey]: base64Data });
                  } else if (statusCode >= 1 && statusCode <= 4) {
                    console.log(decodedData);
                    const loadingDiv = document.querySelector('.spinner-manga');
                    if (loadingDiv) {
                      loadingDiv.innerHTML = `
                        <div style="
                          border: 16px solid #f3f3f3;
                          border-top: 16px solid #3498db;
                          border-radius: 50%;
                          width: 120px;
                          height: 120px;
                          animation: spin 4s linear infinite;
                        ">
                        <p style="
                          color: white;
                          text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000;
                        ">${decodedData}</p>
                        </div>

                      `;
                    }
                  }
                  buffer = buffer.slice(totalSize);
                }
              }
            } else {
              console.error(response.statusText);
            }
          }

          function showLoading(img) {
            let loadingDiv = document.createElement('div');
            loadingDiv.className = 'spinner-manga';
            loadingDiv.style.position = 'absolute';
            loadingDiv.style.top = img.offsetTop + 'px';
            loadingDiv.style.left = img.offsetLeft + 'px';
            loadingDiv.style.width = img.offsetWidth + 'px';
            loadingDiv.style.height = img.offsetHeight + 'px';
            loadingDiv.style.display = 'flex';
            loadingDiv.style.justifyContent = 'center';
            loadingDiv.style.alignItems = 'center';
            loadingDiv.style.zIndex = 10000;
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
            let style = document.createElement('style');
            style.innerHTML = `
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            `;
            document.body.appendChild(loadingDiv);
            document.head.appendChild(style);
            return loadingDiv;
          }

          function hideLoading() {
            let loadingDiv = document.body.querySelector('.spinner-manga');
            if (loadingDiv) {
              loadingDiv.parentNode.removeChild(loadingDiv);
            }
          }

          async function submit(img) {
            let blob = null;
            try {
              console.log("trying to submit blob...");
              blob = await getImageBlob(img);
              return await submitImage(`${items.apiUrl}/translate/with-form/image/stream`, items.target_language, items.colorize, blob);
            } catch (error) {
              try {
                console.log("trying to fetch image and submit it's blob instead...")
                blob = await fetchImage(img.src);
                return await submitImage(`${items.apiUrl}/translate/with-form/image/stream`, items.target_language, items.colorize, blob);
              } catch (error) {
                try {
                  console.log("trying to submit url instead...")
                  return await submitImage(`${items.apiUrl}/translate/with-form/image/stream`, items.target_language, items.colorize, img.src);  
                } catch {
                  hideLoading(img);
                  return;
                }
              }
            }
          }

          function sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
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
  
            for (let img of images) {
              if (getPixelCount(img) > 700000 && !img.src.startsWith('chrome://') && !img.hasAttribute('data-translated')) {
                // Store the original src in a data attribute
                img.dataset.originalSrc = img.src;

                const urlObj = new URL(img.dataset.originalSrc);
                const parts = urlObj.hostname.split('.');
                const domain = parts.slice(-2).join('.');
                const cacheKey = `${domain}${urlObj.pathname}${urlObj.search}_${items.target_language}_${items.colorize ? 'colorized' : 'original'}`;

                // Check if the image has already been translated
                console.log(`Checking cache for ${cacheKey}`);
                chrome.storage.local.get(cacheKey, async function(result) {
                  if (result[cacheKey]) {
                    // Convert base64 to blob URL and use it
                    const base64Data = result[cacheKey];
                    const blob = await (await fetch(base64Data)).blob();
                    const objectUrl = URL.createObjectURL(blob);
                    console.log(`Found translated image in cache for ${cacheKey}`);
                    replaceImage(img, objectUrl);
                    replaceSourceSet(img, objectUrl);
                    img.setAttribute('data-translated', 'true');
                  } else {
                    console.log(`Translation not found in cache for ${cacheKey}`);
                    let loadingDiv = showLoading(img);

                    try {
                      const response = await submit(img);
                      await process(response, img);
                    } catch (error) {
                      console.error('Error:', error);
                    } finally {
                      hideLoading();
                    }
                  }
                });
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
    if (areaName === 'sync' && changes.apiUrl) {
      items.apiUrl = changes.apiUrl.newValue;
    }
    if (areaName === 'sync' && changes.target_language) {
      items.target_language = changes.target_language.newValue;
    }
  });
});