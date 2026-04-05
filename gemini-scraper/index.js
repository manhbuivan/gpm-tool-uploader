const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const config = require('./config');

const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];

// ============ HELPERS ============

function getVideoFiles(folderPath) {
  if (!fs.existsSync(folderPath)) throw new Error(`Folder không tồn tại: ${folderPath}`);
  return fs.readdirSync(folderPath)
    .filter(f => VIDEO_EXTENSIONS.includes(path.extname(f).toLowerCase()))
    .sort()
    .map(f => ({ name: f, fullPath: path.join(folderPath, f), folder: folderPath }));
}

/**
 * Duyệt tất cả kênh + mục, lấy video theo range FROM_DAY → TO_DAY
 * Cấu trúc: rootPath/Kênh X/1/, rootPath/Kênh X/2/, ...
 */
function getAllVideos(rootPath) {
  const results = [];
  const fromDay = config.FROM_DAY || 0;
  const toDay = config.TO_DAY || 0;

  const entries = fs.readdirSync(rootPath, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const channelPath = path.join(rootPath, entry.name);

    // Đọc subfolder (mục/ngày) trong kênh
    const subEntries = fs.readdirSync(channelPath, { withFileTypes: true });
    for (const sub of subEntries) {
      if (!sub.isDirectory()) continue;

      // Filter theo range nếu tên folder là số
      const dayNum = parseInt(sub.name);
      if (!isNaN(dayNum) && fromDay > 0 && toDay > 0) {
        if (dayNum < fromDay || dayNum > toDay) continue;
      }

      const dayPath = path.join(channelPath, sub.name);
      const videos = getVideoFiles(dayPath);
      results.push(...videos);
    }

    // Cũng lấy video nằm trực tiếp trong folder kênh (nếu có)
    const directVideos = getVideoFiles(channelPath);
    if (directVideos.length > 0 && subEntries.filter(s => s.isDirectory()).length === 0) {
      results.push(...directVideos);
    }
  }

  // Nếu folder gốc chứa video trực tiếp (không có subfolder kênh)
  if (results.length === 0) {
    const directVideos = getVideoFiles(rootPath);
    results.push(...directVideos);
  }

  return results;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function log(tab, msg) {
  const time = new Date().toLocaleTimeString();
  console.log(`[${time}] [Tab ${tab}] ${msg}`);
}

// ============ GEMINI TAB HELPERS ============

async function uploadVideoToTab(page, video, tabId) {
  // Click upload menu
  const uploadPos = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b =>
      (b.getAttribute('aria-label') || '').normalize('NFC').includes('tải tệp'.normalize('NFC')) ||
      (b.getAttribute('aria-label') || '').normalize('NFC').includes('Upload file'.normalize('NFC'))
    );
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });

  if (!uploadPos) { log(tabId, '❌ Không tìm thấy nút upload'); return false; }

  await page.mouse.click(uploadPos.x, uploadPos.y);
  await sleep(1500);

  // Click "Tải tệp lên"
  const menuPos = await page.evaluate(() => {
    const o = document.querySelector('.cdk-overlay-container');
    if (!o) return null;
    for (const item of o.querySelectorAll('*')) {
      if (item.children.length === 0) {
        const text = (item.textContent || '').trim().normalize('NFC');
        if (text === 'Tải tệp lên'.normalize('NFC') || text.toLowerCase() === 'upload file') {
          const r = item.getBoundingClientRect();
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        }
      }
    }
    return null;
  });

  if (!menuPos) { log(tabId, '❌ Không tìm thấy menu "Tải tệp lên"'); return false; }

  const [fileChooser] = await Promise.all([
    page.waitForFileChooser({ timeout: 8000 }),
    page.mouse.click(menuPos.x, menuPos.y),
  ]);

  await fileChooser.accept([video.fullPath]);
  log(tabId, `📤 File đã gửi, đợi xử lý...`);
  await sleep(config.WAIT_AFTER_UPLOAD);
  return true;
}

