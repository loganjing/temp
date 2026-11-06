// 我的登记页逻辑
const api = require('../../utils/api.js');

const STATUS_MAP = {
  pending: '待审核',
  approved: '通过',
  rejected: '拒绝'
};

Page({
  data: {
    list: [],
    loading: false,
    errorMsg: ''
  },

  onShow() {
    // 每次进入页面刷新登记列表，确保看到最新审核状态
    this.loadList();
  },

  loadList() {
    const phone = wx.getStorageSync('visitorPhone');
    if (!phone) {
      // 未提交过登记，无手机号缓存，显示空态
      this.setData({ list: [], loading: false, errorMsg: '' });
      return;
    }
    this.setData({ loading: true, errorMsg: '' });
    api.getVisitors({ phone }).then(res => {
      if (res.statusCode === 200 && res.data && Array.isArray(res.data.data)) {
        const list = res.data.data.map(item => ({
          id: item.id,
          name: item.name,
          company: item.company,
          visit_reason: item.visit_reason,
          host_name: item.host_name,
          status: item.status,
          statusText: STATUS_MAP[item.status] || item.status,
          created_at_display: this.formatTime(item.created_at)
        }));
        this.setData({ list, loading: false });
      } else {
        this.setData({ loading: false, errorMsg: '查询登记记录失败' });
      }
    }).catch(() => {
      this.setData({ loading: false, errorMsg: '网络错误，请检查后端服务或稍后重试' });
    });
  },

  formatTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const pad = n => (n < 10 ? '0' + n : '' + n);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  },

  onPullDownRefresh() {
    this.loadList();
    wx.stopPullDownRefresh();
  }
});
