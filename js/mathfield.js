/*
 * Plotsy · MathLive 数学输入适配层
 * 负责数学输入框初始化、LaTeX → 内部表达式转换，以及键盘插入。
 */
(function (global) {
  'use strict';

  const Plotsy = (global.Plotsy = global.Plotsy || {});
  const MathfieldElement = global.MathfieldElement;

  if (MathfieldElement) {
    MathfieldElement.fontsDirectory = 'vendor/mathlive/fonts';
    MathfieldElement.soundsDirectory = null;
  }

  const COMMANDS = {
    sin: '\\sin',
    cos: '\\cos',
    tan: '\\tan',
    cot: '\\cot',
    sec: '\\sec',
    csc: '\\csc',
    asin: '\\arcsin',
    acos: '\\arccos',
    atan: '\\arctan',
    sinh: '\\sinh',
    cosh: '\\cosh',
    tanh: '\\tanh',
    asinh: '\\operatorname{arsinh}',
    acosh: '\\operatorname{arcosh}',
    atanh: '\\operatorname{artanh}',
    ln: '\\ln',
    log: '\\log',
    exp: '\\exp'
  };

  const OPERATOR_TEMPLATES = {
    round: { name: 'round', count: 1 },
    sign: { name: 'sign', count: 1 },
    min: { name: 'min', count: 2 },
    max: { name: 'max', count: 2 },
    mod: { name: 'mod', count: 2 },
    pow: { name: 'pow', count: 2 },
    hypot: { name: 'hypot', count: 2 },
    atan2: { name: 'atan2', count: 2 },
    erf: { name: 'erf', count: 1 },
    erfc: { name: 'erfc', count: 1 },
    clamp: { name: 'clamp', count: 3 },
    nthroot: { name: 'nthroot', count: 2 },
    if: { name: 'if', count: 3 }
  };

  const GREEK_LETTERS = {
    alpha: ['\\alpha', 'α'],
    beta: ['\\beta', 'β'],
    gamma: ['\\gamma', 'γ'],
    delta: ['\\delta', 'δ'],
    epsilon: ['\\epsilon', 'ϵ'],
    varepsilon: ['\\varepsilon', 'ε'],
    zeta: ['\\zeta', 'ζ'],
    eta: ['\\eta', 'η'],
    theta: ['\\theta', 'θ'],
    vartheta: ['\\vartheta', 'ϑ'],
    iota: ['\\iota', 'ι'],
    kappa: ['\\kappa', 'κ'],
    lambda: ['\\lambda', 'λ'],
    mu: ['\\mu', 'μ'],
    nu: ['\\nu', 'ν'],
    xi: ['\\xi', 'ξ'],
    omicron: ['ο', 'ο'],
    pi: ['\\pi', 'π'],
    rho: ['\\rho', 'ρ'],
    varrho: ['\\varrho', 'ϱ'],
    sigma: ['\\sigma', 'σ'],
    varsigma: ['\\varsigma', 'ς'],
    tau: ['\\tau', 'τ'],
    upsilon: ['\\upsilon', 'υ'],
    phi: ['\\phi', 'φ'],
    varphi: ['\\varphi', 'φ'],
    chi: ['\\chi', 'χ'],
    psi: ['\\psi', 'ψ'],
    omega: ['\\omega', 'ω'],
    Alpha: ['Α', 'Α'],
    Beta: ['Β', 'Β'],
    Gamma: ['\\Gamma', 'Γ'],
    Delta: ['\\Delta', 'Δ'],
    Epsilon: ['Ε', 'Ε'],
    Zeta: ['Ζ', 'Ζ'],
    Eta: ['Η', 'Η'],
    Theta: ['\\Theta', 'Θ'],
    Iota: ['Ι', 'Ι'],
    Kappa: ['Κ', 'Κ'],
    Lambda: ['\\Lambda', 'Λ'],
    Mu: ['Μ', 'Μ'],
    Nu: ['Ν', 'Ν'],
    Xi: ['\\Xi', 'Ξ'],
    Omicron: ['Ο', 'Ο'],
    Pi: ['\\Pi', 'Π'],
    Rho: ['Ρ', 'Ρ'],
    Sigma: ['\\Sigma', 'Σ'],
    Tau: ['Τ', 'Τ'],
    Upsilon: ['\\Upsilon', 'Υ'],
    Phi: ['\\Phi', 'Φ'],
    Chi: ['Χ', 'Χ'],
    Psi: ['\\Psi', 'Ψ'],
    Omega: ['\\Omega', 'Ω']
  };

  const CALCULUS_TEMPLATES = {
    int: '\\int_{\\placeholder{}}^{\\placeholder{}}\\,dx',
    integral: '\\int_{\\placeholder{}}^{\\placeholder{}}\\,dx',
    sum: '\\sum_{i=\\placeholder{}}^{\\placeholder{}}',
    prod: '\\prod_{i=\\placeholder{}}^{\\placeholder{}}',
    product: '\\prod_{i=\\placeholder{}}^{\\placeholder{}}'
  };

  const TEXT_TEMPLATES = {
    sin: '\\sin', cos: '\\cos', tan: '\\tan',
    cot: '\\cot', sec: '\\sec', csc: '\\csc',
    arcsin: '\\arcsin', arccos: '\\arccos', arctan: '\\arctan',
    asin: '\\arcsin', acos: '\\arccos', atan: '\\arctan',
    sinh: '\\sinh', cosh: '\\cosh', tanh: '\\tanh',
    asinh: '\\operatorname{asinh}', acosh: '\\operatorname{acosh}',
    atanh: '\\operatorname{atanh}', arsinh: '\\operatorname{arsinh}',
    arcosh: '\\operatorname{arcosh}', artanh: '\\operatorname{artanh}',
    ln: '\\ln', log: '\\log', log2: '\\log_{2}', log10: '\\log_{10}',
    exp: '\\exp', sqrt: '\\sqrt{\\placeholder{}}',
    erf: '\\operatorname{erf}', erfc: '\\operatorname{erfc}',
    cbrt: '\\sqrt[3]{\\placeholder{}}', abs: '\\operatorname{abs}',
    floor: '\\operatorname{floor}', ceil: '\\operatorname{ceil}',
    round: '\\operatorname{round}', sign: '\\operatorname{sign}',
    sgn: '\\operatorname{sgn}', min: '\\operatorname{min}',
    max: '\\operatorname{max}', mod: '\\operatorname{mod}',
    pow: '\\operatorname{pow}', hypot: '\\operatorname{hypot}',
    clamp: '\\operatorname{clamp}', nthroot: '\\operatorname{nthroot}',
    atan2: '\\operatorname{atan2}', if: '\\operatorname{if}',
    diff: '\\operatorname{diff}', derivative: '\\operatorname{derivative}',
    infinity: '\\infty', inf: '\\infty', oo: '\\infty'
  };

  const INLINE_SHORTCUTS = {
    ...Object.fromEntries(Object.entries(GREEK_LETTERS).map(([name, [latex]]) => [name, latex])),
    ...TEXT_TEMPLATES,
    ...CALCULUS_TEMPLATES,
    infty: '\\infty',
    digamma: '\\psi',
    polygamma: '\\operatorname{polygamma}',
    lambertw: 'W',
    lambertwminus: 'W_{-1}'
  };
  const LATEX_LITERAL = /\\(?:operatorname\*?|text|mathrm)\{[^{}]*\}|\\(?:[A-Za-z]+|[^\r\n])/g;
  const SHORTCUT_NAMES = Object.keys(INLINE_SHORTCUTS).sort((a, b) => b.length - a.length);
  const RAW_SHORTCUTS = new RegExp(SHORTCUT_NAMES.join('|'), 'g');
  const PASTED_SHORTCUTS = new RegExp(LATEX_LITERAL.source + '|' + RAW_SHORTCUTS.source, 'g');
  const MAX_SHORTCUT_LENGTH = SHORTCUT_NAMES[0].length;
  const ALIAS_SUFFIXES = {
    t: { remaining: 'egral', template: CALCULUS_TEMPLATES.int },
    d: { remaining: 'uct', template: CALCULUS_TEMPLATES.prod }
  };
  const fieldTyping = new WeakMap();

  function applyShortcutOptions(field) {
    try {
      if (field.inlineShortcutTimeout === 0 && field.inlineShortcuts?.int === INLINE_SHORTCUTS.int &&
          field.inlineShortcuts?.alpha === INLINE_SHORTCUTS.alpha) return;
      field.inlineShortcuts = { ...INLINE_SHORTCUTS };
      field.inlineShortcutTimeout = 0;
    } catch (error) { /* The math field may not be mounted yet. */ }
  }

  function expandPlainShortcuts(text) {
    return text.replace(PASTED_SHORTCUTS, (token, offset) => {
      if (token.startsWith('\\')) return token;
      const replacement = INLINE_SHORTCUTS[token];
      if (replacement.includes('\\placeholder') && /^\s*\(/.test(text.slice(offset + token.length))) {
        return '\\operatorname{' + token + '}';
      }
      const next = text[offset + token.length] || '';
      return replacement + (/[A-Za-z]$/.test(replacement) && /[A-Za-z]/.test(next) ? ' ' : '');
    });
  }

  function convertShortcutAtCaret(field) {
    const range = field.selection?.ranges[0];
    if (!range || range[0] !== range[1]) return;
    const [start] = range;
    const caret = start;
    let left = '';
    let right = '';
    for (let offset = caret; offset > 0 && left.length < MAX_SHORTCUT_LENGTH; offset -= 1) {
      const letter = field.getValue(offset - 1, offset, 'latex');
      if (!/^[A-Za-z0-9]$/.test(letter)) break;
      left = letter + left;
    }
    if (!left) return;
    for (let offset = caret; offset < field.lastOffset && right.length < MAX_SHORTCUT_LENGTH; offset += 1) {
      const letter = field.getValue(offset, offset + 1, 'latex');
      if (!/^[A-Za-z0-9]$/.test(letter)) break;
      right += letter;
    }
    const match = Array.from((left + right).matchAll(RAW_SHORTCUTS)).find(({ index, 0: token }) =>
      index < left.length && index + token.length >= left.length
    );
    if (!match) return;
    const [token] = match;
    const offset = caret - left.length + match.index;
    const replacement = INLINE_SHORTCUTS[token];
    field.selection = { ranges: [[offset, offset + token.length]], direction: 'forward' };
    field.insert(replacement, {
      format: 'latex',
      selectionMode: replacement.includes('\\placeholder') ? 'placeholder' : 'after'
    });
  }

  function extendErfAtCaret(field) {
    const ranges = field.selection?.ranges;
    if (!ranges || ranges.length !== 1) return false;
    const [caret, end] = ranges[0];
    if (caret !== end || caret <= 0) return false;
    const operator = field.getElementInfo(caret);
    if (operator?.latex !== TEXT_TEMPLATES.erf) return false;
    // The operator includes child atoms for the letters in its name.
    let start = caret - 1;
    while (start > 0 && field.getElementInfo(start).depth > operator.depth) start -= 1;
    field.selection = { ranges: [[start, caret]], direction: 'forward' };
    return field.insert(TEXT_TEMPLATES.erfc, { format: 'latex', selectionMode: 'after' });
  }

  function attachShortcutInput(field) {
    // A selected template placeholder clears MathLive's key buffer. Match the
    // remainder of a longer alias without delaying its shorter shortcut.
    let pendingAlias = null;
    function handleCharacter(character) {
      if (character === 'c' && extendErfAtCaret(field)) {
        pendingAlias = null;
        return true;
      }
      if (pendingAlias && character === pendingAlias.remaining[0]) {
        if (!pendingAlias.selection) {
          const latex = getLatex(field);
          if (latex === pendingAlias.before || !latex.includes(pendingAlias.template) ||
              !getSelectionLatex(field).includes('\\placeholder')) {
            pendingAlias = null;
            return false;
          }
          pendingAlias.latex = latex;
          pendingAlias.selection = field.selection;
        }
        pendingAlias.remaining = pendingAlias.remaining.slice(1);
        if (pendingAlias.remaining) return false;
        const { latex, selection } = pendingAlias;
        pendingAlias = null;
        field.setValue(latex, { silenceNotifications: true });
        field.selection = selection;
        field.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        return true;
      }

      const alias = ALIAS_SUFFIXES[character];
      pendingAlias = alias ? { ...alias, before: getLatex(field) } : null;
      return false;
    }
    fieldTyping.set(field, handleCharacter);
    field.addEventListener('keydown', (event) => {
      if (event.isComposing || event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) {
        pendingAlias = null;
      } else if (handleCharacter(event.key)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, true);
    field.addEventListener('blur', () => {
      queueMicrotask(() => {
        if (!field.hasFocus()) pendingAlias = null;
      });
    });
    field.addEventListener('pointerdown', () => { pendingAlias = null; });
    field.addEventListener('input', (event) => {
      // The built-in keyboard shortcuts only see the current key sequence.
      // Also look for a spelling completed beside letters already in the formula.
      if (event.inputType === 'insertText' && /^[A-Za-z0-9]$/.test(event.data || '')) {
        convertShortcutAtCaret(field);
      }
    });
    field.addEventListener('paste', (event) => {
      const clipboard = event.clipboardData;
      if (!clipboard || clipboard.getData('application/x-latex')) return;
      const text = clipboard.getData('text/plain');
      if (text === 'c' && extendErfAtCaret(field)) {
        event.preventDefault();
        pendingAlias = null;
        return;
      }
      const converted = expandPlainShortcuts(text);
      if (converted === text) return;
      event.preventDefault();
      pendingAlias = null;
      field.insert(converted, { format: 'latex', selectionMode: 'placeholder' });
    });
  }

  function typeCharacter(field, character) {
    if (!fieldTyping.get(field)?.(character)) {
      field.executeCommand(['typedText', character, { simulateKeystroke: true }]);
    }
  }

  function restoreCalculusPlaceholders(latex) {
    const text = String(latex || '');
    if (!/\\int|\\sum|\\prod/.test(text)) return text;

    return text.replace(
      /(\\(?:int|sum|prod))([^]*?)(?=\\left|\\,|$)/g,
      (whole, operator, bounds) => {
        let fixed = bounds.replace(/([_^])\{\}/g, '$1{\\placeholder{}}');
        if (operator === '\\sum' || operator === '\\prod') {
          fixed = fixed.replace(/_\{i=\}/g, '_{i=\\placeholder{}}');
        }
        return operator + fixed;
      }
    );
  }

  function restoreSymbolPlaceholders(latex) {
    let next = String(latex || '');
    next = next.replace(/\\sqrt\{\}/g, '\\sqrt{\\placeholder{}}');
    next = next.replace(/\\sqrt\[3\]\{\}/g, '\\sqrt[3]{\\placeholder{}}');
    next = next.replace(/\\sqrt\[\]\{\}/g, '\\sqrt[\\placeholder{}]{\\placeholder{}}');
    next = next.replace(/\\left\|\s*\\right\|/g, '\\left|\\placeholder{}\\right|');
    next = next.replace(/\\left\\lfloor\s*\\right\\rfloor/g, '\\left\\lfloor\\placeholder{}\\right\\rfloor');
    next = next.replace(/\\left\\lceil\s*\\right\\rceil/g, '\\left\\lceil\\placeholder{}\\right\\rceil');
    return next;
  }

  function attachCalculusPlaceholderRestore(field) {
    if (!field || field.__calculusRestoreAttached) return;
    field.__calculusRestoreAttached = true;
    field.addEventListener('input', () => restoreFieldPlaceholders(field));
  }

  function restoreFieldPlaceholders(field) {
    if (field.__calculusRestoring) return;
    const latex = getLatex(field);
    const fixed = restoreSymbolPlaceholders(restoreCalculusPlaceholders(latex));
    if (fixed === latex) return;
    const position = Number(field.position);
    field.__calculusRestoring = true;
    try {
      field.setValue(fixed, {
        silenceNotifications: true,
        selectionMode: 'after'
      });
      if (Number.isFinite(position)) field.position = position;
    } catch (error) {
      /* 保持当前输入 */
    } finally {
      field.__calculusRestoring = false;
    }
  }

  function configureField(field) {
    if (!field) return field;
    try {
      field.mathVirtualKeyboardPolicy = 'manual';
      if (window.mathVirtualKeyboard) {
        try { window.mathVirtualKeyboard.visible = false; } catch (error) { /* 忽略 */ }
      }
      field.defaultMode = 'math';
      field.smartMode = false;
      field.smartFence = true;
      field.smartSuperscript = true;
      field.letterShapeStyle = 'tex';
      field.menuItems = [];
      field.placeholder = '\\text{' + (Plotsy.i18n ? Plotsy.i18n.t('输入表达式') : '输入表达式') + '}';
    } catch (error) { /* 某些旧版本的属性可能不可用 */ }
    if (!field.hasAttribute('aria-label')) field.setAttribute('aria-label', '数学表达式');
    field.setAttribute('autocomplete', 'off');
    field.setAttribute('spellcheck', 'false');
    applyShortcutOptions(field);
    attachShortcutInput(field);
    attachCalculusPlaceholderRestore(field);
    field.addEventListener('keydown', (event) => {
      if (event.isComposing || event.keyCode === 229 || event.ctrlKey || event.metaKey || event.altKey ||
          (event.key !== 'Backspace' && event.key !== 'Delete')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      deleteMath(field, event.key === 'Delete');
    }, true);
    /* MathLive 在首次挂载后可能会重置快捷方式，待其完成挂载再写入一次。 */
    window.setTimeout(() => applyShortcutOptions(field), 0);
    return field;
  }

  function createField() {
    const field = document.createElement('math-field');
    field.className = 'math-field';
    return configureField(field);
  }

  function setLatex(field, latex, options) {
    if (!field) return;
    const opts = options || {};
    try {
      field.mode = 'math';
      field.setValue(latex || '', {
        silenceNotifications: true,
        selectionMode: opts.selectPlaceholder ? 'placeholder' : 'after'
      });
      field.mode = 'math';
    } catch (error) {
      field.value = latex || '';
    }
    if (opts.focus) focusField(field);
  }

  function getLatex(field) {
    if (!field) return '';
    try { return field.getValue('latex') || ''; } catch (error) { return ''; }
  }

  function getAscii(field) {
    if (!field) return '';
    try { return field.getValue('ascii-math') || ''; } catch (error) { return ''; }
  }

  function focusField(field) {
    if (!field) return;
    try {
      applyShortcutOptions(field);
      field.mode = 'math';
      field.focus();
      const sink = field.shadowRoot && field.shadowRoot.querySelector('[part="keyboard-sink"]');
      if (sink) sink.focus();
      window.setTimeout(() => applyShortcutOptions(field), 0);
    } catch (error) { /* 忽略 */ }
  }

  function getSelectionLatex(field) {
    if (!field) return '';
    try {
      if (!field.selection || !field.selection.ranges || field.selection.ranges.length === 0) return '';
      return field.getValue(field.selection, 'latex') || '';
    } catch (error) {
      return '';
    }
  }

  function insertLatex(field, latex, options) {
    if (!field || !latex) return false;
    const opts = options || {};
    focusField(field);
    try {
      return field.insert(latex, {
        format: 'latex',
        selectionMode: opts.selectPlaceholder ? 'placeholder' : (opts.selectionMode || 'after'),
        focus: true
      });
    } catch (error) {
      return false;
    }
  }

  const EMPTY_PLACEHOLDER = /\\placeholder(?:\[[^\]]*\])?\{\}/g;
  const EMPTY_STRUCTURE = /^(?:\\sqrt(?:\[(?:3)?\])?\{\}|\\frac(?:\{\}\{\}|\{d\}\{dx\})|\\left\|\\right\||\\left\\lfloor\\right\\rfloor|\\left\\lceil\\right\\rceil)$/;
  const EMPTY_CALCULUS = /^\\(?:int(?:_\{\})?(?:\^\{\})?(?:\\,dx)?|(?:sum|prod)(?:_\{(?:[A-Za-z]=)?\})?(?:\^\{\})?)$/;
  const EMPTY_PARENS = /^(.*?)\\left[.(](?:\\,)*\\right[.)](?:\^\{\})?$/;
  const PAREN_FUNCTIONS = new Set([...Object.values(COMMANDS), '\\zeta', '\\Gamma', '\\psi', 'W']);
  const FUNCTION_WITH_SCRIPT = /^(?:\\log_(?:2|\{(?:2|10)\})|\\psi_\{\}|W_\{-1\})$/;
  const NAMED_OPERATOR = /^\\operatorname\{[A-Za-z0-9]+\}$/;

  function isEmptyTemplate(latex) {
    const compact = latex.replace(EMPTY_PLACEHOLDER, '').replace(/\s+/g, '');
    if (EMPTY_STRUCTURE.test(compact) || EMPTY_CALCULUS.test(compact) || NAMED_OPERATOR.test(compact)) return true;
    const parens = compact.match(EMPTY_PARENS);
    if (!parens) return false;
    const prefix = parens[1];
    return !prefix || PAREN_FUNCTIONS.has(prefix) || NAMED_OPERATOR.test(prefix) || FUNCTION_WITH_SCRIPT.test(prefix);
  }

  function selectEmptyTemplate(field, forward) {
    const { ranges } = field.selection;
    if (ranges.length !== 1) return;
    const [from, to] = ranges[0];
    if (from !== to && !/^\\placeholder(?:\[[^\]]*\])?\{\}$/.test(field.getValue(from, to, 'latex'))) return;

    // Empty templates span only a handful of nearby atoms. Match complete
    // sibling ranges so surrounding terms and enclosing structures stay intact.
    const searchRadius = 24;
    const first = Math.max(0, from - searchRadius);
    const last = Math.min(field.lastOffset, to + searchRadius);
    for (let end = Math.max(to, forward ? from + 1 : from); end <= last; end += 1) {
      const { depth, latex } = field.getElementInfo(end);
      if (latex !== 'x' && !/^[\\^]/.test(latex)) continue;
      let match = null;
      for (let start = Math.min(end - 1, forward ? from : from - 1); start >= first; start -= 1) {
        const before = field.getElementInfo(start);
        if (before.depth < depth) break;
        if (before.depth === depth && isEmptyTemplate(field.getValue(start, end, 'latex'))) match = start;
      }
      if (match !== null) {
        // The integral template's differential is three adjacent atoms.
        if (latex.startsWith('\\int') && end + 3 <= field.lastOffset &&
            field.getElementInfo(end + 3).depth === depth && field.getValue(end, end + 3, 'latex') === '\\,dx') {
          end += 3;
        }
        field.selection = { ranges: [[match, end]], direction: 'forward' };
        return;
      }
    }
  }

  function deleteMath(field, forward = false) {
    selectEmptyTemplate(field, forward);
    const deleted = field.executeCommand(forward ? 'deleteForward' : 'deleteBackward');
    restoreFieldPlaceholders(field);
    return deleted;
  }

  function deleteBackward(field) {
    return deleteMath(field);
  }

  function moveToPlaceholder(field) {
    if (!field) return false;
    try { return field.executeCommand('moveToNextPlaceholder'); } catch (error) { return false; }
  }

  function selectPlaceholder(field) {
    if (!field) return false;
    try {
      field.setValue(field.getValue('latex') || '', {
        silenceNotifications: true,
        selectionMode: 'placeholder'
      });
      focusField(field);
      return true;
    } catch (error) {
      return false;
    }
  }

  function insertTemplate(field, latex) {
    if (!field || !latex) return false;
    try {
      field.setValue('', { silenceNotifications: true });
      focusField(field);
      return field.insert(latex, {
        format: 'latex',
        selectionMode: 'placeholder',
        focus: true
      });
    } catch (error) {
      return false;
    }
  }

  function functionSpec(name) {
    const special = {
      zeta: '\\zeta\\left(\\,\\right)',
      gamma: '\\Gamma\\left(\\,\\right)',
      digamma: '\\psi\\left(\\,\\right)',
      polygamma: '\\psi_{\\placeholder{}}\\left(\\,\\right)',
      lambertw: 'W\\left(\\,\\right)',
      lambertwminus: 'W_{-1}\\left(\\,\\right)'
    }[name];
    if (special) return { kind: 'special', latex: special };

    if (COMMANDS[name]) return { kind: 'command', command: COMMANDS[name] };

    if (name === 'sqrt') return { kind: 'sqrt' };
    if (name === 'cbrt') return { kind: 'cbrt' };
    if (name === 'nthroot') return { kind: 'nthroot' };
    if (name === 'abs') return { kind: 'abs' };
    if (name === 'floor') return { kind: 'floor' };
    if (name === 'ceil') return { kind: 'ceil' };
    if (name === 'log2') return { kind: 'log', base: '2' };
    if (name === 'log10') return { kind: 'log', base: '10' };
    if (name === 'pow') return { kind: 'power' };

    if (OPERATOR_TEMPLATES[name]) return { kind: 'operator', ...OPERATOR_TEMPLATES[name] };
    return { kind: 'command', command: '\\operatorname{' + name + '}' };
  }

  function moveIntoEmptyParens(field) {
    if (!field) return;
    try {
      field.executeCommand('moveToPreviousChar');
    } catch (error) {
      /* 命令不可用时保持插入后的光标 */
    }
    focusField(field);
  }

  function insertFunction(field, name) {
    if (!field) return;
    const spec = functionSpec(name);
    const selected = getSelectionLatex(field);

    if (spec.kind === 'special') {
      const inserted = insertLatex(field, spec.latex, {
        selectionMode: name === 'polygamma' ? 'placeholder' : 'after'
      });
      if (inserted && name !== 'polygamma') moveIntoEmptyParens(field);
      return;
    }

    if (spec.kind === 'command') {
      if (selected) {
        insertLatex(field, spec.command + '\\left(' + selected + '\\right)', { selectionMode: 'after' });
      } else {
        insertLatex(field, spec.command + ' ', { selectionMode: 'after' });
      }
      return;
    }

    if (spec.kind === 'sqrt') {
      insertLatex(field, selected ? '\\sqrt{' + selected + '}' : '\\sqrt{\\placeholder{}}', {
        selectPlaceholder: !selected,
        selectionMode: selected ? 'after' : 'placeholder'
      });
      return;
    }

    if (spec.kind === 'cbrt') {
      insertLatex(field, selected ? '\\sqrt[3]{' + selected + '}' : '\\sqrt[3]{\\placeholder{}}', {
        selectPlaceholder: !selected,
        selectionMode: selected ? 'after' : 'placeholder'
      });
      return;
    }

    if (spec.kind === 'nthroot') {
      insertLatex(field, '\\sqrt[\\placeholder{}]{' + (selected || '\\placeholder{}') + '}', {
        selectPlaceholder: true,
        selectionMode: 'placeholder'
      });
      return;
    }

    if (spec.kind === 'abs') {
      insertLatex(field, '\\left|' + (selected || '\\placeholder{}') + '\\right|', {
        selectPlaceholder: !selected,
        selectionMode: selected ? 'after' : 'placeholder'
      });
      return;
    }

    if (spec.kind === 'floor' || spec.kind === 'ceil') {
      const left = spec.kind === 'floor' ? '\\lfloor' : '\\lceil';
      const right = spec.kind === 'floor' ? '\\rfloor' : '\\rceil';
      insertLatex(field, '\\left' + left + ' ' + (selected || '\\placeholder{}') + '\\right' + right, {
        selectPlaceholder: !selected,
        selectionMode: selected ? 'after' : 'placeholder'
      });
      return;
    }

    if (spec.kind === 'log') {
      const inserted = insertLatex(
        field,
        '\\log_{' + spec.base + '}\\left(' + (selected || '\\,') + '\\right)',
        { selectionMode: 'after' }
      );
      if (inserted && !selected) moveIntoEmptyParens(field);
      return;
    }

    if (spec.kind === 'power') {
      insertLatex(field, '\\left(' + (selected || '\\,') + '\\right)^{}', {
        selectionMode: 'after'
      });
      return;
    }

    if (spec.kind === 'operator') {
      const inserted = insertLatex(
        field,
        '\\operatorname{' + spec.name + '}\\left(' + '\\,' + '\\right)',
        { selectionMode: 'after' }
      );
      if (inserted) moveIntoEmptyParens(field);
    }
  }

  function insertScript(field, kind) {
    if (!field) return false;
    const selected = getSelectionLatex(field);
    const mark = kind === '_' ? '_' : '^';
    const latex = selected
      ? '{' + selected + '}' + mark + '{}'
      : mark + '{}';
    const inserted = insertLatex(field, latex, { selectionMode: 'after' });
    if (!inserted) return false;
    try {
      field.executeCommand(kind === '_' ? 'moveToSubscript' : 'moveToSuperscript');
    } catch (error) {
      /* 命令不可用时保持插入后的光标 */
    }
    focusField(field);
    return true;
  }

  function calculusInsertion(kind, selected) {
    const selectedText = String(selected || '').trim();
    const hasRealSelection = !!selectedText;
    const body = hasRealSelection ? selectedText : '';
    let latex = '';

    if (kind === 'diff') {
      latex = '\\frac{d}{dx}' + body;
    } else if (kind === 'integral') {
      latex = '\\int_{\\placeholder{}}^{\\placeholder{}}' + body + '\\,dx';
    } else if (kind === 'sum' || kind === 'product') {
      const operator = kind === 'sum' ? '\\sum' : '\\prod';
      latex = operator + '_{i=\\placeholder{}}^{\\placeholder{}}' + body;
    }

    return { latex, hasRealSelection };
  }

  function insertCalculus(field, kind) {
    if (!field) return false;
    const selected = getSelectionLatex(field);
    const insertion = calculusInsertion(kind, selected);
    if (!insertion.latex) return false;
    focusField(field);
    try {
      field.insert(insertion.latex, {
        format: 'latex',
        selectionMode: 'placeholder',
        focus: true
      });
    } catch (error) {
      return false;
    }
    focusField(field);
    return true;
  }

  const GREEK_ASCII = Object.fromEntries(
    Object.entries(GREEK_LETTERS).map(([name, pair]) => [name, pair[1]])
  );

  function normalizeMathliveAscii(input) {
    let s = String(input || '')
      .replace(/\u200b/g, '')
      .replace(/\u2061/g, '')
      .replace(/[−–—]/g, '-')
      .replace(/\\([{}])/g, '$1')
      .replace(/\\lbrace\b/g, '{')
      .replace(/\\rbrace\b/g, '}')
      .replace(/\s+/g, ' ')
      .trim();

    s = s.replace(/\\(Gamma|gamma|zeta|psi|digamma|lambertwminus|lambertw|polygamma)/g, '$1');
    s = s.replace(/\\(?:Gamma|gamma)\b/g, 'gamma');
    s = s.replace(/\\zeta\b/g, 'zeta');
    s = s.replace(/\\(?:psi|digamma)\b/g, 'digamma');
    s = s.replace(/\\lambertwminus\b/g, 'lambertwminus');
    s = s.replace(/\\lambertw\b/g, 'lambertw');

    s = s.replace(/⌊([^⌋]*)⌋/g, 'floor($1)');
    s = s.replace(/⌈([^⌉]*)⌉/g, 'ceil($1)');
    s = s.replace(/\\lfloor\s*([^\\]*?)\s*\\rfloor/g, 'floor($1)');
    s = s.replace(/\\lceil\s*([^\\]*?)\s*\\rceil/g, 'ceil($1)');
    s = s.replace(/log\s*_\s*\(?\s*(\d+)\s*\)?\s*(?=\()/g, 'log$1');
    s = s.replace(/root\s*\(\s*3\s*\)\s*\(([^()]*)\)/g, 'cbrt($1)');
    s = s.replace(/root\s*\(\s*([^()]+)\s*\)\s*\(([^()]*)\)/g, 'nthroot($2,$1)');

    s = s.replace(/(^|[^A-Za-z])(?:infinity|infty|inf)(?![A-Za-z])/gi, '$1inf');
    s = s.replace(/(^|[^A-Za-z])oo(?![A-Za-z])/gi, '$1inf');
    s = s.replace(/∞/g, 'inf');
    s = s.replace(/([A-Za-z\u0370-\u03ff])_\(([^()]*)\)/g, (_, name, subscript) =>
      name + '_' + subscript.replace(/\s/g, '')
    );

    const greekNames = Object.keys(GREEK_ASCII).sort((a, b) => b.length - a.length);
    for (const name of greekNames) {
      const pattern = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp('(^|[^A-Za-z])' + pattern + '(?![A-Za-z])', 'g');
      s = s.replace(regex, '$1' + GREEK_ASCII[name]);
    }

    s = s.replace(/\\Gamma\b/g, 'gamma');
    s = s.replace(/\\zeta\b/g, 'zeta');
    s = s.replace(/\\psi\b/g, 'digamma');
    s = s.replace(/Γ/g, 'gamma');
    s = s.replace(/ζ/g, 'zeta');
    s = s.replace(/ψ\s*_\s*\{?\s*([A-Za-z0-9]+)\s*\}?\s*'\s*\(/g, "polygamma'($1,");
    s = s.replace(/ψ\s*_\s*\{?\s*([A-Za-z0-9]+)\s*\}?\s*\(/g, 'polygamma($1,');
    s = s.replace(/ψ/g, 'digamma');
    s = s.replace(/γ\s*\(/g, 'gamma(');
    s = s.replace(/γ\s*'(?=\s*\()/g, "gamma'");
    s = s.replace(/W\s*_\s*\{?\s*-\s*1\s*\}?/g, 'lambertwminus');
    s = s.replace(/W(?=\s*[('])/g, 'lambertw');

    const names = Object.keys(Plotsy.math.functions)
      .filter((name) => name.length > 1 && name !== 'erf' && name !== 'erfc')
      .sort((a, b) => b.length - a.length);
    for (const name of names) {
      const pattern = name.split('').map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*');
      const regex = new RegExp('(^|[^A-Za-z])' + pattern + '(?=\\s*\\()', 'gi');
      s = s.replace(regex, (match, prefix) => prefix + name);
    }

    return s;
  }

  function readGroup(text, index) {
    let i = index;
    while (i < text.length && text[i] === ' ') i += 1;
    if (i >= text.length) return null;
    const open = text[i];
    if (open === '(' || open === '{' || open === '[') {
      const close = open === '(' ? ')' : (open === '{' ? '}' : ']');
      let depth = 0;
      for (let j = i; j < text.length; j += 1) {
        if (text[j] === open) depth += 1;
        else if (text[j] === close) {
          depth -= 1;
          if (depth === 0) return { text: text.slice(i, j + 1), next: j + 1 };
        }
      }
      return null;
    }

    let sign = '';
    if (open === '+' || open === '-') {
      sign = open;
      i += 1;
    }
    while (i < text.length && text[i] === ' ') i += 1;
    const rest = text.slice(i);
    let match = /^\d+(?:\.\d+)?/.exec(rest);
    if (!match) match = /^[A-Za-z\u0370-\u03ff]+/.exec(rest);
    if (!match) return null;
    return { text: sign + match[0], next: i + match[0].length };
  }

  function stripOuterParens(text) {
    const value = String(text || '').trim();
    if (value[0] !== '(' || value[value.length - 1] !== ')') return value;
    let depth = 0;
    for (let i = 0; i < value.length; i += 1) {
      if (value[i] === '(') depth += 1;
      else if (value[i] === ')') {
        depth -= 1;
        if (depth === 0) return i === value.length - 1 ? value.slice(1, -1).trim() : value;
      }
    }
    return value;
  }

  function parseDerivativeAscii(s, depth) {
    const match = /^\(d\)\/\(d\s*([A-Za-z\u0370-\u03ff])\)\s*/i.exec(s);
    if (!match) return null;
    const rest = s.slice(match[0].length).trim();
    if (!rest) return null;
    const group = readGroup(rest, 0);
    const bodyText = group && !rest.slice(group.next).trim() ? group.text : rest;
    const body = convertCalculusString(stripOuterParens(bodyText), depth + 1);
    if (!body) return null;
    return 'diff(' + body + ',' + match[1] + ')';
  }

  function parseIntegralAscii(s, depth) {
    if (!/^int\b/i.test(s)) return null;
    let index = 3;
    while (s[index] === ' ') index += 1;

    let lower = null;
    let upper = null;

    if (s[index] === '_') {
      const group = readGroup(s, index + 1);
      if (!group) return null;
      lower = group.text;
      index = group.next;
      while (s[index] === ' ') index += 1;
    }

    if (s[index] === '^') {
      const group = readGroup(s, index + 1);
      if (!group) return null;
      upper = group.text;
      index = group.next;
    }

    if (lower === null || upper === null) return null;

    let rest = s.slice(index).trim();
    let variable = 'x';
    const diffMatch = /d\s*([A-Za-z\u0370-\u03ff])\s*$/.exec(rest);
    if (diffMatch) {
      variable = diffMatch[1];
      rest = rest.slice(0, diffMatch.index).trim();
    }
    rest = rest.replace(/^\\?,/, '').trim();
    if (!rest) return null;

    const body = convertCalculusString(stripOuterParens(rest), depth + 1);
    const lowerText = convertCalculusString(stripOuterParens(lower), depth + 1) || '0';
    const upperText = convertCalculusString(stripOuterParens(upper), depth + 1) || '0';
    return 'integral(' + body + ',' + variable + ',' + lowerText + ',' + upperText + ')';
  }

  function parseSumAscii(s, name, depth) {
    const product = name === 'prod';
    if (!new RegExp('^' + name + '\\b', 'i').test(s)) return null;
    let index = name.length;
    while (s[index] === ' ') index += 1;

    let lower = null;
    let upper = null;

    if (s[index] === '_') {
      const group = readGroup(s, index + 1);
      if (!group) return null;
      lower = group.text;
      index = group.next;
      while (s[index] === ' ') index += 1;
    }

    if (s[index] === '^') {
      const group = readGroup(s, index + 1);
      if (!group) return null;
      upper = group.text;
      index = group.next;
    }

    if (!lower || !upper) return null;
    const bodyText = s.slice(index).trim();
    if (!bodyText) return null;

    const lowerText = stripOuterParens(lower);
    const equals = lowerText.indexOf('=');
    if (equals < 0) return null;
    const variable = lowerText.slice(0, equals).trim() || 'n';
    const start = convertCalculusString(lowerText.slice(equals + 1).trim(), depth + 1) || '0';
    const end = convertCalculusString(stripOuterParens(upper), depth + 1) || '0';
    const body = convertCalculusString(stripOuterParens(bodyText), depth + 1);
    return (product ? 'product(' : 'sum(') + body + ',' + variable + ',' + start + ',' + end + ')';
  }

  function convertCalculusString(input, depth) {
    const text = String(input || '').trim();
    if (!text || depth > 20) return text;

    const derivative = parseDerivativeAscii(text, depth);
    if (derivative) return derivative;

    const integral = parseIntegralAscii(text, depth);
    if (integral) return integral;

    const sum = parseSumAscii(text, 'sum', depth);
    if (sum) return sum;

    const product = parseSumAscii(text, 'prod', depth);
    if (product) return product;

    /* 微积分可以出现在等号右侧或表达式中间，例如 k(x)=∫_0^x ...。 */
    const tokenPattern = /\b(integral|int|sigma|sum|product|prod)\b/i;
    const derivativePattern = /\(d\)\/\(d\s*[A-Za-z\u0370-\u03ff]\)/i;
    const tokenMatch = tokenPattern.exec(text);
    const derivativeMatch = derivativePattern.exec(text);
    let start = -1;
    let kind = '';
    if (tokenMatch) {
      start = tokenMatch.index;
      kind = tokenMatch[1].toLowerCase();
    }
    if (derivativeMatch && (start < 0 || derivativeMatch.index < start)) {
      start = derivativeMatch.index;
      kind = 'derivative';
    }
    if (start < 0) return text;

    const prefix = text.slice(0, start);
    let tail = text.slice(start);
    if (kind === 'integral') tail = 'int' + tail.slice('integral'.length);
    else if (kind === 'sigma') tail = 'sum' + tail.slice('sigma'.length);
    else if (kind === 'product') tail = 'prod' + tail.slice('product'.length);

    let converted = null;
    if (kind === 'derivative') {
      converted = parseDerivativeAscii(tail, depth + 1);
    } else if (kind === 'int') {
      converted = parseIntegralAscii(tail, depth + 1);
    } else if (kind === 'sum') {
      converted = parseSumAscii(tail, 'sum', depth + 1);
    } else if (kind === 'prod') {
      converted = parseSumAscii(tail, 'prod', depth + 1);
    }
    if (!converted) return text;
    return convertCalculusString(prefix, depth + 1) + converted;
  }

  function toInternal(latex, ascii) {
    // MathLive spells an unknown operator as separate ASCII variables (e r f).
    // Preserve explicit function atoms without converting a product of variables.
    const source = String(latex || '');
    const named = source.replace(/\\operatorname\{(erfc?)\}/g, '\\text{$1}');
    if (named !== source && global.MathLive?.convertLatexToAsciiMath) {
      ascii = global.MathLive.convertLatexToAsciiMath(named).replace(/"(erfc?)"\s*/g, '$1 ');
    }
    const s = normalizeMathliveAscii(ascii);
    if (!s) return '';
    return convertCalculusString(s, 0);
  }

  function readField(field) {
    return toInternal(getLatex(field), getAscii(field));
  }

  function latexFromExpression(expression, analysis) {
    if (expression && expression.latex) return expression.latex;
    if (!expression || !expression.raw || !expression.raw.trim()) return '';
    if (analysis && analysis.kind && analysis.kind !== 'error' && analysis.kind !== 'empty' && Plotsy.latex) {
      const latex = Plotsy.latex.toLatex(analysis);
      if (latex) return latex;
    }
    const text = String(expression.raw).replace(/[\\{}]/g, (ch) => '\\' + ch);
    return '\\text{' + text + '}';
  }

  Plotsy.mathfield = {
    available: !!MathfieldElement,
    configureField,
    createField,
    setLatex,
    getLatex,
    getAscii,
    getSelectionLatex,
    insertLatex,
    insertFunction,
    insertScript,
    insertCalculus,
    deleteBackward,
    moveToPlaceholder,
    selectPlaceholder,
    insertTemplate,
    focusField,
    toInternal,
    readField,
    typeCharacter,
    latexFromExpression
  };
})(typeof window !== 'undefined' ? window : globalThis);
