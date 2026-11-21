/*
 * Plotsy · 应用控制器
 * 负责表达式列表、滑块、设置和离线文件导入导出。
 */
(function () {
  'use strict';

  const Plotsy = window.Plotsy;
  if (!Plotsy || !Plotsy.math || !Plotsy.expr || !Plotsy.Graph) {
    throw new Error('Plotsy scripts loaded out of order');
  }

  const utils = Plotsy.graphUtils;
  const PALETTE = utils.PALETTE;
  const { t, localize } = Plotsy.i18n;
  const projectFile = Plotsy.projectFile;
  const MAX_EXPRESSIONS = 100;
  const MAX_RAW_LENGTH = 2000;
  const MAX_LATEX_LENGTH = 8000;
  const MAX_PROJECT_FILE_SIZE = 2 * 1024 * 1024;
  const BOUND_LABELS = { min: '参数范围起点', max: '参数范围终点' };
  const DEFAULT_SETTINGS = {
    grid: true,
    minorGrid: true,
    axes: true,
    labels: true,
    angleMode: 'rad'
  };

  const FUNCTION_NAME_POOL = 'fghijklmnopqrstuvwxyz'.split('');
  const GRAPH_NAME_POOL = 'abcdghijklmnopqrstuvwxyz'.split('');
  const NAME_RESERVED = new Set([
    'x', 'y', 'r', 't', 'theta', 'pi', 'e', 'tau', 'phi', 'inf', 'infinity',
    ...Object.keys(Plotsy.math.functions),
    ...Object.keys(Plotsy.math.constants)
  ]);

  const KEYPAD_NUMBERS = [
    ...'7894561230.'.split('').map((label) => ({ label, latex: label })),
    { label: '=', latex: '=', title: '等号' }
  ];
  const KEYPAD_FRACTION = { latex: '\\frac{\\placeholder{}}{\\placeholder{}}', placeholder: true };
  const KEYPAD_OPERATORS = [
    { label: '+', latex: '+', title: '加号' },
    { label: '−', latex: '-', title: '减号' },
    { label: '×', latex: '\\cdot', preview: '\\times', title: '乘号' },
    { ...KEYPAD_FRACTION, label: '÷', preview: '\\div', title: '除号' },
    { ...KEYPAD_FRACTION, label: '分数', preview: '\\tfrac{\\square}{\\square}', title: '分数' },
    { label: '√', latex: '\\sqrt{\\placeholder{}}', preview: '\\sqrt{\\square}', title: '平方根', placeholder: true },
    ...'xyt'.split('').map((label) => ({ label, latex: label })),
    { label: 'θ', latex: '\\theta', title: '极角 theta' },
    { label: 'π', latex: '\\pi', title: '圆周率 pi' },
    { label: 'e', latex: 'e', title: '自然常数 e' },
    { label: '<', latex: '<', title: '小于' },
    { label: '>', latex: '>', title: '大于' },
    { label: '≤', latex: '\\le', title: '小于等于' },
    { label: '≥', latex: '\\ge', title: '大于等于' },
    { label: '∞', latex: '\\infty', title: '无穷大' },
    { label: '{ }', latex: '\\left\\{\\placeholder{}\\right\\}', preview: '\\{\\square\\}', title: '限制条件', placeholder: true },
    { label: '(', latex: '(' },
    { label: ')', latex: ')' },
    { label: ',', latex: ',', title: '逗号' },
    { label: '| |', latex: '\\left|\\placeholder{}\\right|', preview: '|\\square|', title: '绝对值', placeholder: true },
    { label: 'a^b', preview: 'a^b', script: '^', title: '上标 / 乘方' },
    { label: 'a_b', preview: 'a_b', script: '_', title: '下标' }
  ];
  const KEYPAD_CONTROLS = [
    { label: '←', preview: '\\leftarrow', move: 'left', title: '光标左移' },
    { label: '↑', preview: '\\uparrow', move: 'up', title: '光标上移' },
    { label: '↓', preview: '\\downarrow', move: 'down', title: '光标下移' },
    { label: '→', preview: '\\rightarrow', move: 'right', title: '光标右移' },
    { label: '⌫', preview: '\\text{⌫}', action: 'backspace', title: '退格删除' },
    { label: '↵', preview: '\\hookleftarrow', action: 'enter', title: '回车' }
  ];

  const KEYPAD_FUNCTION_GROUPS = [
    {
      title: '特殊函数',
      items: [
        { name: 'erf', desc: '误差函数' },
        { name: 'erfc', desc: '互补误差函数' },
        { name: 'zeta', label: 'ζ', desc: 'Riemann zeta' },
        { name: 'gamma', label: 'Γ', desc: 'Gamma 函数' },
        { name: 'digamma', label: 'ψ', desc: 'Digamma 函数' },
        { name: 'polygamma', label: 'ψₙ', desc: '多 Gamma（下标为阶数）' },
        { name: 'lambertw', label: 'W', desc: 'Lambert W（0 分支）' },
        { name: 'lambertwminus', label: 'W₋₁', desc: 'Lambert W（-1 分支）' }
      ]
    },
    {
      title: '三角函数',
      items: [
        { name: 'sin', desc: '正弦' },
        { name: 'cos', desc: '余弦' },
        { name: 'tan', desc: '正切' },
        { name: 'cot', desc: '余切' },
        { name: 'sec', desc: '正割' },
        { name: 'csc', desc: '余割' },
        { name: 'asin', desc: '反正弦' },
        { name: 'acos', desc: '反余弦' },
        { name: 'atan', desc: '反正切' }
      ]
    },
    {
      title: '双曲函数',
      items: [
        { name: 'sinh', desc: '双曲正弦' },
        { name: 'cosh', desc: '双曲余弦' },
        { name: 'tanh', desc: '双曲正切' },
        { name: 'asinh', desc: '反双曲正弦' },
        { name: 'acosh', desc: '反双曲余弦' },
        { name: 'atanh', desc: '反双曲正切' }
      ]
    },
    {
      title: '根式、指数与对数',
      items: [
        { name: 'sqrt', desc: '平方根' },
        { name: 'nthroot', desc: 'n 次方根' },
        { name: 'abs', desc: '绝对值' },
        { name: 'exp', desc: '自然指数' },
        { name: 'ln', desc: '自然对数' },
        { name: 'log', desc: '常用对数' },
        { name: 'log2', desc: '以 2 为底' },
        { name: 'log10', desc: '以 10 为底' }
      ]
    },
    {
      title: '取整与符号',
      items: [
        { name: 'floor', desc: '向下取整' },
        { name: 'ceil', desc: '向上取整' },
        { name: 'round', desc: '四舍五入' },
        { name: 'sign', desc: '符号函数' }
      ]
    },
    {
      title: '组合与条件',
      items: [
        { name: 'min', desc: '最小值', insert: 'min(, )' },
        { name: 'max', desc: '最大值', insert: 'max(, )' },
        { name: 'mod', desc: '取余', insert: 'mod(, )' },
        { name: 'pow', desc: '幂函数', insert: 'pow(, )' },
        { name: 'hypot', desc: '平方和开根', insert: 'hypot(, )' },
        { name: 'clamp', desc: '限制区间', insert: 'clamp(, , )' },
        { name: 'atan2', desc: '两参数反正切', insert: 'atan2(, )' },
        { name: 'if', desc: '条件分支', insert: 'if(, , )' }
      ]
    }
  ];

  const EXAMPLES = [
    { label: '正弦曲线', sample: 'y = sin(x)', latex: 'y=\\sin(x)' },
    { label: '抛物线', sample: 'y = 0.5x^2 - 2', latex: 'y=0.5x^{2}-2' },
    { label: '圆', sample: 'x^2 + y^2 = 9', latex: 'x^{2}+y^{2}=9' },
    { label: '区域填充', sample: 'x^2 + y^2 <= 9', latex: 'x^{2}+y^{2}\\le 9' },
    { label: '不等式', sample: 'y > x^2 - 2', latex: 'y>x^{2}-2' },
    { label: '参数曲线', sample: '(cos(3t), sin(2t))', latex: '\\left(\\cos(3t),\\sin(2t)\\right)' },
    { label: '极坐标', sample: 'r = 2 + 2cos(θ)', latex: 'r=2+2\\cos(\\theta)' },
    { label: '点', sample: '(1.5, 2)', latex: '\\left(1.5,2\\right)' },
    { label: '分段函数', sample: 'if(x > 0, x, -x)', latex: 'y=\\operatorname{if}\\left(x>0,x,-x\\right)' },
    { label: '滑块', sample: 'a = 1.5', latex: 'a=1.5' },
    { label: '垂直线', sample: 'x = 2', latex: 'x=2' },
    { label: '平方根', sample: 'y = sqrt(x)', latex: 'y=\\sqrt{x}' },
    { label: '导数示例', sample: 'd/dx ( x² ) = 2x', latex: '\\frac{d}{dx}\\left(x^{2}\\right)', desc: '添加一张导数示例卡片' }
  ];

  const KEYPAD_CALCULUS = [
    {
      label: '导数',
      kind: 'diff',
      sample: 'd/dx ( )',
      latex: '\\frac{d}{dx}',
      desc: '反复点击得到二阶、三阶导数'
    },
    {
      label: '定积分',
      kind: 'integral',
      sample: '∫ₐᵇ ( ) dx',
      latex: '\\int_{\\placeholder{}}^{\\placeholder{}}\\,dx',
      desc: '上下限留空，填写后绘图'
    },
    {
      label: 'Sigma 求和',
      kind: 'sum',
      sample: '∑ᵢ₌?^?',
      latex: '\\sum_{i=\\placeholder{}}^{\\placeholder{}}',
      desc: '上下限留空'
    },
    {
      label: '连乘',
      kind: 'product',
      sample: '∏ᵢ₌?^?',
      latex: '\\prod_{i=\\placeholder{}}^{\\placeholder{}}',
      desc: '上下限留空'
    }
  ];

  const ENGLISH_CASE_KEYS = Object.fromEntries(
    'abcdefghijklmnopqrstuvwxyz'.split('').map((letter) => [
      letter,
      {
        lower: letter,
        lowerLatex: letter,
        upper: letter.toUpperCase(),
        upperLatex: letter.toUpperCase()
      }
    ])
  );

  const QWERTY_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

  // Modern Greek key positions, keyed by the shared QWERTY layout.
  const GREEK_CASE_KEYS = {
    q: { lower: ';', lowerLatex: ';', upper: ':', upperLatex: ':', lowerTitle: '希腊语问号', upperTitle: '冒号' },
    w: { lower: 'ς', lowerLatex: '\\varsigma', upper: 'Σ', upperLatex: '\\Sigma' },
    e: { lower: 'ε', lowerLatex: '\\varepsilon', upper: 'Ε', upperLatex: 'Ε' },
    r: { lower: 'ρ', lowerLatex: '\\rho', upper: 'Ρ', upperLatex: 'Ρ' },
    t: { lower: 'τ', lowerLatex: '\\tau', upper: 'Τ', upperLatex: 'Τ' },
    y: { lower: 'υ', lowerLatex: '\\upsilon', upper: 'Υ', upperLatex: 'Υ' },
    u: { lower: 'θ', lowerLatex: '\\theta', upper: 'Θ', upperLatex: 'Θ' },
    i: { lower: 'ι', lowerLatex: '\\iota', upper: 'Ι', upperLatex: 'Ι' },
    o: { lower: 'ο', lowerLatex: 'ο', upper: 'Ο', upperLatex: 'Ο' },
    p: { lower: 'π', lowerLatex: '\\pi', upper: 'Π', upperLatex: 'Π' },
    a: { lower: 'α', lowerLatex: '\\alpha', upper: 'Α', upperLatex: 'Α' },
    s: { lower: 'σ', lowerLatex: '\\sigma', upper: 'Σ', upperLatex: 'Σ' },
    d: { lower: 'δ', lowerLatex: '\\delta', upper: 'Δ', upperLatex: 'Δ' },
    f: { lower: 'φ', lowerLatex: '\\varphi', upper: 'Φ', upperLatex: 'Φ' },
    g: { lower: 'γ', lowerLatex: '\\gamma', upper: 'Γ', upperLatex: 'Γ' },
    h: { lower: 'η', lowerLatex: '\\eta', upper: 'Η', upperLatex: 'Η' },
    j: { lower: 'ξ', lowerLatex: '\\xi', upper: 'Ξ', upperLatex: 'Ξ' },
    k: { lower: 'κ', lowerLatex: '\\kappa', upper: 'Κ', upperLatex: 'Κ' },
    l: { lower: 'λ', lowerLatex: '\\lambda', upper: 'Λ', upperLatex: 'Λ' },
    z: { lower: 'ζ', lowerLatex: '\\zeta', upper: 'Ζ', upperLatex: 'Ζ' },
    x: { lower: 'χ', lowerLatex: '\\chi', upper: 'Χ', upperLatex: 'Χ' },
    c: { lower: 'ψ', lowerLatex: '\\psi', upper: 'Ψ', upperLatex: 'Ψ' },
    v: { lower: 'ω', lowerLatex: '\\omega', upper: 'Ω', upperLatex: 'Ω' },
    b: { lower: 'β', lowerLatex: '\\beta', upper: 'Β', upperLatex: 'Β' },
    n: { lower: 'ν', lowerLatex: '\\nu', upper: 'Ν', upperLatex: 'Ν' },
    m: { lower: 'μ', lowerLatex: '\\mu', upper: 'Μ', upperLatex: 'Μ' }
  };

  const $ = (selector, root) => (root || document).querySelector(selector);
  const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));

  const refs = {
    app: $('#app'),
    languageBtn: $('#languageBtn'),
    importBtn: $('#importBtn'),
    exportBtn: $('#exportBtn'),
    exportMenu: $('#exportMenu'),
    newBtn: $('#newBtn'),
    helpBtn: $('#helpBtn'),
    keypad: $('#keypad'),
    keypadPanels: $('#keypadPanels'),
    exprList: $('#exprList'),
    exprCount: $('#exprCount'),
    sidebarScroll: $('#sidebarScroll'),
    graphPane: $('#graphPane'),
    graphCanvas: $('#graphCanvas'),
    overlayCanvas: $('#overlayCanvas'),
    zoomIn: $('#zoomIn'),
    zoomOut: $('#zoomOut'),
    resetView: $('#resetView'),
    settingsBtn: $('#settingsBtn'),
    settingsPanel: $('#settingsPanel'),
    settingsClose: $('#settingsClose'),
    gridToggle: $('#gridToggle'),
    minorToggle: $('#minorToggle'),
    axesToggle: $('#axesToggle'),
    labelsToggle: $('#labelsToggle'),
    fitViewBtn: $('#fitViewBtn'),
    resetSettingsBtn: $('#resetSettingsBtn'),
    scaleReadout: $('#scaleReadout'),
    coordReadout: $('#coordReadout'),
    coordX: $('#coordX'),
    coordY: $('#coordY'),
    angleBadge: $('#angleBadge'),
    dropOverlay: $('#dropOverlay'),
    fileInput: $('#fileInput'),
    helpDialog: $('#helpDialog'),
    examplesBtn: $('#examplesBtn'),
    addBtn: $('#addBtn'),
    examplesDialog: $('#examplesDialog'),
    examplesGrid: $('#examplesGrid'),
    confirmDialog: $('#confirmDialog'),
    confirmNewBtn: $('#confirmNewBtn'),
    saveDialog: $('#saveDialog'),
    saveFilename: $('#saveFilename'),
    saveLink: $('#saveLink'),
    colorPopover: $('#colorPopover'),
    colorGrid: $('#colorGrid'),
    colorPresets: $('#colorPresets'),
    colorEditor: $('#colorEditor'),
    colorPlane: $('#colorPlane'),
    colorHue: $('#colorHue'),
    colorBack: $('#colorBack'),
    customSwatch: $('#customSwatch'),
    customColor: $('#customColor'),
    toast: $('#toast'),
    toastText: $('#toastText'),
    toastIcon: $('#toastIcon')
  };

  let state = null;
  let graph = null;
  let results = Object.create(null);
  let analyses = new Map();
  const cardRefs = new Map();
  let activeExpressionId = null;
  let activeBoundKey = null;
  let keypadOpen = false;
  let activeKeypadTab = 'main';
  let letterCase = 'lower';
  let greekMode = false;
  let refreshRaf = 0;
  let toastTimer = 0;
  let toastMessage = '';
  let toastCleanupTimer = 0;
  let activeColorId = null;
  let draftColor = null;
  let dragDepth = 0;
  let exportingFile = false;
  let pendingExport = null;

  function uid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return 'e_' + window.crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    }
    return 'e_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function findExpression(id) {
    return state.expressions.find((expression) => expression.id === id) || null;
  }

  function nextColor() {
    if (!state) return PALETTE[0].value;
    const used = new Set(state.expressions.map((expression) => expression.color));
    const unused = PALETTE.find((color) => !used.has(color.value));
    if (unused) return unused.value;
    return PALETTE[state.expressions.length % PALETTE.length].value;
  }

  function createExpression(raw, color, latex) {
    return {
      id: uid(),
      raw: typeof raw === 'string' ? raw : '',
      latex: typeof latex === 'string' ? latex : '',
      name: '',
      nameKind: '',
      color: color || nextColor(),
      hidden: false,
      bounds: { ...Plotsy.expr.defaults.bounds },
      slider: { ...Plotsy.expr.defaults.slider }
    };
  }

  function nextName(pool, used) {
    for (const name of pool) {
      if (!used.has(name) && !NAME_RESERVED.has(name)) return name;
    }
    return '';
  }

  function isXOnlyFunction(analysis, parameterNames) {
    if (!analysis || analysis.kind !== 'explicit' || !analysis.bare) return false;
    const variables = analysis.variables || new Set();
    let hasX = false;
    for (const name of variables) {
      if (name === 'x') {
        hasX = true;
        continue;
      }
      if (parameterNames.has(name)) continue;
      return false;
    }
    return hasX;
  }

  function collectParameterNames() {
    const names = new Set();
    for (const result of Object.values(results || {})) {
      if (result && result.kind === 'parameter' && result.name) names.add(result.name);
    }
    return names;
  }

  function assignExpressionNames(skipFunctionIds) {
    if (!state) return;
    const skipFunctions = skipFunctionIds || new Set();
    const details = new Map();
    const parameterNames = new Set();

    for (const expression of state.expressions) {
      let analysis = null;
      try {
        analysis = Plotsy.expr.analyze(expression.raw, expression);
      } catch (error) {
        analysis = null;
      }
      if (analysis && analysis.kind === 'parameter') parameterNames.add(analysis.name);
      details.set(expression.id, { analysis });
    }

    for (const expression of state.expressions) {
      const detail = details.get(expression.id);
      if (!detail) continue;
      const analysis = detail.analysis;
      let desired = 'none';
      if (analysis && analysis.kind === 'parameter') {
        desired = 'parameter';
      } else if (analysis && analysis.kind === 'explicit') {
        if (analysis.functionName) {
          desired = 'function';
        } else if (analysis.bare && !skipFunctions.has(expression.id) && isXOnlyFunction(analysis, parameterNames)) {
          desired = 'function';
        } else if (analysis.bare) {
          desired = 'none';
        } else {
          desired = 'relation';
        }
      } else if (analysis && ['implicit', 'vertical', 'polar', 'parametric', 'point'].includes(analysis.kind)) {
        desired = 'graph';
      } else if (analysis && analysis.kind === 'empty') {
        desired = 'none';
      }
      detail.desired = desired;
      detail.preferredName = analysis && analysis.functionName ? analysis.functionName : '';
    }

    const declaredNames = [...details.values()].map((detail) => detail.preferredName).filter(Boolean);
    const used = new Set([...NAME_RESERVED, ...parameterNames, ...declaredNames]);
    const preserved = new Set();

    for (const expression of state.expressions) {
      const detail = details.get(expression.id);
      if (!detail) continue;
      if (detail.desired === 'parameter') {
        expression.name = detail.analysis.name;
        expression.nameKind = 'parameter';
        used.add(expression.name);
        continue;
      }
      if (detail.desired === 'relation' || detail.desired === 'none') {
        expression.name = '';
        expression.nameKind = '';
        continue;
      }
      if (detail.preferredName && expression.name !== detail.preferredName) {
        expression.name = '';
        expression.nameKind = '';
      }
      if (detail.desired === 'function' && detail.preferredName) {
        expression.name = detail.preferredName;
        expression.nameKind = 'function';
        used.add(expression.name);
        preserved.add(expression.id);
        continue;
      }
      if (
        (detail.desired === 'function' || detail.desired === 'graph') &&
        expression.nameKind === detail.desired &&
        expression.name &&
        !used.has(expression.name)
      ) {
        used.add(expression.name);
        preserved.add(expression.id);
        continue;
      }
      if (detail.desired !== 'none' && expression.nameKind !== detail.desired) {
        expression.name = '';
        expression.nameKind = '';
      }
    }

    for (const expression of state.expressions) {
      const detail = details.get(expression.id);
      if (!detail || detail.desired !== 'function' || preserved.has(expression.id)) continue;
      const name = nextName(FUNCTION_NAME_POOL, used);
      expression.name = name;
      expression.nameKind = name ? 'function' : '';
      if (name) used.add(name);
    }

    for (const expression of state.expressions) {
      const detail = details.get(expression.id);
      if (!detail || detail.desired !== 'graph' || preserved.has(expression.id)) continue;
      const name = nextName(GRAPH_NAME_POOL, used);
      expression.name = name;
      expression.nameKind = name ? 'graph' : '';
      if (name) used.add(name);
    }

    for (const expression of state.expressions) {
      const detail = details.get(expression.id);
      if (!detail) continue;
      if (detail.desired === 'none' && !expression.raw.trim()) {
        expression.name = '';
        expression.nameKind = '';
      }
    }
  }

  function stripFunctionPrefix(text, isLatex) {
    let value = String(text || '');
    if (isLatex) {
      value = value.replace(/^\s*[a-z\u0370-\u03ff]\s*(?:\\left\s*)?\(\s*x\s*(?:\\right\s*)?\)\s*=\s*/i, '');
      value = value.replace(/^\s*y\s*=\s*/i, '');
    } else {
      value = value.replace(/^\s*[a-z\u0370-\u03ff]\s*\(\s*x\s*\)\s*=\s*/i, '');
      value = value.replace(/^\s*y\s*=\s*/i, '');
    }
    return value.trim();
  }

  function normalizeFunctionNotation() {
    if (!state) return;
    const parameterNames = collectParameterNames();
    for (const expression of state.expressions) {
      const result = results[expression.id];
      if (!result || result.status !== 'ok' || result.kind !== 'explicit') continue;
      if (expression.nameKind !== 'function' || !expression.name) continue;
      const analysis = analyses.get(expression.id);
      if (!analysis || !analysis.bare || !isXOnlyFunction(analysis, parameterNames)) continue;
      const local = cardRefs.get(expression.id);
      if (!local) continue;
      const active = document.activeElement;
      if (active === local.field || (local.field.contains && local.field.contains(active))) continue;

      const raw = String(expression.raw || '').trim();
      if (!raw) continue;
      const latex = String(expression.latex || '').trim();
      const bodyRaw = stripFunctionPrefix(raw, false);
      let bodyLatex = stripFunctionPrefix(latex, true);
      if (!bodyLatex) {
        const analysis = analyses.get(expression.id);
        if (analysis && analysis.ast && Plotsy.latex && typeof Plotsy.latex.astToLatex === 'function') {
          try { bodyLatex = Plotsy.latex.astToLatex(analysis.ast); } catch (error) { bodyLatex = ''; }
        }
      }
      if (!bodyRaw || !bodyLatex) continue;

      const nextRaw = expression.name + '(x)=' + bodyRaw;
      const nextLatex = expression.name + '(x)=' + bodyLatex;
      if (nextRaw === raw && nextLatex === latex) continue;

      expression.raw = nextRaw;
      expression.latex = nextLatex;
      if (Plotsy.mathfield) Plotsy.mathfield.setLatex(local.field, nextLatex, { focus: false });
    }
  }

  function blankProject() {
    return {
      viewport: { x: 0, y: 0, scale: 0 },
      settings: { ...DEFAULT_SETTINGS },
      expressions: [createExpression('', PALETTE[0].value)]
    };
  }

  function normalizeColor(value, index) {
    const color = String(value || '').trim();
    if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase();
    if (/^#[0-9a-f]{3}$/i.test(color)) {
      return '#' + color.slice(1).split('').map((ch) => ch + ch).join('').toLowerCase();
    }
    return PALETTE[index % PALETTE.length].value;
  }

  function normalizeProject(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('这不是 Plotsy 项目文件');
    }
    if (!Array.isArray(data.expressions)) {
      throw new Error('项目文件里没有表达式列表');
    }
    if (data.expressions.length > MAX_EXPRESSIONS) {
      throw new Error('表达式数量超过上限（' + MAX_EXPRESSIONS + ' 条）');
    }

    const expressions = data.expressions.map((entry, index) => {
      if (!entry || typeof entry !== 'object') {
        throw new Error('第 ' + (index + 1) + ' 条表达式格式不正确');
      }
      let raw = typeof entry.raw === 'string' ? entry.raw : '';
      if (raw.length > MAX_RAW_LENGTH) raw = raw.slice(0, MAX_RAW_LENGTH);
      let latex = typeof entry.latex === 'string' ? entry.latex : '';
      if (latex.length > MAX_LATEX_LENGTH) latex = latex.slice(0, MAX_LATEX_LENGTH);
      return {
        id: uid(),
        raw,
        latex,
        name: typeof entry.name === 'string' ? entry.name.slice(0, 32) : '',
        nameKind: entry.nameKind === 'function' || entry.nameKind === 'graph' || entry.nameKind === 'parameter'
          ? entry.nameKind
          : '',
        color: normalizeColor(entry.color, index),
        hidden: entry.hidden === true,
        bounds: Plotsy.expr.normalizeBounds(entry.bounds),
        slider: Plotsy.expr.normalizeSlider(entry.slider)
      };
    });

    const sourceSettings = data.settings && typeof data.settings === 'object' ? data.settings : {};
    const settings = {
      grid: sourceSettings.grid !== false,
      minorGrid: sourceSettings.minorGrid !== false,
      axes: sourceSettings.axes !== false,
      labels: sourceSettings.labels !== false,
      angleMode: sourceSettings.angleMode === 'deg' ? 'deg' : 'rad'
    };

    const sourceViewport = data.viewport && typeof data.viewport === 'object' ? data.viewport : {};
    const x = Number(sourceViewport.x);
    const y = Number(sourceViewport.y);
    const scale = Number(sourceViewport.scale);
    const viewport = {
      x: Number.isFinite(x) ? clamp(x, -1e9, 1e9) : 0,
      y: Number.isFinite(y) ? clamp(y, -1e9, 1e9) : 0,
      scale: Number.isFinite(scale) && scale > 0 ? clamp(scale, 4, 5000) : 0
    };

    if (!expressions.length) expressions.push(createExpression('', PALETTE[0].value));
    return { viewport, settings, expressions };
  }

  function updateLanguage() {
    const english = Plotsy.i18n.language === 'en';
    document.documentElement.lang = Plotsy.i18n.language;
    if (window.MathfieldElement) window.MathfieldElement.locale = english ? 'en' : 'zh-CN';
    localize(document.documentElement);
    refs.languageBtn.lang = english ? 'zh-CN' : 'en';
    refs.languageBtn.textContent = english ? '中文' : 'EN';
    const label = english ? '切换为简体中文' : 'Switch to English';
    refs.languageBtn.title = label;
    refs.languageBtn.setAttribute('aria-label', label);
    refs.graphCanvas.setAttribute('aria-label', t('图形画布。点击曲线以选择，再点同一曲线、点击空白或按 Esc 取消选择。'));
    for (const local of cardRefs.values()) {
      localize(local.card);
      local.field.placeholder = '\\text{' + t('输入表达式') + '}';
      for (const [key, field] of Object.entries(local.boundFields)) {
        field.setAttribute('aria-label', t(BOUND_LABELS[key]));
      }
    }
    if (toastMessage) refs.toastText.textContent = t(toastMessage);
    buildColorGrid();
    buildKeypad();
    buildExamples();
    updateCards();
  }

  function queueRefresh() {
    if (refreshRaf) return;
    refreshRaf = window.requestAnimationFrame(() => {
      refreshRaf = 0;
      refresh();
    });
  }

  function refresh() {
    if (!state || !graph) return;
    const previousNames = new Map();
    for (const expression of state.expressions) {
      previousNames.set(expression.id, {
        name: expression.name || '',
        nameKind: expression.nameKind || ''
      });
    }

    assignExpressionNames();
    let prepared = Plotsy.expr.prepare(state.expressions, state.settings);

    const constantIds = new Set();
    for (const expression of state.expressions) {
      const result = prepared.results[expression.id];
      if (result && result.kind === 'constant') {
        constantIds.add(expression.id);
      }
    }
    if (constantIds.size) {
      for (const expression of state.expressions) {
        const previous = previousNames.get(expression.id);
        if (constantIds.has(expression.id)) {
          expression.name = '';
          expression.nameKind = '';
        } else if (previous) {
          expression.name = previous.name;
          expression.nameKind = previous.nameKind;
        }
      }
      assignExpressionNames(constantIds);
      prepared = Plotsy.expr.prepare(state.expressions, state.settings);
    }

    results = prepared.results;
    analyses = prepared.analyses || new Map();
    for (const expression of state.expressions) {
      if (String(expression.latex || '').includes('\\placeholder')) {
        results[expression.id] = {
          status: 'ok',
          kind: 'placeholder',
          label: '待填写',
          message: ''
        };
        analyses.delete(expression.id);
      }
    }
    normalizeFunctionNotation();
    prepared.drawables = prepared.drawables.filter((drawable) => {
      const expression = state.expressions.find((item) => item.id === drawable.id);
      return !expression || !String(expression.latex || '').includes('\\placeholder');
    });
    graph.setDrawables(prepared.drawables);
    updateCards();
    refs.exprCount.textContent = String(state.expressions.length);
  }

  function setupGraph() {
    graph = new Plotsy.Graph({
      canvas: refs.graphCanvas,
      overlay: refs.overlayCanvas,
      settings: state.settings,
      onViewChange: (view) => {
        state.viewport = view;
        updateScaleReadout();
      },
      onCursor: (cursor) => {
        updateCursor(cursor);
      },
      onSelection: () => {
        for (const local of cardRefs.values()) syncGraphSelection(local);
      }
    });

    refs.graphCanvas.tabIndex = 0;
    refs.graphCanvas.setAttribute('aria-label', t('图形画布。点击曲线以选择，再点同一曲线、点击空白或按 Esc 取消选择。'));
    refs.graphCanvas.setAttribute('role', 'img');

    const view = state.viewport && state.viewport.scale > 0
      ? state.viewport
      : { x: 0, y: 0, scale: graph.defaultScale() };
    graph.setView(view);
    state.viewport = graph.getView();
    updateScaleReadout();
  }

  function updateScaleReadout() {
    if (!graph || !refs.scaleReadout) return;
    const scale = graph.getView().scale;
    refs.scaleReadout.textContent = String(Math.round(scale));
  }

  function updateCursor(cursor) {
    if (!cursor) {
      refs.coordReadout.classList.remove('is-visible');
      refs.coordReadout.setAttribute('aria-hidden', 'true');
      return;
    }
    const scale = graph ? graph.getView().scale : 64;
    refs.coordX.textContent = utils.formatCoordinate(cursor.x, scale);
    refs.coordY.textContent = utils.formatCoordinate(cursor.y, scale);
    refs.coordReadout.classList.add('is-visible');
    refs.coordReadout.setAttribute('aria-hidden', 'false');
  }

  /* ------------------------------------------------------------------------
     表达式卡片
     ------------------------------------------------------------------------ */

  function createCard(expression, index) {
    const card = document.createElement('article');
    card.className = 'expr-card';
    card.dataset.id = expression.id;
    card.style.setProperty('--expr-color', expression.color);
    card.style.setProperty('--expr-soft', utils.rgba(expression.color, 0.1));
    card.style.animationDelay = Math.min(index * 18, 140) + 'ms';
    card.innerHTML = [
      '<button class="color-dot" type="button" aria-controls="colorPopover" aria-expanded="false" aria-keyshortcuts="ArrowDown"></button>',
      '<div class="expr-body">',
      '  <div class="formula-line">',
      '    <span class="expr-prefix" hidden></span>',
      '    <math-field class="math-field" aria-label="数学表达式"></math-field>',
      '  </div>',
      '  <div class="calc-result" hidden>',
      '    <span class="calc-result-label">求导结果</span>',
      '    <span class="calc-result-equals" aria-hidden="true">=</span>',
      '    <span class="calc-result-formula"></span>',
      '  </div>',
      '  <div class="expr-meta">',
      '    <span class="expr-name"></span>',
      '    <span class="expr-kind"></span>',
      '    <span class="expr-error"></span>',
      '  </div>',
      '  <button class="text-btn add-sliders" type="button" hidden></button>',
      '  <div class="param-controls" hidden>',
      '    <div class="param-head"><strong data-param-name>a</strong><span>拖动滑块实时更新</span></div>',
      '    <input class="param-slider" type="range" aria-label="滑块值">',
      '    <output class="param-value">0</output>',
      '    <details class="range-details">',
      '      <summary>滑块范围</summary>',
      '      <div class="range-grid">',
      '        <label class="field">最小<input type="number" data-range="min" step="any" aria-label="滑块最小值"></label>',
      '        <label class="field">最大<input type="number" data-range="max" step="any" aria-label="滑块最大值"></label>',
      '        <label class="field">步长<input type="number" data-range="step" step="any" min="0" aria-label="滑块步长"></label>',
      '      </div>',
      '    </details>',
      '  </div>',
      '  <div class="bounds-row" hidden>',
      '    <span class="bound-marker" data-bound-var></span>',
      '    <label class="bound-field" data-bound-slot="min"><span>起点</span></label>',
      '    <span class="bound-marker" data-latex="\\to" data-fallback="→"></span>',
      '    <label class="bound-field" data-bound-slot="max"><span>终点</span></label>',
      '  </div>',
      '</div>',
      '<div class="expr-actions">',
      '  <button class="expr-action delete" type="button" title="删除表达式" aria-label="删除表达式">',
      '    <svg class="icon"><use href="#i-trash"/></svg>',
      '  </button>',
      '</div>'
    ].join('');
    localize(card);

    const local = {
      card,
      dot: $('.color-dot', card),
      field: $('.math-field', card),
      prefix: $('.expr-prefix', card),
      calcResult: $('.calc-result', card),
      calcLabel: $('.calc-result-label', card),
      calcFormula: $('.calc-result-formula', card),
      name: $('.expr-name', card),
      kind: $('.expr-kind', card),
      error: $('.expr-error', card),
      addSliders: $('.add-sliders', card),
      param: $('.param-controls', card),
      paramName: $('[data-param-name]', card),
      slider: $('.param-slider', card),
      paramValue: $('.param-value', card),
      rangeMin: $('[data-range="min"]', card),
      rangeMax: $('[data-range="max"]', card),
      rangeStep: $('[data-range="step"]', card),
      bounds: $('.bounds-row', card),
      boundVar: $('[data-bound-var]', card),
      boundFields: {},
      boundSources: {},
      initializeBounds,
      delete: $('.delete', card)
    };

    card.classList.toggle('is-hidden', !!expression.hidden);

    bindColorDot(expression, local.dot);

    function activateMathField(boundKey) {
      activeExpressionId = expression.id;
      activeBoundKey = boundKey;
      setKeypad(true);
      window.requestAnimationFrame(() => {
        local.card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
      window.setTimeout(() => {
        local.card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }, 220);
    }

    function leaveMathField() {
      window.setTimeout(() => {
        if (!keypadOpen) return;
        const active = document.activeElement;
        if (active && (active.tagName === 'MATH-FIELD' || (active.closest && active.closest('#keypad')))) return;
        setKeypad(false);
      }, 100);
      window.setTimeout(() => {
        queueRefresh();
      }, 0);
    }

    local.field.addEventListener('focus', () => activateMathField(null));
    local.field.addEventListener('blur', leaveMathField);

    local.field.addEventListener('input', () => {
      syncExpressionFromField(expression, local);
      queueRefresh();
    });

    local.field.addEventListener('keydown', (event) => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        addBlankAfter(expression.id);
        return;
      }
      if (event.key === 'Escape') local.field.blur();
    }, true);

    local.delete.addEventListener('click', () => {
      deleteExpression(expression.id);
    });

    local.addSliders.addEventListener('click', () => {
      refresh();
      const names = results[expression.id]?.missingVariables;
      if (!names?.length) return;
      if (state.expressions.length + names.length > MAX_EXPRESSIONS) {
        showToast('最多只能添加 ' + MAX_EXPRESSIONS + ' 条表达式。', 'error');
        return;
      }
      const sliders = names.map((name) => createExpression(name + ' = 1'));
      const index = state.expressions.indexOf(expression);
      state.expressions.splice(index + 1, 0, ...sliders);
      renderList();
      refresh();
      cardRefs.get(sliders[0].id)?.slider.focus();
    });

    local.slider.addEventListener('input', () => {
      const result = results[expression.id];
      if (!result || result.kind !== 'parameter' || result.status !== 'ok') return;
      const value = Number(local.slider.value);
      const text = String(value);
      expression.raw = result.name + ' = ' + text;
      expression.latex = Plotsy.latex.toLatex({ kind: 'parameter', name: result.name, ast: { type: 'number', value } });
      if (Plotsy.mathfield) Plotsy.mathfield.setLatex(local.field, expression.latex, { focus: false });
      local.paramValue.textContent = text;
      updateSliderFill(local, value, result.range);
      queueRefresh();
    });

    local.rangeMin.addEventListener('change', () => commitSliderRange(expression, local));
    local.rangeMax.addEventListener('change', () => commitSliderRange(expression, local));
    local.rangeStep.addEventListener('change', () => commitSliderRange(expression, local));

    function initializeBounds() {
      if (local.boundFields.min || !Plotsy.mathfield?.available) return;
      for (const [key, label] of Object.entries(BOUND_LABELS)) {
        const field = document.createElement('math-field');
        field.className = 'math-field bound-math';
        field.dataset.bound = key;
        field.setAttribute('aria-label', t(label));
        $('[data-bound-slot="' + key + '"]', card).append(field);
        Plotsy.mathfield.configureField(field);
        field.placeholder = '';
        field.addEventListener('focus', () => activateMathField(key));
        field.addEventListener('blur', leaveMathField);
        field.addEventListener('input', () => {
          syncBoundFromField(expression, local, key);
          queueRefresh();
        });
        field.addEventListener('keydown', (event) => {
          if (event.isComposing || !['Enter', 'Escape'].includes(event.key)) return;
          event.preventDefault();
          field.blur();
        });
        local.boundFields[key] = field;
      }
    }

    cardRefs.set(expression.id, local);
    return card;
  }

  function updateSliderFill(local, value, range) {
    const span = range.max - range.min;
    const percent = span > 0 ? clamp((value - range.min) / span, 0, 1) * 100 : 0;
    local.slider.style.setProperty('--slider-fill', percent.toFixed(2) + '%');
  }

  function commitSliderRange(expression, local) {
    const min = Number(local.rangeMin.value);
    const max = Number(local.rangeMax.value);
    const step = Number(local.rangeStep.value);
    if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(step) || min >= max || step <= 0) {
      showToast('滑块范围需要满足：最小值 < 最大值，步长 > 0。', 'error');
      local.rangeMin.value = String(expression.slider.min);
      local.rangeMax.value = String(expression.slider.max);
      local.rangeStep.value = String(expression.slider.step);
      return;
    }
    expression.slider = { min, max, step };
    queueRefresh();
    showToast('滑块范围已更新。');
  }

  function syncExpressionFromField(expression, local) {
    if (!Plotsy.mathfield || !local || !local.field) return;
    const latex = Plotsy.mathfield.getLatex(local.field);
    const ascii = Plotsy.mathfield.getAscii(local.field);
    expression.latex = latex;
    expression.raw = Plotsy.mathfield.toInternal(latex, ascii);
  }

  function syncBoundFromField(expression, local, key) {
    const raw = Plotsy.mathfield.readField(local.boundFields[key]);
    local.boundSources[key] = raw;
    expression.bounds[key] = raw || Plotsy.expr.defaults.bounds[key];
  }

  function showBound(local, key, raw) {
    const field = local.boundFields[key];
    if (!field || field === document.activeElement || local.boundSources[key] === raw) return;
    let latex = raw;
    try { latex = Plotsy.latex.astToLatex(Plotsy.math.parse(raw)); }
    catch (error) { /* Let the user edit an incomplete boundary. */ }
    Plotsy.mathfield.setLatex(field, latex, { focus: false });
    local.boundSources[key] = raw;
  }

  function initializeMathField(local, expression) {
    if (!Plotsy.mathfield || !Plotsy.mathfield.available) return;
    Plotsy.mathfield.configureField(local.field);
    writeExpressionField(local, expression);
  }

  function writeExpressionField(local, expression) {
    let latex = expression.latex || '';

    if (!latex) {
      let analysis = null;
      if (expression.raw && expression.raw.trim()) {
        try { analysis = Plotsy.expr.analyze(expression.raw, expression); } catch (error) { analysis = null; }
      }
      latex = Plotsy.mathfield.latexFromExpression(expression, analysis);
      expression.latex = latex;
    }

    Plotsy.mathfield.setLatex(local.field, latex, { focus: false });
    if (!String(expression.raw || '').trim() && latex.trim()) {
      syncExpressionFromField(expression, local);
    }
  }

  function showCalcResult(local, label, text, html) {
    if (!local.calcResult || !local.calcFormula) return;
    local.calcLabel.textContent = t(label);
    if (html) {
      local.calcFormula.innerHTML = html;
    } else {
      local.calcFormula.textContent = text;
    }
    local.calcResult.hidden = false;
  }

  function formatResultValue(value) {
    if (Number.isNaN(value)) return t('无实数值');
    if (value === Infinity) return '∞';
    if (value === -Infinity) return '−∞';
    if (Object.is(value, -0)) return '0';
    const abs = Math.abs(value);
    if (abs !== 0 && (abs >= 1e8 || abs < 1e-6)) {
      return value.toExponential(8).replace(/\.?0+e/, 'e');
    }
    return String(Number(value.toPrecision(12)));
  }

  function updateDerivativeResult(local, analysis) {
    if (!local.calcResult || !local.calcFormula) return;
    if (!analysis || analysis.kind !== 'explicit' || !analysis.ast) {
      local.calcResult.hidden = true;
      return;
    }

    let info = null;
    try { info = Plotsy.math.derivativeInfo(analysis.compiledAst || analysis.ast); } catch (error) { info = null; }
    if (!info) {
      local.calcResult.hidden = true;
      return;
    }

    try {
      const latex = Plotsy.latex.astToLatex(info.derivative);
      const html = Plotsy.latex.renderToString(latex);
      showCalcResult(
        local,
        info.order > 1 ? info.order + ' 阶导数结果' : '求导结果',
        latex,
        html
      );
    } catch (error) {
      local.calcResult.hidden = true;
    }
  }

  function syncGraphSelection(local) {
    local.card.classList.toggle('is-graph-selected', local.card.dataset.id === graph?.selectedId);
  }

  function updateCards() {
    for (const [index, expression] of state.expressions.entries()) {
      const local = cardRefs.get(expression.id);
      if (!local) continue;
      const result = results[expression.id] || {
        status: 'empty',
        kind: 'empty',
        label: '空白',
        message: ''
      };
      const analysis = analyses.get(expression.id);
      const isError = result.status === 'error';
      const hasKind = result.status !== 'empty';
      let kindLabel = result.label;
      if (result.kind === 'constant') {
        kindLabel = '数值';
      } else if (analysis && analysis.kind === 'explicit' && analysis.ast && analysis.ast.type === 'call') {
        const name = analysis.ast.name;
        if (name === 'diff' || name === 'derivative') kindLabel = '导数';
        else if (name === 'integral' || name === 'int') kindLabel = '积分';
        else if (name === 'sum' || name === 'sigma') kindLabel = '求和';
        else if (name === 'product' || name === 'prod') kindLabel = '连乘';
      }

      local.card.classList.toggle('has-error', isError);
      local.card.classList.toggle('is-hidden', !!expression.hidden);
      local.card.classList.toggle('is-sole', state.expressions.length === 1);
      local.delete.hidden = state.expressions.length === 1;
      local.card.style.setProperty('--expr-color', expression.color);
      local.card.style.setProperty('--expr-soft', utils.rgba(expression.color, 0.1));
      local.field.style.setProperty('--caret-color', expression.color);
      local.field.setAttribute('aria-label', t('表达式 ' + (index + 1) + '，可直接编辑'));
      syncGraphSelection(local);

      const nameText = expression.nameKind === 'graph' ? expression.name : '';
      local.name.textContent = nameText;
      local.name.hidden = !nameText;
      local.name.title = t('图像名称');

      let livePrefix = '';
      if (result.kind === 'explicit' && expression.nameKind === 'function' && expression.name) {
        const active = document.activeElement;
        const focused = active === local.field || (local.field.contains && local.field.contains(active));
        const analysis = analyses.get(expression.id);
        const parameterNames = collectParameterNames();
        if (focused && analysis && analysis.bare && isXOnlyFunction(analysis, parameterNames)) {
          const raw = String(expression.raw || '').trim();
          const hasPrefix = new RegExp('^' + expression.name + '\\s*\\(\\s*x\\s*\\)\\s*=', 'i').test(raw);
          if (!hasPrefix && !/^y\s*=/i.test(raw)) {
            livePrefix = expression.name + '(x)=';
          }
        }
      }
      local.prefix.textContent = livePrefix;
      local.prefix.hidden = !livePrefix;

      local.kind.textContent = hasKind ? t(kindLabel) : '';
      local.kind.classList.toggle('is-empty', !hasKind);
      local.error.textContent = isError ? t(result.message) : '';
      local.error.title = local.error.textContent;
      local.addSliders.hidden = !result.missingVariables?.length;
      if (result.missingVariables?.length) {
        local.addSliders.textContent = t('添加滑块：' + result.missingVariables.join(', '));
      }

      const visibilityLabel = t(expression.hidden ? '显示表达式' : '隐藏表达式');
      local.dot.setAttribute('aria-label', visibilityLabel);
      local.dot.setAttribute('aria-pressed', String(!expression.hidden));
      local.dot.title = visibilityLabel + ' · ' + t('长按更换颜色');

      if (result.status === 'ok' && result.kind === 'constant') {
        const isDerivative = analysis && analysis.kind === 'explicit' && analysis.ast && analysis.ast.type === 'call' &&
          (analysis.ast.name === 'diff' || analysis.ast.name === 'derivative');
        showCalcResult(
          local,
          isDerivative ? '求导结果' : '结果',
          formatResultValue(result.value)
        );
      } else {
        updateDerivativeResult(local, analysis);
      }

      const showSlider = result.status === 'ok' && result.kind === 'parameter';
      local.param.hidden = !showSlider;
      if (showSlider) {
        const range = result.range;
        local.paramName.textContent = result.name;
        local.slider.min = String(range.min);
        local.slider.max = String(range.max);
        local.slider.step = String(range.step);
        local.slider.setAttribute('aria-label', t('滑块 ' + result.name));
        const sliderValue = clamp(result.value, range.min, range.max);
        if (document.activeElement !== local.slider) local.slider.value = String(sliderValue);
        local.paramValue.textContent = String(result.value);
        updateSliderFill(local, result.value, range);

        if (document.activeElement !== local.rangeMin) local.rangeMin.value = String(range.min);
        if (document.activeElement !== local.rangeMax) local.rangeMax.value = String(range.max);
        if (document.activeElement !== local.rangeStep) local.rangeStep.value = String(range.step);
      }

      const showBounds = analysis?.kind === 'parametric' || analysis?.kind === 'polar';
      local.bounds.hidden = !showBounds;
      if (showBounds) {
        local.initializeBounds();
        const parameter = analysis.paramVar === 'theta' ? '\\theta' : 't';
        if (local.boundVar.dataset.parameter !== parameter) {
          local.boundVar.dataset.parameter = parameter;
          renderKeyMath(local.boundVar, parameter, parameter === 't' ? 't' : 'θ');
        }
        showBound(local, 'min', expression.bounds.min);
        showBound(local, 'max', expression.bounds.max);
      }
    }
  }

  function renderList() {
    const ids = new Set(state.expressions.map((expression) => expression.id));
    for (const [id, local] of cardRefs) {
      if (ids.has(id)) continue;
      local.card.remove();
      cardRefs.delete(id);
    }

    // Keep existing editors connected so inserting a row preserves their state and caret.
    let cursor = refs.exprList.firstElementChild;
    state.expressions.forEach((expression, index) => {
      const previous = cardRefs.get(expression.id);
      const card = previous?.card || createCard(expression, index);
      if (card !== cursor) refs.exprList.insertBefore(card, cursor);
      cursor = card.nextElementSibling;
      if (!previous) {
        initializeMathField(cardRefs.get(expression.id), expression);
        Plotsy.latex?.renderStatic(card);
      }
    });
    refs.exprCount.textContent = String(state.expressions.length);
  }

  function insertExpression(expression, index) {
    if (state.expressions.length >= MAX_EXPRESSIONS) {
      showToast('最多只能添加 ' + MAX_EXPRESSIONS + ' 条表达式。', 'error');
      return false;
    }
    state.expressions.splice(index, 0, expression);
    renderList();
    return true;
  }

  function addBlankAfter(id) {
    const index = state.expressions.findIndex((expression) => expression.id === id);
    if (index < 0) return;
    const expression = createExpression('');
    if (!insertExpression(expression, index + 1)) return;
    refresh();
    focusExpression(expression.id);
  }

  function addExample(raw, latex) {
    let expression = state.expressions.find((item) => !item.raw.trim() && !item.latex.trim());
    if (expression) {
      expression.raw = raw;
      expression.latex = latex || '';
      expression.hidden = false;
      if (Plotsy.mathfield?.available) writeExpressionField(cardRefs.get(expression.id), expression);
    } else {
      expression = createExpression(raw, null, latex);
      if (!insertExpression(expression, state.expressions.length)) return;
    }
    refresh();
    focusExpression(expression.id, { selectPlaceholder: !!latex });
  }

  function deleteExpression(id) {
    if (state.expressions.length === 1) return;
    const index = state.expressions.findIndex((expression) => expression.id === id);
    if (index < 0) return;
    state.expressions.splice(index, 1);
    if (activeExpressionId === id) activeExpressionId = null;
    closeColorPopover();
    renderList();
    refresh();
    focusExpression(state.expressions[Math.min(index, state.expressions.length - 1)].id);
  }

  function focusExpression(id, options) {
    window.requestAnimationFrame(() => {
      const local = cardRefs.get(id);
      const expression = findExpression(id);
      if (!local || !expression) return;
      activeExpressionId = id;
      activeBoundKey = null;
      if (Plotsy.mathfield) {
        Plotsy.mathfield.focusField(local.field);
        if (options && options.selectPlaceholder) {
          Plotsy.mathfield.insertTemplate(local.field, expression.latex || '');
          syncExpressionFromField(expression, local);
          queueRefresh();
        }
      }
      local.card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }

  /* ------------------------------------------------------------------------
     颜色
     ------------------------------------------------------------------------ */

  function bindColorDot(expression, dot) {
    let press = null;
    let suppressClick = false;

    function cancelPress() {
      if (press) clearTimeout(press.timer);
      press = null;
      dot.classList.remove('is-pressing');
    }

    function toggleVisibility() {
      closeColorPopover();
      expression.hidden = !expression.hidden;
      queueRefresh();
    }

    dot.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || !event.isPrimary) return;
      cancelPress();
      suppressClick = false;
      dot.classList.add('is-pressing');
      dot.setPointerCapture(event.pointerId);
      press = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        timer: window.setTimeout(() => {
          suppressClick = true;
          dot.classList.remove('is-pressing');
          openColorPopover(expression.id, dot);
        }, 460)
      };
    });
    dot.addEventListener('pointermove', (event) => {
      if (!press || press.id !== event.pointerId) return;
      if (Math.hypot(event.clientX - press.x, event.clientY - press.y) < 9) return;
      suppressClick = true;
      cancelPress();
    });
    dot.addEventListener('pointerup', (event) => {
      if (press?.id !== event.pointerId) return;
      cancelPress();
      if (event.pointerType === 'touch' && !suppressClick) {
        suppressClick = true;
        toggleVisibility();
      }
    });
    for (const type of ['pointercancel', 'lostpointercapture']) {
      dot.addEventListener(type, (event) => {
        if (press?.id !== event.pointerId) return;
        suppressClick = true;
        cancelPress();
      });
    }
    dot.addEventListener('click', (event) => {
      event.stopPropagation();
      const alreadyHandled = suppressClick && (event.detail !== 0 || event.pointerType);
      suppressClick = false;
      if (!alreadyHandled) toggleVisibility();
    });
    dot.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      suppressClick = true;
      cancelPress();
      openColorPopover(expression.id, dot);
    });
    dot.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowDown') return;
      event.preventDefault();
      openColorPopover(expression.id, dot);
      refs.colorGrid.querySelector('button')?.focus();
    });
  }

  function buildColorGrid() {
    const presets = PALETTE.map((color) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'swatch';
      button.dataset.color = color.value;
      button.style.setProperty('--swatch-color', color.value);
      button.title = t(color.name);
      button.setAttribute('aria-label', t('使用{value}').replace('{value}', button.title));
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        applyColor(color.value);
      });
      return button;
    });
    refs.colorGrid.replaceChildren(...presets, refs.customSwatch);
  }

  function openColorPopover(id, anchor) {
    const expression = findExpression(id);
    if (!expression) return;
    if (activeColorId !== id) closeColorPopover();
    activeColorId = id;
    anchor.setAttribute('aria-expanded', 'true');
    $$('.swatch', refs.colorGrid).forEach((button) => {
      const selected = button === refs.customSwatch
        ? !PALETTE.some((color) => color.value === expression.color)
        : button.dataset.color === expression.color;
      button.classList.toggle('is-selected', selected);
    });
    refs.colorPopover.hidden = false;
    showColorEditor(false);
  }

  function positionColorPopover() {
    const anchor = cardRefs.get(activeColorId)?.dot;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const popoverRect = refs.colorPopover.getBoundingClientRect();
    let left = rect.left - 5;
    let top = rect.bottom + 9;
    if (left + popoverRect.width > window.innerWidth - 8) left = window.innerWidth - popoverRect.width - 8;
    if (top + popoverRect.height > window.innerHeight - 8) top = rect.top - popoverRect.height - 9;
    refs.colorPopover.style.left = Math.max(8, left) + 'px';
    refs.colorPopover.style.top = Math.max(8, top) + 'px';
  }

  function closeColorPopover() {
    cardRefs.get(activeColorId)?.dot.setAttribute('aria-expanded', 'false');
    refs.colorPopover.hidden = true;
    activeColorId = null;
    draftColor = null;
  }

  function colorToHsv(hex) {
    const { r, g, b } = utils.hexToRgb(hex);
    const max = Math.max(r, g, b);
    const delta = max - Math.min(r, g, b);
    let hue = 0;
    if (delta) {
      if (max === r) hue = (g - b) / delta;
      else if (max === g) hue = 2 + (b - r) / delta;
      else hue = 4 + (r - g) / delta;
    }
    return { h: (hue * 60 + 360) % 360, s: max ? delta / max : 0, v: max / 255 };
  }

  function hsvToColor({ h, s, v }) {
    const component = (offset) => {
      const sector = (offset + h / 60) % 6;
      const value = v * (1 - s * Math.max(0, Math.min(sector, 4 - sector, 1)));
      return Math.round(value * 255).toString(16).padStart(2, '0');
    };
    return '#' + component(5) + component(3) + component(1);
  }

  function updateColorEditor(updateHex = true) {
    const color = hsvToColor(draftColor);
    refs.colorEditor.style.setProperty('--picker-hue', draftColor.h);
    refs.colorEditor.style.setProperty('--picker-color', color);
    refs.colorPlane.style.setProperty('--picker-x', draftColor.s * 100 + '%');
    refs.colorPlane.style.setProperty('--picker-y', (1 - draftColor.v) * 100 + '%');
    refs.colorHue.value = Math.min(359, Math.round(draftColor.h));
    if (updateHex) refs.customColor.value = color.toUpperCase();
  }

  function showColorEditor(open) {
    refs.colorPresets.hidden = open;
    refs.colorEditor.hidden = !open;
    refs.colorPopover.classList.toggle('is-editing', open);
    if (open) {
      draftColor = colorToHsv(findExpression(activeColorId).color);
      updateColorEditor();
    }
    positionColorPopover();
  }

  function moveColorPlane(event) {
    const rect = refs.colorPlane.getBoundingClientRect();
    draftColor.s = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    draftColor.v = clamp(1 - (event.clientY - rect.top) / rect.height, 0, 1);
    updateColorEditor();
  }

  function applyColor(color) {
    const expression = findExpression(activeColorId);
    if (!expression || !color) return;
    expression.color = color;
    const restoreFocus = refs.colorPopover.contains(document.activeElement);
    closeColorPopover();
    if (restoreFocus) cardRefs.get(expression.id)?.dot.focus({ preventScroll: true });
    queueRefresh();
  }

  /* ------------------------------------------------------------------------
     数学键盘
     ------------------------------------------------------------------------ */

  function renderKeyMath(element, latex, fallback) {
    if (!Plotsy.latex?.renderElement(element, latex)) element.textContent = fallback;
  }

  function appendKeyMath(button, latex, fallback) {
    const label = document.createElement('span');
    label.className = 'key-math';
    label.setAttribute('aria-hidden', 'true');
    renderKeyMath(label, latex, fallback);
    button.append(label);
  }

  function makeMainKey(item) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'math-key';
    button.title = item.title ? t(item.title) : t('插入 ' + item.label);
    button.setAttribute('aria-label', button.title);
    appendKeyMath(button, item.preview || item.latex, item.label);
    if (item.action) button.dataset.action = item.action;
    else if (item.move) button.dataset.move = item.move;
    else if (item.script) button.dataset.script = item.script;
    else if (item.latex) {
      button.dataset.symbolLatex = item.latex;
      if (item.placeholder) button.dataset.placeholder = '1';
    }
    return button;
  }

  function keyboardGroup(className, label, items) {
    const group = document.createElement('div');
    group.className = className;
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', t(label));
    group.append(...items.map(makeMainKey));
    return group;
  }

  const FUNCTION_PREVIEW = {
    sin: '\\sin', cos: '\\cos', tan: '\\tan',
    cot: '\\cot', sec: '\\sec', csc: '\\csc',
    asin: '\\arcsin', acos: '\\arccos', atan: '\\arctan',
    sinh: '\\sinh', cosh: '\\cosh', tanh: '\\tanh',
    sqrt: '\\sqrt{\\square}', nthroot: '\\sqrt[n]{\\square}',
    abs: '\\lvert\\square\\rvert', ln: '\\ln', log: '\\log', log2: '\\log_2', log10: '\\log_{10}',
    exp: '\\exp', floor: '\\lfloor\\square\\rfloor', ceil: '\\lceil\\square\\rceil',
    zeta: '\\zeta', gamma: '\\Gamma', digamma: '\\psi', polygamma: '\\psi_n',
    lambertw: 'W', lambertwminus: 'W_{-1}'
  };

  function buildFunctionGroup(heading, items) {
    const section = document.createElement('section');
    section.className = 'keypad-group';
    const title = document.createElement('div');
    title.className = 'keypad-group-title';
    title.textContent = t(heading);
    const grid = document.createElement('div');
    grid.className = 'func-grid';
    for (const item of items) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'func-key';
      const name = item.kind ? t(item.label) : item.name;
      button.title = name + ' · ' + t(item.desc);
      button.setAttribute('aria-label', button.title);
      if (item.kind) button.dataset.calculus = item.kind;
      else button.dataset.fn = item.name;
      const preview = document.createElement('strong');
      appendKeyMath(preview, item.kind ? item.latex.replaceAll('\\placeholder{}', '\\square') :
        FUNCTION_PREVIEW[item.name] || '\\operatorname{' + item.name + '}', name);
      const desc = document.createElement('small');
      desc.textContent = item.kind ? name : t(item.desc);
      button.append(preview, desc);
      grid.append(button);
    }
    section.append(title, grid);
    return section;
  }

  function buildLetters() {
    const panel = $('#keypadPanelLetters');
    const pad = document.createElement('div');
    pad.className = 'alphabet-keyboard';
    const grid = document.createElement('div');
    grid.className = 'letter-grid';
    const upper = letterCase === 'upper';
    const alphabet = greekMode ? GREEK_CASE_KEYS : ENGLISH_CASE_KEYS;
    const makeLetter = (item) => {
      const label = upper ? item.upper : item.lower;
      const latex = upper ? item.upperLatex : item.lowerLatex;
      const title = (upper ? item.upperTitle : item.lowerTitle) || (greekMode ? '希腊字母 ' : '字母 ') + label;
      return makeMainKey({ label, latex, title });
    };
    for (const letters of QWERTY_ROWS) {
      const row = document.createElement('div');
      row.className = 'letter-row';
      row.append(...Array.from(letters, (letter) => makeLetter(alphabet[letter])));
      grid.append(row);
    }

    const controls = document.createElement('div');
    controls.className = 'alphabet-controls';
    const shift = makeMainKey({ label: '⇧', preview: '\\Uparrow', title: upper ? '切换为小写' : '切换为大写' });
    shift.dataset.caseToggle = '1';
    shift.setAttribute('aria-pressed', String(upper));
    const mode = makeMainKey({
      label: greekMode ? 'ABC' : 'αβγ',
      preview: greekMode ? '\\mathrm{ABC}' : '\\alpha\\beta\\gamma',
      title: greekMode ? '切换到英文字母' : '切换到希腊字母'
    });
    mode.dataset.alphabetToggle = '1';
    const active = document.activeElement;
    controls.append(shift, mode);
    pad.append(grid, controls);
    panel.replaceChildren(pad);
    if (active?.hasAttribute('data-case-toggle')) shift.focus();
    if (active?.hasAttribute('data-alphabet-toggle')) mode.focus();
  }

  function buildKeypad() {
    const main = document.createElement('div');
    main.className = 'main-keyboard';
    main.append(
      keyboardGroup('keypad-numbers', '数字与等号', KEYPAD_NUMBERS),
      keyboardGroup('keypad-operators', '运算与变量', KEYPAD_OPERATORS),
      keyboardGroup('keypad-controls', '编辑控制', KEYPAD_CONTROLS)
    );
    $('#keypadPanelMain').replaceChildren(main);

    const functions = document.createElement('div');
    functions.className = 'keypad-group-grid';
    const [special, trigonometry, hyperbolic, powers, rounding, other] = KEYPAD_FUNCTION_GROUPS;
    functions.append(
      buildFunctionGroup(trigonometry.title, trigonometry.items),
      buildFunctionGroup(powers.title, powers.items),
      buildFunctionGroup('微积分', KEYPAD_CALCULUS),
      ...[hyperbolic, rounding, other, special].map((group) => buildFunctionGroup(group.title, group.items))
    );
    $('#keypadPanelFunctions').replaceChildren(functions);
    buildLetters();
    setKeypadTab(activeKeypadTab);
  }

  function buildExamples() {
    const buttons = EXAMPLES.map((item) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'syntax-card';
      button.dataset.exampleLatex = item.latex;
      const label = document.createElement('span');
      label.className = 'syntax-tag';
      label.textContent = t(item.label);
      button.setAttribute('aria-label', label.textContent);
      const sample = document.createElement('span');
      sample.className = 'syntax-math';
      renderKeyMath(sample, item.latex, item.sample);
      button.append(label, sample);
      return button;
    });
    refs.examplesGrid.replaceChildren(...buttons);
  }

  function setKeypadTab(tab) {
    if (!['main', 'functions', 'letters'].includes(tab)) tab = 'main';
    activeKeypadTab = tab;
    $$('[data-keypad-tab]', refs.keypad).forEach((button) => {
      const active = button.dataset.keypadTab === tab;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    });
    $$('[data-keypad-panel]', refs.keypadPanels).forEach((panel) => {
      const active = panel.dataset.keypadPanel === tab;
      panel.classList.toggle('is-active', active);
      panel.hidden = !active;
    });
  }

  function setKeypad(open) {
    keypadOpen = !!open;
    refs.keypad.hidden = !keypadOpen;
    refs.app.classList.toggle('keypad-open', keypadOpen);
    if (keypadOpen) setKeypadTab(activeKeypadTab);
  }

  function ensureFieldTarget() {
    if (!state || !Plotsy.mathfield || !Plotsy.mathfield.available) return null;
    const expression = findExpression(activeExpressionId);
    if (!expression) return null;
    const local = cardRefs.get(expression.id);
    if (!local) return null;
    const boundKey = !local.bounds.hidden && local.boundFields[activeBoundKey] ? activeBoundKey : null;
    const field = boundKey ? local.boundFields[boundKey] : local.field;
    Plotsy.mathfield.focusField(field);
    return { expression, local, field, boundKey };
  }

  function finishFieldInsert(target) {
    if (!target) return;
    if (target.boundKey) syncBoundFromField(target.expression, target.local, target.boundKey);
    else syncExpressionFromField(target.expression, target.local);
    queueRefresh();
    target.local.card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function insertSymbolLatex(latex, selectPlaceholder) {
    const target = ensureFieldTarget();
    if (!target) return;
    Plotsy.mathfield.insertLatex(target.field, latex, {
      selectPlaceholder: !!selectPlaceholder,
      selectionMode: selectPlaceholder ? 'placeholder' : 'after'
    });
    finishFieldInsert(target);
  }

  function insertMathFunction(name) {
    const target = ensureFieldTarget();
    if (!target) return;
    Plotsy.mathfield.insertFunction(target.field, name);
    finishFieldInsert(target);
  }

  function insertScript(kind) {
    const target = ensureFieldTarget();
    if (!target) return;
    Plotsy.mathfield.insertScript(target.field, kind);
    finishFieldInsert(target);
  }

  function insertCalculus(kind) {
    const target = ensureFieldTarget();
    if (!target) return;
    Plotsy.mathfield.insertCalculus(target.field, kind);
    finishFieldInsert(target);
  }

  function moveCursor(direction) {
    const target = ensureFieldTarget();
    if (!target) return;
    const commands = {
      left: 'moveToPreviousChar',
      right: 'moveToNextChar',
      up: 'moveUp',
      down: 'moveDown'
    };
    const command = commands[direction];
    if (!command) return;
    try {
      target.field.executeCommand(command);
    } catch (error) {
      /* 忽略不可用的移动命令 */
    }
    Plotsy.mathfield.focusField(target.field);
  }

  function deleteMath() {
    const target = ensureFieldTarget();
    if (!target) return;
    Plotsy.mathfield.deleteBackward(target.field);
    finishFieldInsert(target);
  }

  function handleKeypadClick(event) {
    const moveButton = event.target.closest('[data-move]');
    if (moveButton) {
      moveCursor(moveButton.dataset.move);
      return;
    }
    const caseButton = event.target.closest('[data-case-toggle]');
    if (caseButton) {
      letterCase = letterCase === 'upper' ? 'lower' : 'upper';
      buildLetters();
      return;
    }
    const alphabetButton = event.target.closest('[data-alphabet-toggle]');
    if (alphabetButton) {
      greekMode = !greekMode;
      buildLetters();
      return;
    }
    const actionButton = event.target.closest('[data-action]');
    if (actionButton && actionButton.dataset.action === 'backspace') {
      deleteMath();
      return;
    }
    if (actionButton?.dataset.action === 'enter') {
      const target = ensureFieldTarget();
      if (!target) return;
      if (target.boundKey) target.field.blur();
      else addBlankAfter(target.expression.id);
      return;
    }
    const scriptButton = event.target.closest('[data-script]');
    if (scriptButton) {
      insertScript(scriptButton.dataset.script);
      return;
    }
    const functionButton = event.target.closest('[data-fn]');
    if (functionButton) {
      insertMathFunction(functionButton.dataset.fn);
      return;
    }
    const calculusButton = event.target.closest('[data-calculus]');
    if (calculusButton) {
      insertCalculus(calculusButton.dataset.calculus);
      return;
    }
    const insertButton = event.target.closest('[data-symbol-latex]');
    if (insertButton) {
      if (/^[A-Za-z0-9]$/.test(insertButton.dataset.symbolLatex)) {
        const target = ensureFieldTarget();
        if (!target) return;
        Plotsy.mathfield.typeCharacter(target.field, insertButton.dataset.symbolLatex);
        finishFieldInsert(target);
      } else {
        insertSymbolLatex(insertButton.dataset.symbolLatex, insertButton.dataset.placeholder === '1');
      }
      return;
    }
  }

  /* ------------------------------------------------------------------------
     设置面板
     ------------------------------------------------------------------------ */

  function syncSettingsUI() {
    refs.gridToggle.checked = !!state.settings.grid;
    refs.minorToggle.checked = !!state.settings.minorGrid;
    refs.minorToggle.disabled = !state.settings.grid;
    refs.axesToggle.checked = !!state.settings.axes;
    refs.labelsToggle.checked = !!state.settings.labels;
    $$('[data-angle]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.angle === state.settings.angleMode);
    });
    refs.angleBadge.hidden = state.settings.angleMode !== 'deg';
    updateScaleReadout();
  }

  function setSetting(key, value) {
    if (state.settings[key] === value) return;
    state.settings[key] = value;
    graph.setSettings(state.settings);
    syncSettingsUI();
    if (key === 'angleMode') queueRefresh();
  }

  function setSettingsPanel(open) {
    refs.settingsPanel.hidden = !open;
    refs.settingsBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) closeExportMenu();
  }

  /* ------------------------------------------------------------------------
     导出菜单 / 对话框 / Toast
     ------------------------------------------------------------------------ */

  function setExportMenu(open) {
    refs.exportMenu.hidden = !open;
    refs.exportBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) setSettingsPanel(false);
  }

  function closeExportMenu() {
    setExportMenu(false);
  }

  function openDialog(dialog) {
    if (!dialog || typeof dialog.showModal !== 'function') return;
    setExportMenu(false);
    setSettingsPanel(false);
    closeColorPopover();
    if (!dialog.open) dialog.showModal();
  }

  function showToast(message, type) {
    if (!message) return;
    const error = type === 'error';
    toastMessage = message;
    refs.toastText.textContent = t(message);
    refs.toast.classList.toggle('is-error', error);
    const use = refs.toast.querySelector('use');
    if (use) use.setAttribute('href', error ? '#i-help' : '#i-check');
    if (toastTimer) clearTimeout(toastTimer);
    if (toastCleanupTimer) clearTimeout(toastCleanupTimer);
    refs.toast.hidden = false;
    window.requestAnimationFrame(() => {
      refs.toast.classList.add('is-visible');
    });
    toastTimer = window.setTimeout(() => {
      refs.toast.classList.remove('is-visible');
      toastCleanupTimer = window.setTimeout(() => {
        refs.toast.hidden = true;
      }, 220);
    }, 3000);
  }

  /* ------------------------------------------------------------------------
     导入 / 导出：完全本地文件 API
     ------------------------------------------------------------------------ */

  function timestampForFile() {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, '0');
    return now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + '-' + pad(now.getHours()) + pad(now.getMinutes());
  }

  function updateSaveLink() {
    const name = refs.saveFilename.value.trim();
    const valid = !!pendingExport && !!name && !/[<>:"/\\|?*\x00-\x1f]/u.test(name);
    refs.saveLink.setAttribute('aria-disabled', valid ? 'false' : 'true');
    if (!valid) {
      refs.saveLink.removeAttribute('href');
      refs.saveLink.removeAttribute('download');
      return;
    }
    const { url, extension } = pendingExport;
    refs.saveLink.href = url;
    refs.saveLink.download = name.toLowerCase().endsWith(extension) ? name : name + extension;
  }

  async function chooseExportLocation(name, type, extension, description) {
    if (typeof window.showSaveFilePicker !== 'function') return undefined;
    try {
      return await window.showSaveFilePicker({
        suggestedName: name,
        excludeAcceptAllOption: true,
        types: [{ description: t(description), accept: { [type]: [extension] } }]
      });
    } catch (error) {
      if (error.name === 'AbortError') return null;
      if (error.name === 'SecurityError') return undefined;
      throw error;
    }
  }

  async function saveExport({ extension, type, description, createBlob, successMessage, errorMessage }) {
    setExportMenu(false);
    if (exportingFile || pendingExport) return;
    exportingFile = true;
    refs.exportBtn.disabled = true;
    const basename = 'plotsy-' + timestampForFile();
    try {
      const file = await chooseExportLocation(basename + extension, type, extension, description);
      if (file === null) return;
      if (file && !file.name.toLowerCase().endsWith(extension)) {
        throw new Error('文件名需要以 ' + extension + ' 结尾。');
      }

      const blob = await createBlob();
      if (!file) {
        pendingExport = { url: URL.createObjectURL(blob), extension };
        refs.saveFilename.value = basename;
        updateSaveLink();
        openDialog(refs.saveDialog);
        refs.saveFilename.select();
        return;
      }

      const writable = await file.createWritable();
      try {
        await writable.write(blob);
        await writable.close();
      } catch (error) {
        try { await writable.abort(); } catch (abortError) { /* Preserve the write error. */ }
        throw error;
      }
      showToast(successMessage);
    } catch (error) {
      showToast(error.message || errorMessage, 'error');
    } finally {
      exportingFile = false;
      refs.exportBtn.disabled = false;
    }
  }

  function exportProjectFile() {
    setExportMenu(false);
    if (!state || !graph) return;
    const data = projectFile.encode({ ...state, viewport: graph.getView() });
    const blob = new Blob([data], { type: 'text/plain;charset=utf-8' });
    if (blob.size > MAX_PROJECT_FILE_SIZE) {
      showToast('项目文件太大了（上限 2 MB）。', 'error');
      return;
    }
    return saveExport({
      extension: projectFile.extension,
      type: 'application/octet-stream',
      description: 'Plotsy 存档',
      createBlob: () => blob,
      successMessage: '已导出 Plotsy 存档。',
      errorMessage: '项目导出失败。'
    });
  }

  function exportImageFile() {
    if (!graph) return;
    return saveExport({
      extension: '.png',
      type: 'image/png',
      description: 'PNG 图片',
      createBlob: () => graph.exportPNG(),
      successMessage: '高清 PNG 图片已导出。',
      errorMessage: '图片导出失败。'
    });
  }

  function openFilePicker() {
    setExportMenu(false);
    setSettingsPanel(false);
    closeColorPopover();
    refs.fileInput.value = '';
    refs.fileInput.click();
  }

  async function importFile(file) {
    if (!file) return;
    try {
      if (!file.name.toLowerCase().endsWith(projectFile.extension)) {
        throw new Error('请选择扩展名为 .psy 的 Plotsy 存档。');
      }
      if (file.size > MAX_PROJECT_FILE_SIZE) {
        throw new Error('项目文件太大了（上限 2 MB）。');
      }
      const data = projectFile.decode(await file.text(), MAX_EXPRESSIONS);
      applyProject(normalizeProject(data));
      const count = data.expressions.length;
      showToast(count ? '已导入 ' + count + ' 条表达式。' : '已导入空白图表。');
    } catch (error) {
      showToast(error.message || '导入失败。', 'error');
    } finally {
      refs.fileInput.value = '';
    }
  }

  function applyProject(project) {
    graph.setSelection(null);
    state = project;
    if (!state.viewport || !(state.viewport.scale > 0)) {
      state.viewport = { x: 0, y: 0, scale: 0 };
    }
    activeExpressionId = null;
    activeBoundKey = null;
    closeColorPopover();
    setExportMenu(false);
    syncSettingsUI();
    graph.setSettings(state.settings);
    if (state.viewport.scale > 0) {
      graph.setView(state.viewport);
    } else {
      graph.setView({ x: 0, y: 0, scale: graph.defaultScale() });
    }
    state.viewport = graph.getView();
    renderList();
    refresh();
    updateScaleReadout();
    refs.sidebarScroll.scrollTop = 0;
  }

  function startNewProject() {
    applyProject(blankProject());
    setSettingsPanel(false);
    showToast('已新建空白图表。');
  }

  /* ------------------------------------------------------------------------
     全局事件
     ------------------------------------------------------------------------ */

  function isTextTarget(target) {
    if (!target) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'MATH-FIELD' || target.isContentEditable;
  }

  function bindEvents() {
    refs.languageBtn.addEventListener('click', () => {
      Plotsy.i18n.setLanguage(Plotsy.i18n.language === 'en' ? 'zh-CN' : 'en');
      updateLanguage();
    });
    refs.importBtn.addEventListener('click', openFilePicker);
    refs.exportBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      const open = refs.exportMenu.hidden;
      setExportMenu(open);
    });
    refs.exportMenu.addEventListener('click', (event) => {
      const item = event.target.closest('[data-export]');
      if (!item) return;
      if (item.dataset.export === 'project') exportProjectFile();
      if (item.dataset.export === 'png') exportImageFile();
    });
    refs.newBtn.addEventListener('click', () => openDialog(refs.confirmDialog));
    refs.confirmNewBtn.addEventListener('click', () => {
      refs.confirmDialog.close();
      startNewProject();
    });

    refs.helpBtn.addEventListener('click', () => openDialog(refs.helpDialog));
    refs.examplesBtn.addEventListener('click', () => openDialog(refs.examplesDialog));
    refs.addBtn.addEventListener('click', () => addBlankAfter(state.expressions.at(-1).id));
    refs.examplesGrid.addEventListener('click', (event) => {
      const example = event.target.closest('[data-example-latex]');
      if (!example) return;
      refs.examplesDialog.close();
      addExample('', example.dataset.exampleLatex);
    });

    $$('[data-keypad-tab]').forEach((button) => {
      button.addEventListener('click', () => setKeypadTab(button.dataset.keypadTab));
    });
    refs.keypad.addEventListener('keydown', (event) => {
      const current = event.target.closest('[data-keypad-tab]');
      if (!current) return;
      const tabs = $$('[data-keypad-tab]');
      const index = tabs.indexOf(current);
      if (index < 0) return;
      let next = -1;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next < 0) return;
      event.preventDefault();
      const tab = tabs[next];
      setKeypadTab(tab.dataset.keypadTab);
      tab.focus();
    });
    refs.keypadPanels.addEventListener('click', handleKeypadClick);
    refs.keypad.addEventListener('mousedown', (event) => {
      const button = event.target.closest('button');
      if (button) event.preventDefault();
    });

    refs.zoomIn.addEventListener('click', () => graph.zoomBy(1.25));
    refs.zoomOut.addEventListener('click', () => graph.zoomBy(0.8));
    refs.resetView.addEventListener('click', () => graph.resetView());

    refs.settingsBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      setSettingsPanel(refs.settingsPanel.hidden);
    });
    refs.settingsClose.addEventListener('click', () => setSettingsPanel(false));
    refs.fitViewBtn.addEventListener('click', () => graph.resetView());
    refs.resetSettingsBtn.addEventListener('click', () => {
      state.settings = { ...DEFAULT_SETTINGS };
      graph.setSettings(state.settings);
      syncSettingsUI();
      queueRefresh();
      showToast('视图设置已恢复默认。');
    });

    refs.gridToggle.addEventListener('change', () => setSetting('grid', refs.gridToggle.checked));
    refs.minorToggle.addEventListener('change', () => setSetting('minorGrid', refs.minorToggle.checked));
    refs.axesToggle.addEventListener('change', () => setSetting('axes', refs.axesToggle.checked));
    refs.labelsToggle.addEventListener('change', () => setSetting('labels', refs.labelsToggle.checked));
    $$('[data-angle]').forEach((button) => {
      button.addEventListener('click', () => setSetting('angleMode', button.dataset.angle));
    });

    refs.fileInput.addEventListener('change', () => {
      const file = refs.fileInput.files && refs.fileInput.files[0];
      importFile(file);
    });

    $$('[data-close-dialog]').forEach((button) => {
      button.addEventListener('click', () => {
        const dialog = button.closest('dialog');
        if (dialog) dialog.close();
      });
    });

    [refs.helpDialog, refs.confirmDialog, refs.saveDialog, refs.examplesDialog].forEach((dialog) => {
      dialog.addEventListener('click', (event) => {
        if (event.target === dialog) dialog.close();
      });
    });

    refs.saveFilename.addEventListener('input', updateSaveLink);
    refs.saveFilename.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.isComposing && refs.saveLink.hasAttribute('href')) {
        event.preventDefault();
        refs.saveLink.click();
      }
    });
    refs.saveLink.addEventListener('click', () => {
      if (refs.saveLink.hasAttribute('href')) window.setTimeout(() => refs.saveDialog.close(), 0);
    });
    refs.saveDialog.addEventListener('close', () => {
      if (!pendingExport) return;
      const { url } = pendingExport;
      pendingExport = null;
      updateSaveLink();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    });

    refs.helpDialog.addEventListener('click', (event) => {
      const example = event.target.closest('[data-example]');
      if (!example) return;
      const raw = example.dataset.example;
      refs.helpDialog.close();
      addExample(raw);
    });

    refs.customSwatch.addEventListener('click', () => {
      showColorEditor(true);
      refs.colorPlane.focus();
    });
    refs.colorBack.addEventListener('click', () => {
      showColorEditor(false);
      refs.customSwatch.focus();
    });
    refs.colorEditor.addEventListener('submit', (event) => {
      event.preventDefault();
      applyColor('#' + refs.customColor.value.replace(/^#/, '').toLowerCase());
    });
    refs.customColor.addEventListener('input', () => {
      if (!/^#?[0-9a-f]{6}$/i.test(refs.customColor.value)) return;
      draftColor = colorToHsv(refs.customColor.value);
      updateColorEditor(false);
    });
    refs.colorHue.addEventListener('input', () => {
      draftColor.h = Number(refs.colorHue.value);
      updateColorEditor();
    });
    refs.colorPlane.addEventListener('pointerdown', (event) => {
      refs.colorPlane.setPointerCapture(event.pointerId);
      moveColorPlane(event);
    });
    refs.colorPlane.addEventListener('pointermove', (event) => {
      if (refs.colorPlane.hasPointerCapture(event.pointerId)) moveColorPlane(event);
    });
    refs.colorPlane.addEventListener('keydown', (event) => {
      const step = event.shiftKey ? 0.1 : 0.02;
      const directions = { ArrowLeft: ['s', -1], ArrowRight: ['s', 1], ArrowDown: ['v', -1], ArrowUp: ['v', 1] };
      const direction = directions[event.key];
      if (!direction) return;
      event.preventDefault();
      const [key, sign] = direction;
      draftColor[key] = clamp(draftColor[key] + sign * step, 0, 1);
      updateColorEditor();
    });
    refs.colorPopover.addEventListener('click', (event) => event.stopPropagation());

    document.addEventListener('click', (event) => {
      if (!refs.exportMenu.hidden && !event.target.closest('.menu-wrap')) closeExportMenu();
      if (!refs.settingsPanel.hidden && !event.target.closest('.graph-controls')) setSettingsPanel(false);
      if (!refs.colorPopover.hidden && !event.target.closest('#colorPopover')) closeColorPopover();
    });

    document.addEventListener('keydown', (event) => {
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && !event.altKey) {
        const key = event.key.toLowerCase();
        if (key === 'o') {
          event.preventDefault();
          openFilePicker();
          return;
        }
        if (key === 's') {
          event.preventDefault();
          exportProjectFile();
          return;
        }
        if (key === 'e') {
          event.preventDefault();
          exportImageFile();
          return;
        }
      }

      if (event.key === 'Escape') {
        if (!refs.exportMenu.hidden) {
          closeExportMenu();
          event.preventDefault();
          return;
        }
        if (!refs.settingsPanel.hidden) {
          setSettingsPanel(false);
          event.preventDefault();
          return;
        }
        if (!refs.colorPopover.hidden) {
          if (!refs.colorEditor.hidden) {
            showColorEditor(false);
            refs.customSwatch.focus();
            event.preventDefault();
            return;
          }
          const anchor = cardRefs.get(activeColorId)?.dot;
          closeColorPopover();
          anchor?.focus({ preventScroll: true });
          event.preventDefault();
          return;
        }
        if (keypadOpen) {
          setKeypad(false);
          event.preventDefault();
          return;
        }
        if (graph.selectedId !== null) {
          graph.setSelection(null);
          event.preventDefault();
          return;
        }
      }

      if (event.key === '?' && !isTextTarget(event.target)) {
        event.preventDefault();
        openDialog(refs.helpDialog);
      }
    });

    refs.graphCanvas.addEventListener('contextmenu', (event) => event.preventDefault());

    window.addEventListener('resize', () => {
      updateScaleReadout();
      if (graph) graph.resize();
      if (!refs.colorPopover.hidden) positionColorPopover();
    });

    refs.sidebarScroll.addEventListener('scroll', closeColorPopover, { passive: true });

    bindDragAndDrop();
  }

  function bindDragAndDrop() {
    const hasFiles = (event) => {
      const types = event.dataTransfer && event.dataTransfer.types;
      return types && Array.from(types).includes('Files');
    };

    window.addEventListener('dragenter', (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepth += 1;
      refs.dropOverlay.hidden = false;
    });

    window.addEventListener('dragover', (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    });

    window.addEventListener('dragleave', (event) => {
      if (!hasFiles(event)) return;
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) refs.dropOverlay.hidden = true;
    });

    window.addEventListener('drop', (event) => {
      if (!event.dataTransfer) return;
      event.preventDefault();
      dragDepth = 0;
      refs.dropOverlay.hidden = true;
      const files = Array.from(event.dataTransfer.files || []);
      if (files.length) importFile(files[0]);
    });
  }

  /* ------------------------------------------------------------------------
     启动
     ------------------------------------------------------------------------ */

  function init() {
    localize(document.documentElement);
    state = blankProject();

    setupGraph();
    syncSettingsUI();
    updateLanguage();
    bindEvents();
    renderList();
    refresh();
    updateScaleReadout();
    if (Plotsy.latex) Plotsy.latex.renderStatic(document);
    setKeypad(false);

    if (!Plotsy.mathfield || !Plotsy.mathfield.available) {
      window.setTimeout(() => showToast('数学输入组件加载失败，请确认 vendor/mathlive 目录完整。', 'error'), 350);
    }
  }

  init();
})();
