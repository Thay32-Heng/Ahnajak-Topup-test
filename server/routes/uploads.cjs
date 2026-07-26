/**
 * routes/uploads.cjs — file uploads with automatic WebP conversion
 * POST   /api/upload        — multipart upload (field: "file", optional "path")
 * DELETE /api/upload         — delete a file by path (body: { path })
 * Files are stored in /uploads/site-assets/ and served statically by Express.
 * PNG/JPG/JPEG files are automatically converted to WebP on upload.
 */
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { requireAdmin } = require('../auth.cjs');
const { sendError } = require('../helpers/errors.cjs');

const router = express.Router();

const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads', 'site-assets');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  try {
    fs.chmodSync(path.resolve(process.cwd(), 'uploads'), 0o755);
    fs.chmodSync(UPLOAD_DIR, 0o755);
  } catch (err) {
    console.error('Failed to set uploads directory permissions:', err);
  }
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${Date.now()}_${base}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    const allowedExt = /\.(png|jpe?g|gif|webp|svg|ico|woff2?|ttf|otf)$/i;
    const allowedMime = [
      'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon',
      'font/woff', 'font/woff2', 'font/ttf', 'font/otf',
    ];
    if (allowedExt.test(path.extname(file.originalname)) && allowedMime.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed'));
    }
  },
});

async function convertToWebp(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== '.png' && ext !== '.jpg' && ext !== '.jpeg') return filePath;

  const webpPath = filePath.replace(/\.(png|jpe?g)$/i, '.webp');
  try {
    await sharp(filePath).webp({ quality: 85 }).toFile(webpPath);
    fs.unlinkSync(filePath); // remove original
    try { fs.chmodSync(webpPath, 0o644); } catch {}
    return webpPath;
  } catch (err) {
    console.error('[WebP] Conversion failed:', err.message);
    return filePath; // fall back to original if conversion fails
  }
}

router.post('/', requireAdmin, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    // Convert to WebP if applicable
    const finalPath = await convertToWebp(req.file.path);
    try { fs.chmodSync(finalPath, 0o644); } catch {}

    const filename = path.basename(finalPath);
    const publicPath = `/uploads/site-assets/${filename}`;
    res.json({ path: publicPath, url: publicPath });
  } catch (err) { sendError(res, err, 'POST /upload'); }
});

router.delete('/', requireAdmin, async (req, res) => {
  const { path: filePath } = req.body;
  if (!filePath) return res.status(400).json({ error: 'path required' });
  const fullPath = path.normalize(path.resolve(process.cwd(), filePath));
  const normalizedUpload = path.resolve(UPLOAD_DIR);
  if (!fullPath.startsWith(normalizedUpload)) {
    return res.status(403).json({ error: 'Can only delete uploaded files' });
  }
  try {
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    // Also try deleting .webp variant if original was png/jpg
    const webpPath = fullPath.replace(/\.(png|jpe?g)$/i, '.webp');
    if (webpPath !== fullPath && fs.existsSync(webpPath)) fs.unlinkSync(webpPath);
    res.json({ success: true });
  } catch (err) { sendError(res, err, 'DELETE /uploads'); }
});

module.exports = router;
