const fs = require('fs');
const path = require('path');
const config = require('../config');

// Tạo thư mục logs nếu chưa có
if (!fs.existsSync(config.LOG_DIR)) {
  fs.mkdirSync(config.LOG_DIR, { recursive: true });
}

const LOG_LEVELS = { ERROR: 'ERROR', WARN: 'WARN', INFO: 'INFO', DEBUG: 'DEBUG' };

function getTimestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function getLogFileName() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.log`;
}

function writeLog(level, profile, message) {
  const timestamp = getTimestamp();
  const profileTag = profile ? `[${profile}]` : '';
  const line = `[${timestamp}] [${level}] ${profileTag} ${message}`;

  // Console output với màu sắc
  const colors = {
    ERROR: '\x1b[31m',   // Đỏ
    WARN: '\x1b[33m',    // Vàng
    INFO: '\x1b[36m',    // Cyan
    DEBUG: '\x1b[90m',   // Xám
  };
  const reset = '\x1b[0m';
  console.log(`${colors[level] || ''}${line}${reset}`);

  // Ghi vào file
  const logFile = path.join(config.LOG_DIR, getLogFileName());
  fs.appendFileSync(logFile, line + '\n', 'utf8');
}

const logger = {
  info: (profile, message) => writeLog(LOG_LEVELS.INFO, profile, message),
  warn: (profile, message) => writeLog(LOG_LEVELS.WARN, profile, message),
  error: (profile, message) => writeLog(LOG_LEVELS.ERROR, profile, message),
  debug: (profile, message) => writeLog(LOG_LEVELS.DEBUG, profile, message),

  // Log không cần profile
  log: (message) => writeLog(LOG_LEVELS.INFO, null, message),
  logError: (message) => writeLog(LOG_LEVELS.ERROR, null, message),
  logWarn: (message) => writeLog(LOG_LEVELS.WARN, null, message),

  // Divider cho dễ đọc
  divider: () => {
    const line = '═'.repeat(60);
    console.log(`\x1b[90m${line}\x1b[0m`);
    const logFile = path.join(config.LOG_DIR, getLogFileName());
    fs.appendFileSync(logFile, line + '\n', 'utf8');
  },

  // Banner
  banner: (text) => {
    const line = '═'.repeat(60);
    const padded = `║  ${text}`;
    console.log(`\x1b[35m${line}\n${padded}\n${line}\x1b[0m`);
    const logFile = path.join(config.LOG_DIR, getLogFileName());
    fs.appendFileSync(logFile, `${line}\n${padded}\n${line}\n`, 'utf8');
  },
};

module.exports = logger;
