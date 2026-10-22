import { z } from 'zod'

/**
 * Thân PATCH: đúng những trường được gửi lên, không điền giá trị mặc định.
 *
 * zod 4 vẫn điền mặc định cho trường VẮNG MẶT trong `.partial()`: thân PATCH chỉ có
 * một trường là mọi trường có `.default()` khác bị ghi đè. Nút Bật/Tắt ở A8 chỉ gửi
 * `published`, nên trước đây một cú bấm đã lặng lẽ đưa thứ tự về 0, tâm ảnh hero về
 * giữa và số vị trí tuyển về 1. Gỡ mặc định khỏi từng trường rồi mới `.partial()` —
 * ràng buộc của trường vẫn giữ nguyên. Cửa PATCH nào có schema mang `.default()` thì
 * đi qua đây, đừng `.partial().parse()` thẳng.
 */
export function parsePatch<T extends z.ZodRawShape>(
  schema: z.ZodObject<T>,
  body: unknown,
): Partial<z.output<z.ZodObject<T>>> {
  const shape = Object.fromEntries(
    Object.entries(schema.shape).map(([key, field]) => [
      key,
      field instanceof z.ZodDefault ? field.removeDefault() : field,
    ]),
  )
  return z.object(shape).partial().parse(body) as Partial<z.output<z.ZodObject<T>>>
}
