import { Button, Card, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api'

/**
 * Chấm sao cuối bữa (T15).
 *
 * Ô nhận xét chỉ hiện SAU khi chọn sao: hỏi thẳng "viết gì đi" thì hầu hết khách
 * bỏ qua, còn chạm một lần vào ngôi sao thì gần như ai cũng làm. Chấm lại thì
 * sửa phiếu cũ — quán cần ý kiến cuối của bữa đó, không phải hai dòng đánh nhau.
 */
export function RatingCard({ sessionId }: { sessionId: number }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [stars, setStars] = useState<number | null>(null)
  const [comment, setComment] = useState('')

  const saved = useQuery({
    queryKey: ['feedback', sessionId],
    queryFn: () => api.feedback(sessionId),
  })

  const send = useMutation({
    mutationFn: (next: { stars: number; comment: string }) =>
      api.sendFeedback(sessionId, next.stars, next.comment),
    onSuccess: () => {
      toast('Cảm ơn bạn đã góp ý', 'ok')
      void queryClient.invalidateQueries({ queryKey: ['feedback', sessionId] })
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const current = stars ?? saved.data?.stars ?? 0

  return (
    <Card className="mt-6 border-accent/16 bg-surface-4 p-5">
      <p className="text-[length:var(--fs-b1)] font-medium text-ink-hi">Bữa nay thế nào?</p>

      <div className="mt-3 flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${n} sao`}
            aria-pressed={current >= n}
            onClick={() => {
              setStars(n)
              // Gửi ngay: khách chấm xong là xong, không ai muốn bấm thêm nút Gửi
              send.mutate({ stars: n, comment })
            }}
            className="grid h-11 w-11 place-items-center text-accent"
          >
            <svg
              viewBox="0 0 24 24"
              width="26"
              height="26"
              fill={current >= n ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="1.4"
            >
              <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.2 1 5.9L12 17l-5.2 2.8 1-5.9-4.3-4.2 5.9-.8L12 3.5Z" />
            </svg>
          </button>
        ))}
      </div>

      {current > 0 ? (
        <div className="mt-4">
          <textarea
            rows={2}
            value={comment || (saved.data?.comment ?? '')}
            onChange={(e) => setComment(e.target.value)}
            maxLength={1000}
            placeholder="Món nào bạn sẽ gọi lại?"
            className="w-full resize-y rounded-sm border border-line-3 bg-surface-2 px-3.5 py-3 text-[length:var(--fs-b1)] leading-relaxed text-ink-hi"
          />
          <Button
            size="lg"
            block
            className="mt-2.5"
            disabled={send.isPending || !comment.trim()}
            onClick={() => send.mutate({ stars: current, comment })}
          >
            Gửi nhận xét
          </Button>
        </div>
      ) : null}
    </Card>
  )
}