async function clickSend(page, tabId) {
  const sendPos = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => {
      const aria = (b.getAttribute('aria-label') || '').normalize('NFC');
      return aria.includes('Gửi tin nhắn'.normalize('NFC')) || aria.includes('Send message');
    });
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });

  if (sendPos) {
    await page.mouse.click(sendPos.x, sendPos.y);
  } else {
    await page.keyboard.press('Enter');
  }
  log(tabId, `📨 Đã gửi, đợi Gemini gen...`);
}

async function waitAndParse(page, video, tabId) {
  try {
    const maxWait = config.WAIT_FOR_RESPONSE / 2000;
    let response = null;
    let hasItem1Since = 0;

    for (let i = 0; i < maxWait; i++) {
      await sleep(2000);
      try {
        const check = await page.evaluate(() => {
          const text = document.body.innerText;
          const isGenerating = text.includes('Ngừng tạo') || text.includes('Stop generating');
          const idx = text.lastIndexOf('ITEM 1');
          if (idx === -1) return { hasItem1: false, isGenerating };
          return { hasItem1: true, isGenerating, text: text.substring(idx, Math.min(idx + 8000, text.length)) };
        });

        if (check.hasItem1 && !check.isGenerating) { response = check.text; break; }

        if (check.hasItem1) {
          if (!hasItem1Since) hasItem1Since = i;
          if (i - hasItem1Since > 15 && check.text && check.text.includes('ITEM 2')) {
            response = check.text;
            break;
          }
        }
      } catch (e) {
        await sleep(3000);
      }
      if (i % 10 === 0 && i > 0) log(tabId, `  Đợi... (${i * 2}s)`);
    }

    if (!response) {
      log(tabId, '⏰ Timeout');
      try { await page.screenshot({ path: `gemini-timeout-tab${tabId}.png` }); } catch(e) {}
      return { video: video.name, folder: video.folder, title: 'ERROR', description: 'Timeout' };
    }

    const clean = response.split(/Nhanh|Gemini là AI/)[0].trim();
    const item1 = clean.match(/ITEM 1[:\s]*(.+?)(?=ITEM 2)/s);
    const item2 = clean.match(/ITEM 2[:\s]*([\s\S]+?)(?=This video is|$)/s);

    const title = item1 ? item1[1].trim() : '';
    const description = item2 ? item2[1].trim() : '';

    log(tabId, `✅ Done: "${title.substring(0, 60)}..."`);
    return { video: video.name, folder: video.folder, title, description };
  } finally {
    await page.close().catch(() => {});
  }
}

// ============ MAIN ============

