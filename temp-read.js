const { parseExcelSerial, parseDateTime } = require('./src/utils');
const XLSX = require('xlsx');

// Test serial numbers
console.log('=== parseExcelSerial tests ===');
console.log('46114.25 (expect Apr 1, 2026 6:00):', parseExcelSerial(46114.25)?.toLocaleString());
console.log('46163.333 (expect May 20, 2026 8:00):', parseExcelSerial(46163 + 8/24)?.toLocaleString());

// Test từ file Excel
const wb = XLSX.readFile('schedule.xlsx', { cellDates: false });
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
console.log('\n=== File Excel ===');
for (let i = 1; i < Math.min(rows.length, 5); i++) {
  const raw = rows[i][4];
  const parsed = parseDateTime(raw);
  console.log(`Row ${i}: raw=${raw} → ${parsed?.getFullYear()}-${parsed?.getMonth()+1}-${parsed?.getDate()} ${parsed?.getHours()}:${String(parsed?.getMinutes()).padStart(2,'0')}`);
}

// Test string
console.log('\n=== String tests ===');
console.log('"05/20/2026 8:00" →', parseDateTime('05/20/2026 8:00')?.toLocaleString());
