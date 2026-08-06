import { Controller, Get, Req } from '@nestjs/common'
import type { FastifyRequest } from 'fastify'
import { Public } from '../identity/auth.guard'

/**
 * TẠM THỜI — đo số chặng trung chuyển giữa điện thoại khách và máy chủ, để khai
 * đúng `TRUSTED_PROXY_HOPS` cho lớp 2 (LUONG-QR-BAN.md mục 8).
 *
 * Con số đó KHÔNG đoán được: nó phụ thuộc cách dựng trên Vercel. Đoán thiếu một
 * chặng là tin vào phần địa chỉ do máy khách tự khai; đoán thừa là cả quán thành
 * một địa chỉ duy nhất. Cả hai đều hỏng âm thầm, không có lỗi nào báo ra.
 *
 * Chỉ trả về đúng những dòng nói về đường đi. KHÔNG trả cookie, không trả thông
 * tin đăng nhập, không đọc CSDL.
 *
 * GỠ FILE NÀY sau khi đã khai xong TRUSTED_PROXY_HOPS.
 */
@Controller('api/diag')
export class ForwardingDiagController {
  @Public()
  @Get('forwarding')
  forwarding(@Req() req: FastifyRequest) {
    const header = (name: string): string | null => {
      const value = req.headers[name]
      return typeof value === 'string' ? value : null
    }

    const forwardedFor = header('x-forwarded-for')
    const chain = forwardedFor
      ? forwardedFor.split(',').map((p) => p.trim()).filter(Boolean)
      : []

    return {
      socketIp: req.socket.remoteAddress ?? null,
      xForwardedFor: forwardedFor,
      chain,
      chainLength: chain.length,
      xRealIp: header('x-real-ip'),
      xVercelForwardedFor: header('x-vercel-forwarded-for'),
      forwarded: header('forwarded'),
    }
  }
}
