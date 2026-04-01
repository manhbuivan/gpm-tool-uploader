const config = require('../config');
const logger = require('./logger');
const gpmApi = require('./gpm-api');
const excelManager = require('./excel-manager');
const { runAll } = require('./scheduler');
const { ensureDir } = require('./utils');

// Tạo thư mục cần thiết
ensureDir(config.LOG_DIR);
ensureDir(config.ERROR_SCREENSHOT_DIR);

/**
 * Hiển thị hướng dẫn sử dụng
 */
function showHelp() {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║        GPM YouTube Shorts Auto Upload Tool v1.0           ║
╠════════════════════════════════════════════════════════════╣
║                                                            ║
║  Lệnh:                                                    ║
║    --run            Upload tất cả video pending            ║
║    --dry-run        Chạy thử (không upload thật)           ║
║    --generate       Tạo file Excel mẫu                     ║
║    --list-profiles  Lấy danh sách profile từ GPM Login     ║
║    --test           Test kết nối GPM Login API             ║
║    --help           Hiện hướng dẫn này                     ║
║                                                            ║
║  Sử dụng:                                                  ║
║    1. Chạy GPM Login trước                                 ║
║    2. npm run list-profiles    → Lấy profile IDs           ║
║    3. npm run generate         → Tạo Excel mẫu             ║
║    4. Chỉnh sửa schedule.xlsx  → Điền thông tin            ║
║    5. npm start                → Upload video              ║
║                                                            ║
║  Mỗi ngày chỉ cần đổi:                                    ║
║    - folder_video (cột G): đường dẫn folder video mới     ║
║    - gio_dang (cột E): ngày giờ schedule mới               ║
║    - Xóa cột result (H) để chạy lại                       ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
`);
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    showHelp();
    return;
  }

  // Test kết nối GPM
  if (args.includes('--test')) {
    logger.banner('TEST KẾT NỐI GPM LOGIN');
    await gpmApi.testConnection();
    return;
  }

  // Lấy danh sách profiles
  if (args.includes('--list-profiles')) {
    logger.banner('DANH SÁCH PROFILES GPM LOGIN');
    const profiles = await gpmApi.listProfiles();

    if (!profiles || profiles.length === 0) {
      logger.logError('Không tìm thấy profile nào. Hãy chắc chắn GPM Login đang chạy.');
      return;
    }

    console.log('\n┌──────┬──────────────────────────────┬─────────────────────────────┐');
    console.log('│  #   │  Profile ID                  │  Tên Profile                │');
    console.log('├──────┼──────────────────────────────┼─────────────────────────────┤');

    profiles.forEach((p, i) => {
      const id = String(p.id || p.profile_id || p.uuid || 'N/A').padEnd(28);
      const name = String(p.name || p.profile_name || p.notes || 'N/A').padEnd(27);
      console.log(`│  ${String(i + 1).padEnd(3)} │  ${id}│  ${name}│`);
    });

    console.log('└──────┴──────────────────────────────┴─────────────────────────────┘');
    console.log(`\n📋 Tổng: ${profiles.length} profile(s)`);
    console.log('💡 Copy Profile ID vào cột "profile" trong file Excel');
    return;
  }

  // Tạo file Excel mẫu
  if (args.includes('--generate')) {
    logger.banner('TẠO FILE EXCEL MẪU');

    // Thử lấy profile IDs từ GPM
    let profileIds = [];
    try {
      const profiles = await gpmApi.listProfiles();
      if (profiles && profiles.length > 0) {
        profileIds = profiles.slice(0, 10).map((p) => p.id || p.profile_id || p.uuid || '');
        logger.log(`📋 Lấy được ${profileIds.length} profile ID(s) từ GPM Login`);
      }
    } catch (e) {
      logger.logWarn('Không thể lấy profiles từ GPM. Sẽ dùng placeholder.');
    }

    // Điền placeholder nếu chưa đủ 10
    while (profileIds.length < 10) {
      profileIds.push(`PROFILE_ID_${profileIds.length + 1}`);
    }

    // Tạo file mẫu cho ngày mai
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    excelManager.generateSample(config.EXCEL_FILE, {
      profiles: profileIds,
      startDate: tomorrow,
    });

    console.log('\n💡 Tiếp theo:');
    console.log('   1. Mở file schedule.xlsx');
    console.log('   2. Thay Profile ID bằng ID thật (chạy: npm run list-profiles)');
    console.log('   3. Chỉnh title, description cho từng video');
    console.log('   4. Đổi folder_video thành đường dẫn folder chứa video Shorts');
    console.log('   5. Chạy: npm start');
    return;
  }

  // Chạy upload
  if (args.includes('--run') || args.includes('--dry-run')) {
    const dryRun = args.includes('--dry-run');

    // Kiểm tra file Excel tồn tại
    const fs = require('fs');
    if (!fs.existsSync(config.EXCEL_FILE)) {
      logger.logError(`❌ File Excel không tồn tại: ${config.EXCEL_FILE}`);
      logger.log('💡 Chạy: npm run generate để tạo file Excel mẫu');
      return;
    }

    // Kiểm tra GPM Login
    const connected = await gpmApi.testConnection();
    if (!connected) {
      logger.logError('❌ Không thể kết nối GPM Login. Hãy mở GPM Login trước.');
      return;
    }

    await runAll(dryRun);
    return;
  }

  // Lệnh không hợp lệ
  console.log(`❌ Lệnh không hợp lệ: ${args.join(' ')}`);
  showHelp();
}

// Chạy
main().catch((err) => {
  logger.logError(`❌ Lỗi nghiêm trọng: ${err.message}`);
  console.error(err);
  process.exit(1);
});
