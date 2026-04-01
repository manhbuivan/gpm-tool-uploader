const { parseExcelSerial } = require('./src/utils');

// Kiểm tra serial chính xác cho May 20, 2026
// Tính ngược: May 20, 2026 → serial = ?
// base = 1899-12-30, +1 leap year bug cho serial > 60
const target = new Date(Date.UTC(2026, 4, 20)); // May 20, 2026
const base = Date.UTC(1899, 11, 30);
const days = Math.round((target - base) / 86400000);
const serialWithBug = days + 1; // +1 vì Excel leap year bug (serial > 60 thêm 1)

console.log(`May 20, 2026 → days from epoch: ${days}, serial (with bug): ${serialWithBug}`);
console.log(`parseExcelSerial(${serialWithBug} + 8/24):`, parseExcelSerial(serialWithBug + 8/24)?.toLocaleString());
console.log(`parseExcelSerial(${serialWithBug}):`, parseExcelSerial(serialWithBug)?.toLocaleString());
console.log(`parseExcelSerial(${days}):`, parseExcelSerial(days)?.toLocaleString());

// Test range
for (let s = 46161; s <= 46165; s++) {
  const d = parseExcelSerial(s + 8/24);
  console.log(`serial ${s}.333 → ${d?.getFullYear()}-${d?.getMonth()+1}-${d?.getDate()} ${d?.getHours()}:00`);
}
