// 访客登记页逻辑
const api = require('../../utils/api.js');

Page({
  data: {
    name: '',
    phone: '',
    id_card: '',
    company: '',
    visit_reason: '',
    host_name: '',
    arrivalDate: '',
    arrivalTime: '',
    phone_source: 'manual', // wechat / manual
    phoneLocked: false,      // 微信手机号获取成功后锁定手工输入
    errorMsg: '',
    submitting: false
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [field]: e.detail.value });
  },

  onPhoneInput(e) {
    // 手工填写时，手机号来源标记为 manual
    this.setData({ phone: e.detail.value, phone_source: 'manual' });
  },

  onGetPhoneNumber(e) {
    // 用户拒绝或环境不支持 getPhoneNumber，回退手工填写
    if (e.detail.errMsg !== 'getPhoneNumber:ok' || !e.detail.code) {
      this.setData({ phone_source: 'manual', phoneLocked: false });
      return;
    }
    const code = e.detail.code;
    api.decryptPhone(code).then(res => {
      if (res.statusCode === 200 && res.data && res.data.phone) {
        this.setData({
          phone: res.data.phone,
          phone_source: 'wechat',
          phoneLocked: true,
          errorMsg: ''
        });
      } else {
        // 解密失败，回退手工填写
        this.setData({ phone_source: 'manual', phoneLocked: false });
        wx.showToast({ title: '微信手机号获取失败，请手工填写', icon: 'none' });
      }
    }).catch(() => {
      this.setData({ phone_source: 'manual', phoneLocked: false });
      wx.showToast({ title: '微信手机号获取失败，请手工填写', icon: 'none' });
    });
  },

  resetPhone() {
    this.setData({ phone: '', phone_source: 'manual', phoneLocked: false });
  },

  onDateChange(e) {
    this.setData({ arrivalDate: e.detail.value });
  },

  onTimeChange(e) {
    this.setData({ arrivalTime: e.detail.value });
  },

  // 客户端预校验，规则与 technical-contract.md §4 一致
  validate() {
    const { name, phone, id_card, company, visit_reason } = this.data;
    const errors = [];
    if (!name || name.length < 1 || name.length > 50) {
      errors.push('请填写姓名（1-50 字符）');
    }
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      errors.push('请填写正确的手机号（11 位数字）');
    }
    if (!/^\d{17}[\dXx]$/.test(id_card)) {
      errors.push('请填写正确的身份证号（18 位）');
    }
    if (!company || company.length < 1 || company.length > 200) {
      errors.push('请填写公司信息（1-200 字符）');
    }
    if (!visit_reason || visit_reason.length < 1 || visit_reason.length > 500) {
      errors.push('请填写访问事由（1-500 字符）');
    }
    return errors;
  },

  submitForm() {
    const errors = this.validate();
    if (errors.length > 0) {
      this.setData({ errorMsg: errors[0] });
      return;
    }
    const { name, phone, id_card, company, visit_reason, host_name, arrivalDate, arrivalTime, phone_source } = this.data;
    let expected_arrival_time = null;
    if (arrivalDate) {
      const timePart = arrivalTime || '00:00';
      expected_arrival_time = arrivalDate + 'T' + timePart + ':00';
    }
    const payload = {
      name,
      phone,
      id_card,
      company,
      visit_reason,
      phone_source,
      host_name: host_name || null,
      expected_arrival_time
    };
    this.setData({ submitting: true, errorMsg: '' });
    api.submitVisitor(payload).then(res => {
      if (res.statusCode === 201 && res.data && res.data.id) {
        // 缓存手机号，供「我的登记」页查询本人记录
        wx.setStorageSync('visitorPhone', phone);
        wx.showToast({ title: '登记提交成功', icon: 'success' });
        setTimeout(() => {
          wx.switchTab({ url: '/pages/my-visits/my-visits' });
        }, 1000);
      } else {
        // 失败时表单页内联错误提示
        const errObj = res.data && res.data.error;
        let errorMsg = (errObj && errObj.message) || '提交失败，请稍后重试';
        if (errObj && errObj.fields) {
          const fieldMsgs = Object.keys(errObj.fields).map(k => errObj.fields[k]);
          if (fieldMsgs.length > 0) {
            errorMsg = fieldMsgs[0];
          }
        }
        this.setData({ submitting: false, errorMsg });
      }
    }).catch(() => {
      this.setData({ submitting: false, errorMsg: '网络错误，请检查后端服务或稍后重试' });
    });
  }
});
