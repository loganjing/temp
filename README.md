# 实时时间显示页面

打开页面即可看到当前本地系统时间的时、分、秒，显示值随真实时间自动推进，全程无需交互。

## 运行

```bash
npm install
npm run dev      # 启动开发服务器，打开输出的本地地址即可
```

## 其他命令

```bash
npm run typecheck   # TypeScript 类型检查
npm test            # 单元测试
npm run build       # 类型检查 + 生产构建（输出到 dist/）
npm run preview     # 预览已构建的静态产物
```

## 实现位置

- `src/main.tsx`：应用挂载入口。
- `src/App.tsx`：页面组件，渲染 `HH:MM:SS`。
- `src/useCurrentTime.ts`：每秒多次轮询本地系统时间，卸载时清理计时器。
- `src/time.ts`：把 `Date` 格式化为两位补足的 `HH:MM:SS`。
- `src/styles.css`：页面样式。