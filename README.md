# Plotsy · 图形计算器

一个类似 Desmos 的图形计算器，完全离线运行。表达式卡片本身就是可编辑的 LaTeX 数学输入框，底部键盘在光标进入公式时自动展开；支持函数、隐函数、参数曲线、极坐标、导数、定积分、Sigma 求和、连乘与函数名引用。高频曲线采样与隐函数网格由本地 Rust/WASM 批量求值。

## English quick start

Open `index.html` in your browser and select **EN** in the top bar. Plotsy works offline and remembers your language in the same browser. Select **中文** to return to Simplified Chinese.

- Enter `y=x^2{0<x<2}` to restrict a curve or `x^2+y^2<4{y>=0}` to shade the upper semicircle.
- Enter `y=mx+b` and select **Add sliders** to define both parameters. Drag the sliders to update the line.
- Click a curve to select it or another curve to switch. Click the selected curve again or an empty area to clear the selection. Move the pointer or drag on a touchscreen to trace it. Dots mark visible intercepts, intersections, and local extrema of explicit functions.
- Use **Import** and **Export** for `.psy` projects and PNG images. You can rename the project file while keeping its `.psy` extension.

## 立即使用

直接双击 `index.html`，用 Chrome、Edge、Firefox 或 Safari 打开即可。

- 不需要安装依赖，也不需要启动服务器。
- 不需要联网，公式输入、排版、计算和绘图全部在浏览器内完成。
- 建议保持 `index.html`、`css/`、`js/`、`vendor/`、`assets/` 的相对目录结构不变。

每次打开页面都会得到一张空白画布和一条空白表达式。点「示例」右侧的 `+` 可以在列表末尾新增一条。编辑公式时按回车，会在当前行下方新增一条。光标会移到新表达式。最后一条表达式可以清空，删除按钮只在有多条表达式时出现。要保留图表，可通过“导出 → 导出项目”保存 `.psy` 文件，再通过“导入”恢复。

## 核心功能

- **直接编辑公式**：每张卡片的公式本身就是 MathLive 输入框，没有单独的原始文本框；点击公式即可编辑。
- **自动数学键盘**：不再需要“键盘”按钮。光标进入任意公式后，页面底部会自动出现全宽键盘；点击空白处或按 `Esc` 收起。
- **LaTeX 排版**：分数、根式、上下标、绝对值、微积分符号都用本地 MathLive / KaTeX 渲染。
- **函数自动识别**：输入 `sin`、`cos`、`tan`、`ln`、`sqrt` 等会转为对应函数；支持 `sin x`、`sinx`。
- **自动符号替换**：输入 `int`、`sum`、`prod`、`inf` 或希腊字母拼写时立即转换。慢速输入、在公式中间或括号内编辑、以及粘贴文本都支持替换。例如 `xpi` 显示为 `xπ`。参数曲线与极坐标的范围输入框使用同一套规则。
- **占位结构保护**：根式、绝对值和积分/求和上下限保留结构占位框；函数参数使用普通空括号，微积分主体不使用括号。占位框里的内容清空后会自动还原；在空占位框上按退格会删除它所属的整个符号，而不是只删一个框。
- **上下角标删除**：`^{}` / `_{}` 为空时，按退格删除整个角标，回到 `x`，不会删除底数。
- **微积分上下限**：输入 `int` / `integral` 会生成带上下限的积分模板，输入 `sum` / `prod` / `product` 会生成带索引和上下限的求和/连乘模板，不再只替换一个裸符号。光标先落在上限，按 `Tab` 到下限；被积式/通项直接写在上下限后面，不需要括号。
- **自动函数名**：只有自变量只有 `x` 的裸表达式才自动补成 `f(x)=…`、`g(x)=…`；`y=…` 开头的函数保持原样，`x=…` 视为隐函数，`a=…` 视为赋值（滑块）。其他图像命名为 `a`、`b`…。函数名可直接用于后续公式，如 `f(2x)`、`f(t)`、`f(g(x))`。
- **常数结果**：不含 `x`（或实际不随 `x` 变化）的表达式不绘图，而是在卡片里显示数值结果；`y=2` 是常函数，绘制水平线；`f(x)=2` 也绘制水平线。
- **微积分**：一阶 / 高阶导数、定积分、Sigma 求和与连乘，可互相嵌套；上下限不预设，常数结果直接显示。
- **WASM 绘图加速**：表达式编译成 f64 字节码，由本地 Rust/WASM 批量求值；显函数采用亚像素采样，隐函数网格和参数/极坐标曲线也走 WASM，失败时自动回退 JS。
- **离线项目管理**：`.psy` 导入 / 导出、高清 PNG 导出。
- **响应式界面**：桌面端侧栏 + 画布；移动端画布在上、表达式在下；底部键盘全宽自适应。
- **中英界面**：点击顶部的 **EN** 或 **中文** 切换。浏览器会记住这个选择。
- **曲线限制与坐标追踪**：如 `y=x^2{0<x<2}`。点击曲线选择图像，点击其他曲线可切换。再点已选曲线、点击空白处或按 Esc 可取消选择。鼠标移动或在触屏上拖动即可追踪选中的图像。圆点标示可见的轴交点、图像交点和显函数的局部极值，点击圆点可保留坐标。
- **一键建滑块**：输入 `y=mx+b` 后，点击表达式上的添加滑块按钮即可定义两个变量。

