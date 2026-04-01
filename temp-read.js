const XLSX = require('xlsx');
const { parseDateTime, parseExcelSerial } = require('./src/utils');

const wb = XLSX.readFile('schedule.xlsx', { cellDates: false });
const sheet = wb.Sheets[wb.SheetNames[0]];

// Xem raw cell data
console.log('=== Raw cell E ===');
['E1','E2','E3','E4','E5','E6'].forEach(ref => {
  const cell = sheet[ref];
  if (cell) {
    console.log(`${ref}:`, JSON.stringify(cell));
  }
});

// Đọc với raw: true
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
console.log('\n=== Parse results ===');
for (let i = 1; i < Math.min(rows.length, 6); i++) {
  const raw = rows[i][4];
  const parsed = parseDateTime(raw);
  console.log(`Row ${i}: raw=${JSON.stringify(raw)} (${typeof raw})`);
  if (parsed) {
    console.log(`  -> ${parsed.toLocaleString()}`);
    console.log(`  -> year=${parsed.getFullYear()} month=${parsed.getMonth()+1} day=${parsed.getDate()} hour=${parsed.getHours()} min=${parsed.getMinutes()}`);
  }
  
  // Nếu là number, test parseExcelSerial trực tiếp
  if (typeof raw === 'number') {
    const dayPart = Math.floor(raw);
    const timePart = raw - dayPart;
    console.log(`  -> serial: dayPart=${dayPart}, timePart=${timePart}, timePart*24=${timePart*24}h`);
  }
}
