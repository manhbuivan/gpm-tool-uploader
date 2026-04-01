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
 * Parse Excel serial number thành Date (cross-timezone safe)
 * Serial 1 = 1900-01-01, Excel có bug coi 1900 là năm nhuận (serial 60 = 29/2/1900)
 */
function parseExcelSerial(serial) {
  if (typeof serial !== 'number' || serial <= 0) return null;

  let dayPart = Math.floor(serial);
  const timePart = serial - dayPart;

  // Excel 1900 leap year bug: serial > 60 cần trừ 1
  if (dayPart > 60) dayPart -= 1;

  const totalMinutes = Math.round(timePart * 1440); // 1440 = 24*60
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  // Serial 1 = 1900-01-01 → offset (dayPart - 1) ngày từ 1900-01-01
  // Nhưng sau khi trừ leap bug, cần trừ thêm 1 vì Excel đếm từ 1 (không phải 0)
  const ms = Date.UTC(1900, 0, 1) + (dayPart - 2) * 86400000;
  const utc = new Date(ms);

  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate(), hours, minutes, 0, 0);
}

/**
 * Parse ngày giờ từ Excel
 * Hỗ trợ: Excel serial number, string formats (MM/dd/yyyy H:mm, yyyy-MM-dd HH:mm)
 */
function parseDateTime(value) {
  if (!value && value !== 0) return null;

  // Nếu là số (Excel serial number)
  if (typeof value === 'number') {
    return parseExcelSerial(value);
  }

  // Nếu là Date object
  if (value instanceof Date) return value;

  const s = String(value).trim();
  if (!s) return null;

  // Format: MM/dd/yyyy H:mm (VD: 04/01/2026 6:00)
  let match = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (match) {
    return new Date(
      parseInt(match[3]),       // year
      parseInt(match[1]) - 1,   // month (0-based)
      parseInt(match[2]),       // day
      parseInt(match[4]),       // hours
      parseInt(match[5])        // minutes
    );
  }

  // Format: yyyy-MM-dd HH:mm
  match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})$/);
  if (match) {
    return new Date(
      parseInt(match[1]),
      parseInt(match[2]) - 1,
      parseInt(match[3]),
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
  parseExcelSerial,
  ensureDir,
};
