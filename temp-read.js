const XLSX = require('xlsx');
const { parseDateTime } = require('./src/utils');

const wb = XLSX.readFile('schedule.xlsx', { cellDates: false });
const sheet = wb.Sheets[wb.SheetNames[0]];

// Simulate cả 2 serial numbers
const serials = [46114.25, 46162.3333, 46163.3333];
console.log('=== XLSX.SSF.format tests ===');
for (const s of serials) {
  const formatted = XLSX.SSF.format('mm/dd/yyyy h:mm', s);
  const parsed = parseDateTime(formatted);
  console.log(`serial ${s} → formatted "${formatted}" → parsed ${JSON.stringify(parsed)}`);
}

// Test từ file thực tế
console.log('\n=== File Excel ===');
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
for (let i = 1; i < Math.min(rows.length, 5); i++) {
  const cellRef = XLSX.utils.encode_cell({ r: i, c: 4 });
  const cell = sheet[cellRef];
  if (cell && cell.t === 'n') {
    const formatted = XLSX.SSF.format('mm/dd/yyyy h:mm', cell.v);
    const parsed = parseDateTime(formatted);
    console.log(`Row ${i}: serial=${cell.v}, formatted="${formatted}", parsed=${JSON.stringify(parsed)}`);
  }
}
