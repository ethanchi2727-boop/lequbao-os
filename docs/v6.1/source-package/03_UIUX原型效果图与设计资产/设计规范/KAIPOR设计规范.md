# KAIPOR MAX 设计规范提取（亮色 + 深色双主题 + 动效完整版）

> 来源：https://qm6vyhzrgwsik.ok.kimi.link 构建产物逆向（React + Tailwind + shadcn/ui + framer-motion）。
> 风格：Apple 式极简（SF Pro 字体族、黑白主色、20px 大圆角、玻璃拟态），配极光渐变背景 + 发光 Orb 球。
>
> 配套文件：
> - `KAIPOR-完整样式.css` —— 全量 CSS（格式化可读版）
> - `KAIPOR-动效代码.js` —— 数字跳动 / 入场动画 / Orb / 主题切换的可直接运行代码
> - `亮色版-登录页.png` / `深色版-登录页.png` —— 实拍参考

---

## 1. 字体

```css
font-family: -apple-system, "SF Pro SC", "SF Pro Text", "PingFang SC",
             "Helvetica Neue", Inter, "Noto Sans SC", sans-serif;
```
- 正文 16px / 行高 1.5 / 字重 400
- 数字用 `font-variant-numeric: tabular-nums`（等宽数字，跳动时不抖动）——`.amount-nums` 类内置
- 等宽代码字体：ui-monospace, SFMono-Regular, Menlo, Consolas, monospace

## 2. 双主题设计变量（核心）

主题切换机制：**根元素 `data-theme="dark"` 属性**（亮色为默认 `:root`），body 自带 `transition: background-color .24s ease, color .24s ease` 平滑过渡。

### 2.1 亮色 `:root`

```css
:root {
  /* 背景层级：画布 → 浮层 → 下沉 → 玻璃 */
  --bg-canvas: #FBFBFD;
  --bg-elevated: #FFFFFF;
  --bg-sunken: #F1F1F4;
  --bg-glass: rgba(255, 255, 255, .78);

  /* 文字三级 */
  --text-primary: #1D1D1F;
  --text-secondary: #6E6E73;
  --text-tertiary: #86868B;

  /* 主色：纯黑（按钮/强调），反差色纯白 */
  --accent: #000000;
  --accent-contrast: #FFFFFF;

  /* 边框：发丝线 + 强描边 */
  --border-hairline: rgba(0, 0, 0, .07);
  --border-strong: rgba(0, 0, 0, .14);

  /* 语义色 */
  --success: #0A7A3D;
  --warning: #9A6700;
  --danger: #C81E1E;
  --info: #0A5CCC;

  /* Orb 发光球 */
  --orb-core: #FFFFFF;
  --orb-glow-1: #C7D0FF;   /* 淡紫 */
  --orb-glow-2: #BEF0D8;   /* 淡绿 */
  --orb-ring: rgba(0, 0, 0, .08);
  --hero-glow-opacity: 0;

  /* 极光背景（极低透明度，若隐若现） */
  --aurora-1: rgba(0, 168, 104, .07);   /* 绿 */
  --aurora-2: rgba(94, 92, 230, .055);  /* 紫 */
  --aurora-3: rgba(100, 210, 255, .06); /* 蓝 */
  --grid-line: rgba(0, 0, 0, .025);

  /* 骨架屏 / 遮罩 */
  --skeleton: rgba(0, 0, 0, .05);
  --shimmer: rgba(255, 255, 255, .8);
  --scrim: rgba(0, 0, 0, .4);

  /* 阴影：极轻的双层投影 */
  --shadow-card: 0 1px 2px rgba(0,0,0,.05), 0 8px 24px rgba(0,0,0,.06);
  --shadow-card-hover: 0 2px 4px rgba(0,0,0,.06), 0 12px 32px rgba(0,0,0,.09);

  --radius: 20px;   /* 圆角基准，偏大，柔和 */
}
```

### 2.2 深色 `[data-theme=dark]`

