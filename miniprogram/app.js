// 访客登记小程序全局逻辑
// API 基地址默认指向本地后端服务，可通过修改下方 API_BASE 覆盖。
const API_BASE = 'http://localhost:3000';

App({
  globalData: {
    // 后端 API 基地址
    apiBase: API_BASE,
    // 微信新版 getPhoneNumber 返回 code，需后端调用微信开放接口换取手机号
    phoneDecodePath: '/api/wechat/phone',
    // 访客照片上传接口
    uploadPath: '/api/uploads'
  },
  onLaunch() {
    // 全局初始化，可在必要时读取运行环境配置覆盖 apiBase
  }
});
