const XLSX = require('xlsx');
const path = require('path');
const config = require('../config');
const logger = require('./logger');
const { parseDateTime } = require('./utils');

// Mapping cột Excel
const COLUMNS = {
  STT: 0,           // A
  TITLE: 1,         // B
  DESCRIPTION: 2,   // C
  PROFILE: 3,       // D
  GIO_DANG: 4,      // E
  PROXY: 5,         // F
  FOLDER_VIDEO: 6,  // G
  RESULT: 7,        // H (tool tự ghi)
};

const HEADER_ROW = [
  'STT', 'title', 'description', 'profile', 'gio_dang', 'proxy', 'folder_video', 'result'
];

/**
 * Đọc file Excel, trả về danh sách tasks
 * @param {string} filePath - Đường dẫn file Excel
 * @returns {Array<object>} tasks
 */
function readSchedule(filePath) {
  const excelPath = filePath || config.EXCEL_FILE;
  logger.log(`📂 Đọc file Excel: ${excelPath}`);

  const workbook = XLSX.readFile(excelPath, { cellDates: false });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // raw: true giữ serial number cho date cells
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });

  if (rows.length < 2) {
    throw new Error('File Excel trống hoặc chỉ có header!');
  }

  const tasks = [];
  // Bỏ qua row đầu (header)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row[COLUMNS.TITLE] && !row[COLUMNS.PROFILE]) continue; // Bỏ row trống

    const gioDang = parseDateTime(row[COLUMNS.GIO_DANG]);

    tasks.push({
      rowIndex: i, // Dùng để ghi kết quả
      stt: row[COLUMNS.STT] || i,
      title: String(row[COLUMNS.TITLE] || '').trim(),
      description: String(row[COLUMNS.DESCRIPTION] || '').trim(),
      profile: String(row[COLUMNS.PROFILE] || '').trim(),
      gio_dang: gioDang,
      gio_dang_raw: String(row[COLUMNS.GIO_DANG] || ''),
      proxy: String(row[COLUMNS.PROXY] || '').trim(),
      folder_video: String(row[COLUMNS.FOLDER_VIDEO] || '').trim(),
      result: String(row[COLUMNS.RESULT] || '').trim(),
    });
  }

  logger.log(`📋 Đọc được ${tasks.length} task(s) từ Excel`);
  return tasks;
}

/**
 * Ghi kết quả vào cột RESULT (H) của file Excel
 * @param {string} filePath - Đường dẫn file Excel
 * @param {number} rowIndex - Index của row (1-based, bỏ qua header)
 * @param {string} result - Kết quả (done / error: message)
 */
