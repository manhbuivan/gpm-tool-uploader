const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { fork } = require('child_process');

let mainWindow;
let currentProcess = null;
let customExcelPath = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    title: 'GPM YouTube Shorts Uploader',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.setMenuBarVisibility(false);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

// Chọn file Excel qua dialog
ipcMain.handle('select-excel', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Chọn file Excel schedule',
    filters: [{ name: 'Excel', extensions: ['xlsx', 'xls'] }],
    properties: ['openFile'],
  });
  if (!result.canceled && result.filePaths.length > 0) {
    customExcelPath = result.filePaths[0];
    return customExcelPath;
  }
  return null;
});

// Set đường dẫn Excel thủ công
ipcMain.handle('set-excel-path', async (_, filePath) => {
  customExcelPath = filePath;
  return true;
});

// Lấy đường dẫn Excel hiện tại
ipcMain.handle('get-excel-path', async () => {
  if (customExcelPath) return customExcelPath;
  const config = require(path.join(__dirname, '..', 'config'));
  return config.EXCEL_FILE;
});

// Chạy lệnh CLI
ipcMain.handle('run-command', async (_, command) => {
  if (currentProcess) {
    return { error: 'Đang có lệnh đang chạy. Hãy đợi hoặc dừng trước.' };
  }

  return new Promise((resolve) => {
    const env = { ...process.env };
    if (customExcelPath) {
      env.EXCEL_FILE_OVERRIDE = customExcelPath;
    }

    currentProcess = fork('src/index.js', [command], {
      cwd: path.join(__dirname, '..'),
      silent: true,
      env,
    });

    let output = '';

    currentProcess.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      mainWindow.webContents.send('log', text);
    });

    currentProcess.stderr.on('data', (data) => {
      const text = data.toString();
      output += text;
      mainWindow.webContents.send('log', text);
    });

    currentProcess.on('close', (code) => {
      currentProcess = null;
      mainWindow.webContents.send('command-done', { code });
      resolve({ output, code });
    });

    currentProcess.on('error', (err) => {
      currentProcess = null;
      mainWindow.webContents.send('command-done', { code: 1 });
      resolve({ error: err.message, code: 1 });
    });
  });
});

ipcMain.handle('stop-command', async () => {
  if (currentProcess) {
    currentProcess.kill();
    currentProcess = null;
    return { success: true };
  }
  return { success: false };
});
