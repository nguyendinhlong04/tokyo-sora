import { Button, ErrorState, Skeleton } from '@sora/ui'
import { Component, Suspense, type ReactNode } from 'react'

/**
 * Khung bọc màn đang mở: chunk của màn chưa về thì giữ chỗ bằng skeleton, tải
 * hỏng thì báo ngay trong vùng nội dung — menu vẫn còn, không thành trang trắng.
 *
 * Skeleton chỉ hiện khi chưa có màn nào để giữ: mở thẳng URL, tải lại trang, rời
 * màn báo lỗi. Bấm menu sang màn chưa tải thì `BrowserRouter` đổi URL bằng
 * `startTransition`: React giữ màn cũ tới khi chunk mới về rồi mới đổi, không nháy
 * khung trống.
 *
 * Tải hỏng hay gặp nhất ngay sau một lần deploy: tab mở từ trước còn hỏi chunk
 * tên cũ, bản mới không còn file đó (rewrite trả `index.html`) nên `import()`
 * hỏng. Thử lại tại chỗ vô ích — cả `React.lazy` lẫn trình duyệt đều nhớ lần
 * hỏng — chỉ tải lại trang mới lấy được bản mới. Đổi sang màn khác thì xoá lỗi,
 * màn đã tải trước đó vẫn mở được.
 */
export class ScreenBoundary extends Component<
  { resetKey: string; children: ReactNode },
  { failed: boolean; resetKey: string }
> {
  state = { failed: false, resetKey: this.props.resetKey }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  static getDerivedStateFromProps(props: { resetKey: string }, state: { resetKey: string }) {
    return props.resetKey === state.resetKey ? null : { failed: false, resetKey: props.resetKey }
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="px-8 py-6">
          <ErrorState
            message="Không tải được màn này. Office có thể vừa có bản mới, hoặc mạng vừa chập chờn."
            action={<Button onClick={() => window.location.reload()}>Tải lại trang</Button>}
          />
        </div>
      )
    }
    return <Suspense fallback={<ScreenSkeleton />}>{this.props.children}</Suspense>
  }
}

/** Cùng khung với `PageHeader` và vùng nội dung bên dưới để màn về không làm nhảy bố cục */
function ScreenSkeleton() {
  return (
    <>
      <div className="flex-none border-b border-line-1 bg-canvas px-8 pt-6 pb-5">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="mt-2.5 h-4 w-[420px]" />
      </div>
      <div className="flex flex-col gap-3 px-8 py-6">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-2/3" />
      </div>
    </>
  )
}