```css
[data-theme=dark] {
  --bg-canvas: #000000;              /* 纯黑画布 */
  --bg-elevated: #0A0A0C;
  --bg-sunken: #050506;
  --bg-glass: rgba(12, 12, 14, .72);

  --text-primary: #F5F5F7;
  --text-secondary: #A1A1A6;
  --text-tertiary: #6E6E73;

  --accent: #FFFFFF;                 /* 主色反转为白 */
  --accent-contrast: #000000;

  --border-hairline: rgba(255, 255, 255, .1);
  --border-strong: rgba(255, 255, 255, .22);

  /* 语义色提亮（Apple 深色规范色） */
  --success: #30D158;
  --warning: #FFD60A;
  --danger: #FF453A;
  --info: #0A84FF;

  /* Orb 深色下更艳 */
  --orb-glow-1: #5E5CE6;   /* 紫 */
  --orb-glow-2: #64D2FF;   /* 蓝 */
  --hero-glow-opacity: .6;

  /* 极光透明度提高约 3 倍，深色下才看得见 */
  --aurora-1: rgba(94, 92, 230, .18);
  --aurora-2: rgba(100, 210, 255, .18);
  --aurora-3: rgba(160, 90, 220, .18);
  --grid-line: rgba(255, 255, 255, .04);

  --skeleton: rgba(255, 255, 255, .08);
  --shimmer: rgba(255, 255, 255, .16);

  --shadow-card: 0 1px 2px rgba(0,0,0,.5), 0 8px 32px rgba(0,0,0,.6);
  --shadow-card-hover: 0 2px 4px rgba(0,0,0,.5), 0 14px 40px rgba(0,0,0,.66);
}
```

## 3. 招牌视觉效果

### 3.1 极光背景（Aurora）—— 全站氛围底

```css
.aurora { position: fixed; inset: 0; z-index: 0; overflow: hidden; pointer-events: none; }
.aurora-blob {
  position: absolute; width: 55vmax; height: 55vmax;
  border-radius: 9999px; filter: blur(60px); will-change: transform;
}
/* 三个 blob 各用一种极光色径向渐变，24s 缓慢漂移，方向各不相同 */
.aurora-blob-1 { top:-18%; left:-12%;  background: radial-gradient(circle, var(--aurora-1), transparent 65%); animation: aurora-drift-1 24s linear infinite; }
.aurora-blob-2 { bottom:-22%; right:-10%; background: radial-gradient(circle, var(--aurora-2), transparent 65%); animation: aurora-drift-2 24s linear infinite; }
.aurora-blob-3 { top:30%; left:42%;    background: radial-gradient(circle, var(--aurora-3), transparent 65%); animation: aurora-drift-3 24s linear infinite; }

/* 叠加 40px 网格细线，增加精致感 */
.aurora-grid {
  position: absolute; inset: 0;
  background-image: linear-gradient(var(--grid-line) 1px, transparent 1px),
                    linear-gradient(90deg, var(--grid-line) 1px, transparent 1px);
  background-size: 40px 40px;
}

@keyframes aurora-drift-1 { 0%,to { transform: translate(0); } 50% { transform: translate(9%, 6%); } }
@keyframes aurora-drift-2 { 0%,to { transform: translate(0); } 50% { transform: translate(-8%, -7%); } }
@keyframes aurora-drift-3 { 0%,to { transform: translate(0); } 50% { transform: translate(-6%, 8%); } }
```

### 3.2 Orb 发光球（登录页核心）

双层结构：外层双色径向渐变光晕（opacity .85）+ 内层白核（多层外发光 shadow）。动画 `orb-float 5s`（上下 ±8px）+ `orb-breathe 4s`（透明度 .6→1）。完整代码见 `KAIPOR-动效代码.js`。

### 3.3 玻璃拟态

```css
.glass {
  background: var(--bg-glass);
  backdrop-filter: blur(20px) saturate(1.4);
  border: 1px solid var(--border-hairline);
}
```

### 3.4 卡片

