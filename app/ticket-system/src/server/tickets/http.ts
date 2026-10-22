import type { Context } from 'hono'
import { ApiError } from './service'

export const errorBody = (code: string, message: string) => ({ error: { code, message } })

/** 把业务错误转换为契约声明的 { error: { code, message } }；其他错误交给全局错误处理 */
export function asHandler(handler: (context: Context) => Promise<Response>) {
  return async (context: Context) => {
    try {
      return await handler(context)
    } catch (error) {
      if (error instanceof ApiError) return context.json(errorBody(error.code, error.message), error.status)
      throw error
    }
  }
}
