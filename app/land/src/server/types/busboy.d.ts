/**
 * busboy 1.x 类型声明（CJS、无官方 types）。
 * 仅覆盖附件上传使用的 API：构造、field/file 事件、finish/error。
 */
declare module 'busboy' {
  import type { Readable } from 'node:stream'
  import type { Writable } from 'node:stream'

  export interface BusboyConfig {
    headers: Record<string, string>
    highWaterMark?: number
    defCharset?: string
    preservePath?: boolean
    limits?: {
      fieldNameSize?: number
      fieldSize?: number
      fields?: number
      fileSize?: number
      files?: number
      parts?: number
    }
  }

  export interface BusboyFileInfo {
    filename: string
    encoding: string
    mimeType: string
  }

  export interface BusboyFieldInfo {
    nameTruncated: boolean
    valueTruncated: boolean
    encoding: string
    mimeType: string
  }

  export interface Busboy extends Writable {
    on(event: 'field', listener: (name: string, value: string, info: BusboyFieldInfo) => void): this
    on(event: 'file', listener: (name: string, stream: Readable, info: BusboyFileInfo) => void): this
    on(event: 'close', listener: () => void): this
    on(event: 'finish', listener: () => void): this
    on(event: 'error', listener: (error: Error) => void): this
  }

  function Busboy(options: BusboyConfig): Busboy
  namespace Busboy {
    export type Busboy = import('busboy').Busboy
  }

  export default Busboy
}
