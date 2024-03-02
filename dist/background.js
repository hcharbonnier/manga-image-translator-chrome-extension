let items = {};

chrome.storage.sync.get({
  enabled: false,
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
        args: [items,tab],
        function: (items,tab) => {
          const proxyUrl = 'https://corsproxy.io/?';

          // Create a URL object from tab.url
          const urlObj = new URL(tab.url);
          // Split the hostname into parts
          const parts = urlObj.hostname.split('.');
          // Get the last two parts of the hostname
          const domain = parts.slice(-2).join('.');
          switch (domain) {
            case 'hitomi.com':
              var startwait = 700;
              break;
            case 'nhentai.net':
              var startwait = 0;
              break;
            case 'klmanga.com':
              var startwait = 1000;
              break;
            case 'klz9.com': 
              var startwait = 1000;
              break;
            default:
              var startwait =500;
          }

          // Function to get pixel count of an image
          function getPixelCount(img) {
            console.log("Getting pixel count" + img.naturalWidth * img.naturalHeight)
            return img.naturalWidth * img.naturalHeight;
          }

          // Function to replace an image
          function replaceImage(img, newSrc) {
            console.log("Replacing image")
            img.src = newSrc;
            console.log("image src replaced")
            // const newImg = new Image();
            // newImg.src = img.src;
            // // When the new image is loaded, replace the original image with the new one
            // newImg.onload = function() {
            //   if (img.parentNode) {
            //     img.parentNode.replaceChild(newImg, img);
            //   }
            // };
          }

          function replaceSourceSet(img, newSrc) {
            console.log("Replacing source set")
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
            console.log("source set replaced")
          }

          // Function to get image as Blob from cache and if not available, fetch it
          async function getImageBlob(img) {
            console.log("Getting image as blob: " + img.src)
            if (img.src.startsWith('chrome://')) {
              // Skip chrome:// URLs
              throw new Error('Cannot fetch chrome:// URL');
            }
          
            // Create a new image element
            var newImg = new Image();
            newImg.crossOrigin = "Anonymous"; // This enables CORS
            newImg.src = img.src;
          
            // Create an off-screen canvas
            var canvas = document.createElement('canvas');
            canvas.width = newImg.naturalWidth; // or 'width' if you want a special/scaled size
            canvas.height = newImg.naturalHeight; // or 'height' if you want a special/scaled size
          
            // Context to draw in canvas
            var ctx = canvas.getContext('2d');
            ctx.drawImage(newImg, 0, 0, canvas.width, canvas.height);
          
            // Get raw image data
            return new Promise((resolve, reject) => {
              canvas.toBlob(blob => {
                if (blob) {
                  resolve(blob);
                } else {
                  console.log('Canvas to Blob conversion failed');
                  reject('Canvas to Blob conversion failed');
                }
              });
            });
          }

          // Function to fetch image as Blob from url (called by getImageAsBlob if read from cache failed)
          function fetchImage(url) {
            console.log("Fetching image as blob: " + url)
            if (url.startsWith('chrome://')) {
              // Skip chrome:// URLs
              return Promise.reject('Cannot fetch chrome:// URL');
            }

            return fetch(proxyUrl + url)
            .then(response => {
              return response.blob().then(blob => {
                if (!response.ok) {
                  throw new Error(`HTTP error! status: ${response.status}`);
                } 
                return blob;
              });
            });
            
          }

          // Function to post image to API and get task ID
          function submitImage (apiUrl,target_language,imageBlob) {
            if (!imageBlob){
              return { taskId: "0", status: "error" };
            }
            console.log("Posting image to API"+ apiUrl)
            const formData = new FormData();
            formData.append('file', imageBlob);
            formData.append('size', 'X');
            formData.append('detector', 'auto');
            formData.append('direction', 'auto');
            formData.append('translator', 'deepl');
            formData.append('tgt_lang', target_language);

            return fetch(apiUrl, {
              method: 'POST',
              body: formData
            })
            .then(response => {
              if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
              }
              return response.json();
            })
            .then(data => {
              // Return an object that includes both task_id and status
              if (!data.task_id || data.status !== 'successful') {
                throw new Error({ taskId: "0", status: "error" });
              } else {
                return({ taskId: data.task_id, status: data.status });
              }
            })
          }

          // Function to poll task state
          function pollTaskState(url, taskId) {
            console.log("Polling task state2")
            return fetch(`${url}?taskid=${taskId}`, { // Add taskid as a query parameter in the URL
              method: 'GET', // Change method to GET as you're not sending a body anymore
              headers: { 'Content-Type': 'application/json' }
            }).then(response => response.json());
          }

          // Function to get translated image
          function getTranslatedImage(url, taskId) {
            console.log("Getting translated image")
            if (!taskId) {
              console.error('Task ID is undefined');
              throw new Error('Task ID is undefined');
            }
            return fetch(`${url}/${taskId}`).then(response => response.blob());
          }

          function showLoading(img) {
            // Create a new div element for the loading spinner
            let loadingDiv = document.createElement('div');
            loadingDiv.className = 'spinner-manga';
            loadingDiv.style.position = 'absolute';
            loadingDiv.style.top = img.offsetTop + 'px'; // Position it at the top of the image
            loadingDiv.style.left = img.offsetLeft + 'px'; // Position it at the left of the image
            loadingDiv.style.width = img.offsetWidth + 'px'; // Make it the same width as the image
            loadingDiv.style.height = img.offsetHeight + 'px'; // Make it the same height as the image
            //loadingDiv.style.backgroundColor = 'rgba(255, 255, 255, 0.5)';
            loadingDiv.style.display = 'flex';
            loadingDiv.style.justifyContent = 'center';
            loadingDiv.style.alignItems = 'center';
            loadingDiv.style.zIndex = 10000;
            loadingDiv.innerHTML = `
              <div style="
                border: 16px solid #f3f3f3; /* Light grey */
                border-top: 16px solid #3498db; /* Blue */
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
            // Add the loading spinner to the image's parent
            document.body.appendChild(loadingDiv);
            document.head.appendChild(style);
            // Return the loading div so it can be removed later
            return loadingDiv;
          }

          function hideLoading() {
            // Find the loading div in the body of the document
            let loadingDiv = document.body.querySelector('.spinner-manga');
            if (loadingDiv) {
              // Remove the loading spinner from the body of the document
              loadingDiv.parentNode.removeChild(loadingDiv);
            }
          }

          // Function to image's url to API and get task ID
          function submitUrl(apiUrl,target_language,imgUrl) {
            console.log("Posting Url to API"+ apiUrl)
            const formData = new FormData();
            formData.append('url', imgUrl);
            formData.append('size', 'X');
            formData.append('detector', 'auto');
            formData.append('direction', 'auto');
            formData.append('translator', 'deepl');
            formData.append('tgt_lang', target_language);

            return fetch(apiUrl, {
              method: 'POST',
              body: formData
            })
            .then(response => {
              if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
              }
              return response.json();
            })
            .then(data => {
              // Return an object that includes both task_id and status
              if (!data.taskId || data.status !== 'successful') {
                throw new Error(`{ taskId: ${data.task_id}, status: ${data.status} }`);
              } else {
              return { taskId: data.task_id, status: data.status };
              }
            })
            .catch(error => {
              throw new Error('{ taskId: "0", status: "error" }');
            });
          }

          // Function to submit image to the API
          async function submit(img){
            // Submit the image to the API
            // Preference order of submit: Blob -> URL -> Fetched blob
            let blob = null
            try {
              blob = await getImageBlob(img)
              return await submitImage(`${items.apiUrl}/submit`,items.target_language,blob)
            } catch (error) {
              console.log("Failed to get image as blob. Try to submit image as URL.")
              try {
                return await submitUrl(`${items.apiUrl}/submit`, items.target_language,img.src)
              } catch (error) {
                console.log("Failed to submit image as URL try to fetch+submit image")
                try {
                  blob=await fetchImage(img.src)
                  return await submitImage(`${items.apiUrl}/submit`,items.target_language,blob)
                }
                catch {
                  hideLoading(img);
                  console.log("Image submission was not successful, skipping this image");
                  return;
                }
              }
            }
          }

          function sleep(ms) {
            console.log("Sleeping"+ms + "ms")
            return new Promise(resolve => setTimeout(resolve, ms));
          }

          setTimeout(function() {
            console.log("Script running")
            const images = document.getElementsByTagName('img');
  
            // Get all images on the page
            for (let img of images) {
              console.log("Image found")
              // If the image has more than 500000 pixels
              if (getPixelCount(img) > 500000 && !img.src.startsWith('chrome://')) {
                // Fetch image as Blob
                let loadingDiv = showLoading(img);

                //submit the image to the API
                submit(img).then(response => {
                  let taskId = response.taskId

                  pollTaskState(`${items.apiUrl}/task-state`, taskId)
                    .then(async response => {
                      console.log("Response: " + JSON.stringify(response))
                      await sleep(response.waiting * 3 * 1000)
                      .then (() => {
                      // Poll task state until it's finished
                      const pollInterval = setInterval(() => {
                        console.log("Polling task state")
                        pollTaskState(`${items.apiUrl}/task-state`, taskId) // Use response.taskId
                        .then(response => {
                          console.log("Response: " + JSON.stringify(response))
                          if (response.finished) {
                            clearInterval(pollInterval);
                            // Get translated image
                            console.log("Getting translated image")
                            getTranslatedImage(`${items.apiUrl}/result`, taskId)
                              .then(translatedImageBlob => {
                                // Create object URL from Blob
                                const objectUrl = URL.createObjectURL(translatedImageBlob);
                                // Replace the image with the translated one
                                hideLoading(img);
                                replaceImage(img, objectUrl);
                                replaceSourceSet(img, objectUrl);
                              });
                          } 
                        });
                      }, 1000); // Poll every second
                    })
                  })
                })
                .catch(error => console.error('Error:', error));
              }
            }
          },startwait)
        }
      });
    }
  });

  chrome.storage.onChanged.addListener(function(changes, areaName) {
    if (areaName === 'sync' && changes.enabled) {
      // Update the enabled status in the items object
      items.enabled = changes.enabled.newValue;
      console.log('The value of "enabled" is set to ' + items.enabled);
    }
    if (areaName === 'sync' && changes.enabled) {
      // Update the enabled status in the items object
      items.enabled = changes.enabled.newValue;
      console.log('The value of "enabled" is set to ' + items.enabled);
    }
    if (areaName === 'sync' && changes.apiUrl) {
      // Update the apiUrl status in the items object
      items.apiUrl = changes.apiUrl.newValue;
      console.log('The value of "apiUrl" is set to ' + items.apiUrl);
    }
    if (areaName === 'sync' && changes.target_language) {
      // Update the target_language status in the items object
      items.target_language = changes.target_language.newValue;
      console.log('The value of "target_language" is set to ' + items.target_language);
    }
  });
});