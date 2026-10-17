# Minecraft Tax Free Levels Calculator (Web 0.1.0)

GitHub Pages 静态计算器。**以本仓库 Web 为准**（桌面 Python 版已冻结）。

## 本地预览

需用本地静态服务器（ESM + import map 不能直接 `file://`）：

```bash
npx --yes serve .
```

或 VS Code / PyCharm 的静态预览。然后打开提示的本地地址。

## 技术栈

- Preact + htm + hooks：`src/lib/`（本地 ESM）
- 对比图：本地 Chart.js（`src/lib/chart.umd.min.js`，约 **200KB**）；失败时回退 Canvas
- 语言包：`lang/zh_CN.json`、`lang/en_US.json`

## 功能（0.1.0）

- Tab1 单点对比：铁砧 / 附魔台 / levelBase=30
- 进度刚开始 / 刚结束 + 平均
- 三条水平对比线
- 中英切换（localStorage）

不含：URL 分享参数、范围曲线 Tab2。
