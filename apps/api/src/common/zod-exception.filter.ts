import { ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common'
import type { FastifyReply } from 'fastify'
import { ZodError } from 'zod'

/** Lỗi kiểm dữ liệu đầu vào → 400 kèm chỉ rõ trường sai, để UI trỏ đúng ô */
@Catch(ZodError)
export class ZodExceptionFilter implements ExceptionFilter {
  catch(error: ZodError, host: ArgumentsHost) {
    const reply = host.switchToHttp().getResponse<FastifyReply>()
    void reply.status(400).send({
      statusCode: 400,
      code: 'validation_error',
      message: 'Dữ liệu gửi lên không hợp lệ',
      issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    })
  }
}
