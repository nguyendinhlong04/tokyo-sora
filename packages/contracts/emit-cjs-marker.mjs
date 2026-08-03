// package.json của gói này khai "type": "module", nên Node coi MỌI file .js trong
// phạm vi gói là ESM — kể cả bản CommonJS vừa biên dịch ra dist/cjs. Marker này
// thu hẹp phạm vi đó lại cho riêng thư mục dist/cjs.
import { writeFileSync } from 'node:fs'

writeFileSync(new URL('dist/cjs/package.json', import.meta.url), '{"type":"commonjs"}\n')
