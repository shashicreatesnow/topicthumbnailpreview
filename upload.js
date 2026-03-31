/**
 * Upload Thumbnails to Supabase
 *
 * Usage:
 *   node upload.js /path/to/folder --new        (uploads as "new" thumbnails)
 *   node upload.js /path/to/folder --corrected  (uploads as "corrected" thumbnails)
 *   node upload.js /path/to/folder --stable     (uploads as "stable" / approved thumbnails)
 *   node upload.js /path/to/folder --discarded  (uploads as "discarded" / rejected — hidden from UI)
 *   node upload.js /path/to/folder              (defaults to "new")
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

const BADGES = ['New Episode', 'Newly Added', 'Trending', 'Popular'];
const randomBadge = () => BADGES[Math.floor(Math.random() * BADGES.length)];
const randomEpisodes = () => Math.floor(Math.random() * 20) + 3;
const randomViews = () => {
  const num = Math.floor(Math.random() * 90) + 5;
  return num + 'k';
};

async function uploadThumbnails(folderPath, category) {
  if (!folderPath) {
    console.log('Usage:');
    console.log('  node upload.js /path/to/folder --new');
    console.log('  node upload.js /path/to/folder --corrected');
    process.exit(1);
  }

  const resolvedPath = path.resolve(folderPath);

  if (!fs.existsSync(resolvedPath)) {
    console.log(`Folder not found: ${resolvedPath}`);
    process.exit(1);
  }

  const files = fs.readdirSync(resolvedPath).filter(file => {
    const ext = path.extname(file).toLowerCase();
    return SUPPORTED_FORMATS.includes(ext);
  });

  if (files.length === 0) {
    console.log('No image files found.');
    process.exit(1);
  }

  console.log(`Found ${files.length} images. Uploading as "${category}"...\n`);

  let uploaded = 0;
  let failed = 0;

  for (const file of files) {
    const filePath = path.join(resolvedPath, file);
    const fileBuffer = fs.readFileSync(filePath);
    const ext = path.extname(file).toLowerCase();

    const timestamp = Date.now();
    const cleanName = file.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storagePath = `${category}/${timestamp}_${cleanName}`;

    const contentTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp'
    };

    const { error: storageError } = await supabase.storage
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

    const { data: urlData } = supabase.storage
      .from('thumbnails')
      .getPublicUrl(storagePath);

    const imageUrl = urlData.publicUrl;

    const title = path.basename(file, ext)
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());

    const { error: dbError } = await supabase
      .from('thumbnails')
      .insert({
        title: title,
        image_url: imageUrl,
        badge: randomBadge(),
        episodes: randomEpisodes(),
        views: randomViews(),
        category: category
      });

    if (dbError) {
      console.log(`  FAILED (DB): ${file} — ${dbError.message}`);
      failed++;
      continue;
    }

    uploaded++;
    console.log(`  Uploaded: ${file}`);
  }

  console.log(`\nDone! ${uploaded} uploaded as "${category}", ${failed} failed.`);
}

// Parse arguments
const args = process.argv.slice(2);
const folderPath = args.find(a => !a.startsWith('--'));
const category = args.includes('--corrected') ? 'corrected' : args.includes('--stable') ? 'stable' : args.includes('--discarded') ? 'discarded' : 'new';

uploadThumbnails(folderPath, category);
