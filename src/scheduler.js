const config = require('../config');
const logger = require('./logger');
const gpmApi = require('./gpm-api');
const excelManager = require('./excel-manager');
const { uploadShort } = require('./youtube-uploader');
const { getVideoByIndex, profileDelay, sleepWithLog } = require('./utils');

/**
 * Upload tất cả video pending cho 1 profile
 * @param {Array} tasks - Danh sách tasks của profile này
 * @param {boolean} dryRun - Chạy thử không upload thật
 */
async function processProfile(tasks, dryRun = false) {
  const profileId = tasks[0].profile;
  const proxy = tasks[0].proxy;

  logger.divider();
  logger.info(profileId, `🔄 Bắt đầu xử lý ${tasks.length} video(s) | Proxy: ${proxy}`);

  let profileData = null;

  try {
    // 1. Mở profile GPM Login
    profileData = await gpmApi.startProfile(profileId);

    // Đợi browser khởi động xong
    await sleepWithLog(5000, 'Đợi browser khởi động');

    // 2. Upload từng video
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      logger.divider();
      logger.info(profileId, `📹 Video ${i + 1}/${tasks.length} | STT: ${task.stt}`);

      try {
        // Lấy file video từ folder theo index
        // Đếm số video đã done trong folder này để biết lấy video tiếp theo
        const allTasks = excelManager.readSchedule();
        const doneTasks = allTasks.filter(
          (t) => t.profile === profileId && t.folder_video === task.folder_video && t.result && t.result.startsWith('done')
        );
        const videoIndex = i; // Dùng index trong batch hiện tại

        let videoPath;
        try {
          videoPath = getVideoByIndex(task.folder_video, videoIndex);
        } catch (e) {
          logger.error(profileId, `❌ ${e.message}`);
          excelManager.writeResult(config.EXCEL_FILE, task.rowIndex, `error: ${e.message}`);
          continue;
        }

        // Upload video
        const result = await uploadShort({
          browserURL: profileData.browserURL,
          profileId: profileId,
          videoPath: videoPath,
          title: task.title,
          description: task.description,
          scheduleDate: task.gio_dang,
          dryRun: dryRun,
        });

        // Ghi kết quả vào Excel
        excelManager.writeResult(config.EXCEL_FILE, task.rowIndex, result.message);

        if (result.success) {
          logger.info(profileId, `✅ Video ${i + 1} thành công!`);
        } else {
          logger.error(profileId, `❌ Video ${i + 1} thất bại: ${result.message}`);
        }

        // Delay giữa các video (nếu còn video tiếp)
        if (i < tasks.length - 1) {
          await sleepWithLog(
            Math.floor(Math.random() * (config.VIDEO_DELAY_MAX - config.VIDEO_DELAY_MIN)) + config.VIDEO_DELAY_MIN,
            'Đợi trước video tiếp theo'
          );
        }

      } catch (err) {
        logger.error(profileId, `❌ Lỗi video ${i + 1}: ${err.message}`);
        excelManager.writeResult(config.EXCEL_FILE, task.rowIndex, `error: ${err.message}`);
      }
    }

  } catch (err) {
    logger.error(profileId, `❌ Lỗi profile: ${err.message}`);
    // Ghi lỗi cho tất cả tasks của profile
    for (const task of tasks) {
      if (!task.result || !task.result.startsWith('done')) {
        excelManager.writeResult(config.EXCEL_FILE, task.rowIndex, `error: ${err.message}`);
      }
    }
  } finally {
    // 3. Đóng profile GPM Login
    if (profileData) {
      await gpmApi.closeProfile(profileId);
    }
  }
}

/**
 * Chạy tất cả uploads
 * - 2 proxy chạy song song
 * - Các profile trong cùng proxy chạy tuần tự
 * @param {boolean} dryRun
 */
