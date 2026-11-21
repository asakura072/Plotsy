# Plotsy · Graphing Calculator

English · [简体中文](README.zh-CN.md)

Plotsy is an offline graphing calculator inspired by Desmos. Edit LaTeX formulas directly in the expression list, with a math keypad that opens when a formula receives focus. Plotsy supports explicit and implicit curves, parametric and polar plots, named functions, derivatives, definite integrals, sums, and products. A local Rust/WebAssembly module accelerates curve sampling and implicit contouring.

## Quick start

Open `index.html` in Chrome, Edge, Firefox, or Safari. Select **EN** in the top bar for English or **中文** for Simplified Chinese. Plotsy remembers your language preference in the browser.

Keep `index.html`, `css/`, `js/`, `vendor/`, and `assets/` in their original relative locations. Formula editing, typesetting, calculation, and plotting all run in the browser without a server or an internet connection.

Each launch starts with a blank graph and one empty expression. Select **+** next to **Examples** to append an expression, or press **Enter** while editing to insert one below the current row. The new expression receives focus. You can clear the last remaining expression, and the delete button appears when the list has multiple rows.

## Features

- **Direct formula editing**. Click any expression to edit it in its MathLive field. MathLive and KaTeX render fractions, radicals, scripts, absolute values, and calculus notation.
- **Automatic keypad**. The full-width math keypad opens when you edit a formula or parameter bound. Click away or press `Esc` to dismiss it.
- **Input shortcuts**. Type `sin`, `cos`, `tan`, `ln`, `sqrt`, `int`, `sum`, `prod`, `inf`, or Greek letter names to insert the corresponding notation. Shortcuts work with slow typing, edits inside formulas, and pasted text. For example, `xpi` displays as `xπ`. The same shortcuts work in parametric and polar bounds.
- **Editable placeholders**. Radicals, absolute values, and calculus bounds keep their placeholders when cleared. Backspace on an empty placeholder removes the enclosing template. Backspace in an empty superscript or subscript removes the script and leaves the base in place.
- **Calculus templates**. Typing `int` or `integral` inserts a definite integral with bounds. Typing `sum`, `prod`, or `product` inserts an operator with an index and bounds. The caret starts in the upper bound. Press `Tab` to reach the lower bound.
- **Named functions and constant results**. A bare function of `x` can receive a name such as `f` and be called from later expressions. Standalone constant expressions display their values. Use `y=2` or `f(x)=2` to plot a horizontal line.
- **Sliders**. Enter `y=mx+b` and select **Add sliders** to define `m` and `b`. Drag either slider to update the line.
- **Restrictions**. Enter `y=x^2{0<x<2}` to restrict a curve or `x^2+y^2<4{y>=0}` to shade the upper semicircle.
- **Curve tracing**. Click a curve to select it or another curve to switch. Click the selected curve again, click blank space, or press `Esc` to clear the selection. Move the pointer or drag on a touchscreen to trace the selected curve. Dots mark visible axis intercepts, curve intersections, and local extrema of explicit functions. Click a dot to pin its coordinates.
- **Offline plotting and export**. Supported expressions use WebAssembly for batch evaluation, with a JavaScript fallback. Use **Import** and **Export** to manage `.psy` projects and export high-resolution PNG images.
- **Responsive layout**. On desktop, the expression list sits beside the graph. On mobile it sits below the graph, with the same full-width keypad at the bottom.

## WebAssembly acceleration

- The Rust module in `wasm/` targets `wasm32-unknown-unknown` and has no third-party runtime dependencies.
- `js/plotsy_math_data.js` embeds the binary as base64 so the app can run from `file://` without a network request.
- `js/wasm.js` compiles supported expression ASTs to bytecode. `js/expression.js` attaches the bytecode to the corresponding plot objects.
- Explicit curves are sampled at 0.35-pixel intervals before rendering on Canvas.
- Implicit curves use a 3-pixel marching squares grid, reduced to 2 pixels during export. The original grid used 6-pixel cells.
- Parametric sampling increases from 1,800 to 3,600 steps. Polar sampling increases from 2,200 to 4,400 steps.
- When WebAssembly is unavailable or cannot evaluate an expression, JavaScript evaluates it instead.
- WebAssembly uses IEEE 754 `f64`, the same numeric precision as JavaScript's `Number`. Denser sampling and a finer contour grid improve the rendered curves.