function writeResult(filePath, rowIndex, result) {
  const excelPath = filePath || config.EXCEL_FILE;

  // Đọc giữ nguyên format gốc — không truyền cellDates để tránh thay đổi format hiển thị
  const workbook = XLSX.readFile(excelPath, { cellStyles: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // Ghi vào cột H (index 7), row = rowIndex + 1 (do header)
  const cellRef = XLSX.utils.encode_cell({ r: rowIndex, c: COLUMNS.RESULT });
  sheet[cellRef] = { t: 's', v: result };

  // Cập nhật range nếu cần
  const range = XLSX.utils.decode_range(sheet['!ref']);
  if (COLUMNS.RESULT > range.e.c) {
    range.e.c = COLUMNS.RESULT;
    sheet['!ref'] = XLSX.utils.encode_range(range);
  }

  let attempts = 0;
  while (attempts < 5) {
    try {
      XLSX.writeFile(workbook, excelPath);
      logger.debug(null, `Đã ghi result "${result}" vào row ${rowIndex + 1}`);
      break;
    } catch (err) {
      if (err.code === 'EBUSY') {
        attempts++;
        if (attempts >= 5) {
          logger.error(null, `❌ Vẫn không thể ghi file Excel sau 5 lần thử. Vui lòng tắt file Excel nếu đang mở.`);
        } else {
          logger.warn(null, `⚠️ File Excel đang được mở (bị khóa). Vui lòng đóng file Excel. Đang thử lại lần ${attempts}/5...`);
          // Sleep đồng bộ 3 giây (cross-platform)
          try {
            const isWin = process.platform === 'win32';
            require('child_process').execSync(isWin ? 'ping 127.0.0.1 -n 4 > nul' : 'sleep 3');
          } catch(e) {}
        }
      } else {
        logger.error(null, `❌ Lỗi ghi file Excel: ${err.message}`);
        break;
      }
    }
  }
}

/**
 * Lọc tasks chưa upload (result trống hoặc có lỗi)
 */
function getPendingTasks(tasks) {
  return tasks.filter((t) => !t.result || t.result.startsWith('error'));
}

/**
 * Tạo file Excel mẫu cho 10 kênh × 5 video/ngày
 * @param {string} filePath - Đường dẫn file output
 * @param {object} options - { profiles: ['id1','id2',...], startDate: Date }
 */
function generateSample(filePath, options = {}) {
  const excelPath = filePath || config.EXCEL_FILE;
  const profiles = options.profiles || [
    'PROFILE_ID_1', 'PROFILE_ID_2', 'PROFILE_ID_3', 'PROFILE_ID_4', 'PROFILE_ID_5',
    'PROFILE_ID_6', 'PROFILE_ID_7', 'PROFILE_ID_8', 'PROFILE_ID_9', 'PROFILE_ID_10',
  ];
  const startDate = options.startDate || new Date();
  startDate.setHours(6, 0, 0, 0); // Bắt đầu từ 6h sáng

  const rows = [HEADER_ROW]; // Header
  let stt = 1;

  // Lịch upload: 5 video/kênh, cách nhau 2.5h, kênh lệch nhau 15 phút
  const videosPerChannel = 5;
  const gapHours = 2.5; // 2 tiếng 30 phút giữa các video
  const channelOffsetMinutes = 15; // Lệch 15 phút giữa các kênh

  for (let ch = 0; ch < profiles.length; ch++) {
    const proxy = ch < 5 ? 'proxy1' : 'proxy2';
    const channelOffset = ch * channelOffsetMinutes; // phút

    for (let v = 0; v < videosPerChannel; v++) {
      const scheduleTime = new Date(startDate);
      scheduleTime.setMinutes(scheduleTime.getMinutes() + channelOffset + v * gapHours * 60);

      const pad = (n) => String(n).padStart(2, '0');
      const dateStr = `${scheduleTime.getFullYear()}-${pad(scheduleTime.getMonth() + 1)}-${pad(scheduleTime.getDate())}`;
      const timeStr = `${pad(scheduleTime.getHours())}:${pad(scheduleTime.getMinutes())}`;

      rows.push([
        stt++,
        `Video ${v + 1} - Kênh ${ch + 1}`,                  // title
        `Mô tả video ${v + 1} cho kênh ${ch + 1} #shorts`,  // description
        profiles[ch],                                          // profile ID
        `${dateStr} ${timeStr}`,                               // giờ đăng
        proxy,                                                 // proxy
        `C:\\Videos\\kenh${ch + 1}`,                           // folder video
        '',                                                    // result (trống)
      ]);
    }
  }

  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);

  // Set độ rộng cột
  sheet['!cols'] = [
    { wch: 5 },   // STT
    { wch: 35 },  // title
    { wch: 50 },  // description
    { wch: 25 },  // profile
    { wch: 20 },  // gio_dang
    { wch: 10 },  // proxy
    { wch: 30 },  // folder_video
    { wch: 20 },  // result
  ];

  XLSX.utils.book_append_sheet(workbook, sheet, 'Schedule');
  XLSX.writeFile(workbook, excelPath);

  logger.log(`✅ Đã tạo file Excel mẫu: ${excelPath}`);
  logger.log(`📋 ${rows.length - 1} tasks (${profiles.length} kênh × ${videosPerChannel} video)`);
  logger.log(`⚠️  Hãy thay PROFILE_ID_x bằng ID thật từ GPM Login (chạy: npm run list-profiles)`);
}

module.exports = {
  readSchedule,
  writeResult,
  getPendingTasks,
  generateSample,
  COLUMNS,
};
