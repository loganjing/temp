import { Hono } from 'hono';
import { errorResponse } from '../utils/error';

/**
 * 微信手机号解密路由。
 *
 * 开发环境无 WECHAT_APPID / WECHAT_SECRET 时返回 WECHAT_SERVICE_ERROR。
 * 生产环境调用微信 phonenumber.getPhoneNumber 接口解密手机号。
 */
export function createWechatRouter(): Hono {
  const app = new Hono();

  // POST /api/wechat/phone — 微信手机号解密
  app.post('/phone', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return errorResponse(c, 400, 'VALIDATION_ERROR', '请求体必须是合法 JSON');
    }

    const b = body as Record<string, unknown>;
    const code = b?.code;

    if (typeof code !== 'string' || code.length === 0) {
      return errorResponse(c, 400, 'VALIDATION_ERROR', '字段校验失败', {
        code: 'code 不能为空',
      });
    }

    const appId = process.env.WECHAT_APPID;
    const secret = process.env.WECHAT_SECRET;

    if (!appId || !secret) {
      return errorResponse(
        c,
        500,
        'WECHAT_SERVICE_ERROR',
        '微信服务未配置（缺少 WECHAT_APPID 或 WECHAT_SECRET），无法调用微信接口',
      );
    }

    try {
      // 1. 获取 access_token
      const tokenUrl =
        `https://api.weixin.qq.com/cgi-bin/token` +
        `?grant_type=client_credential&appid=${encodeURIComponent(appId)}` +
        `&secret=${encodeURIComponent(secret)}`;
      const tokenResp = await fetch(tokenUrl);
      const tokenData = (await tokenResp.json()) as {
        access_token?: string;
        errcode?: number;
        errmsg?: string;
      };

      if (!tokenData.access_token) {
        return errorResponse(
          c,
          500,
          'WECHAT_SERVICE_ERROR',
          `微信服务端调用失败: ${tokenData.errmsg ?? '未知错误'}`,
        );
      }

      // 2. 调用 phonenumber.getPhoneNumber 解密手机号
      const phoneResp = await fetch(
        `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${tokenData.access_token}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        },
      );
      const phoneData = (await phoneResp.json()) as {
        errcode?: number;
        errmsg?: string;
        phone_info?: { phoneNumber?: string };
      };

      if (phoneData.errcode && phoneData.errcode !== 0) {
        return errorResponse(
          c,
          400,
          'WECHAT_DECRYPT_FAILED',
          `手机号解密失败: ${phoneData.errmsg ?? '未知错误'}`,
        );
      }

      const phone = phoneData.phone_info?.phoneNumber;
      if (!phone) {
        return errorResponse(c, 400, 'WECHAT_DECRYPT_FAILED', '未能获取手机号');
      }

      return c.json({ phone });
    } catch (err) {
      return errorResponse(
        c,
        500,
        'WECHAT_SERVICE_ERROR',
        `微信服务调用异常: ${err instanceof Error ? err.message : '未知错误'}`,
      );
    }
  });

  return app;
}
