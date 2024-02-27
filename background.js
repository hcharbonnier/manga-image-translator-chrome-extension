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
        args: [items],
        function: (items) => {
          
          const proxyUrl = 'https://corsproxy.io/?';

          // Function to get pixel count of an image
          function getPixelCount(img) {
            console.log("Getting pixel count" + img.naturalWidth * img.naturalHeight)
            return img.naturalWidth * img.naturalHeight;
          }

          // Function to replace an image
          function replaceImage(img, newSrc) {
            console.log("Replacing image")
            img.src = newSrc;
            console.log("image replaced")
          }

          // Function to get image as Blob from cache and if not available, fetch it
          function getImageAsBlob(img) {
            console.log("Getting image as blob: " + img.src)
            if (img.src.startsWith('chrome://')) {
              // Skip chrome:// URLs
              return Promise.reject('Cannot fetch chrome:// URL');
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
                  fetchImageAsBlob(img.src)
                    .then(blob => resolve(blob))
                    .catch(err => reject(err));
                }
              });
            });
          }

          // Function to fetch image as Blob from url (called by getImageAsBlob if read from cache failed)
          function fetchImageAsBlob(url) {
            console.log("Fetching image as blob: " + url)
            if (url.startsWith('chrome://')) {
              // Skip chrome:// URLs
              return Promise.reject('Cannot fetch chrome:// URL');
            }

            return fetch(proxyUrl + url)
            .then(response => {
              return response.blob().then(blob => {
                if (!response.ok) {
                  console.log("Response not ok: submit failed")
                } else {
                  console.log("Response ok: submit ok")
                }
                console.log("Response size: " + blob.size);
                return blob;
              });
            });
            
          }

          // Function to post image to API and get task ID
          function postImageToApi(url,target_language, imageBlob) {
            console.log("Posting image to API"+ url)
            const formData = new FormData();
            formData.append('file', imageBlob);
            formData.append('size', 'M');
            formData.append('detector', 'auto');
            formData.append('direction', 'auto');
            formData.append('translator', 'google');
            formData.append('tgt_lang', target_language);

            return fetch(url, {
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
              return { taskId: data.task_id, status: data.status };
            })
            .catch(error => {
              console.error('There was a problem with the fetch operation: ', error);
            });
          }

          // Function to image's url to API and get task ID
          function postUrlToApi(serverUrl,target_language, imageUrl) {
            console.log("Posting image to API"+ serverUrl)
            const formData = new FormData();
            formData.append('url', imageUrl);
            formData.append('size', 'M');
            formData.append('detector', 'auto');
            formData.append('direction', 'auto');
            formData.append('translator', 'google');
            formData.append('tgt_lang', target_language);

            return fetch(serverUrl, {
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
              return { taskId: data.task_id, status: data.status };
            })
            .catch(error => {
              console.error('There was a problem with the fetch operation: ', error);
            });
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
              return Promise.reject('Task ID is undefined');
            }
            return fetch(`${url}/${taskId}`).then(response => response.blob());
          }
          console.log("Script running")
          const images = document.getElementsByTagName('img');
  
          // Get all images on the page
          for (let img of images) {
            console.log("Image found")
            // If the image has more than 500000 pixels
            if (getPixelCount(img) > 500000 && !img.src.startsWith('chrome://')&& !img.src.startsWith('blob:')) {
              // Fetch image as Blob
              postUrlToApi(`${items.apiUrl}/submit`, items.target_language,img.src)
              .then (response => {
                if (!response.taskId || response.status !== 'successful') {
                  return postImageToApi(`${items.apiUrl}/submit`, items.target_language,imageBlob);
                }
                else {
                  return response
                }
              })
              .then(response => {
                if (!response.taskId || response.status !== 'successful') {
                  console.log("Image submission was not successful, skipping this image");
                  return;
                }

                // Poll task state until it's finished
                const pollInterval = setInterval(() => {
                  let taskId = response.taskId
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
                          replaceImage(img, objectUrl);
                        });
                    }
                  });
                }, 2500); // Poll every second
              })
              .catch(error => console.error('Error:', error));
            }
          }
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