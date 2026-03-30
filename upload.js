/**
 * Upload Thumbnails to Supabase
 *
 * Usage: node upload.js /path/to/thumbnails-folder
 *
 * This script:
 * 1. Reads all images from the folder you provide
 * 2. Uploads each image to Supabase Storage
 * 3. Adds a row in the database for each thumbnail
 *
 * Supported formats: .jpg, .jpeg, .png, .webp
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const SUPPORTED_FORMATS = ['.jpg', '.jpeg', '.png', '.webp'];

async function uploadThumbnails(folderPath) {
  if (!folderPath) {
    console.log('Please provide a folder path:');
    console.log('  node upload.js /path/to/thumbnails-folder');
    process.exit(1);
  }

  // Resolve the folder path
  const resolvedPath = path.resolve(folderPath);

  if (!fs.existsSync(resolvedPath)) {
    console.log(`Folder not found: ${resolvedPath}`);
    process.exit(1);
  }

  // Get all image files
  const files = fs.readdirSync(resolvedPath).filter(file => {
    const ext = path.extname(file).toLowerCase();
    return SUPPORTED_FORMATS.includes(ext);
  });

  if (files.length === 0) {
    console.log('No image files found in the folder.');
    console.log('Supported formats: ' + SUPPORTED_FORMATS.join(', '));
    process.exit(1);
  }

  console.log(`Found ${files.length} images. Uploading...\n`);

  let uploaded = 0;
  let failed = 0;

  for (const file of files) {
    const filePath = path.join(resolvedPath, file);
    const fileBuffer = fs.readFileSync(filePath);
    const ext = path.extname(file).toLowerCase();

    // Create a clean filename with timestamp to avoid conflicts
    const timestamp = Date.now();
    const cleanName = file.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storagePath = `${timestamp}_${cleanName}`;

    // Determine content type
    const contentTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp'
    };

    // Upload to Supabase Storage
    const { data: storageData, error: storageError } = await supabase.storage
      .from('thumbnails')
      .upload(storagePath, fileBuffer, {
        contentType: contentTypes[ext],
        upsert: false
      });

    if (storageError) {
      console.log(`  FAILED: ${file} — ${storageError.message}`);
      failed++;
      continue;
    }

    // Get the public URL
    const { data: urlData } = supabase.storage
      .from('thumbnails')
      .getPublicUrl(storagePath);

    const imageUrl = urlData.publicUrl;

    // Create a title from the filename (remove extension, replace underscores/hyphens)
    const title = path.basename(file, ext)
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());

    // Insert into database
    const { error: dbError } = await supabase
      .from('thumbnails')
      .insert({
        title: title,
        image_url: imageUrl,
        badge: null,
        episodes: 0,
        views: '0'
      });

    if (dbError) {
      console.log(`  FAILED (DB): ${file} — ${dbError.message}`);
      failed++;
      continue;
    }

    uploaded++;
    console.log(`  Uploaded: ${file}`);
  }

  console.log(`\nDone! ${uploaded} uploaded, ${failed} failed.`);
  console.log('Refresh your preview page to see the new thumbnails.');
}

const folderPath = process.argv[2];
uploadThumbnails(folderPath);
