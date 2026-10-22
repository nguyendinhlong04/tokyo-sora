import { subscribeOutbox, type OutboxState } from '@sora/core'
import { useEffect, useState } from 'react'

/** Trạng thái mạng lấy từ hàng đợi offline — cùng nguồn với POS và màn bếp */
export function useOutbox(): OutboxState {
  const [state, setState] = useState<OutboxState>({
    pending: 0,
    failed: 0,
    online: true,
    draining: false,
  })
  useEffect(() => subscribeOutbox(setState), [])
  return state
}