To rebuild the WebAssembly module on Windows, run the following command.

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-wasm.ps1
```

The script compiles the Rust crate, copies `wasm/plotsy_math.wasm`, and regenerates `js/plotsy_math_data.js`.

A previous local Chromium benchmark evaluated `sin(x)+x^2/3+cos(2x)` at 200,000 points over five runs. JavaScript closures took about 175.5 ms and batch WebAssembly took about 65.4 ms, a 2.68× speedup. The sums of the results matched in that test. Performance varies with the machine, expression, and batch size.

## Math keypad

The keypad opens across the bottom of the page when you edit a formula or parameter bound. Mathematical key labels are typeset in LaTeX.

| Tab | Contents |
| --- | --- |
| Keypad | Numbers, arithmetic, comparisons, fractions, radicals, common variables and constants, arrow keys, Backspace, and Enter |
| Functions & calculus | 43 common and special functions, plus derivative, definite integral, summation, and product keys |
| ABC/αβγ | English and Greek letters share the same three-row QWERTY positions. Select `αβγ` or `ABC` to switch alphabets and `⇧` to change case. |

Use the arrow keys to move the caret through fractions, superscripts, and subscripts. The **Examples** button in the expression panel opens a gallery of 13 formulas that you can insert.

The `×` key inserts a centered multiplication dot `·`. Both `÷` and the fraction key insert a fraction with numerator and denominator placeholders.

Tap the colored dot beside an expression to show or hide its plot. Press and hold it to open the 3×3 palette. Choose a preset or select the multicolored dot to open the custom color picker, which includes a hue slider and a HEX field.

- `a^b` inserts a superscript and moves the caret into it. `a_b` does the same for a subscript.
- Clearing a script leaves it in place for editing. Press Backspace in an empty script to turn `x^{}` or `x_{}` back into `x`.
- Select `ⁿ√` in **Functions & calculus** to insert a radical with an editable index.
- Select part of a formula before pressing a function key to use the selection as its argument.
- Separate multiple function arguments with commas. Press `Tab` to move between available placeholders.

## Input rules

Parentheses are optional for simple function arguments.

```text
sin x        →  sin(x)
cos x        →  cos(x)
sinx         →  sin(x)
sin(x)       →  sin(x)
sin(2x)      →  sin(2x)
```

Use parentheses for compound arguments. Plotsy interprets `sin 2x` as `(sin 2) · x`, so write `sin(2x)` to apply sine to the entire product.

Adjacent letters and numbers can imply multiplication.

```text
2x    3ab    ab    x2
```

Variables can be single letters or have a subscript.

```text
a = 1.5      a_1 = 2      x_2
```

Available constants include `pi` or `π`, `e`, `tau`, `phi`, and `inf` or `∞`. Use `θ` or `theta` in polar equations.

### Automatic shortcuts

| Input | Result |
| --- | --- |
| `int` | `∫` |
| `erf`, `erfc` | Typeset error and complementary error functions. Type `c` after a converted `erf` to change it to `erfc`. |
| `sum` | `∑` |
| `prod` | `∏` |
| `inf` | `∞` |
| `alpha`, `beta`, `gamma`, `theta`, `pi`, `omega`, … | `α`, `β`, `γ`, `θ`, `π`, `ω`, … |

**Functions & calculus** also inserts definite integral, sum, and product templates with empty bounds.

## Named functions, constants, and references

- Bare expressions with `x` as their only independent variable can become `f(x)=…`, `g(x)=…`, and so on. Examples include `sin(x)`, `x^2`, and `a*sin(x)` when `a` is a slider.
- Explicit equations such as `y=sin(x)` retain their `y=` form. An equation such as `y=2` plots a horizontal line.
- Equations starting with `x=` are implicit plots. For example, `x=2` plots a vertical line.
- Single-variable assignments such as `a=2` define sliders.
- Implicit curves, parametric curves, polar plots, points, and inequalities receive small identification labels such as `a`, `b`, and `c`. Callable function names come from explicit function definitions such as `f(x)=…`.
- Standalone expressions that evaluate to constants display their results in the expression list.

```text
2 + 2                    →  Result = 4
integral(x^2, x, 0, 1)    →  Result ≈ 0.333333333333
diff(5, x)                →  Derivative result = 0
```

To plot a horizontal line, write `y = 2` or `f(x) = 2`.

Call named functions from later formulas using expressions such as `f(2x)`, `f(t)`, `f(g(x))`, or `f(x) + 1`. Plotsy substitutes the argument into the function body before compilation and reports errors for self-references and circular references.

## Supported expressions

| Type | Example | Behavior |
| --- | --- | --- |
| Bare function of `x` | `sin x`, `x^2`, `a*sin(x)` | Assigns a name such as `f(x)` and plots it |
| Explicit equation | `y = sin(x)`, `y = 2` | Preserves the `y=` form |
| Named constant function | `f(x) = 2` | Plots a horizontal line |
| Constant result | `2 + 2`, `integral(x^2, x, 0, 1)` | Displays a numeric result |
| Implicit equation | `x^2 + y^2 = 9`, `x = 2` | Plots an implicit curve or a vertical line |
| Assignment | `a = 2` | Defines a slider |
| Inequality | `y > x^2 - 2` | Supports `<`, `>`, `<=`, `>=`, `≤`, and `≥` |
| Domain or region restriction | `y=x^2{0<x<2}`, `x^2+y^2<4{y>=0}` | Accepts one or more trailing conditions in braces |
| Parametric curve | `(cos(3t), sin(2t))` | Uses `0 ≤ t ≤ 2π` by default |
| Polar curve | `r = 2 + 2cos(θ)` | Uses `0 ≤ θ ≤ 2π` by default |
| Point | `(1, 2)` | Coordinates can reference sliders |
| Slider | `a = 1.5`, `a_1 = 2` | Accepts a single-letter or subscripted name |
| Conditional function | `y = if(x > 0, x, -x)` | Defines a piecewise function |
| Derivative | `diff(x^2, x)` | Also available from **Functions & calculus** |
| Definite integral | `integral(x^2, x, 0, 1)` | Takes a lower and upper bound |
| Sum or product | `sum(n*x, n, 1, 10)`, `product(x+n, n, 1, 4)` | Takes an index and bounds |

The function keypad includes `sin`, `cos`, `tan`, `cot`, `sec`, `csc`, `asin` or `arcsin`, `acos` or `arccos`, `atan` or `arctan`, `atan2`, `sinh`, `cosh`, `tanh`, `asinh`, `acosh`, `atanh`, `sqrt`, `nthroot`, `abs`, `exp`, `ln`, `log`, `log2`, `log10`, `floor`, `ceil`, `round`, `sign`, `min`, `max`, `mod`, `pow`, `hypot`, `clamp`, `if`, and the special functions below.

| Function | Key | Accepted forms | Notes |
| --- | --- | --- | --- |
| Riemann zeta | `ζ` | `zeta(x)`, `ζ(x)`, `\zeta(x)` | Real-valued zeta |
| Error function | `erf` | `erf(x)` | Real-valued error function |
| Complementary error function | `erfc` | `erfc(x)` | Equals `1-erf(x)` and evaluates the tail directly for large positive inputs |
| Gamma | `Γ` | `gamma(x)`, `Γ(x)`, `\Gamma(x)` | Gamma function |
| Digamma | `ψ` | `digamma(x)`, `psi(x)`, `ψ(x)`, `\psi(x)` | Uses an unsubscripted psi |
| Polygamma | `ψₙ` | `polygamma(n,x)`, `ψ_n(x)`, `\psi_{n}(x)` | The subscript `n` is the order |
| Lambert W, branch 0 | `W` | `lambertw(x)`, `W(x)` | Use an unsubscripted W |
| Lambert W, branch −1 | `W₋₁` | `lambertwminus(x)`, `W_{-1}(x)` | The −1 branch |

Special-function keys insert LaTeX and position the caret in the argument. The polygamma key first selects the order subscript. Plotsy also recognizes typed LaTeX and the equivalent Unicode forms in the table.

### Differentiating special functions

Prime notation works in expressions such as `sin'(x)`, `f'(x)`, `(x^2)'`, `ζ'(x)`, `Γ'(5)`, `ψ_2'(x)`, and `W_{-1}'(-0.1)`.