## WASM 绘图加速

- WASM 模块位于 `wasm/`，由 Rust 编译到 `wasm32-unknown-unknown`，无第三方运行时依赖。
- 为了继续支持 `file://` 双击打开，WASM 以 base64 内嵌在 `js/plotsy_math_data.js`，不使用 `fetch`。
- 表达式 AST 在 `js/wasm.js` 中编译成字节码；`js/expression.js` 把字节码附加到对应图元。
- 显函数：按 0.35px 的亚像素间隔批量采样，再在 Canvas 上绘制。
- 隐函数：marching squares 网格从 6px 提升到 3px（导出 2px），并通过 WASM 批量求值。
- 参数曲线步数 1800 → 3600；极坐标步数 2200 → 4400。
- 如果浏览器不支持 WebAssembly、脚本被拦截或 WASM 加载失败，绘图自动回退到原来的 JS 求值路径。
- WASM 使用 IEEE 754 `f64`，与 JS 的 `double` 精度相同；绘图“更准”来自更高采样密度和更细的隐函数网格，而不是把双精度换成无限精度。

构建命令：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-wasm.ps1
```

脚本会编译 Rust、复制 `wasm/plotsy_math.wasm`，并重新生成内嵌 base64 的 `js/plotsy_math_data.js`。

本机 Chromium 实测（20 万点 × 5 轮，表达式 `sin(x)+x^2/3+cos(2x)`）：JS 闭包约 175.5ms，WASM 批量约 65.4ms，约 2.68×；两者结果求和差值为 0。实际速度取决于机器、表达式和批量大小。

## 自动数学键盘

编辑公式或参数范围时，页面底部会出现全宽键盘。键帽上的数学内容使用 LaTeX 排版。

| 标签 | 内容 |
| --- | --- |
| 主键盘 | 数字小键盘、四则与比较、分数、根式、常用变量和常量、方向键、退格、回车 |
| 函数与微积分 | 43 个常用与特殊函数，以及导数、定积分、求和、连乘 |
| ABC/αβγ | 英文字母和希腊字母共用三行 QWERTY 键位，点 `αβγ` 切换字母表，用 `⇧` 切换大小写 |

主键盘的方向键可以在分式、上下标等结构内移动光标。表达式区顶部的“示例”独立展示 13 个公式，选择一项即可插入。

主键盘的 `×` 键输入点乘号 `·`，`÷` 键和分数键都插入带分子、分母占位框的分式。

轻点表达式左侧的颜色圆点可以切换图像显隐。长按打开 3×3 调色板，选择预设色或点彩色圆点，使用色板、色相滑块或 HEX 输入框自定义颜色。

- `a^b` 插入 LaTeX 上标并把光标放进上标，`a_b` 插入下标并把光标放进下标。
- 上下角标内容清空后角标保留；在空角标内按退格会删除整个角标，例如 `x^{}` → `x`、`x_{}` → `x`。
- “函数与微积分”内的 `ⁿ√` 键插入带根指数的根式。
- 选中公式中的内容后点击函数按钮，会把选中内容包进函数。
- 多参数函数直接在括号内用逗号分隔输入；`Tab` 在可用的占位框之间切换。

## 输入规则

函数名可以直接写，不必强制加括号：

```text
sin x        →  sin(x)
cos x        →  cos(x)
sinx         →  sin(x)
sin(x)       →  sin(x)
sin(2x)      →  sin(2x)
```

复合参数必须加括号。若写 `sin 2x`，会按 `(sin 2) · x` 解析，因此 `sin(2x)` 请保留括号。

乘号可以省略：

```text
2x    3ab    ab    x2
```

字母和数字、字母和字母之间都可以直接相乘。

变量可以是单字母或带下标的形式：

```text
a = 1.5      a_1 = 2      x_2
```

常量：`pi` / `π`、`e`、`tau`、`phi`、`inf` / `∞`。极坐标使用 `θ` 或 `theta`。

### 自动替换

| 输入 | 显示 |
| --- | --- |
| `int` | `∫` |
| `erf`、`erfc` | 转义为误差函数和互补误差函数。在已转义的 `erf` 后输入 `c` 会切换为 `erfc` |
| `sum` | `∑` |
| `prod` | `∏` |
| `inf` | `∞` |
| `alpha`、`beta`、`gamma`、`theta`、`pi`、`omega`… | `α`、`β`、`γ`、`θ`、`π`、`ω`… |

可在“函数与微积分”中插入带占位框的定积分、求和或连乘。

## 函数名、常数与引用

函数名现在按输入形式区分：

- **裸表达式且自变量只有 `x`**：自动补成 `f(x)=…`、`g(x)=…`，例如 `sin(x)`、`x^2`、`a*sin(x)`。
- **`y=…` 开头**：保持 `y=…`，不会被改成 `f(x)=…`；`y=2` 是常函数，画水平线。
- **`x=…` 开头**：视为隐函数，例如 `x=2` 画竖直线，并归入隐函数类。
- **`a=…` 这类单变量赋值**：视为赋值/滑块，不绘图。
- 隐函数、参数曲线、极坐标、点、不等式等：`a`、`b`、`c`…，显示为小型名称标签。
- 常数表达式不会获得函数名，也不会绘图；卡片直接显示“结果”。

如果表达式的结果是常数（例如 `2 + 2`、`∫₀¹ x² dx`、`∑ n`、`d/dx 5`），它只显示数值：

```text
2 + 2                    →  结果 = 4
integral(x^2, x, 0, 1)    →  结果 ≈ 0.333333333333
diff(5, x)                →  求导结果 = 0
```

要画一个常数函数，可以写：

```text
y = 2
f(x) = 2
```

`y=` 保持 `y=` 写法；`f(x)=` 用于手动命名函数。只有裸的、自变量只有 `x` 的表达式会自动补 `f(x)=`。

函数名可以在后续任意公式中调用：

```text
f(2x)
f(t)
f(g(x))
f(x) + 1
```

函数体会在编译前展开，因此 `f(2x)` 会真正使用 `f` 的定义，而不是把 `f` 当成变量。自引用或循环引用会给出错误提示。

> `y=…` 函数保持原式，不额外获得 `f(x)` 名称；需要被后续公式调用时，请写成 `f(x)=…`。非函数图像（点、隐函数曲线等）的名称只用于识别。

## 支持的表达式

| 类型 | 示例 | 说明 |
| --- | --- | --- |
| 裸 x 函数 | `sin x`、`x^2`、`a*sin(x)` | 自动补成 `f(x)=…` 并绘制 |
| y= 函数 | `y = sin(x)`、`y = 2` | 保持 `y=…`，绘制函数 |
| 常数函数 | `f(x) = 2` | 手动命名并绘制水平线 |
| 常数结果 | `2 + 2`、`integral(x^2, x, 0, 1)` | 显示数值，不绘图 |
| 隐函数 | `x^2 + y^2 = 9`、`x = 2` | 含 `x`、`y` 的方程或竖直线 |
| 赋值 | `a = 2` | 作为参数滑块，不绘图 |
| 不等式 | `y > x^2 - 2` | 支持 `<`、`>`、`<=`、`>=`、`≤`、`≥` |
| 定义域与区域限制 | `y=x^2{0<x<2}`、`x^2+y^2<4{y>=0}` | 直角坐标曲线或不等式末尾可以追加一个或多个花括号条件 |
| 参数曲线 | `(cos(3t), sin(2t))` | 默认 `0 ≤ t ≤ 2π` |
| 极坐标 | `r = 2 + 2cos(θ)` | 默认 `0 ≤ θ ≤ 2π` |
| 点 | `(1, 2)` | 可引用滑块变量 |
| 滑块 | `a = 1.5`、`a_1 = 2` | 变量名可为单字母或带下标 |
| 条件函数 | `y = if(x > 0, x, -x)` | 分段函数 |
| 导数 | `diff(x^2, x)` | 或使用“函数与微积分”里的导数键 |
| 定积分 | `integral(x^2, x, 0, 1)` | 必须给出下限、上限 |
| 求和 / 连乘 | `sum(n*x, n, 1, 10)`、`product(x+n, n, 1, 4)` | 必须给出索引与上下限 |

当前函数键盘包含：`sin`、`cos`、`tan`、`cot`、`sec`、`csc`、`asin` / `arcsin`、`acos` / `arccos`、`atan` / `arctan`、`atan2`、`sinh`、`cosh`、`tanh`、`asinh`、`acosh`、`atanh`、`sqrt`、`nthroot`、`abs`、`exp`、`ln`、`log`、`log2`、`log10`、`floor`、`ceil`、`round`、`sign`、`min`、`max`、`mod`、`pow`、`hypot`、`clamp`、`if`，以及特殊函数：

| 函数 | 键盘 | 可输入写法 | 说明 |
| --- | --- | --- | --- |
| Riemann zeta | `ζ` | `zeta(x)`、`ζ(x)`、`\zeta(x)` | 实数 zeta |
| 误差函数 | `erf` | `erf(x)` | 实数误差函数 |
| 互补误差函数 | `erfc` | `erfc(x)` | 与 `1-erf(x)` 等价，对较大的正数直接计算尾部 |
| Gamma | `Γ` | `gamma(x)`、`Γ(x)`、`\Gamma(x)` | Gamma 函数 |
| Digamma | `ψ` | `digamma(x)`、`psi(x)`、`ψ(x)`、`\psi(x)` | 双伽马，无下标 |
| Polygamma | `ψₙ` | `polygamma(n,x)`、`ψ_n(x)`、`\psi_{n}(x)` | 下标 `n` 是阶数 |
| Lambert W（0 分支） | `W` | `lambertw(x)`、`W(x)` | 0 分支不写下标 |
| Lambert W（-1 分支） | `W₋₁` | `lambertwminus(x)`、`W_{-1}(x)` | -1 分支 |

特殊函数的键盘按钮都会插入对应 LaTeX 并定位到参数括号；`polygamma` 的按钮先定位到下标阶数。手写 `\zeta`、`\Gamma`、`\psi`、`W`、`W_{-1}` 或对应 Unicode 符号也会按同一函数解析。

### 特殊函数求导

支持撇号写法，例如 `sin'(x)`、`f'(x)`、`(x^2)'`、`ζ'(x)`、`Γ'(5)`、`ψ_2'(x)`、`W_{-1}'(-0.1)`。

