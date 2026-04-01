const path = require('path');

module.exports = {
  // GPM Login API
  GPM_API_BASE: 'http://127.0.0.1:19995',

  // File Excel lịch đăng
  EXCEL_FILE: path.join(__dirname, 'schedule.xlsx'),

  // ===== DELAYS (mô phỏng hành vi người thật) =====
  // Delay giữa các thao tác click/type (ms)
  ACTION_DELAY_MIN: 800,
  ACTION_DELAY_MAX: 2500,

  // Delay sau khi upload video, chờ YouTube xử lý
  UPLOAD_WAIT_MS: 30000,

  // Timeout tối đa cho 1 video upload (5 phút - Shorts thường nhẹ)
  UPLOAD_TIMEOUT_MS: 300000,

  // Delay giữa các video trong cùng 1 profile
  VIDEO_DELAY_MIN: 5000,
  VIDEO_DELAY_MAX: 10000,

  // Delay giữa các profile (tránh spam)
  PROFILE_DELAY_MIN: 10000,
  PROFILE_DELAY_MAX: 20000,

  // ===== RETRY =====
  MAX_RETRIES: 2,

  // ===== PATHS =====
  LOG_DIR: path.join(__dirname, 'logs'),
  ERROR_SCREENSHOT_DIR: path.join(__dirname, 'errors'),

  // ===== VIDEO EXTENSIONS =====
  VIDEO_EXTENSIONS: ['.mp4', '.mov', '.avi', '.mkv', '.webm'],

  // ===== BROWSER WINDOW =====
  WINDOW_SIZE: '1280,800',
  WINDOW_SCALE: 0.8,
};
