/**
 * CDN Manager for Alibaba Cloud OSS
 * Handles image uploads from China server to OSS
 */

const OSS = require('ali-oss');

class CDNManager {
  constructor() {
    this.client = null;
    this.cdnDomain = process.env.CDN_DOMAIN || 'https://cdn.yourdomain.com';
    this.bucketName = process.env.OSS_BUCKET || 'your-app-images';
    this.enabled = process.env.CDN_ENABLED === 'true';
  }

  /**
   * Initialize OSS client
   */
  initialize() {
    if (!this.enabled) {
      console.log('⚠️  CDN disabled - using local storage');
      return;
    }

    try {
      this.client = new OSS({
        region: process.env.OSS_REGION || 'oss-cn-beijing',
        accessKeyId: process.env.OSS_ACCESS_KEY_ID,
        accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
        bucket: this.bucketName
      });
      console.log('✅ CDN Manager initialized (Alibaba OSS)');
    } catch (error) {
      console.error('❌ Failed to initialize CDN:', error.message);
      this.enabled = false;
    }
  }

  /**
   * Upload image to OSS
   * @param {Buffer} fileBuffer - Image file buffer
   * @param {string} filename - Original filename
   * @param {string} folder - Folder path (e.g., 'products', 'users')
   * @returns {Promise<string>} - CDN URL of uploaded image
   */
  async uploadImage(fileBuffer, filename, folder = 'images') {
    if (!this.enabled || !this.client) {
      console.warn('⚠️  CDN not enabled, cannot upload');
      return null;
    }

    try {
      // Generate unique filename
      const timestamp = Date.now();
      const ext = filename.split('.').pop();
      const uniqueFilename = `${folder}/${timestamp}_${Math.random().toString(36).substr(2, 9)}.${ext}`;

      // Upload to OSS
      const result = await this.client.put(uniqueFilename, fileBuffer, {
        headers: {
          'Content-Type': this.getContentType(ext),
          'Cache-Control': 'public, max-age=2592000' // 30 days
        }
      });

      // Return CDN URL
      const cdnUrl = `${this.cdnDomain}/${uniqueFilename}`;
      console.log(`✅ Image uploaded to CDN: ${cdnUrl}`);
      
      return cdnUrl;
    } catch (error) {
      console.error('❌ Failed to upload to CDN:', error.message);
      throw error;
    }
  }

  /**
   * Upload multiple images
   */
  async uploadImages(files, folder = 'images') {
    if (!Array.isArray(files)) {
      files = [files];
    }

    const uploadPromises = files.map(file => 
      this.uploadImage(file.buffer, file.originalname, folder)
    );

    return await Promise.all(uploadPromises);
  }

  /**
   * Delete image from OSS
   */
  async deleteImage(imageUrl) {
    if (!this.enabled || !this.client) {
      return false;
    }

    try {
      // Extract path from CDN URL
      const path = imageUrl.replace(this.cdnDomain + '/', '');
      await this.client.delete(path);
      console.log(`✅ Image deleted from CDN: ${imageUrl}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to delete from CDN:', error.message);
      return false;
    }
  }

  /**
   * Get CDN URL for a path
   */
  getCDNUrl(path) {
    return `${this.cdnDomain}/${path}`;
  }

  /**
   * Get content type based on file extension
   */
  getContentType(ext) {
    const types = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'svg': 'image/svg+xml',
      'pdf': 'application/pdf'
    };
    return types[ext.toLowerCase()] || 'application/octet-stream';
  }

  /**
   * Check if CDN is enabled and working
   */
  isEnabled() {
    return this.enabled && this.client !== null;
  }
}

// Singleton instance
const cdnManager = new CDNManager();

module.exports = cdnManager;

