const { parseExcelSerial, parseDateTime } = require('./src/utils');

console.log('=== Serial tests ===');
console.log('46114.25:', JSON.stringify(parseExcelSerial(46114.25)));
console.log('46163.333:', JSON.stringify(parseExcelSerial(46163 + 8/24)));

console.log('\n=== String tests ===');
console.log('"05/20/2026 8:00":', JSON.stringify(parseDateTime('05/20/2026 8:00')));
console.log('"04/01/2026 6:00":', JSON.stringify(parseDateTime('04/01/2026 6:00')));
