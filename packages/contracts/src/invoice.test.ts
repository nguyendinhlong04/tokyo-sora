import { describe, expect, it } from 'vitest'
import {
  buyerLabelOf,
  CONSUMER_BUYER_LABEL,
  InvoiceBuyerSchema,
  isOrgTaxCode,
  isPersonalTaxCode,
  normalizeTaxCode,
  taxCodeChecksumOk,
} from './invoice'

describe('Mã số thuế', () => {
  it.each([
    ['0101248141', '0101248141'],
    [' 0101 248 141 ', '0101248141'],
    ['0101248141001', '0101248141-001'],
    ['0101248141-001', '0101248141-001'],
    ['0101.248.141', '0101248141'],
  ])('chuẩn hoá %j → %s', (raw, expected) => {
    expect(normalizeTaxCode(raw)).toBe(expected)
  })

  it('MST tổ chức: 10 số, chi nhánh 10-3', () => {
    expect(isOrgTaxCode('0101248141')).toBe(true)
    expect(isOrgTaxCode('0101248141-001')).toBe(true)
    expect(isOrgTaxCode('010124814')).toBe(false)
    expect(isOrgTaxCode('001203012345')).toBe(false)
  })

  it('cá nhân, hộ kinh doanh: MST 10 số hoặc số định danh 12 số', () => {
    expect(isPersonalTaxCode('001203012345')).toBe(true)
    expect(isPersonalTaxCode('8012345678')).toBe(true)
    expect(isPersonalTaxCode('0101248141-001')).toBe(false)
  })

  it('số kiểm tra đúng với MST thật, sai với MST mẫu trong seed', () => {
    for (const real of ['0101248141', '0100109106', '0300588569', '0101248141-001']) {
      expect(taxCodeChecksumOk(real), real).toBe(true)
    }
    expect(taxCodeChecksumOk('0101234567')).toBe(false)
    expect(taxCodeChecksumOk('abc')).toBe(false)
  })
})

describe('InvoiceBuyerSchema', () => {
  const company = {
    kind: 'company',
    taxCode: '0101248141',
    name: 'CÔNG TY CỔ PHẦN FPT',
    address: '17 Duy Tân, Cầu Giấy, Hà Nội',
  }

  it('doanh nghiệp: đủ MST, tên, địa chỉ; email tuỳ chọn và được chuẩn hoá', () => {
    const parsed = InvoiceBuyerSchema.parse({ ...company, email: ' KeToan@FPT.com.vn ' })
    expect(parsed).toEqual({ ...company, email: 'ketoan@fpt.com.vn' })
  })

  it('MST 13 số liền của chi nhánh được đưa về dạng 10-3', () => {
    expect(InvoiceBuyerSchema.parse({ ...company, taxCode: '0101248141001' })).toMatchObject({
      taxCode: '0101248141-001',
    })
  })

  it('doanh nghiệp thiếu địa chỉ hoặc MST sai dạng bị từ chối, nói rõ thiếu gì', () => {
    const noAddress = InvoiceBuyerSchema.safeParse({ ...company, address: '  ' })
    expect(noAddress.success).toBe(false)
    expect(noAddress.error?.issues[0]?.message).toBe('Thiếu địa chỉ công ty')

    const badCode = InvoiceBuyerSchema.safeParse({ ...company, taxCode: '01012481' })
    expect(badCode.success).toBe(false)
    expect(badCode.error?.issues[0]?.path).toEqual(['taxCode'])
  })

  it('doanh nghiệp không nhận số định danh cá nhân 12 số', () => {
    expect(InvoiceBuyerSchema.safeParse({ ...company, taxCode: '001203012345' }).success).toBe(
      false,
    )
  })

  it('ô để trống gửi lên là chuỗi rỗng thì coi như không có', () => {
    const parsed = InvoiceBuyerSchema.parse({ ...company, email: '', contactName: '  ' })
    expect(parsed).toEqual(company)
  })

  it('email sai dạng bị từ chối', () => {
    const res = InvoiceBuyerSchema.safeParse({ ...company, email: 'ketoan@' })
    expect(res.error?.issues[0]?.message).toBe('Email nhận hoá đơn chưa đúng')
  })

  it('cá nhân chỉ cần họ tên; đưa số định danh thì phải có địa chỉ', () => {
    expect(InvoiceBuyerSchema.parse({ kind: 'person', name: 'Nguyễn Văn An' })).toEqual({
      kind: 'person',
      name: 'Nguyễn Văn An',
    })

    const noAddress = InvoiceBuyerSchema.safeParse({
      kind: 'person',
      name: 'Nguyễn Văn An',
      taxCode: '001203012345',
    })
    expect(noAddress.success).toBe(false)
    expect(noAddress.error?.issues[0]?.path).toEqual(['address'])

    expect(
      InvoiceBuyerSchema.parse({
        kind: 'person',
        name: 'Nguyễn Văn An',
        taxCode: '001 203 012 345',
        address: 'Hà Nội',
        phone: '+84 912 345 678',
      }),
    ).toMatchObject({ taxCode: '001203012345', phone: '0912345678' })
  })

  it('loại người mua lạ bị từ chối', () => {
    expect(InvoiceBuyerSchema.safeParse({ kind: 'consumer', name: 'x' }).success).toBe(false)
  })

  it('không có người mua thì in "Bán cho người tiêu dùng"', () => {
    expect(buyerLabelOf(null)).toBe(CONSUMER_BUYER_LABEL)
    expect(CONSUMER_BUYER_LABEL).toBe('Bán cho người tiêu dùng')
    expect(buyerLabelOf(InvoiceBuyerSchema.parse(company))).toBe('CÔNG TY CỔ PHẦN FPT')
  })
})
