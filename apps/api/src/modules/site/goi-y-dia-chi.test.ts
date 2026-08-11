/**
 * Gợi ý địa chỉ chạy trên Postgres THẬT (PGlite — bản Postgres biên dịch WASM).
 *
 * Câu tra ghép chuỗi bằng `||`, lọc bằng `LIKE` và xếp hạng bằng một biểu thức
 * boolean trong `ORDER BY` — ba thứ chỉ Postgres mới nói được là đúng hay sai,
 * nên test này dựng CSDL thật thay vì giả lập tầng Drizzle.
 */
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '../../db/client'
import { runMigrations } from '../../db/migrate'
import * as schema from '../../db/schema'
import { SiteService } from './site.service'

let pg: PGlite
let site: SiteService

const ten = (rows: { name: string }[]) => rows.map((r) => r.name)

beforeAll(async () => {
  pg = new PGlite()
  await runMigrations(pg)

  // Trình điều khiển PGlite của Drizzle nói cùng một ngôn ngữ với node-postgres;
  // khác kiểu ở TypeScript nhưng cùng bề mặt lúc chạy.
  site = new SiteService(drizzle(pg, { schema }) as unknown as Db)

  await pg.exec(`
    INSERT INTO address_points (kind, name, name_folded, ward, ward_folded, hits) VALUES
      ('ward',   'Thành Sen',        'thanh sen',        'Thành Sen',  'thanh sen',  0),
      ('ward',   'Trần Phú',         'tran phu',         'Trần Phú',   'tran phu',  50),
      ('ward',   'Hà Huy Tập',       'ha huy tap',       'Hà Huy Tập', 'ha huy tap', 0),
      ('ward',   'Hà Linh',          'ha linh',          'Hà Linh',    'ha linh',    9),
      ('ward',   'Phúc Trạch',       'phuc trach',       'Phúc Trạch', 'phuc trach', 0),
      ('ward',   'Sơn Kim 1',        'son kim 1',        'Sơn Kim 1',  'son kim 1',  0),
      ('street', 'Hàm Nghi',         'ham nghi',         '',           '',           0),
      ('street', 'Ngõ 10 Xuân Diệu', 'ngo 10 xuan dieu', '',           '',           0),
      ('street', 'Phan Đình Phùng',  'phan dinh phung',  'Thành Sen',  'thanh sen',  0);
  `)
}, 60_000)

afterAll(async () => {
  await pg?.close()
})

describe('Tra địa chỉ', () => {
  it('khớp khi khách gõ không dấu', async () => {
    expect(ten(await site.addressSuggest('ham nghi'))).toContain('Hàm Nghi')
    expect(ten(await site.addressSuggest('Hàm Nghi'))).toContain('Hàm Nghi')
  })

  it('khớp theo TỪNG TỪ, không đòi cả chuỗi liền nhau', async () => {
    // Khách tả một chỗ bằng đường + phường; đòi khớp liền là không ra gì
    expect(ten(await site.addressSuggest('phan phung thanh sen'))).toContain('Phan Đình Phùng')
  })

  it('tra được cả tên đường — thứ bảng vùng giao không bao giờ biết', async () => {
    expect(ten(await site.addressSuggest('ngo 10'))).toEqual(['Ngõ 10 Xuân Diệu'])
  })

  it('số nhà khách gõ kèm không làm trượt con phố', async () => {
    // Kiểu gõ thường gặp nhất. Chỉ mục không biết số nhà nào trên phố cả.
    expect(ten(await site.addressSuggest('12 ham nghi'))).toContain('Hàm Nghi')
    expect(ten(await site.addressSuggest('Số 5 Phan Đình Phùng'))).toContain('Phan Đình Phùng')
    expect(ten(await site.addressSuggest('số nhà 12, Hàm Nghi'))).toContain('Hàm Nghi')
    // Số nhà Việt Nam không chỉ là chữ số
    expect(ten(await site.addressSuggest('12A Hàm Nghi'))).toContain('Hàm Nghi')
    expect(ten(await site.addressSuggest('4/21 Hàm Nghi'))).toContain('Hàm Nghi')
  })

  it('không cắt nhầm tên bắt đầu bằng "So…"', async () => {
    // Cắt "số" vô điều kiện là biến "Sơn Kim 1" thành "Kim 1"
    expect(ten(await site.addressSuggest('son kim'))).toContain('Sơn Kim 1')
  })

  it('nhưng số trong TÊN đường thì vẫn tra được', async () => {
    // Bỏ hẳn nhóm số đi thì "ngõ 10" ra mọi con ngõ
    expect(ten(await site.addressSuggest('ngo 10'))).toEqual(['Ngõ 10 Xuân Diệu'])
    // Gõ toàn số: lúc đó số là tất cả những gì khách cho, phải đòi nó khớp
    expect(ten(await site.addressSuggest('10'))).toEqual(['Ngõ 10 Xuân Diệu'])
  })

  it('ghép phường vào nhãn khi biết, để trần khi chưa biết', async () => {
    const [duongCoPhuong] = await site.addressSuggest('phan dinh phung')
    expect(duongCoPhuong?.label).toBe('Phan Đình Phùng, Thành Sen')

    const [duongChuaBiet] = await site.addressSuggest('ham nghi')
    expect(duongChuaBiet?.label).toBe('Hàm Nghi')

    // Phường thì tên nó đã là đủ — không đọc thành "Thành Sen, Thành Sen"
    const [phuong] = await site.addressSuggest('thanh sen')
    expect(phuong?.label).toBe('Thành Sen')
  })
})

describe('Xếp hạng gợi ý', () => {
  it('bắt đầu bằng chữ khách gõ thì đứng trước', async () => {
    // 'Trần Phú' có `hits` 50 mà vẫn xếp sau: khớp đầu chuỗi thắng độ phổ biến
    const rows = ten(await site.addressSuggest('phu'))
    expect(rows[0]).toBe('Phúc Trạch')
    expect(rows).toContain('Trần Phú')
  })

  it('cùng mức khớp thì chỗ khách hay chọn đứng trước', async () => {
    const rows = ten(await site.addressSuggest('ha'))
    expect(rows[0]).toBe('Hà Linh')
  })
})

describe('Chữ khách gõ không được lái câu tra', () => {
  it('ký tự điều khiển của LIKE không kéo về cả bảng', async () => {
    // Để lọt một dấu '%' là gợi ý trả về tám địa chỉ ngẫu nhiên
    expect(await site.addressSuggest('%')).toEqual([])
    expect(await site.addressSuggest('_')).toEqual([])
    expect(await site.addressSuggest('ha%')).not.toContain('Hàm Nghi')
  })

  it('chữ rỗng trả mảng rỗng chứ không phải cả bảng', async () => {
    expect(await site.addressSuggest('')).toEqual([])
    expect(await site.addressSuggest('   ')).toEqual([])
  })
})