- `Γ'(x) = Γ(x) ψ(x)`
- `ψ'(x) = ψ_1(x)`
- `ψ_n'(x) = ψ_{n+1}(x)` when differentiating with respect to `x`
- `W'(x) = W(x) / (x(1+W(x)))` for both supported branches
- `ζ'(x)` retains its prime notation and can be plotted as an explicit function.

## Calculus

The operation keys are in **Functions & calculus**.

1. **Derivative.** Insert the `d/dx` operator on the current row. Enter the function to display the derivative beside the original notation and plot the result.
2. **Higher derivatives.** Insert another derivative operator to differentiate again. Enter the operand directly after the nested operators.
3. **Definite integral.** Insert `∫_□^□ dx` with two empty bounds. Enter the integrand between the bounds and `dx`.
4. **Summation and product.** The default index is `i`. Set its start and end values, for example `i = 1` and `10`, then enter the term.

You can nest these operations, such as a sum inside an integral or a derivative inside a sum. Plotsy simplifies symbolic derivatives, applies adaptive Simpson integration to definite integrals, and evaluates sums and products at integer indices. Operations that evaluate to constants display their values. Use `f(x)=…` or `y=…` to graph a constant result.

Write infinity as `inf` or `∞`. The parser recognizes infinite bounds. Divergent integrals and sums do not yield numeric results.

