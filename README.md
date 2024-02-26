# manga-image-translator-chrome-extension

This README file provides information about the manga-image-translator-chrome-extension project. The project aims to create a Chrome extension that utilizes the manga-image-translator API to translate manga.

Please note that this extension is currently a Proof of Concept and may not function optimally on all websites.

To use the manga-image-translator API, the following requirements must be met:

To install this extension, follow the steps below:

1. Go to the [Chrome Extensions Developer Documentation](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world).
2. Follow the instructions to install the extension as an unpacked extension.

- You need to have a manga-image-translator instance. You can find the repository for the manga-image-translator [here](https://github.com/zyddnys/manga-image-translator).
- The manga-image-translator instance must be accessible via HTTPS and have a valid SSL certificate.
- CORS (Cross-Origin Resource Sharing) must be configured for the manga-image-translator instance with the following settings:
    - Access-Control-Allow-Origin: "*"
    - Access-Control-Allow-Methods: "GET, POST, OPTIONS"
    - Access-Control-Allow-Headers: "DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range"
    - Access-Control-Expose-Headers: "Content-Length,Content-Range"

Supplementary Information:

- The log console contains various logs.
- Some errors in the log are expected. The extension first attempts to access images without re-downloading them. If this fails, usually due to CORS issues, the image is then downloaded.
- The future evolution of this extension is uncertain. It was primarily created as an opportunity to develop a first Chrome extension.