- `Γ'(x) = Γ(x) ψ(x)`（Gamma 的导数）
- `ψ'(x) = ψ_1(x)`（Digamma 的导数）
- `ψ_n'(x) = ψ_{n+1}(x)`（Polygamma 对 x 求导）
- `W'(x) = W(x) / (x(1+W(x)))`，两个分支同式
- `ζ'(x)` 保持 `\zeta'(x)` 的 prime 记号，并作为普通显函数绘图

## 微积分

“函数与微积分”中的运算键用法如下。

1. **导数**：插入 `d/dx ( )`；按钮只插入符号，不新建卡片。填入函数后，卡片会显示原导数记号与求导结果，并绘制导函数。
2. **二阶 / 高阶导数**：导数模板不包主体括号，插入后直接输入被求导表达式；再点一次“导数”可嵌套。
3. **定积分**：插入上下限都为空的 `∫_□^□ dx`；填写上下限后被积函数直接写在中间。没有不定积分模板。
4. **Sigma 求和 / 连乘**：索引默认为 `i`，上下限为空；填写如 `i = 1`、`10` 后绘图。

这些运算可以互相嵌套，例如积分里放求和、求和里放积分、求和里放导数等。导数结果使用符号求导并化简；定积分使用自适应 Simpson 数值积分；求和 / 连乘按整数索引计算。若整体结果不随 `x` 变化，则只显示结果，不绘制图像；要强制绘制常数函数，请写成 `f(x)=…` 或 `y=…`。

