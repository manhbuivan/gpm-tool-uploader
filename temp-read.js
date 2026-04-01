const XLSX = require('xlsx');
const { parseDateTime } = require('./src/utils');

// Đọc raw (cellDates: false) — giữ serial number
const wb = XLSX.readFile('schedule.xlsx', { cellDates: false });
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });

console.log('=== Parse kết quả ===');
for (let i = 0; i < Math.min(rows.length, 6); i++) {
  const raw = rows[i][4]; // cột E = gio_dang
  const parsed = parseDateTime(raw);
  console.log(`Row ${i}: raw=${JSON.stringify(raw)} (${typeof raw})`);
  if (parsed) {
    console.log(`  -> parsed: ${parsed.toLocaleString()}`);
    console.log(`  -> date: ${parsed.getFullYear()}-${parsed.getMonth()+1}-${parsed.getDate()}`);
    console.log(`  -> time: ${parsed.getHours()}:${String(parsed.getMinutes()).padStart(2,'0')}`);
  } else {
    console.log(`  -> parsed: null`);
  }
}
