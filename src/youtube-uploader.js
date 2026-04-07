const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const logger = require('./logger');
const { actionDelay, sleepWithLog, formatScheduleDate, ensureDir } = require('./utils');

async function connectBrowser(browserURL) {
  const browser = await puppeteer.connect({
    browserURL: browserURL,
    defaultViewport: null,
    protocolTimeout: 120000,
  });
  const pages = await browser.pages();
  const page = pages[0] || await browser.newPage();
  page.setDefaultTimeout(90000);
  page.setDefaultNavigationTimeout(90000);
  return { browser, page };
}

async function takeErrorScreenshot(page, profileId, step) {
  try {
    ensureDir(config.ERROR_SCREENSHOT_DIR);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${profileId}_${step}_${timestamp}.png`;
    const filepath = path.join(config.ERROR_SCREENSHOT_DIR, filename);
    await page.screenshot({ path: filepath, fullPage: true });
    logger.error(profileId, `Screenshot: ${filepath}`);
  } catch (e) {}
}

async function uploadShort(params) {
  const { browserURL, profileId, videoPath, title, description, scheduleDate, dryRun } = params;

  if (!fs.existsSync(videoPath)) {
    throw new Error('File video khong ton tai: ' + videoPath);
  }

  logger.info(profileId, 'Upload: ' + path.basename(videoPath));
  logger.info(profileId, 'Title: ' + title);
  logger.info(profileId, 'Schedule: ' + scheduleDate.day + '/' + scheduleDate.month + '/' + scheduleDate.year + ' ' + scheduleDate.hours + ':' + String(scheduleDate.minutes).padStart(2, '0'));

  if (dryRun) {
    logger.info(profileId, 'DRY RUN');
    return { success: true, message: 'dry-run' };
  }

  let browser, page;

  try {
    ({ browser, page } = await connectBrowser(browserURL));
    logger.info(profileId, 'Da ket noi browser');

    // Mo YouTube Studio
    await page.goto('https://studio.youtube.com', { waitUntil: 'networkidle2', timeout: 120000 });
    await sleepWithLog(3000, 'Doi YouTube Studio load');

    // Click CREATE
    logger.info(profileId, 'Bat dau upload...');
    const createSelectors = ['#create-icon', 'ytcp-button#create-icon', '#upload-icon'];
    let createClicked = false;
    for (const sel of createSelectors) {
      try {
        await page.waitForSelector(sel, { visible: true, timeout: 5000 });
        await page.click(sel);
        createClicked = true;
        break;
      } catch (e) { continue; }
    }
    if (!createClicked) {
      await page.evaluate(() => {
        const buttons = document.querySelectorAll('ytcp-button, tp-yt-paper-icon-button');
        for (const btn of buttons) {
          if ((btn.id || '').includes('create') || (btn.id || '').includes('upload')) { btn.click(); return; }
        }
      });
    }
    await actionDelay();

    // Click Upload videos menu
    const menuSelectors = ['#text-item-0', 'tp-yt-paper-item:first-child', 'a[href*="upload"]'];
    for (const sel of menuSelectors) {
      try {
        await page.waitForSelector(sel, { visible: true, timeout: 5000 });
        await page.click(sel);
        break;
      } catch (e) { continue; }
    }
    await actionDelay();
    await sleepWithLog(2000, 'Doi dialog upload');

    // Upload file
    const fileInputSelector = 'input[type="file"]';
    await page.waitForSelector(fileInputSelector, { timeout: 15000 });
    const fileInput = await page.$(fileInputSelector);
    if (!fileInput) throw new Error('Khong tim thay input file');
    await fileInput.uploadFile(videoPath);
    logger.info(profileId, 'Da chon file: ' + path.basename(videoPath));
    await sleepWithLog(5000, 'Doi YouTube xu ly file');

    // 7. Dien Title + Description
    logger.info(profileId, 'Dien thong tin video...');
    const allTextboxes = await page.$$('div#textbox[contenteditable="true"]');
    logger.debug(profileId, '  Found ' + allTextboxes.length + ' textbox(es)');

    // Title = textbox dau tien
    if (allTextboxes.length >= 1) {
      await allTextboxes[0].click({ clickCount: 3 }); // Triple click = select all trong textbox
      await actionDelay();
      await page.keyboard.press('Backspace');
      await actionDelay();
      await page.keyboard.type(title, { delay: Math.random() * 30 + 15 });
      logger.debug(profileId, '  Title filled');
    } else {
      logger.warn(profileId, 'Khong tim thay textbox title');
    }
    await actionDelay();

    // Description = textbox thu 2 — dung evaluate de xoa text cu, tranh Ctrl+A select ca title
    if (allTextboxes.length >= 2 && description && description.trim()) {
      await page.evaluate((idx) => {
        const boxes = document.querySelectorAll('div#textbox[contenteditable="true"]');
        if (boxes[idx]) {
          boxes[idx].textContent = '';
          boxes[idx].focus();
        }
      }, 1);
      await actionDelay();
      await allTextboxes[1].click();
      await actionDelay();
      await page.keyboard.type(description, { delay: Math.random() * 25 + 10 });
      logger.debug(profileId, '  Description filled');
    } else if (allTextboxes.length < 2) {
      logger.warn(profileId, 'Khong tim thay textbox description');
    }
    await actionDelay();

    // 9. Not made for kids
    logger.info(profileId, 'Chon Not made for kids...');
    try {
      const kidsSelectors = [
        'tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]',
        '#audience tp-yt-paper-radio-button:nth-child(2)',
        'tp-yt-paper-radio-button[name="NOT_MADE_FOR_KIDS"]',
      ];
      let kidsClicked = false;
      for (const sel of kidsSelectors) {
        try {
          await page.waitForSelector(sel, { visible: true, timeout: 5000 });
          await page.click(sel);
          kidsClicked = true;
          break;
        } catch (e) { continue; }
      }
      if (!kidsClicked) {
        await page.evaluate(() => {
          const radios = document.querySelectorAll('tp-yt-paper-radio-button');
          for (const r of radios) {
            const t = (r.textContent || '').toLowerCase();
            if (t.includes('not made for kids')) { r.click(); return; }
          }
        });
      }
    } catch (e) {}
    await actionDelay();

    // 10-12. Click NEXT 3 times
    for (let step = 1; step <= 3; step++) {
      const names = ['Video elements', 'Checks', 'Visibility'];
      logger.info(profileId, 'Next -> ' + names[step - 1]);
      try {
        await page.waitForSelector('#next-button', { visible: true, timeout: 8000 });
        await page.click('#next-button');
      } catch (e) {
        await page.evaluate(() => {
          const btns = document.querySelectorAll('ytcp-button');
          for (const b of btns) {
            const t = (b.textContent || '').toLowerCase().trim();
            if (t === 'next' || t === 'tiếp theo' || t === 'tiếp') { b.click(); return; }
          }
        });
      }
      await actionDelay();
      await sleepWithLog(2000, 'Doi buoc ' + names[step - 1]);
    }

    // 13. Chon Schedule
    logger.info(profileId, 'Thiet lap Schedule...');
    await page.evaluate(() => {
      const btn = document.querySelector('#schedule-radio-button');
      if (btn) { btn.scrollIntoView({ behavior: 'smooth', block: 'center' }); btn.click(); return; }
      const radios = document.querySelectorAll('tp-yt-paper-radio-button');
      for (const r of radios) {
        const t = (r.textContent || '').toLowerCase();
        if (t.includes('schedule') || (t.includes('l\u00ean') && t.includes('l\u1ECBch'))) {
          r.scrollIntoView({ behavior: 'smooth', block: 'center' }); r.click(); return;
        }
      }
    });
    await actionDelay();
    await sleepWithLog(2000, 'Doi form schedule');

    // 14. Set date + time
    const pad2 = n => String(n).padStart(2, '0');
    const viMonths = ['thg 1','thg 2','thg 3','thg 4','thg 5','thg 6','thg 7','thg 8','thg 9','thg 10','thg 11','thg 12'];
    const dateStr = scheduleDate.day + ' ' + viMonths[scheduleDate.month - 1] + ', ' + scheduleDate.year;

    let hTemp = scheduleDate.hours;
    let mTemp = scheduleDate.minutes;
    mTemp = Math.round(mTemp / 15) * 15;
    if (mTemp === 60) { mTemp = 0; hTemp += 1; }
    if (hTemp === 24) { hTemp = 0; }
    const timeStr24 = pad2(hTemp) + ':' + pad2(mTemp);
    // 12h format cho YouTube VN (SA = sang, CH = chieu)
    const ampm = hTemp >= 12 ? 'CH' : 'SA';
    let h12 = hTemp % 12; if (h12 === 0) h12 = 12;
    const timeStr12 = pad2(h12) + ':' + pad2(mTemp) + ' ' + ampm;

    logger.info(profileId, '  Date: ' + dateStr + ' | Time: ' + timeStr24 + ' (' + timeStr12 + ')');

    // Set date
    try {
      // Tim va click date input
      const dateFound = await page.evaluate(() => {
        const queryAllDeep = (sel, root = document) => {
          let r = Array.from(root.querySelectorAll ? root.querySelectorAll(sel) : []);
          (root.querySelectorAll ? root.querySelectorAll('*') : []).forEach(c => {
            if (c.shadowRoot) r = r.concat(queryAllDeep(sel, c.shadowRoot));
          });
          return r;
        };
        let dateInput = null;
        
        // Cach 1: Tim trong ytcp-date-picker
        const pickers = queryAllDeep('ytcp-date-picker');
        for (const p of pickers) {
          const inp = p.querySelector('input') || (p.shadowRoot && p.shadowRoot.querySelector('input'));
          if (inp) { dateInput = inp; break; }
        }
        
        // Cach 2: Tim #datepicker-trigger input
        if (!dateInput) {
          const trigger = document.querySelector('#datepicker-trigger');
          if (trigger) {
            dateInput = trigger.querySelector('input') || trigger;
          }
        }
        
        // Cach 3: Tim input co aria-label date/ngay
        if (!dateInput) {
          for (const inp of queryAllDeep('input')) {
            const a = (inp.getAttribute('aria-label') || '').toLowerCase();
            if (a.includes('date') || a.includes('ng\u00E0y')) { dateInput = inp; break; }
          }
        }
        
        // Cach 4: Tim trong #schedule-date-time
        if (!dateInput) {
          const area = document.querySelector('#schedule-date-time') || document.querySelector('ytcp-video-visibility-select');
          if (area) {
            const inputs = area.querySelectorAll('input');
            if (inputs.length > 0) dateInput = inputs[0]; // Input dau tien la date
          }
        }
        
        // Cach 5: Tim ytcp-text-dropdown-trigger co text ngay
        if (!dateInput) {
          const triggers = document.querySelectorAll('ytcp-text-dropdown-trigger');
          for (const t of triggers) {
            if (t.id === 'datepicker-trigger' || (t.textContent || '').match(/thg|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/i)) {
              const r = t.getBoundingClientRect();
              return { found: true, x: r.x + r.width / 2, y: r.y + r.height / 2, value: (t.textContent || '').trim(), method: 'trigger' };
            }
          }
        }
        
        if (!dateInput) return { found: false };
        dateInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const r = dateInput.getBoundingClientRect();
        return { found: true, x: r.x + r.width / 2, y: r.y + r.height / 2, value: dateInput.value || '', method: 'input' };
      });

      logger.debug(profileId, '  Date input: ' + JSON.stringify(dateFound));

      if (dateFound.found) {
        // Triple click de select all text trong input
        await page.mouse.click(dateFound.x, dateFound.y, { clickCount: 3 });
        await actionDelay();
        // Type de de len text cu
        await page.keyboard.type(dateStr, { delay: 50 });
        await actionDelay();
        await page.keyboard.press('Enter');
        await actionDelay();
        await page.keyboard.press('Escape');
      } else {
        logger.warn(profileId, 'Date input not found');
      }
      logger.debug(profileId, '  Date set: ' + dateStr);
    } catch (e) {
      logger.warn(profileId, 'Loi set date: ' + e.message);
    }
    await actionDelay();

    // Set time
    try {
      let timePickerOpened = false;
      timePickerOpened = await page.evaluate(() => {
        const queryAllDeep = (sel, root = document) => {
          let r = Array.from(root.querySelectorAll ? root.querySelectorAll(sel) : []);
          (root.querySelectorAll ? root.querySelectorAll('*') : []).forEach(c => {
            if (c.shadowRoot) r = r.concat(queryAllDeep(sel, c.shadowRoot));
          });
          return r;
        };
        const triggers = queryAllDeep('ytcp-text-dropdown-trigger');
        for (const t of triggers) {
          if (/\d{1,2}:\d{2}/.test((t.textContent || '').trim()) && t.offsetWidth > 0) {
            t.scrollIntoView({ behavior: 'smooth', block: 'center' }); t.click(); return true;
          }
        }
        return false;
      });

      if (!timePickerOpened) {
        await page.keyboard.press('Tab');
        await actionDelay();
        await page.keyboard.press('Tab');
        await actionDelay();
        await page.keyboard.press('Enter');
      }

      await sleepWithLog(2000, 'Doi dropdown time');

      const timeSelected = await page.evaluate((t24, t12) => {
        const queryAllDeep = (sel, root = document) => {
          let r = Array.from(root.querySelectorAll ? root.querySelectorAll(sel) : []);
          (root.querySelectorAll ? root.querySelectorAll('*') : []).forEach(c => {
            if (c.shadowRoot) r = r.concat(queryAllDeep(sel, c.shadowRoot));
          });
          return r;
        };
        const norm = s => s.replace(/\s+/g, ' ').trim().toUpperCase();
        const targets = [norm(t24), norm(t12)];
        const opts = queryAllDeep('tp-yt-paper-item').filter(el => el.offsetWidth > 0 && /\d{1,2}:\d{2}/.test((el.textContent||'').trim()));
        for (const o of opts) {
          const ot = norm(o.textContent);
          if (targets.includes(ot)) { o.scrollIntoView({behavior:'smooth',block:'center'}); o.click(); return { found: true, clicked: ot }; }
        }
        // Flexible match: bo leading zero, normalize AM/PM/SA/CH
        for (const o of opts) {
          const ot = norm(o.textContent).replace(/^0/,'').replace(/\s*(AM|PM|SA|CH)/,' $1');
          for (const tgt of targets) {
            const tt = tgt.replace(/^0/,'').replace(/\s*(AM|PM|SA|CH)/,' $1');
            if (ot === tt) { o.scrollIntoView({behavior:'smooth',block:'center'}); o.click(); return { found: true, clicked: norm(o.textContent) }; }
          }
        }
        const sample = opts.slice(0, 10).map(o => (o.textContent||'').trim());
        return { found: false, count: opts.length, sample };
      }, timeStr24, timeStr12);

      if (!timeSelected.found) {
        logger.warn(profileId, 'Time not found in dropdown: ' + JSON.stringify(timeSelected));
        await page.keyboard.down('Control');
        await page.keyboard.press('KeyA');
        await page.keyboard.up('Control');
        await page.keyboard.press('Backspace');
        await actionDelay();
        await page.keyboard.type(timeStr24, { delay: 50 });
        await page.keyboard.press('Enter');
      }
      await actionDelay();
      await page.keyboard.press('Escape');
      logger.debug(profileId, '  Time set: ' + timeStr24);
    } catch (e) {
      logger.warn(profileId, 'Loi set time: ' + e.message);
    }
    await actionDelay();

    // 15. Click Schedule
    logger.info(profileId, 'Dang schedule video...');
    await sleepWithLog(2000, 'Delay truoc khi Schedule');

    try {
      await page.waitForSelector('#done-button', { visible: true, timeout: 10000 });
      await page.click('#done-button');
    } catch (e) {
      await page.evaluate(() => {
        const btns = document.querySelectorAll('ytcp-button');
        for (const b of btns) {
          const t = (b.textContent || '').toLowerCase().trim();
          if (t.includes('schedule') || t.includes('done') || t.includes('xong')) { b.click(); return; }
        }
      });
    }
    await sleepWithLog(3000, 'Doi xu ly nut Schedule');

    // Bat popup canh bao
    try {
      await page.evaluate(() => {
        const queryAllDeep = (sel, root = document) => {
          let r = Array.from(root.querySelectorAll ? root.querySelectorAll(sel) : []);
          (root.querySelectorAll ? root.querySelectorAll('*') : []).forEach(c => {
            if (c.shadowRoot) r = r.concat(queryAllDeep(sel, c.shadowRoot));
          });
          return r;
        };
        const btns = queryAllDeep('ytcp-button, yt-button-renderer');
        for (const b of btns) {
          const t = (b.textContent || '').toLowerCase().trim();
          if ((t === 'got it' || t === 'xác nhận') && b.offsetWidth > 0) { b.click(); return; }
        }
      });
    } catch (e) {}

    await sleepWithLog(4000, 'Doi hoan tat');

    let success = true;
    try {
      success = await page.evaluate(() => {
        const body = document.body.textContent || '';
        return body.includes('Scheduled') || body.includes('published') || !document.querySelector('ytcp-uploads-dialog[is-dialog-open]');
      });
    } catch (e) { success = true; }

    if (success) {
      logger.info(profileId, 'Video da duoc schedule thanh cong!');
      return { success: true, message: 'done - scheduled ' + scheduleDate.day + '/' + scheduleDate.month + '/' + scheduleDate.year + ' ' + scheduleDate.hours + ':' + String(scheduleDate.minutes).padStart(2, '0') };
    } else {
      throw new Error('Schedule video co the khong thanh cong');
    }

  } catch (error) {
    logger.error(profileId, 'Loi upload: ' + error.message);
    if (page) await takeErrorScreenshot(page, profileId, 'upload-error');
    return { success: false, message: 'error: ' + error.message };
  } finally {
    // Khong disconnect - de processProfile quan ly
  }
}

module.exports = { uploadShort, connectBrowser };
