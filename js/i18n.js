(function (global) {
  'use strict';

  const Plotsy = (global.Plotsy = global.Plotsy || {});
  const preferenceKey = 'plotsy.language';
  let language = 'zh-CN';
  try {
    language = global.localStorage.getItem(preferenceKey) === 'en' ? 'en' : 'zh-CN';
  } catch (error) { /* Language switching still works without storage. */ }

  const translations = new Map(`
Plotsy · 图形计算器|Plotsy · Graphing Calculator
Plotsy 图形计算器|Plotsy Graphing Calculator
Plotsy 是一款离线图形计算器，支持 LaTeX 输入、函数、滑块和微积分。|Plotsy is an offline graphing calculator with LaTeX input, functions, sliders, and calculus.
导入 Plotsy 存档 (Ctrl+O)|Import a Plotsy project (Ctrl+O)
导入|Import
导出项目或图片|Export a project or image
导出|Export
导出项目|Export project
保留表达式、滑块与视图 · .psy|Expressions, sliders and view · .psy
导出图片|Export image
高清 PNG，适合分享与打印|High-resolution PNG for sharing and printing
新建项目|New project
帮助与语法|Help and syntax
表达式列表|Expression list
表达式|Expressions
示例|Examples
添加表达式|Add expression
关闭示例|Close examples
数学键盘|Math keypad
键盘分类|Keypad categories
主键盘|Keypad
数字与等号|Numbers and equals
运算与变量|Operators and variables
编辑控制|Editing controls
回车|Enter
分数|Fraction
函数|Function
函数与微积分|Functions & calculus
微积分|Calculus
光标移动|Move caret
光标左移|Move caret left
光标上移|Move caret up
光标下移|Move caret down
光标右移|Move caret right
所有计算都在本机完成|All calculations run locally
WASM 批量采样已启用|WASM sampling is enabled
导入项目|Import project
图形画布|Graph canvas
图形画布，拖拽平移，滚轮缩放，方向键移动|Graph canvas. Drag or use arrow keys to pan. Scroll to zoom.
你的浏览器需要支持 Canvas 才能显示图像。|Canvas support is required to display the graph.
画布缩放|Graph zoom
放大|Zoom in
缩小|Zoom out
复位视图 (0)|Reset view (0)
复位视图|Reset view
视图设置|Graph settings
关闭设置|Close settings
显示网格|Show grid
淡淡的坐标纸|Light grid lines
细分网格|Minor grid
主刻度之间的小格|Subdivisions between major ticks
坐标轴|Axes
显示 x、y 轴|Show the x- and y-axes
刻度标签|Axis labels
显示轴上的数字|Show numbers along the axes
三角函数角度单位|Angle unit
角度单位|Angle unit
弧度|Radians
角度|Degrees
重置为初始视图|Reset graph view
恢复默认设置|Restore defaults
缩放级别|Scale
px / 单位|px / unit
DEG · 角度制|DEG · Degrees
松开以导入项目|Drop to import project
支持 Plotsy 存档 · .psy|Plotsy project files · .psy
把想法写成曲线|Graphing help
关闭帮助|Close help
公式本身可以直接点击编辑，输入时立即排版。点击下面的例子，会把它添加到表达式列表。|Select a formula to edit it. Select any example below to add it to the expression list.
隐函数|Implicit curve
参数曲线|Parametric curve
极坐标|Polar curve
不等式|Inequality
点|Point
导数|Derivative
数值结果|Numeric result
绘制 x 的显函数，也支持 cos、tan、ln、sqrt、abs 等。|Graph functions of x using sin, cos, tan, ln, sqrt, abs, and more.
任意含 x、y 的方程会被绘制成隐式曲线。|Graph an implicit equation in x and y.
写成坐标形式并使用 t，下方可调整 t 的范围。|Enter a pair of coordinates in t. Set the range below the expression.
以 r = … 开头，使用 θ 或 theta，绘制极坐标曲线。|Start with r = … and use θ or theta to plot a polar curve.
支持 <、>、≤、≥，区域会自动着色。|Use <, >, ≤, and ≥ to shade regions.
坐标点会标注在画布上，可引用滑块变量。|Plot a labeled point. Coordinates can use slider variables.
显示原导数式和求导结果，并绘制导数函数。|Display the derivative and graph it.
不含 x、结果为常数的表达式只显示数值，不绘制图像。|Expressions that evaluate to a constant display a numeric result.
键盘会自动出现。|The keypad opens automatically. 
把光标放进任意公式，页面底部就会展开全宽数学键盘；点击空白处或按|Select a formula to open the math keypad. Click away or press
收起。主键盘提供方向键和回车。「ABC/αβγ」中的 αβγ 键可切换到希腊字母。| to close it. The main keypad has arrow keys and Enter. In ABC/αβγ, select αβγ to switch to Greek letters.
输入规则：|Input rules. 
函数可省略括号，例如|Parentheses are optional for simple arguments such as
；复合参数请写|. Use parentheses for compound arguments, as in
。若写|. Plotsy reads
，会按| as
解析。乘号可省略：|. You can omit the multiplication sign in
、|, 
；变量可以是单字母或下标形式，如|. Variables can be single letters or have subscripts, such as
。输入|. Type
会自动变成对应符号；输入| to insert the corresponding symbols. Greek letter names such as
等希腊字母拼写会立即变成| expand to LaTeX commands such as
等 LaTeX 命令，在空格、括号和运算符前后都有效。| around spaces, parentheses, and operators.
微积分与结果：|Calculus. 
在“函数与微积分”中插入导数、积分、求和或连乘。积分、求和和连乘的上下限可直接填写。常数结果显示在表达式卡片里。连续点击“导数”可求高阶导数。|Use Functions & calculus to insert derivatives, integrals, sums, or products. Enter the limits directly. Constant results appear on the expression card. Select Derivative repeatedly for higher derivatives.
函数名与结果：|Function names and results. 
只有自变量只有|Expressions with
的裸表达式才自动补成| as their only independent variable can be named automatically, for example
；|. 
保持原样，| stays as entered,
视为隐函数，| is drawn as an implicit curve, and
视为赋值/滑块。函数名可以写进后续公式，例如| defines a slider. Use function names in later expressions, for example
。常数表达式只显示结果、不画图；|. Constant expressions show a number.
是常函数并画水平线，| and
也画水平线。| define horizontal lines.
变量与滑块|Variables and sliders
参数曲线和极坐标的范围也支持自动替换，例如输入|Parametric and polar ranges use the same shortcuts. Typing
会显示为| displays as
输入|Enter
后，可一键为未定义的变量添加滑块。| to add sliders for undefined variables in one click.
用单个字母或带下标的字母定义变量，例如|Define a variable with one letter or a subscripted letter, for example
。表达式卡片会变成滑块，拖动即可实时更新所有引用它的曲线。|. Drag its slider to update every curve that depends on it.
键盘里的|On the keypad,
插入下标，| inserts a subscript and
插入上标。| inserts a superscript.
画布手势|Graph gestures
点击曲线选择图像，点击其他曲线可切换。再点已选曲线或点击空白处可取消选择。移动鼠标或在触屏上拖动可追踪选中的图像。圆点标示交点和显函数的局部极值。|Click a curve to select it or another curve to switch. Click the selected curve again or an empty area to clear the selection. Move the pointer or drag on a touchscreen to trace the selected graph. Circles mark intersections and local extrema of explicit functions.
拖拽平移，滚轮或双指缩放。点击画布工具栏上的复位按钮可回到初始视图。鼠标悬停时左下角会显示坐标。|Drag to pan and scroll or pinch to zoom. Use Reset view in the graph toolbar to restore the initial view. Hover over the graph to see coordinates at the bottom left.
使用顶部“视图设置”可以切换网格、坐标轴与三角函数角度单位。|Use Graph settings to change the grid, axes, and angle unit.
快捷键|Keyboard shortcuts
新建下一条表达式|Add the next expression
画布聚焦时复位视图|Reset the view when the graph has focus
打开帮助|Open help
完全离线。|Works offline. 
绘图在浏览器本机完成。要保留当前图表，请导出 .psy 存档。|Graphing runs locally in your browser. Export a .psy file to keep the current graph.
开始绘图|Start graphing
新建空白图表？|Create a blank graph?
新建图表会替换当前图表。要保留一份副本，请先导出项目。|Creating a graph replaces the current one. Export it first to keep a copy.
取消|Cancel
保存文件|Save file
要选择保存位置，请右键点击保存链接，然后选择“链接另存为”。|To choose a location, right-click the save link and select Save link as.
文件名|File name
保存链接|Save link
新建空白图表|Create blank graph
选择曲线颜色|Choose a curve color
曲线颜色|Curve color
长按更换颜色|Hold to change color
自定义颜色|Custom color
饱和度与明度，使用方向键调整|Saturation and brightness. Use the arrow keys.
色相|Hue
十六进制颜色|Hex color
返回|Back
应用颜色|Apply color
图形画布。点击曲线以选择，再点同一曲线、点击空白或按 Esc 取消选择。|Graph canvas. Click a curve to select it. Click the same curve or an empty area, or press Escape, to clear the selection.
切换到希腊字母|Switch to Greek letters
切换到英文字母|Switch to Latin letters
数学表达式|Math expression
输入表达式|Enter an expression
求导结果|Derivative
{value} 阶导数结果|Derivative (order {value})
拖动滑块实时更新|Drag to update the graph
滑块值|Slider value
滑块范围|Slider range
最小|Min
最大|Max
步长|Step
滑块最小值|Slider minimum
滑块最大值|Slider maximum
滑块步长|Slider step
从|from
起点|Start
终点|End
参数范围起点|Start of parameter range
参数范围终点|End of parameter range
显示表达式|Show expression
隐藏表达式|Hide expression
删除表达式|Delete expression
图像名称|Graph name
表达式 {value}，可直接编辑|Expression {value}, editable
滑块 {value}|Slider {value}
从一条曲线开始|Start with a curve
输入函数、方程或坐标点。也可以从下面的例子开始。|Enter a function, equation, or point. You can also start with an example below.
使用{value}|Use {value}
希腊字母 {value}|Greek letter {value}
希腊语问号|Greek question mark
冒号|Colon
字母 {value}|Letter {value}
切换大小写|Toggle letter case
切换为大写|Switch to uppercase
切换为小写|Switch to lowercase
插入 {value}|Insert {value}
新表达式：{value}|New expression ({value})
除号|Division
小于|Less than
大于|Greater than
绝对值|Absolute value
小于等于|Less than or equal to
大于等于|Greater than or equal to
圆周率 pi|Pi
无穷大|Infinity
乘号|Multiplication
上标 / 乘方|Superscript / power
下标|Subscript
平方根|Square root
极角 theta|Polar angle theta
自然常数 e|Euler's number
减号|Minus
加号|Plus
逗号|Comma
自然对数|Natural logarithm
等号|Equals
正弦|Sine
余弦|Cosine
正切|Tangent
常用对数|Base-10 logarithm
向下取整|Round down
向上取整|Round up
n 次方根|Nth root
退格删除|Backspace
特殊函数|Special functions
误差函数|Error function
互补误差函数|Complementary error function
Gamma 函数|Gamma function
Digamma 函数|Digamma function
多 Gamma（下标为阶数）|Polygamma (order in subscript)
Lambert W（0 分支）|Lambert W (branch 0)
Lambert W（-1 分支）|Lambert W (branch −1)
三角函数|Trigonometry
余切|Cotangent
正割|Secant
余割|Cosecant
反正弦|Inverse sine
反余弦|Inverse cosine
反正切|Inverse tangent
双曲函数|Hyperbolic functions
双曲正弦|Hyperbolic sine
双曲余弦|Hyperbolic cosine
双曲正切|Hyperbolic tangent
反双曲正弦|Inverse hyperbolic sine
反双曲余弦|Inverse hyperbolic cosine
反双曲正切|Inverse hyperbolic tangent
根式、指数与对数|Roots, exponents and logarithms
自然指数|Natural exponential
以 2 为底|Base-2 logarithm
以 10 为底|Base-10 logarithm
取整与符号|Rounding and sign
四舍五入|Round to nearest
符号函数|Sign function
组合与条件|Multi-argument functions
最小值|Minimum
最大值|Maximum
取余|Remainder
幂函数|Power
平方和开根|Square root of sum of squares
限制区间|Clamp to a range
两参数反正切|Two-argument arctangent
条件分支|Conditional
正弦曲线|Sine wave
抛物线|Parabola
圆|Circle
区域填充|Shaded region
分段函数|Piecewise function
滑块|Slider
垂直线|Vertical line
导数示例|Derivative example
添加一张导数示例卡片|Add a derivative example
反复点击得到二阶、三阶导数|Select repeatedly for higher derivatives
定积分|Definite integral
上下限留空，填写后绘图|Enter the limits to graph
Sigma 求和|Sigma sum
上下限留空|Enter the limits
连乘|Product
积分|Integral
求和|Sum
数值|Value
结果|Result
待填写|Incomplete
空白|Empty
无实数值|Undefined over the reals
海蓝|Blue
朱红|Red
松绿|Green
鸢尾|Violet
琥珀|Amber
湖水|Teal
山茶|Pink
墨灰|Slate
这不是 Plotsy 项目文件|This is not a Plotsy project file.
不支持此 Plotsy 项目格式或版本|The file uses an unsupported Plotsy project format or version.
项目文件里没有表达式列表|The project file has no expression list.
表达式数量超过上限（{value} 条）|The project exceeds the limit of {value} expressions.
第 {value} 条表达式格式不正确|Expression {value} has an invalid format.
滑块范围需要满足：最小值 < 最大值，步长 > 0。|Enter a minimum below the maximum and a positive step.
滑块范围已更新。|Slider range updated.
最多只能添加 {value} 条表达式。|You can add up to {value} expressions.
已导出 Plotsy 存档。|Plotsy project exported.
高清 PNG 图片已导出。|High-resolution PNG exported.
图片导出失败。|Image export failed.
项目导出失败。|Project export failed.
文件名需要以 {value} 结尾。|The file name must end in {value}.
Plotsy 存档|Plotsy project
PNG 图片|PNG image
项目文件太大了（上限 2 MB）。|This project file exceeds the 2 MB limit.
已导入 {value} 条表达式。|Imported {value} expressions.
已导入 1 条表达式。|Imported 1 expression.
已导入空白图表。|Imported a blank graph.
请选择扩展名为 .psy 的 Plotsy 存档。|Select a Plotsy project with the .psy extension.
项目文件第 {value} 行格式不正确。|The project file has an invalid record on line {value}.
导入失败。|Import failed.
已新建空白图表。|Created a blank graph.
视图设置已恢复默认。|Restored default graph settings.
数学输入组件加载失败，请确认 vendor/mathlive 目录完整。|The math editor could not load. Check the vendor/mathlive folder.
画布还没有准备好|The graph is not ready yet.
无法导出图片|The image could not be exported.
图片生成失败|The image could not be created.
数字格式不正确|Invalid number.
暂不支持阶乘，请使用 gamma 相关函数|Factorial is unavailable. Use the gamma function.
无法识别的字符 “{value}”|Unrecognized character “{value}”.
表达式不完整|Incomplete expression.
请输入一个表达式|Enter an expression.
一个表达式只能包含一个关系符号|Use one relation symbol per expression.
多余的右括号|Extra closing parenthesis.
表达式末尾多出了 “{value}”|Unexpected “{value}” at the end of the expression.
暂不支持“不等于”的不等式|The ≠ relation is unavailable.
函数参数不能为空|Function arguments cannot be empty.
函数调用缺少右括号|Missing closing parenthesis in the function call.
函数 {name} 缺少参数；复合参数请用括号，例如 {value}(2x)|Missing argument for {name}. Use parentheses for compound arguments, as in {value}(2x).
括号里缺少表达式|Enter an expression between the parentheses.
括号没有闭合|Missing closing parenthesis.
绝对值符号里缺少表达式|Enter an expression between the absolute-value bars.
绝对值符号没有闭合|Missing closing absolute-value bar.
表达式不完整，请继续输入|Finish entering the expression.
这里需要一个数字、变量或括号|Expected a number, variable, or parenthesis.
导数需要指定变量，例如 diff(x^2, x)|Specify a differentiation variable, as in diff(x^2, x).
暂不支持对函数 “{value}” 求导|Differentiation is unavailable for “{value}”.
暂不支持对这种表达式求导|Differentiation is unavailable for this expression.
未知变量 “{value}”|Unknown variable “{value}”.
不支持的导数表达式|Unsupported derivative expression.
未知运算符 “{value}”|Unknown operator “{value}”.
未知函数 “{value}”|Unknown function “{value}”.
函数 {name} 需要至少 {value} 个参数|{name} expects at least {value} arguments.
函数 {name} 需要{min} 至 {max} 个参数|{name} expects {min} to {max} arguments.
函数 {name} 需要{value} 个参数|{name} expects {value} argument(s).
{name} 的第二个参数必须是求导/积分/求和的变量，例如 {value}(x^2, x)|The second argument of {name} must be a variable, as in {value}(x^2, x).
定积分需要 4 个参数（被积函数、积分变量、下限、上限）|A definite integral needs four arguments: the integrand, variable, lower limit, and upper limit.
无法处理这个表达式|This expression could not be evaluated.
关系符号左侧缺少表达式|Enter an expression to the left of the relation.
关系符号右侧缺少表达式，请继续输入|Enter an expression to the right of the relation.
坐标或参数曲线只能有两个分量|Use two coordinates for a point or parametric curve.
坐标的两个分量都不能为空|Enter both coordinates.
一个表达式只能包含一个关系符号，请拆成多条表达式|Use one relation symbol per expression. Split this into separate expressions.
坐标点与参数曲线不能直接使用 x 或 y，请改用 t 或滑块变量|Use t or a slider variable in coordinates in place of x or y.
参数曲线只能使用一个参数：t 或 θ|Use a single parameter, t or θ, for a parametric curve.
函数定义只能使用等号|Use an equals sign to define a function.
“{value}” 不能作为函数名，请使用 f、g、h 等字母|Choose a function name such as f, g, or h. “{value}” is reserved.
极坐标暂不支持不等式|Polar inequalities are unavailable.
“{value}” 是保留名称，请换一个滑块变量名|Choose a different slider name. “{value}” is reserved.
滑块变量请使用单个字母或带下标的字母，例如 a、b、a_1|Use a single letter or a letter with a subscript for the slider, such as a, b, or a_1.
滑块定义只能使用等号|Use an equals sign to define a slider.
方程或不等式中需要包含 x 或 y|Include x or y in the equation or inequality.
函数 “{value}” 出现了循环引用|Function “{value}” has a circular reference.
函数 “{value}” 需要 1 个参数|Function “{value}” expects one argument.
函数 “{value}” 未定义|Function “{value}” is undefined.
函数 “{value}” 被重复定义|Function “{value}” is defined more than once.
范围起点不能为空|Enter the start of the range.
范围终点不能为空|Enter the end of the range.
范围起点不能使用变量 “{value}”|The start of the range cannot use “{value}”.
范围终点不能使用变量 “{value}”|The end of the range cannot use “{value}”.
范围起点不是有效数值|The start of the range must be a finite number.
范围终点不是有效数值|The end of the range must be a finite number.
范围起点必须小于终点|The start must be below the end of the range.
无法解析这个表达式|This expression could not be parsed.
无法展开函数引用|This function reference could not be resolved.
变量 “{value}” 被重复定义，请保留一条滑块定义|“{value}” is defined more than once. Keep one definition.
滑块值无法解析|The slider value could not be read.
无法计算滑块值，请检查是否存在循环引用或无效运算|The slider value could not be calculated. Check for circular references or undefined operations.
依赖的滑块 “{value}” 没有有效数值|Slider “{value}” has no valid value.
竖线的位置不是有效数值|The vertical line needs a finite x-coordinate.
坐标不是有效数值|The coordinates must be finite numbers.
暂不支持这种表达式|This expression type is unavailable.
无法绘制这个表达式|This expression could not be graphed.
限制条件需要比较符号，例如 {0 < x < 2}|Use a comparison in the restriction, such as {0 < x < 2}.
请在表达式末尾填写完整的花括号限制|Enter a complete restriction in braces at the end of the expression.
此处的限制条件需要使用直角坐标曲线或不等式|Use a Cartesian curve or inequality here to apply a restriction.
未定义变量：{value}|Undefined variables: {value}
添加滑块：{value}|Add sliders: {value}
限制条件|Restriction
限制条件。|Restrictions. 
在直角坐标曲线或不等式末尾加花括号，例如|Add braces at the end of a Cartesian curve or inequality, such as
。|.
`.trim().split('\n').map((line) => line.split('|')));

  const patterns = Array.from(translations).filter(([source]) => source.includes('{')).map(([source, target]) => {
    const names = [];
    const regex = source.split(/(\{\w+\})/).map((part, index) => {
      if (index % 2 === 1) {
        names.push(part);
        return '(.+?)';
      }
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }).join('');
    return { regex: new RegExp('^' + regex + '$'), names, target };
  });

  function t(value) {
    if (language !== 'en' || !value) return value;
    if (translations.has(value)) return translations.get(value);
    if (!/[\u3400-\u9fff]/.test(value)) return value;
    for (const { regex, names, target } of patterns) {
      const match = regex.exec(value);
      if (match) return target.replace(/\{\w+\}/g, (name) => match[names.indexOf(name) + 1]);
    }
    return value;
  }

  const bindings = new WeakMap();
  function localize(root) {
    if (!bindings.has(root)) {
      const entries = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
      let node = walker.currentNode;
      while (node) {
        if (node.nodeType === Node.TEXT_NODE && translations.has(node.data.trim())) {
          const textNode = node;
          const source = node.data;
          entries.push(() => { textNode.data = source.replace(source.trim(), () => t(source.trim())); });
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const element = node;
          for (const attribute of ['title', 'aria-label', 'content']) {
            const source = element.getAttribute(attribute);
            if (translations.has(source)) entries.push(() => element.setAttribute(attribute, t(source)));
          }
        }
        node = walker.nextNode();
      }
      bindings.set(root, entries);
    }
    for (const apply of bindings.get(root)) apply();
  }

  Plotsy.i18n = {
    t,
    localize,
    get language() { return language; },
    setLanguage(value) {
      language = value === 'en' ? 'en' : 'zh-CN';
      try { global.localStorage.setItem(preferenceKey, language); } catch (error) { /* Storage is optional. */ }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
