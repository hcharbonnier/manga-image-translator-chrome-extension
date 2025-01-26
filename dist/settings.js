// Function to restore options from storage
function restoreOptions() {
  chrome.storage.sync.get('advancedSettings', function (data) {
    const advancedSettings = data.advancedSettings || {};

    // Update form fields with the restored settings
    document.getElementById('render_renderer').value = advancedSettings.render.renderer;
    document.getElementById('render_alignment').value = advancedSettings.render.alignment;
    document.getElementById('render_disable_font_border').checked = advancedSettings.render.disable_font_border;
    document.getElementById('render_font_size_offset').value = advancedSettings.render.font_size_offset;
    document.getElementById('render_font_size_minimum').value = advancedSettings.render.font_size_minimum;
    document.getElementById('render_direction').value = advancedSettings.render.direction;
    document.getElementById('render_uppercase').checked = advancedSettings.render.uppercase;
    document.getElementById('render_lowercase').checked = advancedSettings.render.lowercase;
    document.getElementById('render_gimp_font').value = advancedSettings.render.gimp_font;
    document.getElementById('render_no_hyphenation').checked = advancedSettings.render.no_hyphenation;
    document.getElementById('render_font_color').value = advancedSettings.render.font_color;
    document.getElementById('render_line_spacing').value = advancedSettings.render.line_spacing;
    document.getElementById('render_font_size').value = advancedSettings.render.font_size;
    document.getElementById('upscale_upscaler').value = advancedSettings.upscale.upscaler;
    document.getElementById('upscale_revert_upscaling').checked = advancedSettings.upscale.revert_upscaling;
    document.getElementById('upscale_upscale_ratio').value = advancedSettings.upscale.upscale_ratio;
    document.getElementById('translator_translator').value = advancedSettings.translator.translator;
    document.getElementById('translator_no_text_lang_skip').checked = advancedSettings.translator.no_text_lang_skip;
    document.getElementById('detector_detector').value = advancedSettings.detector.detector;
    document.getElementById('detector_detection_size').value = advancedSettings.detector.detection_size;
    document.getElementById('detector_text_threshold').value = advancedSettings.detector.text_threshold;
    document.getElementById('detector_det_rotate').checked = advancedSettings.detector.det_rotate;
    document.getElementById('detector_det_auto_rotate').checked = advancedSettings.detector.det_auto_rotate;
    document.getElementById('detector_det_invert').checked = advancedSettings.detector.det_invert;
    document.getElementById('detector_det_gamma_correct').checked = advancedSettings.detector.det_gamma_correct;
    document.getElementById('detector_box_threshold').value = advancedSettings.detector.box_threshold;
    document.getElementById('detector_unclip_ratio').value = advancedSettings.detector.unclip_ratio;
    document.getElementById('inpainter_inpainter').value = advancedSettings.inpainter.inpainter;
    document.getElementById('inpainter_inpainting_size').value = advancedSettings.inpainter.inpainting_size;
    document.getElementById('inpainter_inpainting_precision').value = advancedSettings.inpainter.inpainting_precision;
    document.getElementById('ocr_use_mocr_merge').checked = advancedSettings.ocr.use_mocr_merge;
    document.getElementById('ocr_ocr').value = advancedSettings.ocr.ocr;
    document.getElementById('ocr_min_text_length').value = advancedSettings.ocr.min_text_length;
    document.getElementById('ocr_ignore_bubble').value = advancedSettings.ocr.ignore_bubble;
    document.getElementById('kernel_size').value = advancedSettings.kernel_size;
    document.getElementById('mask_dilation_offset').value = advancedSettings.mask_dilation_offset;
    document.getElementById('disable_cache').checked = advancedSettings.disable_cache;
  });
}

