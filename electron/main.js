const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { fork } = require('child_process');

let mainWindow;

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

// Chạy lệnh CLI trong child process
let currentProcess = null;

ipcMain.handle('run-command', async (event, command) => {
  if (currentProcess) {
    return { error: 'Đang có lệnh đang chạy. Hãy đợi hoặc dừng trước.' };
  }

  return new Promise((resolve) => {
    const args = ['src/index.js', command];
    currentProcess = fork(args[0], [args[1]], {
      cwd: path.join(__dirname, '..'),
      silent: true,
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
  return { success: false, message: 'Không có lệnh nào đang chạy' };
});

ipcMain.handle('get-excel-path', async () => {
  const config = require(path.join(__dirname, '..', 'config'));
  return config.EXCEL_FILE;
});
