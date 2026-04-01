const fs = require('fs');
const path = require('path');
const config = require('../config');

/**
 * Random delay giữa min và max (ms)
 */
function randomDelay(min, max) {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Delay giữa các thao tác (mô phỏng người thật)
 */
function actionDelay() {
  return randomDelay(config.ACTION_DELAY_MIN, config.ACTION_DELAY_MAX);
}

/**
 * Delay giữa các video
 */
function videoDelay() {
  return randomDelay(config.VIDEO_DELAY_MIN, config.VIDEO_DELAY_MAX);
}

/**
 * Delay giữa các profile
 */
function profileDelay() {
  return randomDelay(config.PROFILE_DELAY_MIN, config.PROFILE_DELAY_MAX);
}

/**
 * Lấy danh sách file video trong folder, sắp xếp theo tên
 */
function getVideoFiles(folderPath) {
  if (!fs.existsSync(folderPath)) {
    throw new Error(`Folder không tồn tại: ${folderPath}`);
  }

  const files = fs.readdirSync(folderPath)
    .filter((file) => {
      const ext = path.extname(file).toLowerCase();
      return config.VIDEO_EXTENSIONS.includes(ext);
    })
    .sort() // Sắp xếp alphabet
    .map((file) => path.join(folderPath, file));

  return files;
}

/**
 * Lấy file video theo index (STT - 1) hoặc file đầu tiên
 * @param {string} folderPath - Đường dẫn folder
 * @param {number} index - Index của video trong folder (0-based)
 */
function getVideoByIndex(folderPath, index) {
  const files = getVideoFiles(folderPath);
  if (files.length === 0) {
    throw new Error(`Không tìm thấy video trong folder: ${folderPath}`);
  }
  if (index >= files.length) {
    throw new Error(`Folder chỉ có ${files.length} video, yêu cầu video index ${index}`);
  }
  return files[index];
}

/**
 * Sleep với countdown hiển thị
 */
async function sleepWithLog(ms, message) {
  const seconds = Math.ceil(ms / 1000);
  process.stdout.write(`\x1b[90m  ⏳ ${message} (${seconds}s)...\x1b[0m`);
  await new Promise((resolve) => setTimeout(resolve, ms));
  process.stdout.write(' ✓\n');
}

/**
 * Format date thành string cho YouTube schedule
 * @param {Date} date
 * @returns {object} { dateStr: 'Apr 1, 2026', timeStr: '8:00 AM' }
 */
function formatScheduleDate(date) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[date.getMonth()];
  const day = date.getDate();
  const year = date.getFullYear();

  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;

  return {
    dateStr: `${month} ${day}, ${year}`,
    timeStr: `${hours}:${minutes} ${ampm}`,
  };
}

/**
 * Parse chuỗi ngày giờ từ Excel
 * Hỗ trợ format: "yyyy-MM-dd HH:mm" hoặc "dd/MM/yyyy HH:mm"
 */
function parseDateTime(str) {
  if (!str) return null;

  // Nếu là Date object (Excel đã parse)
  if (str instanceof Date) return str;

  const s = String(str).trim();

  // Format: yyyy-MM-dd HH:mm
  let match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})$/);
  if (match) {
    return new Date(
      parseInt(match[1]),
      parseInt(match[2]) - 1,
      parseInt(match[3]),
      parseInt(match[4]),
      parseInt(match[5])
    );
  }

  // Format: dd/MM/yyyy HH:mm
  match = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (match) {
    return new Date(
      parseInt(match[3]),
      parseInt(match[2]) - 1,
      parseInt(match[1]),
      parseInt(match[4]),
      parseInt(match[5])
    );
  }

  // Thử parse trực tiếp
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d;

  return null;
}

/**
 * Tạo thư mục nếu chưa tồn tại
 */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

module.exports = {
  randomDelay,
  actionDelay,
  videoDelay,
  profileDelay,
  getVideoFiles,
  getVideoByIndex,
  sleepWithLog,
  formatScheduleDate,
  parseDateTime,
  ensureDir,
};
