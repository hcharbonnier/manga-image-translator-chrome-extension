# Manga Image Translator Chrome Extension

A Chrome extension that integrates with the [Manga Image Translator](https://github.com/zyddnys/manga-image-translator) API to translate manga directly within the browser.

> **Note:** This extension is currently a **Proof of Concept** and may not work optimally on all websites.

---

## 🚀 Features

- Translates and colorize manga images in real time using the **Manga Image Translator API**.
- Keep in Chrome cache the translated images (each set of differents settings have a dedicated cache)
- All settings from [Manga Image Translator](https://github.com/zyddnys/manga-image-translator) are availables in the Advanced settings page
- Add a right-click option to translate/colorize option on demand
- Beta: Option to capture the images via Chrome screenshot feature, in order to translate images on website, requiring a special Origin when fetching the images. I this mode don't touch scroll the page until the capture is finished 

---

## 🛠 Requirements

To use this extension, ensure you have:

- A running instance of [Manga Image Translator](https://github.com/zyddnys/manga-image-translator) in server mode.
- To have acceptable perrformance, ensure [Manga Image Translator](https://github.com/zyddnys/manga-image-translator) is set to use GPU.
- If translation are too slow, consider reducing image detection size in advanced settings 

---

## 📌 Installation Guide

### 1. Install the Extension

Follow these steps to install the extension manually:

1. Download or clone this repository.
2. Open **Google Chrome** and navigate to [`chrome://extensions/`](chrome://extensions/).
3. Enable **Developer mode** (toggle in the top right corner).
4. Click **Load unpacked** and select the extension's root folder.

### 2. Set Up the Extension

1. Pin the extension on the Chrome toolbar for easy access.
2. Open the extension popup by clicking on the extension icon and enter your **Manga Image Translator instance URL** (e.g., `http://127.0.0.1:5003`).
3. Configure the URL of your [Manga Image Translator](https://github.com/zyddnys/manga-image-translator) instance
4. Click **Enable** to activate translation for the current website.
5. Or right-click and image and choose "Translate Image..."

---

## 📝 Notes

- Some errors in the logs are **normal** as the extension tries different methods to fetch and translate images.
- Performance and compatibility may vary depending on the website and your hardware.

---

## 🛠 Troubleshooting

- If the extension does not work, verify that:
  - Your Manga Image Translator instance is **running and accessible**.
  - The **API URL** is correctly configured in the extension settings.
  - The website allows image processing via third-party scripts.

For any issues, feel free to **open an issue** on this repository!

---

## 📜 License

This project is licensed under the [GPL-3.0](LICENSE).how 