// Function to save options to storage
function saveOptions(event) {
  if (event) event.preventDefault();
  const form = document.getElementById('optionsForm');
  const formData = new FormData(form);

  const advancedSettings = {
    render: {
      renderer: formData.get('render_renderer'),
      alignment: formData.get('render_alignment'),
      disable_font_border: formData.get('render_disable_font_border') === 'on',
      font_size_offset: parseInt(formData.get('render_font_size_offset')),
      font_size_minimum: parseInt(formData.get('render_font_size_minimum')),
      direction: formData.get('render_direction'),
      uppercase: formData.get('render_uppercase') === 'on',
      lowercase: formData.get('render_lowercase') === 'on',
      gimp_font: formData.get('render_gimp_font'),
      no_hyphenation: formData.get('render_no_hyphenation') === 'on',
      font_color: formData.get('render_font_color'),
      line_spacing: parseInt(formData.get('render_line_spacing')),
      font_size: parseInt(formData.get('render_font_size'))
    },
    upscale: {
      upscaler: formData.get('upscale_upscaler'),
      revert_upscaling: formData.get('upscale_revert_upscaling') === 'on',
      upscale_ratio: parseInt(formData.get('upscale_upscale_ratio'))
    },
    translator: {
      translator: formData.get('translator_translator'),
      no_text_lang_skip: formData.get('translator_no_text_lang_skip') === 'on'
    },
    detector: {
      detector: formData.get('detector_detector') ,
      detection_size: parseInt(formData.get('detector_detection_size')),
      text_threshold: parseFloat(formData.get('detector_text_threshold')),
      det_rotate: formData.get('detector_det_rotate') === 'on',
      det_auto_rotate: formData.get('detector_det_auto_rotate') === 'on',
      det_invert: formData.get('detector_det_invert') === 'on',
      det_gamma_correct: formData.get('detector_det_gamma_correct') === 'on',
      box_threshold: parseFloat(formData.get('detector_box_threshold')),
      unclip_ratio: parseFloat(formData.get('detector_unclip_ratio'))
    },
    inpainter: {
      inpainter: formData.get('inpainter_inpainter'),
      inpainting_size: parseInt(formData.get('inpainter_inpainting_size')),
      inpainting_precision: formData.get('inpainter_inpainting_precision')
    },
    ocr: {
      use_mocr_merge: formData.get('ocr_use_mocr_merge') === 'on',
      ocr: formData.get('ocr_ocr') ,
      min_text_length: parseInt(formData.get('ocr_min_text_length')) ,
      ignore_bubble: parseInt(formData.get('ocr_ignore_bubble')) 
    },
    kernel_size: parseInt(formData.get('kernel_size')) ,
    mask_dilation_offset: parseInt(formData.get('mask_dilation_offset')) ,
    disable_cache: formData.get('disable_cache') === 'on', // New setting
  };

  console.log('Modified advanced settings:', advancedSettings);

  chrome.storage.sync.set({ advancedSettings }, function() {
    console.log('Advanced Settings saved');
    chrome.runtime.sendMessage({ type: 'settings-updated' });
    chrome.runtime.sendMessage({ type: 'update-refresh-icon' });
    chrome.runtime.sendMessage({ type: 'update-badge-text' });
    chrome.runtime.sendMessage({ type: 'settings-modified' }); // Added message to background.js
  });
}

// Function to reset options to default values
function resetOptions() {
  const defaultadvancedSettings = {
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
      font_color: '',
      line_spacing: 0,
      font_size: 0
    },
    upscale: {
      upscaler: 'waifu2x',
      revert_upscaling: false,
      upscale_ratio: 0
    },
    translator: {
      translator: 'nllb_big',
      no_text_lang_skip: false
    },
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
    inpainter: {
      inpainter: 'default',
      inpainting_size: 1024,
      inpainting_precision: 'fp32'
    },
    ocr: {
      use_mocr_merge: false,
      ocr: '32px',
      min_text_length: 0,
      ignore_bubble: 0
    },
    kernel_size: 3,
    mask_dilation_offset: 0,
    disable_cache: false,
  };

  chrome.storage.sync.set({ advancedSettings: defaultadvancedSettings }, function() {
    console.log('advanced Settings reset to default');
    restoreOptions(); // Restore the default settings in the form
    chrome.runtime.sendMessage({ type: 'settings-modified' }); // Added message to background.js
  });
}

// Event listeners
document.addEventListener('DOMContentLoaded', function () {
  restoreOptions();
  document.getElementById('optionsForm').addEventListener('submit', saveOptions);

  // Add event listeners to save settings in real-time
  const inputs = document.querySelectorAll('#optionsForm input, #optionsForm select');
  inputs.forEach(input => {
    input.addEventListener('change', saveOptions);
  });

  // Add event listener to reset button
  document.getElementById('resetButton').addEventListener('click', resetOptions);
});