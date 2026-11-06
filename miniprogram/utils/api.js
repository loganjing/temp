// API 调用封装：统一对接后端 REST API（前缀 /api）
const config = require('../config.js');

function request(options) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: config.apiBaseUrl + options.path,
      method: options.method || 'GET',
      data: options.data,
      header: { 'Content-Type': 'application/json' },
      success(res) {
        resolve(res);
      },
      fail(err) {
        reject(err);
      }
    });
  });
}

function buildQuery(params) {
  const keys = Object.keys(params).filter(k => params[k] !== undefined && params[k] !== null && params[k] !== '');
  if (keys.length === 0) return '';
  return '?' + keys.map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&');
}

module.exports = {
  // POST /api/visitors — 提交访客登记
  submitVisitor(data) {
    return request({ path: '/api/visitors', method: 'POST', data });
  },
  // GET /api/visitors — 查询登记列表（支持 status / phone 过滤）
  getVisitors(params) {
    return request({ path: '/api/visitors' + buildQuery(params || {}) });
  },
  // POST /api/wechat/phone — 微信手机号解密
  decryptPhone(code) {
    return request({ path: '/api/wechat/phone', method: 'POST', data: { code } });
  }
};