## Import and export

### Project files (.psy)

Select **Export → Export project** to save the current graph. Browsers with a native save picker let you choose the directory and enter a filename. In other browsers, enter a filename, right-click **Save link**, and choose **Save link as**.

A `.psy` file is UTF-8 text and stores the following project data.

- Original expression text, LaTeX, and colors
- Generated names such as `f`, `g`, and `b`
- Expression visibility
- Slider and curve parameter bounds
- View center and zoom level
- Grid, axes, labels, and angle units

Restore a project with **Import** or by dragging the file into the window. You can rename the file while keeping its `.psy` extension.

The first line is `plotsy 1`. Each subsequent line is a record. Blank lines and indentation are optional. This example hides the grid and plots a blue parabola.

```text
plotsy 1
view 0 0 64
grid off
expr "y=x^2"
  color #2563eb
```

- `view` stores the center coordinates and scale. Before the first expression, use `grid`, `minor-grid`, `axes`, or `labels` with `on` or `off`, and `angle` with `rad` or `deg`.
- Each `expr` may be followed by `latex "…"`, `color #rrggbb`, `name function "f"`, `hidden`, `bounds "0" "2π"`, or `slider -10 10 0.1`. Name types are `function`, `graph`, and `parameter`.
- Wrap text arguments in double quotes. Use `\\` for a backslash, `\"` for a double quote, and `\n` for a line break.

### Images (PNG)

**Export → Export image** uses the same save flow and produces a high-resolution PNG at approximately 2.5× the viewport resolution. The image includes the current view, curves, shaded regions, and a small watermark in the lower-right corner.

## Tests

Run `node --test scripts/test-math.js` to check formula conversion, restrictions, slider dependencies, calculus, and curve tracing. The unit tests use bundled files.

The browser suite covers language switching, keypad input, plotting, project import and export, and touchscreen coordinates. On the first run, install Playwright and Chromium, then run the suite.

```powershell
npm install --no-save --package-lock=false playwright
npx playwright install chromium
node scripts/test-browser.js
```

