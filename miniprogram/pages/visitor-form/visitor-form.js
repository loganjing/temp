// 访客登记页面逻辑
const app = getApp();

Page({
  data: {
    name: '',
    phone: '',
    idCard: '',
    company: '',
    visitReason: '',
    hostName: '',
    dateValue: '',
    timeValue: '',
    photoTempPath: '',
    photoUrl: null,
    phoneReadOnly: false,
    phoneLoading: false,
    submitting: false
  },

  onFieldInput(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ [key]: e.detail.value });
  },

  onDateChange(e) {
    this.setData({ dateValue: e.detail.value });
  },

  onTimeChange(e) {
    this.setData({ timeValue: e.detail.value });
  },

  // 微信新版 getPhoneNumber 接口：返回 code，需后端换取手机号
  onGetPhoneNumber(e) {
    if (e.detail.errMsg !== 'getPhoneNumber:ok') {
      this.setData({ phoneReadOnly: false, phone: '' });
      wx.showToast({ title: '未获取到手机号，请手工填写', icon: 'none' });
      return;
    }

    // 兼容直接返回手机号的场景（旧版或调试）
    if (e.detail.phoneNumber) {
      this.setData({ phone: e.detail.phoneNumber, phoneReadOnly: true });
      return;
    }

    const code = e.detail.code;
    if (!code) {
      this.setData({ phoneReadOnly: false });
      wx.showToast({ title: '手机号获取失败，请手工填写', icon: 'none' });
      return;
    }

    this.setData({ phoneLoading: true });
    this.exchangePhoneNumber(code);
  },

  // 调用后端用 code 换取手机号
  exchangePhoneNumber(code) {
    const { apiBase, phoneDecodePath } = app.globalData;
    wx.request({
      url: apiBase + phoneDecodePath,
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: { code },
      success: (res) => {
        if (res.statusCode === 200 && res.data && res.data.phoneNumber) {
          this.setData({ phone: res.data.phoneNumber, phoneReadOnly: true });
        } else {
          this.setData({ phoneReadOnly: false });
          wx.showToast({ title: '手机号获取失败，请手工填写', icon: 'none' });
        }
      },
      fail: () => {
        this.setData({ phoneReadOnly: false });
        wx.showToast({ title: '手机号获取失败，请手工填写', icon: 'none' });
      },
      complete: () => {
        this.setData({ phoneLoading: false });
      }
    });
  },

  // 选择访客照片（选填）
  onChoosePhoto() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFile = res.tempFiles && res.tempFiles[0];
        if (!tempFile) {
          return;
        }
        this.setData({ photoTempPath: tempFile.tempFilePath });
        this.uploadPhoto(tempFile.tempFilePath);
      },
      fail: () => {
        // 用户取消选择，无需提示
      }
    });
  },

  uploadPhoto(filePath) {
    const { apiBase, uploadPath } = app.globalData;
    wx.uploadFile({
      url: apiBase + uploadPath,
      filePath,
      name: 'file',
      success: (res) => {
        try {
          const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
          if (data && data.url) {
            this.setData({ photoUrl: data.url });
          } else {
            this.setData({ photoUrl: null });
          }
        } catch (err) {
          this.setData({ photoUrl: null });
        }
      },
      fail: () => {
        // 照片为选填字段，上传失败时置空，不阻断提交
        this.setData({ photoUrl: null });
        wx.showToast({ title: '照片上传失败，将不提交照片', icon: 'none' });
      }
    });
  },

  validate() {
    const { name, phone, idCard, company, visitReason, hostName, dateValue, timeValue } = this.data;

    if (!name || !name.trim()) {
      return '请填写姓名';
    }
    if (!phone || !/^1\d{10}$/.test(phone)) {
      return '请填写正确的 11 位手机号';
    }
    if (!idCard || !/^\d{17}[\dXx]$/.test(idCard)) {
      return '请填写正确的 18 位身份证号';
    }
    if (!company || !company.trim()) {
      return '请填写公司信息';
    }
    if (!visitReason || !visitReason.trim()) {
      return '请填写访问事由';
    }
    if (!hostName || !hostName.trim()) {
      return '请填写被访人姓名';
    }
    if (!dateValue || !timeValue) {
      return '请选择预计到访时间';
    }
    return '';
  },

  onSubmit() {
    const error = this.validate();
    if (error) {
      wx.showToast({ title: error, icon: 'none' });
      return;
    }

    const { name, phone, idCard, company, visitReason, hostName, dateValue, timeValue, photoUrl } = this.data;
    // 组合为 ISO 8601 日期时间字符串
    const expectedVisitTime = `${dateValue}T${timeValue}:00`;

    const payload = {
      name: name.trim(),
      phone,
      idCard: idCard.trim(),
      company: company.trim(),
      visitReason: visitReason.trim(),
      hostName: hostName.trim(),
      expectedVisitTime,
      photoUrl: photoUrl || null
    };

    this.setData({ submitting: true });

    wx.request({
      url: app.globalData.apiBase + '/api/visitors',
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: payload,
      success: (res) => {
        if (res.statusCode === 201) {
          wx.navigateTo({ url: '/pages/submit-success/submit-success' });
        } else {
          const msg = (res.data && res.data.error && res.data.error.message) || '提交失败，请稍后重试';
          wx.showModal({ title: '提交失败', content: msg, showCancel: false });
        }
      },
      fail: () => {
        wx.showModal({ title: '提交失败', content: '网络异常，请稍后重试', showCancel: false });
      },
      complete: () => {
        this.setData({ submitting: false });
      }
    });
  }
});
