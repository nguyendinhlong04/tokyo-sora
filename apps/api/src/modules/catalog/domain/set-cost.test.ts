import { describe, expect, it } from 'vitest'
import type { SetDefinition } from '../../kitchen/domain/explode'
import { setCostRange } from './set-cost'

const COSTS: Record<string, number> = {
  'ba-chi-bo': 18_000,
  'de-suon': 46_000,
  'nam-bo': 30_000,
  'kim-chi': 4_000,
  'canh-mieso': 6_000,
}

const costOf = (dishId: string) => COSTS[dishId] ?? null

const def = (groups: SetDefinition['groups']): SetDefinition => ({
  setDishId: 'set-kiwami',
  label: 'SET KIWAMI',
  groups,
})

describe('setCostRange', () => {
  it('nhóm cố định không có dải: đáy bằng trần', () => {
    const range = setCostRange(
      def([
        {
          id: 'g1',
          label: 'Mở bữa',
          pickCount: null,
          batchOffset: 0,
          items: [
            { dishId: 'kim-chi', qty: 1 },
            { dishId: 'canh-mieso', qty: 2 },
          ],
        },
      ]),
      costOf,
    )

    expect(range.minVnd).toBe(4_000 + 6_000 * 2)
    expect(range.maxVnd).toBe(range.minVnd)
  })

  it('trần của nhóm chọn N là N LẦN món đắt nhất, vì khách được chọn trùng', () => {
    const range = setCostRange(
      def([
        {
          id: 'g2',
          label: 'Bò trên than',
          pickCount: 4,
          batchOffset: 1,
          items: [
            { dishId: 'ba-chi-bo', qty: 1 },
            { dishId: 'nam-bo', qty: 1 },
            { dishId: 'de-suon', qty: 1 },
          ],
        },
      ]),
      costOf,
    )

    expect(range.minVnd).toBe(4 * 18_000)
    expect(range.maxVnd).toBe(4 * 46_000)
  })

  it('định lượng của dòng nhân vào giá trước khi so rẻ nhất/đắt nhất', () => {
    const range = setCostRange(
      def([
        {
          id: 'g3',
          label: 'Bò trên than',
          pickCount: 1,
          batchOffset: 0,
          items: [
            // ba chỉ khay đôi đắt hơn một phần dẻ sườn dù đơn giá rẻ hơn
            { dishId: 'ba-chi-bo', qty: 3 },
            { dishId: 'de-suon', qty: 1 },
          ],
        },
      ]),
      costOf,
    )

    expect(range.minVnd).toBe(46_000)
    expect(range.maxVnd).toBe(54_000)
  })

  it('cộng dồn qua các chặng và giữ chi tiết từng chặng', () => {
    const range = setCostRange(
      def([
        {
          id: 'g1',
          label: 'Mở bữa',
          pickCount: null,
          batchOffset: 0,
          items: [{ dishId: 'kim-chi', qty: 1 }],
        },
        {
          id: 'g2',
          label: 'Bò trên than',
          pickCount: 2,
          batchOffset: 1,
          items: [
            { dishId: 'ba-chi-bo', qty: 1 },
            { dishId: 'de-suon', qty: 1 },
          ],
        },
      ]),
      costOf,
    )

    expect(range.minVnd).toBe(4_000 + 2 * 18_000)
    expect(range.maxVnd).toBe(4_000 + 2 * 46_000)
    expect(range.courses.map((c) => c.label)).toEqual(['Mở bữa', 'Bò trên than'])
    expect(range.courses[1]).toMatchObject({ minVnd: 36_000, maxVnd: 92_000 })
  })

  it('món chưa khai công thức bị nêu tên chứ không âm thầm tính 0₫', () => {
    const range = setCostRange(
      def([
        {
          id: 'g2',
          label: 'Bò trên than',
          pickCount: 1,
          batchOffset: 0,
          items: [
            { dishId: 'ba-chi-bo', qty: 1 },
            { dishId: 'bo-wagyu-moi', qty: 1 },
          ],
        },
      ]),
      costOf,
    )

    expect(range.unknownDishIds).toEqual(['bo-wagyu-moi'])
    // Đáy vẫn là 0 vì món chưa biết giá — chính vì thế phải đọc kèm `unknownDishIds`
    expect(range.minVnd).toBe(0)
  })

  it('chặng rỗng không làm hỏng phép tính', () => {
    const range = setCostRange(
      def([{ id: 'g9', label: 'Chưa khai', pickCount: 2, batchOffset: 0, items: [] }]),
      costOf,
    )
    expect(range).toMatchObject({ minVnd: 0, maxVnd: 0 })
  })
})