async function runAll(dryRun = false) {
  logger.banner('GPM YouTube Shorts Auto Upload');
  logger.log(`Mode: ${dryRun ? '🏃 DRY RUN' : '🚀 LIVE UPLOAD'}`);
  logger.log(`Excel: ${config.EXCEL_FILE}`);

  // Đọc tasks từ Excel
  const allTasks = excelManager.readSchedule();
  const pendingTasks = excelManager.getPendingTasks(allTasks);

  if (pendingTasks.length === 0) {
    logger.log('✅ Không có video nào cần upload (tất cả đã done)');
    return;
  }

  logger.log(`📋 Tổng: ${allTasks.length} tasks | Pending: ${pendingTasks.length}`);

  // Validate tasks
  const invalidTasks = pendingTasks.filter((t) => !t.profile || !t.title || !t.gio_dang || !t.folder_video);
  if (invalidTasks.length > 0) {
    logger.logWarn(`⚠️ ${invalidTasks.length} task(s) thiếu thông tin:`);
    invalidTasks.forEach((t) => {
      const missing = [];
      if (!t.profile) missing.push('profile');
      if (!t.title) missing.push('title');
      if (!t.gio_dang) missing.push('gio_dang');
      if (!t.folder_video) missing.push('folder_video');
      logger.logWarn(`   STT ${t.stt}: thiếu ${missing.join(', ')}`);
    });
  }

  // Chỉ lấy valid tasks
  const validTasks = pendingTasks.filter((t) => t.profile && t.title && t.gio_dang && t.folder_video);

  if (validTasks.length === 0) {
    logger.logError('❌ Không có task hợp lệ nào!');
    return;
  }

  // Nhóm tasks theo proxy
  const proxyGroups = {};
  for (const task of validTasks) {
    const proxy = task.proxy || 'default';
    if (!proxyGroups[proxy]) proxyGroups[proxy] = {};
    if (!proxyGroups[proxy][task.profile]) proxyGroups[proxy][task.profile] = [];
    proxyGroups[proxy][task.profile].push(task);
  }

  logger.log(`\n📊 Phân bổ:`);
  for (const [proxy, profiles] of Object.entries(proxyGroups)) {
    const profileCount = Object.keys(profiles).length;
    const videoCount = Object.values(profiles).reduce((sum, tasks) => sum + tasks.length, 0);
    logger.log(`   ${proxy}: ${profileCount} profile(s), ${videoCount} video(s)`);
  }

  // Chạy song song theo proxy, tuần tự trong cùng proxy
  const proxyPromises = Object.entries(proxyGroups).map(async ([proxy, profiles]) => {
    logger.log(`\n🔌 Proxy ${proxy}: Bắt đầu xử lý ${Object.keys(profiles).length} profiles`);

    for (const [profileId, tasks] of Object.entries(profiles)) {
      // Sắp xếp tasks theo giờ đăng
      tasks.sort((a, b) => {
        const toMin = (d) => d ? (d.year * 525600 + d.month * 43800 + d.day * 1440 + d.hours * 60 + d.minutes) : 0;
        return toMin(a.gio_dang) - toMin(b.gio_dang);
      });

      await processProfile(tasks, dryRun);

      // Delay giữa các profile
      const profileIds = Object.keys(profiles);
      if (profileId !== profileIds[profileIds.length - 1]) {
        await sleepWithLog(
          Math.floor(Math.random() * (config.PROFILE_DELAY_MAX - config.PROFILE_DELAY_MIN)) + config.PROFILE_DELAY_MIN,
          `Đợi trước profile tiếp theo (${proxy})`
        );
      }
    }
  });

  // Chạy 2 proxy song song
  await Promise.all(proxyPromises);

  // Tổng kết
  logger.divider();
  logger.banner('KẾT QUẢ TỔNG KẾT');

  const finalTasks = excelManager.readSchedule();
  const doneCount = finalTasks.filter((t) => t.result && t.result.startsWith('done')).length;
  const errorCount = finalTasks.filter((t) => t.result && t.result.startsWith('error')).length;
  const remainCount = finalTasks.filter((t) => !t.result).length;

  logger.log(`✅ Thành công: ${doneCount}`);
  logger.log(`❌ Lỗi: ${errorCount}`);
  logger.log(`⏳ Chưa xử lý: ${remainCount}`);
  logger.log(`📄 Kết quả chi tiết: ${config.EXCEL_FILE} (cột result)`);
}

module.exports = {
  runAll,
  processProfile,
};
