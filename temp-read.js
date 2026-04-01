const { parseDateTime } = require('./src/utils');

const tests = [
  '04/01/2026 6:00',   // 1 tháng 4, 6h sáng
  '04/15/2026 18:30',  // 15 tháng 4, 6h30 chiều
  '12/25/2026 0:00',   // 25 tháng 12, 0h
];

for (const t of tests) {
  const d = parseDateTime(t);
  console.log(`"${t}" => ${d ? d.toLocaleString('vi-VN') : 'null'}`);
}
