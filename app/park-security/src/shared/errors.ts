// 业务 API 错误。平台中立，仅继承 Error，不依赖运行时框架。
// 服务层抛出 ApiError；app.onError 将其映射为 {error:{code,message}} 响应。
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}
