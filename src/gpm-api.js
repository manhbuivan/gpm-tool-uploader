const http = require('http');
const config = require('../config');
const logger = require('./logger');

/**
 * Gọi GPM Login API
 * @param {string} endpoint - API endpoint (ví dụ: /api/v3/profiles/start/abc123)
 * @returns {Promise<object>} JSON response
 */
function callAPI(endpoint) {
  return new Promise((resolve, reject) => {
    const url = `${config.GPM_API_BASE}${endpoint}`;
    logger.debug(null, `GPM API: GET ${url}`);

    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          reject(new Error(`GPM API trả về dữ liệu không hợp lệ: ${data}`));
        }
      });
    }).on('error', (err) => {
      reject(new Error(`Không thể kết nối GPM Login API (${config.GPM_API_BASE}). Hãy chắc chắn GPM Login đang chạy. Lỗi: ${err.message}`));
    });
  });
}

/**
 * Mở profile GPM Login
 * @param {string} profileId - ID profile trong GPM Login
 * @returns {Promise<object>} { browserURL, profileId }
 */
async function startProfile(profileId) {
  logger.info(profileId, 'Đang mở profile trên GPM Login...');

  const params = new URLSearchParams({
    win_size: config.WINDOW_SIZE,
    win_scale: String(config.WINDOW_SCALE),
  });

  const result = await callAPI(`/api/v3/profiles/start/${profileId}?${params.toString()}`);

  if (!result.success && result.success !== undefined) {
    throw new Error(`GPM không thể mở profile ${profileId}: ${JSON.stringify(result)}`);
  }

  // GPM trả về remote_debugging_address dạng "127.0.0.1:PORT"
  const debugAddress = result.data?.remote_debugging_address
    || result.remote_debugging_address
    || result.data?.debuggingAddress;

  if (!debugAddress) {
    // Thử lấy browser_location hoặc thông tin khác
    logger.debug(profileId, `GPM Response: ${JSON.stringify(result)}`);
    throw new Error(`Không tìm thấy remote_debugging_address trong response GPM. Response: ${JSON.stringify(result)}`);
  }

  const browserURL = debugAddress.startsWith('http') ? debugAddress : `http://${debugAddress}`;

  logger.info(profileId, `Profile đã mở. Browser URL: ${browserURL}`);
  return { browserURL, profileId, rawResponse: result };
}

/**
 * Đóng profile GPM Login
 * @param {string} profileId - ID profile
 */
async function closeProfile(profileId) {
  logger.info(profileId, 'Đang đóng profile...');
  try {
    await callAPI(`/api/v3/profiles/close/${profileId}`);
    logger.info(profileId, 'Profile đã đóng.');
  } catch (err) {
    logger.warn(profileId, `Không thể đóng profile: ${err.message}`);
  }
}

/**
 * Lấy danh sách tất cả profiles từ GPM Login
 * @returns {Promise<Array>} Danh sách profiles
 */
async function listProfiles() {
  logger.log('Đang lấy danh sách profiles từ GPM Login...');
  try {
    const result = await callAPI('/api/v3/profiles');

    // GPM có thể trả về dạng khác nhau
    const profiles = result.data || result.profiles || result;

    if (Array.isArray(profiles)) {
      return profiles;
    }

    logger.debug(null, `GPM Profiles Response: ${JSON.stringify(result)}`);
    return [];
  } catch (err) {
    logger.logError(`Lỗi lấy danh sách profiles: ${err.message}`);
    return [];
  }
}

/**
 * Test kết nối GPM Login API
 * @returns {Promise<boolean>} true nếu kết nối thành công
 */
async function testConnection() {
  try {
    const profiles = await listProfiles();
    logger.log(`✅ Kết nối GPM Login thành công!`);
    if (Array.isArray(profiles) && profiles.length > 0) {
      logger.log(`📋 Tìm thấy ${profiles.length} profile(s)`);
      profiles.forEach((p, i) => {
        const id = p.id || p.profile_id || p.uuid || 'N/A';
        const name = p.name || p.profile_name || p.notes || 'N/A';
        logger.log(`   ${i + 1}. ID: ${id} | Tên: ${name}`);
      });
    }
    return true;
  } catch (err) {
    logger.logError(`❌ Không thể kết nối GPM Login: ${err.message}`);
    logger.logError(`   Hãy chắc chắn GPM Login đang chạy tại ${config.GPM_API_BASE}`);
    return false;
  }
}

module.exports = {
  startProfile,
  closeProfile,
  listProfiles,
  testConnection,
};