无穷可以写成 `inf` 或 `∞`；无穷上下限可以被识别，但数值积分 / 求和不会对真正发散的无穷区间强行取值。

## 导入与导出

### 项目文件（.psy）

顶部“导出 → 导出项目”会打开保存流程。支持系统保存窗口的浏览器可直接选择目录并修改文件名。其他浏览器可先填写文件名，再右键点击保存链接，选择“链接另存为”。存档是 UTF-8 文本文件，包含：

- 表达式原文、LaTeX 源码与颜色
- 自动名称（如 `f`、`g`、`b`）
- 显示 / 隐藏状态
- 滑块范围与参数曲线范围
- 视图位置、缩放级别
- 网格、坐标轴、标签和角度单位设置

通过“导入”按钮、侧栏“导入项目”或直接拖入窗口即可恢复。文件主名可以自由修改，扩展名须为 `.psy`。

存档以 `plotsy 1` 开头。每行是一条记录，空行和行首缩进可省略。下例关闭网格并绘制一条蓝色抛物线。

```text
plotsy 1
view 0 0 64
grid off
expr "y=x^2"
  color #2563eb
```

- `view` 记录中心坐标和缩放倍率。可在首条表达式前使用 `grid`、`minor-grid`、`axes`、`labels`（`on` 或 `off`），以及 `angle`（`rad` 或 `deg`）。
- 每条 `expr` 后可跟 `latex "…"`、`color #rrggbb`、`name function "f"`、`hidden`、`bounds "0" "2π"` 或 `slider -10 10 0.1`。名称类型为 `function`、`graph` 或 `parameter`。
- 文本参数用双引号括起。用 `\\` 转义反斜杠、用 `\"` 转义双引号、用 `\n` 表示换行。

