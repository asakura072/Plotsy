/*
 * Plotsy · 表达式 LaTeX 渲染
 * 把解析器 AST 转成 LaTeX，再用本地 KaTeX 离线渲染。
 */
(function (global) {
  'use strict';

  const Plotsy = (global.Plotsy = global.Plotsy || {});

  const RELATION = {
    '=': '=',
    '<': '<',
    '>': '>',
    '<=': '\\le',
    '>=': '\\ge'
  };

  const GREEK = {
    alpha: '\\alpha',
    beta: '\\beta',
    gamma: '\\gamma',
    delta: '\\delta',
    epsilon: '\\epsilon',
    varepsilon: '\\varepsilon',
    zeta: '\\zeta',
    eta: '\\eta',
    theta: '\\theta',
    vartheta: '\\vartheta',
    iota: '\\iota',
    kappa: '\\kappa',
    lambda: '\\lambda',
    mu: '\\mu',
    nu: '\\nu',
    xi: '\\xi',
    omicron: 'o',
    pi: '\\pi',
    rho: '\\rho',
    sigma: '\\sigma',
    tau: '\\tau',
    upsilon: '\\upsilon',
    phi: '\\varphi',
    chi: '\\chi',
    psi: '\\psi',
    omega: '\\omega'
  };

  const UNICODE_GREEK = {
    'α': '\\alpha', 'β': '\\beta', 'γ': '\\gamma', 'δ': '\\delta',
    'ε': '\\epsilon', 'ζ': '\\zeta', 'η': '\\eta', 'θ': '\\theta',
    'ι': '\\iota', 'κ': '\\kappa', 'λ': '\\lambda', 'μ': '\\mu',
    'ν': '\\nu', 'ξ': '\\xi', 'ο': 'o', 'π': '\\pi', 'ρ': '\\rho',
    'σ': '\\sigma', 'τ': '\\tau', 'υ': '\\upsilon', 'φ': '\\varphi',
    'χ': '\\chi', 'ψ': '\\psi', 'ω': '\\omega'
  };

  const FUNCTION_COMMANDS = {
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
    exp: '\\exp',
    min: '\\min',
    max: '\\max',
    zeta: '\\zeta',
    gamma: '\\Gamma',
    digamma: '\\psi',
    psi: '\\psi',
    lambertw: 'W',
    lambertwminus: 'W_{-1}'
  };

  function formatNumber(value) {
    if (Number.isNaN(value)) return '\\mathrm{NaN}';
    if (!Number.isFinite(value)) return value < 0 ? '-\\infty' : '\\infty';
    if (Object.is(value, -0)) value = 0;
    const text = String(value);
    if (!/e/i.test(text)) return text;
    const parts = text.split(/e/i);
    return parts[0] + ' \\times 10^{' + String(Number(parts[1])) + '}';
  }

  function safeName(name) {
    return String(name)
      .replace(/\\/g, '')
      .replace(/_/g, '\\_')
      .replace(/[^A-Za-z0-9\\_]/g, '');
  }

  function variableLatex(name) {
    if (name === 'inf' || name === 'infinity') return '\\infty';
    if (Object.prototype.hasOwnProperty.call(GREEK, name)) return GREEK[name];
    if (Object.prototype.hasOwnProperty.call(UNICODE_GREEK, name)) return UNICODE_GREEK[name];
    if (/^[a-zA-Z]$/.test(name)) return name;
    const subscript = /^([a-z\u0370-\u03ff])_([a-z0-9\u0370-\u03ff]+)$/i.exec(name);
    if (subscript) {
      const contents = Array.from(subscript[2], (char) => UNICODE_GREEK[char] || char).join(' ');
      return variableLatex(subscript[1]) + '_{' + contents + '}';
    }
    const cleaned = safeName(name);
    return cleaned ? '\\mathrm{' + cleaned + '}' : '\\mathrm{?}';
  }

  function wrap(tex) {
    return '\\left(' + tex + '\\right)';
  }

  function factorLatex(node) {
    const tex = astToLatex(node);
    if (node.type === 'binary' && (node.op === '+' || node.op === '-' || node.op === '*')) return wrap(tex);
    if (node.type === 'unary') return wrap(tex);
    if (node.type === 'compare') return wrap(tex);
    if (node.type === 'call' && node.name === 'if') return wrap(tex);
    return tex;
  }

  function baseLatex(node) {
    const tex = astToLatex(node);
    if (node.type === 'binary' || node.type === 'unary' || node.type === 'compare') return wrap(tex);
    if (node.type === 'call' && node.name === 'if') return wrap(tex);
    return tex;
  }

  function relationLatex(op) {
    return RELATION[op] || '=';
  }

  function argumentsLatex(args) {
    return args.map((arg) => astToLatex(arg)).join(',\\; ');
  }

  function callLatex(node) {
    const name = node.name;
    const args = node.args || [];
    const rendered = args.map((arg) => astToLatex(arg));

    if (name === 'diff' || name === 'derivative') {
      const variable = args[1] && args[1].type === 'variable' ? variableLatex(args[1].name) : 'x';
      return '\\frac{d}{d' + variable + '}\\left(' + (rendered[0] || '') + '\\right)';
    }

    if (name === 'integral' || name === 'int') {
      const variable = args[1] && args[1].type === 'variable' ? variableLatex(args[1].name) : 'x';
      if (args.length >= 4) {
        return '\\int_{' + (rendered[2] || '') + '}^{' + (rendered[3] || '') + '}\\left(' +
          (rendered[0] || '') + '\\right)\\,d' + variable;
      }
      return '\\int\\left(' + (rendered[0] || '') + '\\right)\\,d' + variable;
    }

    if (name === 'sum' || name === 'sigma' || name === 'product' || name === 'prod') {
      const variable = args[1] && args[1].type === 'variable' ? variableLatex(args[1].name) : 'n';
      const operator = name === 'product' || name === 'prod' ? '\\prod' : '\\sum';
      return operator + '_{' + variable + '=' + (rendered[2] || '') + '}^{' + (rendered[3] || '') +
        '}\\left(' + (rendered[0] || '') + '\\right)';
    }

    if (name === 'sqrt') return '\\sqrt{' + (rendered[0] || '') + '}';
    if (name === 'cbrt') return '\\sqrt[3]{' + (rendered[0] || '') + '}';
    if (name === 'nthroot') {
      const radicand = rendered[0] || '';
      const degree = rendered[1] || '';
      return '\\sqrt[' + degree + ']{' + radicand + '}';
    }
    if (name === 'abs') return '\\left|' + (rendered[0] || '') + '\\right|';
    if (name === 'pow') return wrap(rendered[0] || '') + '^{' + (rendered[1] || '') + '}';
    if (name === 'floor') return '\\left\\lfloor ' + (rendered[0] || '') + '\\right\\rfloor';
    if (name === 'ceil') return '\\left\\lceil ' + (rendered[0] || '') + '\\right\\rceil';
    if (name === 'log2') return '\\log_{2}\\left(' + (rendered[0] || '') + '\\right)';
    if (name === 'log10') return '\\log_{10}\\left(' + (rendered[0] || '') + '\\right)';
    if (name === 'round') return '\\operatorname{round}\\left(' + argumentsLatex(args) + '\\right)';
    if (name === 'sign') return '\\operatorname{sgn}\\left(' + (rendered[0] || '') + '\\right)';
    if (name === 'mod') return '\\operatorname{mod}\\left(' + argumentsLatex(args) + '\\right)';
    if (name === 'hypot') return '\\operatorname{hypot}\\left(' + argumentsLatex(args) + '\\right)';
    if (name === 'clamp') return '\\operatorname{clamp}\\left(' + argumentsLatex(args) + '\\right)';
    if (name === 'atan2') return '\\operatorname{atan2}\\left(' + argumentsLatex(args) + '\\right)';
    if (name === 'polygamma') return '\\psi_{' + (rendered[0] || '') + '}\\left(' + (rendered[1] || '') + '\\right)';

    if (name === 'if' && args.length >= 3) {
      return '\\operatorname{if}\\left(' + rendered.join(', ') + '\\right)';
    }

    if (FUNCTION_COMMANDS[name]) {
      return FUNCTION_COMMANDS[name] + '\\left(' + argumentsLatex(args) + '\\right)';
    }

    const symbol = /^[a-z\u0370-\u03ff]$/i.test(name)
      ? variableLatex(name)
      : '\\operatorname{' + (safeName(name) || 'fn') + '}';
    return symbol + "'".repeat(node.primeCount || 0) + '\\left(' + argumentsLatex(args) + '\\right)';
  }

  function astToLatex(node) {
    if (!node) return '';

    switch (node.type) {
      case 'number':
        return formatNumber(node.value);

      case 'variable':
        return variableLatex(node.name);

      case 'unary':
        return '-' + (node.operand.type === 'binary' && (node.operand.op === '+' || node.operand.op === '-')
          ? wrap(astToLatex(node.operand))
          : astToLatex(node.operand));

      case 'abs':
        return '\\left|' + astToLatex(node.operand) + '\\right|';

      case 'binary': {
        const left = astToLatex(node.left);
        const right = astToLatex(node.right);

        if (node.op === '+') return left + ' + ' + right;
        if (node.op === '-') {
          return left + ' - ' + (node.right.type === 'binary' && (node.right.op === '+' || node.right.op === '-')
            ? wrap(right)
            : right);
        }
        if (node.op === '/') return '\\frac{' + left + '}{' + right + '}';
        if (node.op === '^') return baseLatex(node.left) + '^{' + right + '}';
        if (node.op === '*') {
          const leftFactor = factorLatex(node.left);
          const rightFactor = factorLatex(node.right);
          if (node.implicit) {
            if (node.left.type === 'number' && node.right.type === 'number') {
              return leftFactor + ' \\cdot ' + rightFactor;
            }
            return leftFactor + rightFactor;
          }
          return leftFactor + ' \\cdot ' + rightFactor;
        }
        return left + ' ' + node.op + ' ' + right;
      }

      case 'compare':
        return astToLatex(node.left) + ' ' + relationLatex(node.op) + ' ' + astToLatex(node.right);

      case 'call':
        return callLatex(node);

      case 'prime':
        return (FUNCTION_COMMANDS[node.name] || safeName(node.name)) + "'".repeat(node.order || 1) +
          '\\left(' + argumentsLatex(node.args) + '\\right)';

      default:
        return '';
    }
  }

  function toLatex(analysis) {
    if (!analysis || analysis.kind === 'empty' || analysis.kind === 'error') return null;
    if (analysis.restrictions) {
      return toLatex(analysis.plot) + analysis.restrictions.map((condition) =>
        '\\left\\{' + astToLatex(condition) + '\\right\\}'
      ).join('');
    }

    if (analysis.kind === 'explicit') {
      if (analysis.ast && analysis.ast.type === 'call' &&
          ['diff', 'derivative', 'integral', 'int', 'sum', 'sigma', 'product', 'prod'].includes(analysis.ast.name)) {
        return astToLatex(analysis.ast);
      }
      const body = astToLatex(analysis.ast);
      if (analysis.bare) return body;
      const lhs = analysis.functionName ? variableLatex(analysis.functionName) + '(x)' : 'y';
      return lhs + ' ' + relationLatex(analysis.op) + ' ' + body;
    }

    if (analysis.kind === 'implicit') {
      const lhs = analysis.lhsAst || (analysis.equationAst && analysis.equationAst.left);
      const rhs = analysis.rhsAst || (analysis.equationAst && analysis.equationAst.right);
      return astToLatex(lhs) + ' ' + relationLatex(analysis.op) + ' ' + astToLatex(rhs);
    }

    if (analysis.kind === 'vertical') {
      return 'x ' + relationLatex(analysis.op) + ' ' + astToLatex(analysis.ast);
    }

    if (analysis.kind === 'polar') {
      return 'r = ' + astToLatex(analysis.ast);
    }

    if (analysis.kind === 'parameter') {
      return variableLatex(analysis.name) + ' = ' + astToLatex(analysis.ast);
    }

    if (analysis.kind === 'parametric' || analysis.kind === 'point') {
      return '\\left(' + astToLatex(analysis.firstAst) + ',\\; ' + astToLatex(analysis.secondAst) + '\\right)';
    }

    return null;
  }

  function renderToString(latex) {
    if (!latex || !global.katex) return null;
    try {
      return global.katex.renderToString('\\displaystyle ' + latex, {
        displayMode: false,
        throwOnError: true,
        strict: false,
        trust: false,
        output: 'htmlAndMathml',
        maxSize: 40,
        maxExpand: 1200
      });
    } catch (error) {
      return null;
    }
  }

  function renderElement(element, latex) {
    if (!element) return false;
    const html = renderToString(latex);
    if (!html) return false;
    element.innerHTML = html;
    return true;
  }

  function renderStatic(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-latex]').forEach((element) => {
      if (element.dataset.mathRendered === '1') return;
      const latex = element.getAttribute('data-latex');
      if (renderElement(element, latex)) {
        element.dataset.mathRendered = '1';
      } else {
        element.textContent = element.getAttribute('data-fallback') || latex || '';
      }
    });
  }

  Plotsy.latex = {
    toLatex,
    astToLatex,
    renderToString,
    renderElement,
    renderStatic
  };
})(typeof window !== 'undefined' ? window : globalThis);
