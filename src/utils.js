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
 * Parse Excel serial number thành object {year, month, day, hours, minutes}
 * Không dùng Date object để tránh mọi vấn đề timezone
 */
function parseExcelSerial(serial) {
  if (typeof serial !== 'number' || serial <= 0) return null;

  let dayPart = Math.floor(serial);
  const timePart = serial - dayPart;

  // Excel 1900 leap year bug: serial > 60 cần trừ 1
  if (dayPart > 60) dayPart -= 1;

  // Tính giờ phút
  const totalMinutes = Math.round(timePart * 1440);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  // Tính ngày tháng năm bằng pure math
  // Sau khi trừ leap bug: dayPart=1 → 1900-01-01
  // remaining = dayPart - 1 = số ngày kể từ 1900-01-01 (0-based)
  // Nhưng Excel đếm serial 1 = ngày đầu tiên, nên offset thêm -1
  let remaining = dayPart - 2;
  let y = 1900;

  // Trừ từng năm
  while (true) {
    const daysInYear = isLeapYear(y) ? 366 : 365;
    if (remaining < daysInYear) break;
    remaining -= daysInYear;
    y++;
  }

  // Trừ từng tháng
  const daysInMonth = [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let m = 1;
  for (let i = 0; i < 12; i++) {
    if (remaining < daysInMonth[i]) {
      m = i + 1;
      break;
    }
    remaining -= daysInMonth[i];
  }

  const d = remaining + 1; // 0-based → 1-based

  return { year: y, month: m, day: d, hours, minutes };
}

function isLeapYear(y) {
  return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);
}

/**
 * Parse ngày giờ từ Excel → trả về object {year, month, day, hours, minutes}
 * Không dùng Date object để tránh timezone issues
 */
function parseDateTime(value) {
  if (!value && value !== 0) return null;

  // Nếu là số (Excel serial number)
  if (typeof value === 'number') {
    return parseExcelSerial(value);
  }

  // Nếu là Date object
  if (value instanceof Date) {
    return {
      year: value.getFullYear(), month: value.getMonth() + 1, day: value.getDate(),
      hours: value.getHours(), minutes: value.getMinutes()
    };
  }

  const s = String(value).trim();
  if (!s) return null;

  // Format: MM/dd/yyyy H:mm (VD: 05/20/2026 8:00)
  let match = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (match) {
    return {
      year: parseInt(match[3]), month: parseInt(match[1]), day: parseInt(match[2]),
      hours: parseInt(match[4]), minutes: parseInt(match[5])
    };
  }

  // Format: yyyy-MM-dd HH:mm
  match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})$/);
  if (match) {
    return {
      year: parseInt(match[1]), month: parseInt(match[2]), day: parseInt(match[3]),
      hours: parseInt(match[4]), minutes: parseInt(match[5])
    };
  }

  // Thử parse trực tiếp
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return {
      year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(),
      hours: d.getHours(), minutes: d.getMinutes()
    };
  }

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