The suite runs Chromium in headless mode and saves screenshots to `screenshots/`. Set `PLOTSY_BROWSER_EXECUTABLE` to use an existing Chromium executable.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Enter` | Add an expression below the current one |
| `Ctrl/Cmd + O` | Import a .psy project |
| `Ctrl/Cmd + S` | Export a .psy project |
| `Ctrl/Cmd + E` | Export a PNG image |
| `?` | Open help |
| `0` | Reset the view while the graph has focus |
| Arrow keys | Pan while the graph has focus |
| `+` / `-` | Zoom while the graph has focus |

The formula caret controls when the math keypad opens and closes.

## Project structure

```text
.
├── index.html              # Page structure, icon sprite, keypad, and help
├── css/
│   └── styles.css          # Design tokens, layout, and responsive styles
├── js/
│   ├── parser.js           # Parser, implicit multiplication, subscripts, and calculus
│   ├── expression.js       # Classification, function expansion, compilation, and plot objects
│   ├── wasm.js             # AST to f64 bytecode, batch evaluation, and fallback
│   ├── plotsy_math_data.js # Generated base64 WebAssembly for offline loading
│   ├── latex.js            # AST to LaTeX and KaTeX rendering
│   ├── mathfield.js        # MathLive adapter, shortcuts, calculus templates, and editing
│   ├── graph.js            # Canvas rendering, sampling, implicit contours, and interaction
│   ├── graph-geometry.js   # Hit testing, tracing, intersections, and local extrema
│   ├── project-file.js     # Reading and writing .psy project files
│   └── app.js              # UI state, naming, keypad, and import and export
├── wasm/
│   ├── Cargo.toml          # Rust WebAssembly crate
│   ├── src/lib.rs          # Batch f64 evaluator
│   └── plotsy_math.wasm    # Compiled module
├── scripts/
│   └── build-wasm.ps1      # Compile WebAssembly and regenerate base64 data
├── vendor/
│   ├── katex/              # Bundled KaTeX JavaScript, styles, fonts, and MIT license
│   └── mathlive/           # Bundled MathLive JavaScript, styles, fonts, and MIT license
├── assets/
│   └── favicon.svg
├── preview.png
├── README.md              # English
└── README.zh-CN.md        # Simplified Chinese
```

## Implementation notes

- **Formula editing.** A MathLive `<math-field>` both displays and edits each formula.
- **Keypad layout.** When a MathLive field gains focus, `.app` adds bottom padding for the fixed keypad. The currently edited expression scrolls into view.
- **Input shortcuts.** Formula and parameter-bound fields share MathLive shortcuts. Spelled-out names such as `pi`, `theta`, `alpha`, and `Gamma` convert as soon as the spelling is complete, including when typed next to other symbols.
- **Function expansion.** Bare expressions with `x` as the sole independent variable get names. Explicit `y=…` equations retain their form, `x=…` is implicit, and `a=…` defines a slider. For a call such as `f(2x)`, the compiler substitutes the argument AST for `x` and expands nested calls.
- **Constant detection.** Plotsy tests bare expressions at several `x` samples to decide whether to display a value or pass the expression to the plotter.
- **Calculus.** The parser handles `diff`, `integral`, `sum`, and `product`. Derivatives can nest, and the compiler recursively compiles the bodies of integrals, sums, and products.
- **Evaluation pipeline.** The parser builds an AST and compiles it to closures or WebAssembly bytecode. Unknown functions and variables produce error messages.
- **Sampling.** Explicit functions use subpixel samples, parametric and polar curves use denser sampling, and implicit contours use a finer marching squares grid. Supported paths use WebAssembly with a JavaScript fallback.
- **Offline operation.** The app ships with MathLive, KaTeX, fonts, WebAssembly, and scripts locally.

## Third-party licenses

- [KaTeX](https://katex.org/) 0.16.11 uses the MIT license.
- [MathLive](https://mathlive.io/) 0.105.0 uses the MIT license. The bundled copy includes a fix for the previous formula field reclaiming focus after an expression switch.

See [KaTeX LICENSE](vendor/katex/LICENSE) and [MathLive LICENSE](vendor/mathlive/LICENSE.txt) for the license texts.

## Browser support

Use a recent version of Chrome, Edge, Firefox, or Safari. Plotsy uses Custom Elements, Canvas 2D, WebAssembly, ResizeObserver, HTML dialogs, Blob, and Pointer Events.

## Development

Open `index.html` directly and refresh the page after editing source files. The app runs with the bundled WebAssembly binary.

Run the following commands to check JavaScript syntax.

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
