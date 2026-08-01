/**
 * Fixture set — chép từ prototype `Sora Web.dc.html` (setDetails.setsora) và
 * bổ sung một set có nhóm "chọn N trong M" theo §14 ("chọn 4 trong 10 loại bò").
 */
import type { SetDefinition } from '../explode'

/** Set Sora — 8 món, 6 chặng, toàn nhóm cố định */
export const SET_SORA: SetDefinition = {
  setDishId: 'sora',
  label: 'SET SORA',
  groups: [
    {
      id: 'sora-mo-bua',
      label: 'Mở bữa',
      pickCount: null,
      batchOffset: 0,
      items: [{ dishId: 'duamuoi', qty: 1, portionLabel: '1 phần' }],
    },
    {
      id: 'sora-bo',
      label: 'Bò trên than',
      pickCount: null,
      batchOffset: 1,
      items: [
        { dishId: 'bachibo', qty: 1, portionLabel: '100g' },
        { dishId: 'nambo', qty: 1, portionLabel: '100g' },
        { dishId: 'carbi', qty: 1, portionLabel: '100g' },
      ],
    },
    {
      id: 'sora-haisan',
      label: 'Hải sản',
      pickCount: null,
      batchOffset: 1,
      items: [{ dishId: 'tomsu', qty: 1, portionLabel: '3 con' }],
    },
    {
      id: 'sora-rau',
      label: 'Rau nướng',
      pickCount: null,
      batchOffset: 1,
      items: [{ dishId: 'bingoi', qty: 1, portionLabel: '1 phần' }],
    },
    {
      id: 'sora-chot',
      label: 'Chốt bữa',
      pickCount: null,
      batchOffset: 2,
      items: [
        { dishId: 'miso', qty: 2, portionLabel: '2 bát' },
        { dishId: 'comtrang', qty: 2, portionLabel: '2 bát' },
      ],
    },
    {
      id: 'sora-trangmieng',
      label: 'Tráng miệng',
      pickCount: null,
      batchOffset: 3,
      items: [{ dishId: 'kemtra', qty: 1, portionLabel: '2 phần' }],
    },
  ],
}

/** Set Kiwami — "bếp trưởng chọn theo lô nhập": nhóm chọn 4 trong 10 loại bò (§14) */
export const SET_KIWAMI: SetDefinition = {
  setDishId: 'kiwami',
  label: 'SET KIWAMI',
  groups: [
    {
      id: 'kiwami-khaivi',
      label: 'Khai vị',
      pickCount: null,
      batchOffset: 0,
      items: [{ dishId: 'sashimi', qty: 1, portionLabel: '1 phần' }],
    },
    {
      id: 'kiwami-bo',
      label: 'Chọn 4 loại bò',
      pickCount: 4,
      batchOffset: 1,
      items: [
        { dishId: 'luoibo', qty: 1, portionLabel: '80g' },
        { dishId: 'cuongtim', qty: 1, portionLabel: '80g' },
        { dishId: 'diemthan', qty: 1, portionLabel: '80g' },
        { dishId: 'desuon', qty: 1, portionLabel: '80g' },
        { dishId: 'gaubo', qty: 1, portionLabel: '80g' },
        { dishId: 'thanbo', qty: 1, portionLabel: '80g' },
        { dishId: 'bachibo', qty: 1, portionLabel: '80g' },
        { dishId: 'nambo', qty: 1, portionLabel: '80g' },
        { dishId: 'longbo', qty: 1, portionLabel: '80g' },
        { dishId: 'ganbo', qty: 1, portionLabel: '80g' },
      ],
    },
  ],
}