### 图片（PNG）

“导出 → 导出图片”使用相同的保存流程，生成约 2.5 倍分辨率的高清 PNG。图片包含当前视图、曲线、区域填充和右下角小水印。

## 回归检查

运行 `node --test scripts/test-math.js` 可检查公式转换、限制条件、滑块依赖、微积分和坐标追踪。测试使用本地文件，无需安装依赖。

浏览器测试覆盖语言切换、键盘输入、绘图、项目导入导出和触屏坐标。首次运行可用以下命令安装测试依赖并启动无头 Chromium。

```powershell
npm install --no-save --package-lock=false playwright
npx playwright install chromium
node scripts/test-browser.js
```

截图保存在 `screenshots/`。如已有 Chromium，可通过 `PLOTSY_BROWSER_EXECUTABLE` 指定其可执行文件。

## 快捷键

| 快捷键 | 功能 |
| --- | --- |
| `Enter` | 新建下一条表达式 |
| `Ctrl/Cmd + O` | 导入 .psy 存档 |
| `Ctrl/Cmd + S` | 导出 .psy 存档 |
| `Ctrl/Cmd + E` | 导出 PNG 图片 |
| `?` | 打开帮助 |
| `0` | 画布聚焦时复位视图 |
| 方向键 | 画布聚焦时平移 |
| `+` / `-` | 画布聚焦时缩放 |

数学键盘不再绑定 `Ctrl+K`；它跟随公式光标自动出现和收起。

## 文件结构

