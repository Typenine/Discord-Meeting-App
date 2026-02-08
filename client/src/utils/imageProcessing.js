/**
 * Image processing utilities for agenda item images
 * Handles resizing, compression, and format conversion
 */

/**
 * Process an image file for agenda item attachment
 * - Resize to max 900px (preserving aspect ratio)
 * - Compress to target ≤250KB
 * - Convert to webp (if supported) or jpeg
 * - Return data URL or error
 * 
 * @param {File} file - The image file to process
 * @returns {Promise<{success: boolean, dataUrl?: string, error?: string}>}
 */
export async function processImageFile(file) {
  // Validate file type
  if (!file.type.startsWith('image/')) {
    return { success: false, error: 'File must be an image' };
  }

  // Max size constraints
  const MAX_DIMENSION = 900;
  const MAX_SIZE_BYTES = 250 * 1024; // 250KB
  const MIN_QUALITY = 0.5;

  try {
    // Load image
    const img = await loadImage(file);
    
    // Calculate new dimensions
    let { width, height } = img;
    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
      width = Math.floor(width * ratio);
      height = Math.floor(height * ratio);
    }

    // Create canvas
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);

    // Try webp first (better compression)
    const supportsWebp = canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
    const format = supportsWebp ? 'image/webp' : 'image/jpeg';

    // Compress with quality adjustment
    let quality = 0.9;
    let dataUrl = canvas.toDataURL(format, quality);
    let sizeBytes = estimateDataUrlSize(dataUrl);

    // Reduce quality until under size limit
    while (sizeBytes > MAX_SIZE_BYTES && quality > MIN_QUALITY) {
      quality -= 0.1;
      dataUrl = canvas.toDataURL(format, quality);
      sizeBytes = estimateDataUrlSize(dataUrl);
    }

    // Final check
    if (sizeBytes > MAX_SIZE_BYTES) {
      return { 
        success: false, 
        error: `Image too large (${Math.round(sizeBytes / 1024)}KB). Please use a smaller image or lower resolution.` 
      };
    }

    return { success: true, dataUrl };
  } catch (err) {
    console.error('[imageProcessing] Error processing image:', err);
    return { success: false, error: 'Failed to process image. Please try a different file.' };
  }
}

/**
 * Load an image file into an HTMLImageElement
 * @param {File} file 
 * @returns {Promise<HTMLImageElement>}
 */
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Estimate the size of a data URL in bytes
 * @param {string} dataUrl 
 * @returns {number}
 */
function estimateDataUrlSize(dataUrl) {
  // Remove the data URL prefix to get base64 string
  const base64 = dataUrl.split(',')[1] || '';
  // Base64 encoding increases size by ~33%, so decode size is roughly:
  return Math.floor((base64.length * 3) / 4);
}

/**
 * Validate image URL format
 * @param {string} url 
 * @returns {{valid: boolean, error: string}}
 */
export function validateImageUrl(url) {
  if (!url || url.trim() === '') {
    return { valid: true, error: '' };
  }
  const trimmed = url.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return { valid: true, error: '' };
  }
  return { valid: false, error: 'Image URL must start with http:// or https://' };
}