```css
.card-base {
  background: var(--bg-elevated);
  border: 1px solid var(--border-hairline);
  border-radius: 20px;
  box-shadow: var(--shadow-card);
}
.card-hover { transition: transform .2s ease-out, box-shadow .2s ease-out; }
.card-hover:hover { transform: translateY(-2px); box-shadow: var(--shadow-card-hover); }
```

## 4. 动效体系

### 4.1 数字跳动（Count-Up）★

- **时长 800ms，缓动 easeOutCubic `1-(1-t)³`**，requestAnimationFrame 驱动
- **进入视口 30% 时触发一次**（useInView `{ amount: 0.3, once: true }`）
- 数字容器必须 `font-variant-numeric: tabular-nums`，防止位数变化抖动
- 完整实现见 `KAIPOR-动效代码.js` 的 `useCountUp` / `CountUpStat`

### 4.2 界面出现效果（Entrance）

| 模式 | 参数 |
|---|---|
| 上浮入场（最常用） | `opacity 0→1, y 12→0`，0.4~0.45s |
| 淡入 | `opacity 0→1`，0.4s |
| 弹入（图标/Logo） | `scale .8→1, opacity 0→1`，0.4s |
| 下拉入场 | `opacity 0→1, y -16→0` |
| 列表逐项 | 父容器 `staggerChildren: 0.06s`，子项用上浮入场 |

招牌缓动曲线：**`cubic-bezier(0.16, 1, 0.3, 1)`**（接近 easeOutExpo，先快后稳，「舒服感」的主要来源）；辅助 `[0.4,0,0.1,1]`、`[0.25,0.1,0.35,1]`。

### 4.3 微交互补充（复刻必需）

| 交互 | 精确参数 |
|---|---|
| **按钮按压** | `.pressable` 类：`:active { transform: scale(.97) }`，0.12s ease-out，全站可点元素通用 |
| **骨架屏** | `.skeleton-block`：12px 圆角灰块 + 90° 渐变扫光，`shimmer 1.4s` 无限循环 |
| **成功打勾** | 绿色圆形对勾 `scale 0→1`，spring：stiffness 320 / damping 18 / delay 0.1s |
| **分段控件滑块** | framer-motion `layoutId` 共享元素动画，选中胶囊自动平滑滑动（无需手写位移） |
| **斜纹进度条** | 45° 斜纹 `background-size:16px`，`background-position` 1s 流动循环 |
| **卡片悬浮** | `translateY(-2px)` + 阴影加深，0.2s ease-out |

### 4.4 其他 keyframes

| 名称 | 效果 |
|---|---|
| `orb-float` 5s | 上下浮动 ±8px |
| `orb-breathe` 4s | 呼吸透明度 .6↔1 |
| `shimmer` 1.4s | 骨架屏扫光 |
| `pulse-dot` 2s | 状态点缩放呼吸（scale 1→1.25） |
| `dash-flow` 1.2s | SVG 虚线流动（连接线动画） |
| `angle-spin` 6s | 渐变边框角度旋转（`@property --angle`） |
| `pulse` / `spin` / `caret-blink` | 常规加载态 |

## 5. 迁移要点

1. **「舒服感」公式** = 大圆角(20px) + 发丝边框(7% 透明度) + 极轻双层投影 + 0.4s/0.16-1-0.3 缓动 + 低透明度极光底。单拿任何一项都不够，要整套。
2. 主题切换是 `data-theme` 属性而非 class，变量覆盖写在 `[data-theme=dark]` 选择器下。
3. 深色不是简单反色：语义色全部换成 Apple 深色提亮版（`#30D158` 等），极光透明度 ×3，阴影加重。
4. UniApp/小程序注意：`backdrop-filter`、`filter: blur(60px)`、`@property --angle` 在小程序端不可用，极光和玻璃效果需要降级（可用静态渐变图替代）。
5. 数字跳动逻辑是纯 JS（rAF + easeOutCubic），与框架无关，小程序里用 setInterval/定时器也能等价实现。