```text
.
├── index.html              # 页面结构、图标 sprite、自动键盘、帮助
├── css/
│   └── styles.css          # 设计令牌、布局、全宽键盘、响应式
├── js/
│   ├── parser.js           # 解析器、隐式乘法、下标变量、微积分、无穷
│   ├── expression.js       # 分类、函数名展开、编译、图元
│   ├── wasm.js             # AST → f64 字节码、WASM 批量求值/回退
│   ├── plotsy_math_data.js # 生成的 WASM base64，离线加载
│   ├── latex.js            # AST → LaTeX、KaTeX 渲染
│   ├── mathfield.js        # MathLive 适配、自动符号、微积分嵌套、退格兜底
│   ├── graph.js            # Canvas 渲染、WASM 采样、隐函数轮廓、交互
│   ├── graph-geometry.js   # 路径命中、坐标追踪、交点与局部极值
│   ├── project-file.js     # .psy 存档读写
│   └── app.js              # UI 状态、命名、底部键盘和导入导出
├── wasm/
│   ├── Cargo.toml          # Rust WASM crate
│   ├── src/lib.rs          # 批量 f64 求值器
│   └── plotsy_math.wasm    # 构建产物
├── scripts/
│   └── build-wasm.ps1      # 编译并生成 base64 数据
├── vendor/
│   ├── katex/              # 本地 KaTeX（JS、CSS、字体、MIT 许可证）
│   └── mathlive/           # 本地 MathLive（JS、CSS、字体、MIT 许可证）
├── assets/
│   └── favicon.svg
├── preview.png
└── README.md
```

## 实现说明

- **直接公式输入**：表达式卡片是 MathLive 的 `<math-field>`，承担显示和编辑；没有单独的文本输入。
- **底部键盘**：当任意 MathLive 字段获得焦点时，给 `.app` 增加底部内边距并显示固定定位的全宽键盘；失焦后收起。正在编辑的卡片会自动滚动到键盘上方。
- **自动符号**：普通公式与参数范围共用 MathLive 快捷输入。`pi`、`theta`、`alpha`、`Gamma` 等拼写可与其他字母相邻，完整拼写后立即转换。
- **函数名**：只有裸的、自变量只有 `x`（滑块参数除外）的表达式自动补成 `f(x)=…`；`y=…` 保持原形，`x=…` 视为隐函数，`a=…` 视为赋值。编译前把 `f(2x)` 中的 `x` 替换为实参 AST 并递归展开。
- **常数判定**：无关系的裸表达式会在多个 `x` 采样点上试算；结果不随 `x` 变化时标记为常数，只显示数值、不加入图元。
- **微积分**：解析器处理 `diff`、`integral`、`sum`、`product`；导数支持连续嵌套，积分 / 求和 / 连乘的函数体递归编译。
- **不使用 `eval` / `new Function`**：解析器先生成 AST，再编译成闭包或 WASM 字节码；未知变量和函数给出中文错误。
- **亚像素采样与隐函数轮廓**：显函数使用 0.35px 亚像素采样；参数 / 极坐标曲线提高步数；隐函数使用更细的 marching squares 网格。高频路径优先 WASM，异常时回退 JS。
- **完全无网络**：MathLive、KaTeX、字体、WASM base64 和全部脚本都随项目本地分发，没有 CDN 或外部字体请求。

## 第三方许可

- [KaTeX](https://katex.org/) 0.16.11，MIT 许可证。
- [MathLive](https://mathlive.io/) 0.105.0，MIT 许可证。本地包修正了切换表达式后旧编辑器延迟抢回焦点的问题。

许可证文本位于 `vendor/katex/LICENSE` 和 `vendor/mathlive/LICENSE.txt`。

## 浏览器支持

建议使用较新的 Chrome、Edge、Firefox 或 Safari。项目使用 Custom Elements、Canvas 2D、WebAssembly、ResizeObserver、dialog、Blob 和 Pointer Events。

## 开发

没有构建步骤。修改文件后直接刷新浏览器即可。

```bash
node --check js/parser.js
node --check js/wasm.js
node --check js/expression.js
node --check js/latex.js
node --check js/mathfield.js
node --check js/graph.js
node --check js/app.js
node --check js/plotsy_math_data.js
```

应用不依赖网络，直接打开 `index.html` 即可完整使用。
