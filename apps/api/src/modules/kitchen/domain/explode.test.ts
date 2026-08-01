import { describe, expect, it } from 'vitest'
import { SET_KIWAMI, SET_SORA } from './__fixtures__/sets'
import { SetSelectionError, explodeSet, setComponentDishIds, type SetLineInput } from './explode'

const setLine = (over: Partial<SetLineInput> = {}): SetLineInput => ({
  lineId: 'L1',
  setDishId: 'sora',
  qty: 1,
  batchNo: 1,
  ...over,
})

describe('Nổ set — nhóm cố định (Set Sora)', () => {
  // Prototype ghi "8 món" (không tính bát cơm trắng kèm); nổ ra bếp là 9 dòng.
  it('sinh đủ 9 dòng con theo đúng thứ tự 6 chặng', () => {
    const lines = explodeSet(setLine(), SET_SORA)
    expect(lines.map((l) => l.dishId)).toEqual([
      'duamuoi',
      'bachibo',
      'nambo',
      'carbi',
      'tomsu',
      'bingoi',
      'miso',
      'comtrang',
      'kemtra',
    ])
  })

  it('mọi dòng con trỏ về dòng set và mang nhãn set cho bếp', () => {
    for (const line of explodeSet(setLine(), SET_SORA)) {
      expect(line.parentLineId).toBe('L1')
      expect(line.setLabel).toBe('SET SORA')
    }
  })

  it('giữ định lượng của set để in lên vé bếp', () => {
    const lines = explodeSet(setLine(), SET_SORA)
    expect(lines.find((l) => l.dishId === 'bachibo')?.portionLabel).toBe('100g')
    expect(lines.find((l) => l.dishId === 'tomsu')?.portionLabel).toBe('3 con')
  })

  it('chặng rơi vào đợt lệch so với đợt của dòng set — "set nấu theo nhịp"', () => {
    const lines = explodeSet(setLine({ batchNo: 1 }), SET_SORA)
    const batchOf = (id: string) => lines.find((l) => l.dishId === id)?.batchNo
    expect(batchOf('duamuoi')).toBe(1) // Mở bữa — cùng đợt
    expect(batchOf('bachibo')).toBe(2) // Bò trên than
    expect(batchOf('miso')).toBe(3) // Chốt bữa
    expect(batchOf('kemtra')).toBe(4) // Tráng miệng
  })

  it('đặt set giữa bữa vẫn giữ đúng nhịp — offset tính từ đợt hiện tại', () => {
    const lines = explodeSet(setLine({ batchNo: 3 }), SET_SORA)
    const batchOf = (id: string) => lines.find((l) => l.dishId === id)?.batchNo
    expect(batchOf('duamuoi')).toBe(3)
    expect(batchOf('kemtra')).toBe(6)
  })

  it('gọi 2 set thì nhân đôi số phần từng món', () => {
    const lines = explodeSet(setLine({ qty: 2 }), SET_SORA)
    expect(lines.find((l) => l.dishId === 'bachibo')?.qty).toBe(2)
    expect(lines.find((l) => l.dishId === 'miso')?.qty).toBe(4) // 2 bát × 2 set
  })

  it('ghi chú của khách theo xuống mọi dòng con', () => {
    const lines = explodeSet(setLine({ note: 'ít cay' }), SET_SORA)
    expect(lines.every((l) => l.note === 'ít cay')).toBe(true)
  })
})

describe('Nổ set — nhóm "chọn N trong M" (Set Kiwami)', () => {
  const kiwamiLine = setLine({ setDishId: 'kiwami', lineId: 'L9' })
  const pick4 = [{ groupId: 'kiwami-bo', dishIds: ['thanbo', 'nambo', 'luoibo', 'ganbo'] }]

  it('chọn đủ 4 → sinh khai vị + đúng 4 món bò khách chọn', () => {
    const lines = explodeSet(kiwamiLine, SET_KIWAMI, pick4)
    expect(lines).toHaveLength(5)
    expect(lines.filter((l) => l.batchNo === 2).map((l) => l.dishId)).toEqual([
      'thanbo',
      'nambo',
      'luoibo',
      'ganbo',
    ])
  })

  it('cho phép chọn trùng — khách muốn 2 phần cùng một thớ', () => {
    const lines = explodeSet(kiwamiLine, SET_KIWAMI, [
      { groupId: 'kiwami-bo', dishIds: ['thanbo', 'thanbo', 'nambo', 'nambo'] },
    ])
    expect(lines.filter((l) => l.dishId === 'thanbo')).toHaveLength(2)
  })

  it('chọn thiếu → chặn ngay, không để set thiếu món trôi xuống bếp', () => {
    expect(() =>
      explodeSet(kiwamiLine, SET_KIWAMI, [{ groupId: 'kiwami-bo', dishIds: ['thanbo'] }]),
    ).toThrow(SetSelectionError)
  })

  it('chọn thừa → chặn', () => {
    expect(() =>
      explodeSet(kiwamiLine, SET_KIWAMI, [
        { groupId: 'kiwami-bo', dishIds: ['thanbo', 'nambo', 'luoibo', 'ganbo', 'gaubo'] },
      ]),
    ).toThrow(/cần chọn đúng 4 món, đang có 5/)
  })

  it('không gửi lựa chọn nào → chặn', () => {
    expect(() => explodeSet(kiwamiLine, SET_KIWAMI)).toThrow(SetSelectionError)
  })

  it('chọn món ngoài danh sách nhóm → chặn, kèm mã nhóm để UI trỏ đúng chỗ', () => {
    try {
      explodeSet(kiwamiLine, SET_KIWAMI, [
        { groupId: 'kiwami-bo', dishIds: ['thanbo', 'nambo', 'luoibo', 'biatuoi'] },
      ])
      expect.unreachable('phải ném lỗi')
    } catch (err) {
      expect(err).toBeInstanceOf(SetSelectionError)
      expect((err as SetSelectionError).groupId).toBe('kiwami-bo')
    }
  })
})

describe('Bảo vệ đầu vào', () => {
  it('dòng set không khớp định nghĩa → chặn', () => {
    expect(() => explodeSet(setLine({ setDishId: 'kiwami' }), SET_SORA)).toThrow(
      /không khớp định nghĩa/,
    )
  })

  it.each([0, -1, 1.5])('số lượng set %s → chặn', (qty) => {
    expect(() => explodeSet(setLine({ qty }), SET_SORA)).toThrow(SetSelectionError)
  })
})

describe('setComponentDishIds — nguồn cho M11 tính dải giá vốn min–max', () => {
  it('liệt kê mọi món có thể có, không trùng lặp', () => {
    expect(setComponentDishIds(SET_KIWAMI)).toHaveLength(11) // 1 khai vị + 10 lựa chọn bò
    expect(new Set(setComponentDishIds(SET_SORA)).size).toBe(setComponentDishIds(SET_SORA).length)
  })
})
