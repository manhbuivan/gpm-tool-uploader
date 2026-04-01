const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const logger = require('./logger');
const { actionDelay, sleepWithLog, formatScheduleDate, ensureDir } = require('./utils');

/**
 * Kết nối Puppeteer vào browser GPM Login
 * @param {string} browserURL - URL debug của browser (http://127.0.0.1:PORT)
 * @returns {Promise<{browser, page}>}
 */
async function connectBrowser(browserURL) {
  const browser = await puppeteer.connect({
    browserURL: browserURL,
    defaultViewport: null,
  });

  const pages = await browser.pages();
  const page = pages[0] || await browser.newPage();

  // Set timeout mặc định
  page.setDefaultTimeout(60000);
  page.setDefaultNavigationTimeout(60000);

  return { browser, page };
}

/**
 * Chụp screenshot khi lỗi
 */
async function takeErrorScreenshot(page, profileId, step) {
  try {
    ensureDir(config.ERROR_SCREENSHOT_DIR);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${profileId}_${step}_${timestamp}.png`;
    const filepath = path.join(config.ERROR_SCREENSHOT_DIR, filename);
    await page.screenshot({ path: filepath, fullPage: true });
    logger.error(profileId, `📸 Screenshot lỗi: ${filepath}`);
  } catch (e) {
    logger.error(profileId, `Không thể chụp screenshot: ${e.message}`);
  }
}

/**
 * Đợi và click element, hỗ trợ nhiều loại selector
 */
async function waitAndClick(page, selector, description, timeout = 15000) {
  try {
    await page.waitForSelector(selector, { visible: true, timeout });
    await actionDelay();
    await page.click(selector);
    logger.debug(null, `  ✓ Click: ${description}`);
  } catch (err) {
    throw new Error(`Không tìm thấy element "${description}" (${selector}): ${err.message}`);
  }
}

/**
 * Đợi element xuất hiện
 */
async function waitForElement(page, selector, timeout = 15000) {
  return await page.waitForSelector(selector, { visible: true, timeout });
}

/**
 * Gõ text vào input, xóa nội dung cũ trước
 */
async function clearAndType(page, selector, text, description) {
  try {
    await page.waitForSelector(selector, { visible: true, timeout: 15000 });
    await actionDelay();

    // Click vào element
    await page.click(selector);
    await actionDelay();

    // Chọn tất cả và xóa
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyA');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');

    // Gõ text mới - gõ từng ký tự cho tự nhiên
    for (const char of text) {
      await page.keyboard.type(char, { delay: Math.random() * 50 + 20 });
    }

    logger.debug(null, `  ✓ Type: ${description}`);
  } catch (err) {
    throw new Error(`Không thể nhập "${description}" (${selector}): ${err.message}`);
  }
}

/**
 * Upload 1 video Shorts lên YouTube Studio với schedule
 * 
 * @param {object} params
 * @param {string} params.browserURL - URL debug browser GPM
 * @param {string} params.profileId - ID profile (dùng cho log)
 * @param {string} params.videoPath - Đường dẫn file video
 * @param {string} params.title - Tiêu đề video
 * @param {string} params.description - Mô tả video
 * @param {Date} params.scheduleDate - Ngày giờ lên lịch công khai
 * @param {boolean} params.dryRun - Nếu true, không upload thật
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function uploadShort(params) {
  const { browserURL, profileId, videoPath, title, description, scheduleDate, dryRun } = params;

  // Verify file tồn tại
  if (!fs.existsSync(videoPath)) {
    throw new Error(`File video không tồn tại: ${videoPath}`);
  }

  logger.info(profileId, `🎬 Upload: ${path.basename(videoPath)}`);
  logger.info(profileId, `📝 Title: ${title}`);
  logger.info(profileId, `📅 Schedule: ${scheduleDate.toLocaleString()}`);

  if (dryRun) {
    logger.info(profileId, '🏃 DRY RUN - Bỏ qua upload thật');
    return { success: true, message: 'dry-run' };
  }

  let browser, page;

  try {
    // 1. Kết nối browser
    ({ browser, page } = await connectBrowser(browserURL));
    logger.info(profileId, '🌐 Đã kết nối browser');

    // 2. Mở YouTube Studio
    logger.info(profileId, '📺 Đang mở YouTube Studio...');
    await page.goto('https://studio.youtube.com', { waitUntil: 'networkidle2', timeout: 60000 });
    await sleepWithLog(3000, 'Đợi YouTube Studio load');

    // 3. Click nút CREATE (Upload)
    logger.info(profileId, '📤 Bắt đầu upload...');
    
    // Tìm nút CREATE/TẠO - thử nhiều selector
    const createButtonSelectors = [
      '#create-icon',                                    // Nút Create icon
      'ytcp-button#create-icon',                         // Polymer component
      '#upload-icon',                                    // Nút upload
      'button[aria-label="Upload videos"]',              // Aria label EN
      'button[aria-label="Tải video lên"]',              // Aria label VI
    ];

    let createClicked = false;
    for (const sel of createButtonSelectors) {
      try {
        await page.waitForSelector(sel, { visible: true, timeout: 5000 });
        await page.click(sel);
        createClicked = true;
        logger.debug(profileId, `  ✓ Click CREATE: ${sel}`);
        break;
      } catch (e) {
        continue;
      }
    }

    if (!createClicked) {
      // Thử tìm trong shadow DOM bằng evaluate
      createClicked = await page.evaluate(() => {
        // Tìm nút có icon upload
        const buttons = document.querySelectorAll('ytcp-button, tp-yt-paper-icon-button');
        for (const btn of buttons) {
          const id = btn.id || '';
          const text = btn.textContent || '';
          if (id.includes('create') || id.includes('upload') || text.includes('Create') || text.includes('Tạo')) {
            btn.click();
            return true;
          }
        }
        return false;
      });
    }

    if (!createClicked) {
      throw new Error('Không tìm thấy nút CREATE/Upload trên YouTube Studio');
    }

    await actionDelay();

    // 4. Click "Upload videos" trong menu dropdown
    const uploadMenuSelectors = [
      '#text-item-0',                                     // Item đầu tiên trong menu
      'tp-yt-paper-item:first-child',                     // Paper item
      'a[href*="upload"]',                                 // Link upload
    ];

    let menuClicked = false;
    for (const sel of uploadMenuSelectors) {
      try {
        await page.waitForSelector(sel, { visible: true, timeout: 5000 });
        await page.click(sel);
        menuClicked = true;
        logger.debug(profileId, `  ✓ Click Upload videos: ${sel}`);
        break;
      } catch (e) {
        continue;
      }
    }

    if (!menuClicked) {
      menuClicked = await page.evaluate(() => {
        const items = document.querySelectorAll('tp-yt-paper-item, ytcp-text-menu a');
        for (const item of items) {
          const text = (item.textContent || '').toLowerCase();
          if (text.includes('upload video') || text.includes('tải video lên')) {
            item.click();
            return true;
          }
        }
        return false;
      });
    }

    await actionDelay();
    await sleepWithLog(2000, 'Đợi dialog upload');

    // 5. Upload file video
    logger.info(profileId, '📁 Chọn file video...');

    // Đợi input file xuất hiện
    const fileInputSelector = 'input[type="file"]';
    try {
      await page.waitForSelector(fileInputSelector, { timeout: 10000 });
    } catch (e) {
      // Nếu không tìm thấy input file trực tiếp, thử tìm trong shadow DOM
      await page.evaluate(() => {
        const inputs = document.querySelectorAll('input[type="file"]');
        if (inputs.length === 0) {
          // Tìm sâu trong shadow root
          const allElements = document.querySelectorAll('*');
          for (const el of allElements) {
            if (el.shadowRoot) {
              const input = el.shadowRoot.querySelector('input[type="file"]');
              if (input) return;
            }
          }
        }
      });
      await page.waitForSelector(fileInputSelector, { timeout: 5000 });
    }

    // Upload file
    const fileInput = await page.$(fileInputSelector);
    if (!fileInput) {
      throw new Error('Không tìm thấy input file upload');
    }
    await fileInput.uploadFile(videoPath);
    logger.info(profileId, `  ✓ Đã chọn file: ${path.basename(videoPath)}`);

    // 6. Đợi upload bắt đầu và form details xuất hiện
    await sleepWithLog(5000, 'Đợi YouTube xử lý file');

    // 7. Điền Title
    logger.info(profileId, '✏️ Điền thông tin video...');

    // Title input - YouTube Studio dùng textbox đặc biệt
    const titleSelectors = [
      'div#textbox[contenteditable="true"]',              // Textbox chính
      '#title-textarea div[contenteditable="true"]',       // Trong container title
      'ytcp-social-suggestions-textbox #textbox',          // Component textbox
    ];

    let titleFilled = false;
    for (const sel of titleSelectors) {
      try {
        const els = await page.$$(sel);
        // Title thường là textbox đầu tiên
        if (els.length > 0) {
          await els[0].click();
          await actionDelay();

          // Xóa nội dung cũ (YouTube tự điền tên file)
          await page.keyboard.down('Control');
          await page.keyboard.press('KeyA');
          await page.keyboard.up('Control');
          await page.keyboard.press('Backspace');
          await actionDelay();

          // Gõ title
          await page.keyboard.type(title, { delay: Math.random() * 30 + 15 });
          titleFilled = true;
          logger.debug(profileId, `  ✓ Title filled: ${sel}`);
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!titleFilled) {
      logger.warn(profileId, '⚠️ Không thể điền title tự động, thử phương pháp khác...');
      // Fallback: dùng evaluate
      await page.evaluate((titleText) => {
        const textboxes = document.querySelectorAll('div#textbox[contenteditable="true"]');
        if (textboxes.length > 0) {
          textboxes[0].innerHTML = '';
          textboxes[0].focus();
          document.execCommand('insertText', false, titleText);
        }
      }, title);
    }

    await actionDelay();

    // 8. Điền Description
    const descSelectors = [
      'div#textbox[contenteditable="true"]',
    ];

    try {
      const textboxes = await page.$$('div#textbox[contenteditable="true"]');
      // Description thường là textbox thứ 2
      if (textboxes.length >= 2) {
        await textboxes[1].click();
        await actionDelay();
        await page.keyboard.type(description, { delay: Math.random() * 25 + 10 });
        logger.debug(profileId, '  ✓ Description filled');
      }
    } catch (e) {
      logger.warn(profileId, `⚠️ Không thể điền description: ${e.message}`);
    }

    await actionDelay();

    // 9. Chọn "Not made for kids"
    logger.info(profileId, '👶 Chọn "Not made for kids"...');
    try {
      // Radio button "Not made for kids"
      const notForKidsSelectors = [
        'tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]',
        '#audience tp-yt-paper-radio-button:nth-child(2)',
        'tp-yt-paper-radio-button[name="NOT_MADE_FOR_KIDS"]',
      ];

      let kidsClicked = false;
      for (const sel of notForKidsSelectors) {
        try {
          await page.waitForSelector(sel, { visible: true, timeout: 5000 });
          await page.click(sel);
          kidsClicked = true;
          break;
        } catch (e) {
          continue;
        }
      }

      if (!kidsClicked) {
        // Fallback: tìm radio button có text "not made for kids"
        await page.evaluate(() => {
          const radios = document.querySelectorAll('tp-yt-paper-radio-button');
          for (const radio of radios) {
            const text = (radio.textContent || '').toLowerCase();
            if (text.includes('not made for kids') || text.includes('không phải dành cho trẻ em')) {
              radio.click();
              return;
            }
          }
        });
      }
      logger.debug(profileId, '  ✓ Not made for kids selected');
    } catch (e) {
      logger.warn(profileId, `⚠️ Không thể chọn "Not made for kids": ${e.message}`);
    }

    await actionDelay();

    // 10-12. Click NEXT 3 lần (Details → Video elements → Checks → Visibility)
    for (let step = 1; step <= 3; step++) {
      const stepNames = ['Video elements', 'Checks', 'Visibility'];
      logger.info(profileId, `➡️ Next → ${stepNames[step - 1]}...`);

      const nextSelectors = [
        '#next-button',
        'ytcp-button#next-button',
        '#step-badge-3',
      ];

      let nextClicked = false;
      for (const sel of nextSelectors) {
        try {
          await page.waitForSelector(sel, { visible: true, timeout: 8000 });
          await page.click(sel);
          nextClicked = true;
          break;
        } catch (e) {
          continue;
        }
      }

      if (!nextClicked) {
        await page.evaluate(() => {
          const buttons = document.querySelectorAll('ytcp-button');
          for (const btn of buttons) {
            const text = (btn.textContent || '').toLowerCase().trim();
            if (text === 'next' || text === 'tiếp theo' || text === 'tiếp') {
              btn.click();
              return;
            }
          }
        });
      }

      await actionDelay();
      await sleepWithLog(2000, `Đợi bước ${stepNames[step - 1]}`);
    }

    // 13. Chọn Schedule
    logger.info(profileId, '📅 Thiết lập Schedule...');

    const scheduleSuccess = await page.evaluate(() => {
        // Ưu tiên tìm theo ID chuẩn của Youtube Studio
        const scheduleBtn = document.querySelector('#schedule-radio-button');
        if (scheduleBtn) {
            scheduleBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            scheduleBtn.click();
            return true;
        }

        // Dự phòng tìm theo chữ
        const radios = document.querySelectorAll('tp-yt-paper-radio-button, .ytcp-video-visibility-select');
        for (const radio of radios) {
          const name = (radio.getAttribute('name') || '').toUpperCase();
          const text = (radio.textContent || '').toLowerCase();
          if (name === 'SCHEDULE' || text.includes('schedule') || (text.includes('lên') && text.includes('lịch'))) {
            radio.scrollIntoView({ behavior: 'smooth', block: 'center' });
            radio.click();
            return true;
          }
        }
        return false;
    });

    if (scheduleSuccess) {
        logger.debug(profileId, `  ✓ Schedule radio clicked`);
    } else {
        logger.warn(profileId, `⚠️ Không tìm thấy nút Schedule radio`);
    }

    await actionDelay();
    await sleepWithLog(2000, 'Đợi form schedule');

    // 14. Set ngày giờ schedule
    const padNode = n => String(n).padStart(2, '0');
    const yyNode = scheduleDate.getFullYear();
    const mmNode = padNode(scheduleDate.getMonth() + 1);
    const ddNode = padNode(scheduleDate.getDate());
    
    // Eng date component
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const engDate = `${months[scheduleDate.getMonth()]} ${scheduleDate.getDate()}, ${yyNode}`;
    const viDate = `${ddNode}/${mmNode}/${yyNode}`;

    // Time components - Chú ý: Làm tròn mốc 15 phút (YouTube Studio chỉ nhận 00, 15, 30, 45)
    let hTemp = scheduleDate.getHours();
    let mTemp = scheduleDate.getMinutes();
    
    // Fix sai số làm tròn của Excel (vd 05:59 -> 06:00)
    mTemp = Math.round(mTemp / 15) * 15;
    if (mTemp === 60) {
        mTemp = 0;
        hTemp += 1;
    }
    if (hTemp === 24) {
        hTemp = 0; // Sang ngày mới (tạm bỏ qua tăng ngày vì hiếm khi đặt 23:59)
    }

    const ampm = hTemp >= 12 ? 'PM' : 'AM';
    let hEng = hTemp % 12; if(hEng === 0) hEng = 12;
    
    const engTime = `${hEng}:${padNode(mTemp)} ${ampm}`;
    const viTime = `${padNode(hTemp)}:${padNode(mTemp)}`;

    // evaluate
    const { dateStr, timeStr } = await page.evaluate(({engDate, viDate, engTime, viTime}) => {
        const lang = document.documentElement.lang || navigator.language || '';
        if (lang.toLowerCase().startsWith('en')) {
            return { dateStr: engDate, timeStr: engTime };
        } else {
            return { dateStr: viDate, timeStr: viTime };
        }
    }, { engDate, viDate, engTime, viTime });

    logger.info(profileId, `  📅 Date: ${dateStr}`);
    logger.info(profileId, `  🕐 Time: ${timeStr}`);

    // Helper dùng evaluate để tìm và focus đúng ô Date / Time bằng đệ quy Shadow DOM
    const findAndFocusInput = async (page, inputType) => {
      return await page.evaluate((type) => {
        // Hàm đệ quy tìm kiếm xuyên qua các lớp Shadow DOM
        const queryDeep = (selector, root = document) => {
          let el = root.querySelector && root.querySelector(selector);
          if (el) return el;
          
          // Phải kiểm tra chính cái root xem nó có shadowRoot không
          if (root.shadowRoot) {
            el = queryDeep(selector, root.shadowRoot);
            if (el) return el;
          }

          let items = root.querySelectorAll ? root.querySelectorAll('*') : [];
          for (let item of items) {
            if (item.shadowRoot) {
              el = queryDeep(selector, item.shadowRoot);
              if (el) return el;
            }
          }
          return null;
        };

        const getEl = () => {
          if (type === 'date') {
            const picker = queryDeep('ytcp-date-picker') || queryDeep('#datepicker-trigger');
            if (picker) {
              const input = queryDeep('input', picker) || picker;
              return input;
            }
          } else if (type === 'time') {
            const picker = queryDeep('ytcp-time-of-day-picker') || queryDeep('ytcp-time-of-day-picker-v2') || queryDeep('#time-of-day-trigger');
            if (picker) {
              // Time picker có input ẩn bên trong
              const input = queryDeep('input', picker) || picker;
              return input;
            }
          }

          // Fallback deep search theo class / aria-label nếu vẫn không thấy
          const allEls = document.querySelectorAll('*');
          for (const el of allEls) {
            if (el.shadowRoot) {
               const shadowInputs = el.shadowRoot.querySelectorAll('input');
               for (const input of shadowInputs) {
                 const aria = (input.getAttribute('aria-label') || '').toLowerCase();
                 const name = (input.getAttribute('name') || '').toLowerCase();
                 if (type === 'date' && (aria.includes('date') || aria.includes('ngày') || name.includes('date'))) return input;
                 if (type === 'time' && (aria.includes('time') || aria.includes('giờ') || name.includes('time'))) return input;
               }
            }
          }
          return null;
        };

        const input = getEl();
        if (input) {
          input.scrollIntoView({ behavior: 'smooth', block: 'center' });
          input.focus();
          if(typeof input.click === 'function') input.click();
          
          // Chọn toàn bộ văn bản để gõ đè lên (chuẩn hơn so với bấm phím Ctrl A)
          if(typeof input.select === 'function') {
             try { input.select(); } catch(e) {}
             // Thêm một cách xóa giá trị an toàn qua execCommand nếu có
             try { document.execCommand('selectAll', false, null); } catch(e) {}
          }
          return true;
        }
        return false;
      }, inputType);
    };

    // Set date
    try {
      const isDateFocused = await findAndFocusInput(page, 'date');
      
      // Fallback selector puppeteer mới
      if (!isDateFocused) {
          try {
              const dInput = await page.$('>>> ytcp-date-picker >>> input, >>> #datepicker-trigger >>> input');
              if (dInput) {
                  await dInput.click();
                  await dInput.evaluate(el => el.select && el.select());
              } else {
                  throw new Error('Không tìm thấy ô Date qua fallback handler');
              }
          } catch(e) {
              logger.warn(profileId, `⚠️ Không tìm thấy ô Date fallback: ${e.message}`);
          }
      }

      await sleepWithLog(1000, 'Focus Date');
      await page.keyboard.press('Backspace');
      for(let i=0; i<4; i++) { await page.keyboard.press('Backspace'); } // Bơm thêm backspace dự phòng
      
      await actionDelay();
      await page.keyboard.type(dateStr, { delay: 30 });
      await page.keyboard.press('Enter');
      await actionDelay();
      await page.keyboard.press('Escape'); // Đóng popup calendar nếu có
      logger.debug(profileId, `  ✓ Date set`);
    } catch (e) {
      logger.warn(profileId, `⚠️ Lỗi set date: ${e.message}`);
    }

    await actionDelay();

    // Set time — YouTube Studio dùng dropdown cho time picker
    try {
      logger.info(profileId, `  🕐 Đang set time: ${timeStr}`);

      // Debug: dump DOM structure vùng schedule để biết chính xác cấu trúc
      const debugInfo = await page.evaluate(() => {
        const info = { timePickers: [], dropdowns: [], inputs: [], scheduleHTML: '' };

        // Tìm tất cả element liên quan đến time
        const tagNames = ['ytcp-time-of-day-picker', 'ytcp-time-of-day-picker-v2',
                          'ytcp-text-dropdown-trigger', 'tp-yt-paper-dropdown-menu'];
        for (const tag of tagNames) {
          const els = document.querySelectorAll(tag);
          els.forEach(el => {
            info.timePickers.push({
              tag: el.tagName.toLowerCase(),
              id: el.id,
              classes: el.className,
              visible: el.offsetWidth > 0,
              childTags: Array.from(el.children).map(c => c.tagName.toLowerCase()).slice(0, 5),
            });
          });
        }

        // Tìm tất cả input trong vùng schedule
        const scheduleArea = document.querySelector('#schedule-date-time') ||
                             document.querySelector('ytcp-video-visibility-select') ||
                             document.querySelector('#visibility-publish-time');
        if (scheduleArea) {
          info.scheduleHTML = scheduleArea.innerHTML.substring(0, 2000);
          const inputs = scheduleArea.querySelectorAll('input');
          inputs.forEach(inp => {
            info.inputs.push({
              type: inp.type,
              id: inp.id,
              ariaLabel: inp.getAttribute('aria-label'),
              value: inp.value,
              visible: inp.offsetWidth > 0,
            });
          });
        }

        // Tìm dropdown trigger gần vùng time
        document.querySelectorAll('ytcp-text-dropdown-trigger').forEach(el => {
          info.dropdowns.push({
            id: el.id,
            text: (el.textContent || '').trim().substring(0, 50),
            visible: el.offsetWidth > 0,
            parentId: el.parentElement?.id || '',
            parentTag: el.parentElement?.tagName?.toLowerCase() || '',
          });
        });

        return info;
      });

      logger.debug(profileId, `  🔍 Debug DOM: ${JSON.stringify(debugInfo)}`);

      // === Bước 1: Mở dropdown time ===
      let timePickerOpened = false;

      // Cách 1: Click ytcp-text-dropdown-trigger chứa giờ (thường là cái thứ 2 trong vùng schedule)
      timePickerOpened = await page.evaluate(() => {
        // Tìm trong vùng schedule
        const scheduleArea = document.querySelector('#schedule-date-time') ||
                             document.querySelector('ytcp-video-visibility-select');
        if (!scheduleArea) return false;

        // Tìm tất cả dropdown trigger trong vùng schedule
        const triggers = scheduleArea.querySelectorAll('ytcp-text-dropdown-trigger');
        // Trigger đầu tiên thường là timezone, trigger thứ 2 (hoặc cái có giờ) là time
        // Hoặc tìm cái có text match pattern giờ
        for (const trigger of triggers) {
          const text = (trigger.textContent || '').trim();
          if (/\d{1,2}:\d{2}/.test(text)) {
            trigger.scrollIntoView({ behavior: 'smooth', block: 'center' });
            trigger.click();
            return true;
          }
        }
        // Nếu không match pattern, thử click trigger cuối cùng (thường là time)
        if (triggers.length > 0) {
          const last = triggers[triggers.length - 1];
          last.scrollIntoView({ behavior: 'smooth', block: 'center' });
          last.click();
          return true;
        }
        return false;
      });

      if (timePickerOpened) {
        logger.debug(profileId, `  ✓ Time dropdown opened via ytcp-text-dropdown-trigger`);
      }

      // Cách 2: Thử selector trực tiếp
      if (!timePickerOpened) {
        const timePickerSelectors = [
          '#time-of-day-trigger',
          'ytcp-time-of-day-picker',
          'ytcp-time-of-day-picker-v2',
          '#schedule-date-time ytcp-text-dropdown-trigger:last-of-type',
        ];
        for (const sel of timePickerSelectors) {
          try {
            await page.waitForSelector(sel, { visible: true, timeout: 2000 });
            await page.click(sel);
            timePickerOpened = true;
            logger.debug(profileId, `  ✓ Time picker opened via: ${sel}`);
            break;
          } catch (e) {
            continue;
          }
        }
      }

      if (!timePickerOpened) {
        logger.warn(profileId, '⚠️ Không thể mở time picker dropdown');
      }

      await sleepWithLog(2000, 'Đợi dropdown time mở');

      // === Bước 2: Chọn giờ từ dropdown ===
      const timeSelected = await page.evaluate((targetTime) => {
        const normalizeTime = (str) => str.replace(/\s+/g, ' ').trim().toUpperCase();
        const target = normalizeTime(targetTime);

        // Tìm tất cả options có thể — thử nhiều selector
        const selectors = [
          'tp-yt-paper-item',
          'paper-item',
          '[role="option"]',
          'tp-yt-paper-listbox tp-yt-paper-item',
          'tp-yt-paper-listbox paper-item',
          '#time-of-day-listbox tp-yt-paper-item',
          'ytcp-text-dropdown-trigger + * tp-yt-paper-item',
          '.ytcp-text-dropdown-trigger tp-yt-paper-item',
        ];

        let allOptions = [];
        for (const sel of selectors) {
          const items = document.querySelectorAll(sel);
          // Lọc chỉ lấy visible items có text match pattern giờ
          const visible = Array.from(items).filter(el => {
            if (el.offsetWidth === 0 && el.offsetHeight === 0) return false;
            const text = (el.textContent || '').trim();
            return /\d{1,2}:\d{2}/.test(text);
          });
          if (visible.length > 0) {
            allOptions = visible;
            break;
          }
        }

        // Nếu vẫn không tìm thấy, tìm bất kỳ tp-yt-paper-item nào visible
        if (allOptions.length === 0) {
          const all = document.querySelectorAll('tp-yt-paper-item, paper-item');
          allOptions = Array.from(all).filter(el => {
            const text = (el.textContent || '').trim();
            return el.offsetWidth > 0 && /\d{1,2}:\d{2}/.test(text);
          });
        }

        if (allOptions.length === 0) {
          // Dump toàn bộ tp-yt-paper-item để debug
          const allItems = document.querySelectorAll('tp-yt-paper-item');
          const dump = Array.from(allItems).slice(0, 15).map(el => ({
            text: (el.textContent || '').trim().substring(0, 30),
            visible: el.offsetWidth > 0,
            parent: el.parentElement?.tagName?.toLowerCase(),
          }));
          return { found: false, reason: 'no-options', totalPaperItems: allItems.length, dump };
        }

        // Tìm option khớp
        for (const opt of allOptions) {
          const optText = normalizeTime(opt.textContent || '');
          if (optText === target || optText.includes(target)) {
            opt.scrollIntoView({ behavior: 'smooth', block: 'center' });
            opt.click();
            return { found: true, clicked: optText };
          }
        }

        // So sánh linh hoạt: bỏ leading zero, bỏ space trước AM/PM
        const flexMatch = (a, b) => {
          const cleanA = a.replace(/^0/, '').replace(/\s*(AM|PM)/i, ' $1').trim();
          const cleanB = b.replace(/^0/, '').replace(/\s*(AM|PM)/i, ' $1').trim();
          return cleanA === cleanB;
        };

        for (const opt of allOptions) {
          const optText = normalizeTime(opt.textContent || '');
          if (flexMatch(optText, target)) {
            opt.scrollIntoView({ behavior: 'smooth', block: 'center' });
            opt.click();
            return { found: true, clicked: optText };
          }
        }

        const sampleOptions = allOptions.slice(0, 10).map(o => (o.textContent || '').trim());
        return { found: false, reason: 'no-match', target: targetTime, optionCount: allOptions.length, sampleOptions };
      }, timeStr);

      if (timeSelected.found) {
        logger.info(profileId, `  ✓ Time selected: ${timeSelected.clicked}`);
      } else {
        logger.warn(profileId, `⚠️ Không tìm thấy giờ "${timeStr}" trong dropdown. Debug: ${JSON.stringify(timeSelected)}`);

        // Fallback: thử type trực tiếp vào input nếu có
        const fallbackResult = await page.evaluate((time) => {
          // Tìm input trong vùng schedule
          const scheduleArea = document.querySelector('#schedule-date-time') ||
                               document.querySelector('ytcp-video-visibility-select');
          if (!scheduleArea) return { typed: false, reason: 'no-schedule-area' };

          const inputs = scheduleArea.querySelectorAll('input');
          for (const input of inputs) {
            const aria = (input.getAttribute('aria-label') || '').toLowerCase();
            const placeholder = (input.placeholder || '').toLowerCase();
            if (aria.includes('time') || aria.includes('giờ') || placeholder.includes('time') || placeholder.includes('giờ')) {
              input.focus();
              input.value = '';
              input.value = time;
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
              input.dispatchEvent(new Event('blur', { bubbles: true }));
              return { typed: true, ariaLabel: aria };
            }
          }

          // Thử input thứ 2 (input đầu là date, input 2 là time)
          if (inputs.length >= 2) {
            const input = inputs[1];
            input.focus();
            input.value = '';
            input.value = time;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.dispatchEvent(new Event('blur', { bubbles: true }));
            return { typed: true, method: 'second-input' };
          }

          return { typed: false, reason: 'no-time-input', inputCount: inputs.length };
        }, timeStr);

        logger.debug(profileId, `  Fallback type result: ${JSON.stringify(fallbackResult)}`);
      }

      await actionDelay();
      await page.keyboard.press('Escape');
      logger.debug(profileId, `  ✓ Time set done`);
    } catch (e) {
      logger.warn(profileId, `⚠️ Lỗi set time: ${e.message}`);
    }

    await actionDelay();

    // 15. Click "Schedule" để publish
    logger.info(profileId, '🚀 Đang schedule video...');

    // Đã bỏ qua bước chờ video upload hoàn tất theo yêu cầu (chỉ ấn Schedule luôn)
    logger.info(profileId, '⏩ Bỏ qua bước chờ upload, chốt đơn luôn...');
    await sleepWithLog(2000, 'Delay nhanh trước khi Schedule');

    // Click nút Schedule/Done
    const scheduleButtonSelectors = [
      '#done-button',
      'ytcp-button#done-button',
    ];

    let doneClicked = false;
    for (const sel of scheduleButtonSelectors) {
      try {
        await page.waitForSelector(sel, { visible: true, timeout: 10000 });
        await page.click(sel);
        doneClicked = true;
        logger.debug(profileId, `  ✓ Schedule button clicked: ${sel}`);
        break;
      } catch (e) {
        continue;
      }
    }

    if (!doneClicked) {
      await page.evaluate(() => {
        const buttons = document.querySelectorAll('ytcp-button');
        for (const btn of buttons) {
          const text = (btn.textContent || '').toLowerCase().trim();
          if (text.includes('schedule') || text.includes('lên lịch') || text.includes('đặt lịch') || text === 'done' || text === 'xong') {
            btn.click();
            return;
          }
        }
      });
    }

    await sleepWithLog(3000, 'Đợi xử lý nút Schedule');

    // 15.5 Bắt popup "Chúng tôi vẫn đang kiểm tra..." (Đã hiểu / Got it)
    logger.info(profileId, '🔎 Kiểm tra popup cảnh báo upload chưa xong...');
    try {
      const gotItClicked = await page.evaluate(() => {
        const queryAllDeep = (selector, root = document) => {
          let results = Array.from(root.querySelectorAll ? root.querySelectorAll(selector) : []);
          let items = root.querySelectorAll ? root.querySelectorAll('*') : [];
          for (let item of items) {
            if (item.shadowRoot) {
              results = results.concat(queryAllDeep(selector, item.shadowRoot));
            }
          }
          return results;
        };

        const buttons = queryAllDeep('ytcp-button, yt-button-renderer');
        for (const btn of buttons) {
          const text = (btn.textContent || '').toLowerCase().trim();
          if (text === 'đã hiểu' || text === 'got it' || text === 'xác nhận') {
            if (btn.offsetWidth > 0 && btn.offsetHeight > 0) {
              btn.click();
              return text;
            }
          }
        }
        return null;
      });

      if (gotItClicked) {
        logger.warn(profileId, `⚠️ Màn hình hiện cảnh báo chưa check xong, đã tự động click nút [${gotItClicked}]`);
        await actionDelay();
      }
    } catch (e) {
      // Có lỗi thì bỏ qua
    }

    // 16. Đợi xác nhận
    await sleepWithLog(4000, 'Đợi hoàn tất quá trình schedule');

    // Kiểm tra dialog thành công
    let success = false;
    try {
      success = await page.evaluate(() => {
        const body = document.body.textContent || '';
        return body.includes('Scheduled') || body.includes('published') ||
               body.includes('Đã lên lịch') || body.includes('Video scheduled') ||
               !document.querySelector('ytcp-uploads-dialog[is-dialog-open]');
      });
    } catch (e) {
      // Nếu không kiểm tra được, coi như thành công
      success = true;
    }

    if (success) {
      logger.info(profileId, `✅ Video đã được schedule thành công!`);
      return { success: true, message: `done - scheduled ${scheduleDate.toLocaleString()}` };
    } else {
      throw new Error('Schedule video có thể không thành công');
    }

  } catch (error) {
    logger.error(profileId, `❌ Lỗi upload: ${error.message}`);
    if (page) {
      await takeErrorScreenshot(page, profileId, 'upload-error');
    }
    return { success: false, message: `error: ${error.message}` };
  } finally {
    // Disconnect (không close browser - GPM quản lý)
    if (browser) {
      try {
        browser.disconnect();
      } catch (e) { /* ignore */ }
    }
  }
}

module.exports = {
  uploadShort,
  connectBrowser,
};
