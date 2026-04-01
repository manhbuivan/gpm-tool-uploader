const fs = require('fs');
const manager = require('./src/excel-manager');
try {
  const tasks = manager.readSchedule('./schedule.xlsx');
  fs.writeFileSync('output.json', JSON.stringify(tasks, null, 2));
} catch (e) {
  console.error("Error reading schedule:", e.message);
}