async function main() {
  const args = process.argv.slice(2);
  const folderPath = args[0];

  const folderPath = args[0] || config.DEFAULT_FOLDER;

  if (!folderPath) {
    console.log('Usage: npm run scrape -- <folder> [from] [to]');
    console.log('  VD: npm run scrape -- "E:\\Videos" 1 3');
    return;
  }

  // Override config từ command line nếu có
  if (args[1]) config.FROM_DAY = parseInt(args[1]) || 0;
  if (args[2]) config.TO_DAY = parseInt(args[2]) || 0;

  const absPath = path.resolve(folderPath);
  const videos = getAllVideos(absPath);
  if (videos.length === 0) {
    console.log(`❌ Không tìm thấy video trong: ${absPath}`);
    return;
  }

  console.log(`📂 Folder: ${absPath}`);
  console.log(`🎬 Videos: ${videos.length}`);
  console.log(`📑 Tabs: ${config.MAX_TABS}`);
  console.log('');

  // Connect browser
  const browser = await puppeteer.connect({ browserURL: config.CHROME_DEBUG_URL });

  const results = [];
  
  // Xử lý theo batch — upload tuần tự, đợi response song song
  for (let i = 0; i < videos.length; i += config.MAX_TABS) {
    const batch = videos.slice(i, i + config.MAX_TABS);
    console.log(`\n═══ Batch ${Math.floor(i / config.MAX_TABS) + 1}: video ${i + 1}-${i + batch.length}/${videos.length} ═══`);

    // Mở tabs và upload tuần tự (tránh conflict file chooser)
    const tabPromises = [];
    for (let j = 0; j < batch.length; j++) {
      const video = batch[j];
      const tabId = i + j + 1;
      const page = await browser.newPage();
      
      try {
        // Navigate
        log(tabId, `Mở Gem page...`);
        await page.goto(config.GEM_URL, { waitUntil: 'networkidle2', timeout: 30000 });
        await sleep(6000);

        // Upload
        log(tabId, `Upload: ${video.name}`);
        const uploaded = await uploadVideoToTab(page, video, tabId);
        if (!uploaded) {
          results.push({ video: video.name, folder: video.folder, title: 'ERROR', description: 'Upload failed' });
          await page.close().catch(() => {});
          continue;
        }

        // Click gửi
        await clickSend(page, tabId);

        // Thêm vào danh sách đợi response (song song)
        tabPromises.push(waitAndParse(page, video, tabId));
      } catch (err) {
        log(tabId, `❌ Lỗi: ${err.message}`);
        results.push({ video: video.name, folder: video.folder, title: 'ERROR', description: err.message });
        await page.close().catch(() => {});
      }
    }

    // Đợi tất cả tabs gen response song song
    const batchResults = await Promise.all(tabPromises);
    results.push(...batchResults);

    if (i + config.MAX_TABS < videos.length) {
      console.log('⏳ Đợi 3s trước batch tiếp...');
      await sleep(3000);
    }
  }

  browser.disconnect();

  // Export Excel
  console.log('\n═══ Export Excel ═══');
  const rows = [['STT', 'title', 'description', 'profile', 'gio_dang', 'proxy', 'folder_video', 'video_name', 'result']];
  
  results.forEach((r, i) => {
    rows.push([
      i + 1,
      r.title,
      r.description,
      '',           // profile — user tự điền
      '',           // gio_dang — user tự điền
      '',           // proxy — user tự điền
      r.folder,     // folder_video — folder chứa video
      r.video,      // video_name
      '',           // result
    ]);
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 5 }, { wch: 60 }, { wch: 80 }, { wch: 25 },
    { wch: 20 }, { wch: 10 }, { wch: 40 }, { wch: 25 }, { wch: 15 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Schedule');
  XLSX.writeFile(wb, config.OUTPUT_FILE);

  console.log(`✅ Exported: ${config.OUTPUT_FILE}`);
  console.log(`📋 ${results.length} videos processed`);
  console.log(`   ✅ Success: ${results.filter(r => r.title !== 'ERROR').length}`);
  console.log(`   ❌ Error: ${results.filter(r => r.title === 'ERROR').length}`);

  // Ghi log lịch sử chạy
  const logFile = 'scrape-history.log';
  const now = new Date().toLocaleString();
  const fromDay = config.FROM_DAY || 'all';
  const toDay = config.TO_DAY || 'all';
  const channels = [...new Set(results.map(r => {
    // Lấy tên kênh từ folder path
    const parts = r.folder.split(path.sep);
    const kenhIdx = parts.findIndex(p => p.toLowerCase().includes('kênh') || p.toLowerCase().includes('kenh'));
    return kenhIdx > -1 ? parts[kenhIdx] : 'unknown';
  }))];
  const successCount = results.filter(r => r.title !== 'ERROR').length;
  const errorCount = results.filter(r => r.title === 'ERROR').length;

  const logEntry = `[${now}] Folder: ${absPath} | Day: ${fromDay}-${toDay} | Kênh: ${channels.join(', ')} | Videos: ${results.length} (✅${successCount} ❌${errorCount})\n`;
  
  fs.appendFileSync(logFile, logEntry);
  console.log(`📝 Log saved: ${logFile}`);
}

main().catch(e => {
  console.error('❌ Fatal:', e.message);
  process.exit(1);
});
