import { describe, expect, it } from 'vitest'
import { FIXED_DISHES, SONG_DISHES, routingOf } from './__fixtures__/section-16'
import { diffReroute, type LineState, type RerouteLine } from './reroute'
import { ST, type ServiceContext } from './routing'

const GRILL_TABLE: ServiceContext = { kind: 'dinein', tableCode: '12', tableHasGrill: true }
const PLAIN_TABLE: ServiceContext = { kind: 'dinein', tableCode: '05', tableHasGrill: false }

const songLine = (over: Partial<RerouteLine> = {}): RerouteLine => ({
  lineId: 'L1',
  dishId: 'bachibo',
  name: 'Ba chỉ bò',
  state: 'queued',
  currentStation: ST.RAW,
  routing: routingOf(SONG_DISHES[6]!),
  ...over,
})

describe('Chuyển bàn CÓ bếp → KHÔNG bếp', () => {
  it('món chưa nấu chuyển được từ ST-02 sang ST-06', () => {
    const diff = diffReroute([songLine()], PLAIN_TABLE)
    expect(diff.moves).toEqual([
      { lineId: 'L1', dishId: 'bachibo', name: 'Ba chỉ bò', from: ST.RAW, to: ST.GRILL },
    ])
    expect(diff.stuck).toEqual([])
    expect(diff.requiresConfirmation).toBe(true)
  })

  it.each<LineState>(['cooking', 'ready', 'served'])(
    'món ở trạng thái %s giữ nguyên trạm — không giật khỏi vỉ',
    (state) => {
      const diff = diffReroute([songLine({ state })], PLAIN_TABLE)
      expect(diff.moves).toEqual([])
      expect(diff.stuck).toHaveLength(1)
      expect(diff.stuck[0]).toMatchObject({ from: ST.RAW, wouldBe: ST.GRILL, reason: 'dang-nau' })
    },
  )

  it('món chưa gửi bếp (draft) cũng nằm trong nhóm chuyển được', () => {
    const diff = diffReroute([songLine({ state: 'draft', currentStation: null })], PLAIN_TABLE)
    expect(diff.moves[0]).toMatchObject({ from: null, to: ST.GRILL })
  })

  it('món đã huỷ bị bỏ qua hoàn toàn', () => {
    const diff = diffReroute([songLine({ state: 'voided' })], PLAIN_TABLE)
    expect(diff).toMatchObject({ moves: [], stuck: [], requiresConfirmation: false })
  })
})

describe('Chuyển bàn không đổi định tuyến', () => {
  it('món trạm cố định không bao giờ phải xác nhận', () => {
    const milanh = FIXED_DISHES.find((d) => d.id === 'milanh')!
    const diff = diffReroute(
      [songLine({ dishId: 'milanh', routing: routingOf(milanh), currentStation: ST.HOT2 })],
      PLAIN_TABLE,
    )
    expect(diff.requiresConfirmation).toBe(false)
  })

  it('chuyển sang bàn cùng loại (đều có bếp) không sinh thay đổi nào', () => {
    const diff = diffReroute([songLine()], {
      kind: 'dinein',
      tableCode: '14',
      tableHasGrill: true,
    })
    expect(diff.requiresConfirmation).toBe(false)
  })
})

describe('Đơn hỗn hợp — tách rõ nhóm chuyển được và nhóm kẹt', () => {
  it('trả đủ hai nhóm để POS hiện hộp xác nhận đúng nội dung', () => {
    const diff = diffReroute(
      [
        songLine({ lineId: 'L1', state: 'queued' }),
        songLine({ lineId: 'L2', state: 'cooking' }),
        songLine({
          lineId: 'L3',
          dishId: 'milanh',
          routing: routingOf(FIXED_DISHES.find((d) => d.id === 'milanh')!),
          currentStation: ST.HOT2,
        }),
      ],
      PLAIN_TABLE,
    )
    expect(diff.moves.map((m) => m.lineId)).toEqual(['L1'])
    expect(diff.stuck.map((s) => s.lineId)).toEqual(['L2'])
  })
})

describe('Chuyển ngược KHÔNG bếp → CÓ bếp', () => {
  it('món nướng hộ chưa nấu trả về ST-02 để khách tự nướng', () => {
    const diff = diffReroute([songLine({ currentStation: ST.GRILL })], GRILL_TABLE)
    expect(diff.moves[0]).toMatchObject({ from: ST.GRILL, to: ST.RAW })
  })
})
