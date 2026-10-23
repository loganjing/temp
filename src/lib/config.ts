// 前端运行配置
// VITE_USE_MOCK 未设置或为 "true" 时使用 mock 数据，便于前端独立渲染
// 生产环境后端静态托管前端时，API 同源可达，设 VITE_USE_MOCK=false 即可切换为真实 API

export const USE_MOCK: boolean =
  import.meta.env.VITE_USE_MOCK !== 'false';

export const API_BASE_URL: string =
  import.meta.env.VITE_API_BASE_URL || '/api';
