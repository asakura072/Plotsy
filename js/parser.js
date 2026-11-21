/*
 * Plotsy · 数学表达式解析器
 * 手写词法分析 + Pratt 风格递归下降，不依赖 eval，全部离线运行。
 */
(function (global) {
  'use strict';

  const Plotsy = (global.Plotsy = global.Plotsy || {});

  class MathError extends Error {
    constructor(message, position) {
      super(message);
      this.name = 'MathError';
      this.position = Number.isFinite(position) ? position : 0;
    }
  }

  const GREEK_NAMES = {
    'π': ' pi ',
    'θ': ' theta ',
    'τ': ' tau ',
    'φ': ' phi ',
    'ϑ': ' theta '
  };

  const REPLACEMENTS = {
    '（': '(', '）': ')', '，': ',', '＋': '+', '－': '-', '＊': '*', '／': '/',
    '＝': '=', '＜': '<', '＞': '>', '｜': '|', '　': ' ',
    '−': '-', '–': '-', '—': '-', '﹣': '-',
    '×': '*', '·': '*', '⋅': '*', '∙': '*', '∗': '*', '⋆': '*', '÷': '/',
    '≤': '<=', '≥': '>=', '≠': '!=',
    '∞': ' inf ',
    '²': '^2', '³': '^3', '⁴': '^4'
  };

  function normalize(source) {
    let value = String(source == null ? '' : source);
    value = value.replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
    value = value.replace(/Γ/g, ' gamma ');
    value = value.replace(/γ\s*\(/g, ' gamma (');
    value = value.replace(/γ\s*'(?=\s*\()/g, ' gamma ');
    value = value.replace(/ζ/g, ' zeta ');
    value = value.replace(/ψ\s*_\s*\{?\s*([A-Za-z0-9]+)\s*\}?\s*'\s*\(/g, " polygamma'($1,");
    value = value.replace(/ψ\s*_\s*\{?\s*([A-Za-z0-9]+)\s*\}?\s*\(/g, ' polygamma($1,');
    value = value.replace(/ψ/g, ' digamma ');
    value = value.replace(/W\s*_\s*\{?\s*-\s*1\s*\}?/g, ' lambertwminus ');
    value = value.replace(/W(?=\s*[('])/g, ' lambertw ');
    value = value.replace(/\\Gamma\b/g, ' gamma ');
    value = value.replace(/\\zeta\b/g, ' zeta ');
    value = value.replace(/\\psi\b/g, ' digamma ');
    value = value.replace(/[πθτφϑ]/g, (ch) => GREEK_NAMES[ch] || ch);
    for (const key of Object.keys(REPLACEMENTS)) {
      value = value.split(key).join(REPLACEMENTS[key]);
    }
    value = value.replace(/\*\*/g, '^');
    return value.replace(/\s+/g, ' ').trim();
  }

  function isDigit(ch) {
    return ch >= '0' && ch <= '9';
  }

  function isIdentStart(ch) {
    return /[A-Za-z_\u0370-\u03ff]/.test(ch);
  }

  function isIdentPart(ch) {
    return /[A-Za-z0-9_\u0370-\u03ff]/.test(ch);
  }

  let knownWordCache = null;

  function knownWords() {
    if (knownWordCache) return knownWordCache;
    const names = new Set([
      ...Object.keys(FUNCTIONS),
      ...Object.keys(CONSTANTS),
      'theta'
    ]);
    knownWordCache = Array.from(names).sort((a, b) => b.length - a.length);
    return knownWordCache;
  }

  function pushWordTokens(tokens, raw, base) {
    const lower = raw.toLowerCase();
    const names = knownWords();
    let i = 0;

    while (i < lower.length) {
      const ch = lower[i];

      if (isDigit(ch)) {
        let j = i + 1;
        while (j < lower.length && isDigit(lower[j])) j += 1;
        tokens.push({
          type: 'number',
          value: Number(lower.slice(i, j)),
          raw: raw.slice(i, j),
          pos: base + i
        });
        i = j;
        continue;
      }

      const subscript = /^[A-Za-z\u0370-\u03ff]_[A-Za-z0-9\u0370-\u03ff]+/.exec(lower.slice(i));
      if (subscript) {
        tokens.push({
          type: 'ident',
          value: subscript[0],
          raw: raw.slice(i, i + subscript[0].length),
          pos: base + i
        });
        i += subscript[0].length;
        continue;
      }

      let matched = null;
      for (const name of names) {
        if (lower.startsWith(name, i)) {
          matched = name;
          break;
        }
      }

      if (matched) {
        tokens.push({ type: 'ident', value: matched, raw: raw.slice(i, i + matched.length), pos: base + i });
        i += matched.length;
      } else {
        tokens.push({ type: 'ident', value: ch, raw: raw.slice(i, i + 1), pos: base + i });
        i += 1;
      }
    }
  }

  function tokenize(source) {
    const text = normalize(source);
    const tokens = [];
    let i = 0;

    while (i < text.length) {
      const ch = text[i];

      if (ch === ' ') {
        i += 1;
        continue;
      }

      if (isDigit(ch) || (ch === '.' && isDigit(text[i + 1]))) {
        const match = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(text.slice(i));
        if (!match) throw new MathError('数字格式不正确', i);
        tokens.push({ type: 'number', value: Number(match[0]), raw: match[0], pos: i });
        i += match[0].length;
        continue;
      }

      if (isIdentStart(ch)) {
        let j = i + 1;
        while (j < text.length && isIdentPart(text[j])) j += 1;
        const raw = text.slice(i, j);
        pushWordTokens(tokens, raw, i);
        i = j;
        continue;
      }

      const two = text.slice(i, i + 2);
      if (two === '<=' || two === '>=' || two === '!=') {
        tokens.push({ type: two === '!=' ? 'op' : 'cmp', value: two, pos: i });
        i += 2;
        continue;
      }

      if (ch === '<' || ch === '>' || ch === '=') {
        tokens.push({ type: 'cmp', value: ch, pos: i });
        i += 1;
        continue;
      }

      if ('+-*/^'.includes(ch)) {
        tokens.push({ type: 'op', value: ch, pos: i });
        i += 1;
        continue;
      }

      if (ch === '(') {
        tokens.push({ type: 'lparen', value: ch, pos: i });
        i += 1;
        continue;
      }

      if (ch === ')') {
        tokens.push({ type: 'rparen', value: ch, pos: i });
        i += 1;
        continue;
      }

      if (ch === ',') {
        tokens.push({ type: 'comma', value: ch, pos: i });
        i += 1;
        continue;
      }

      if (ch === '|') {
        tokens.push({ type: 'bar', value: ch, pos: i });
        i += 1;
        continue;
      }

      if (ch === "'" || ch === '′' || ch === '’') {
        tokens.push({ type: 'prime', value: ch, pos: i });
        i += 1;
        continue;
      }

      if (ch === '!') {
        throw new MathError('暂不支持阶乘，请使用 gamma 相关函数', i);
      }

      throw new MathError('无法识别的字符 “' + ch + '”', i);
    }

    tokens.push({ type: 'eof', value: '', pos: text.length });
    return tokens;
  }

  function startsPrimary(token) {
    return token && (
      token.type === 'number' ||
      token.type === 'ident' ||
      token.type === 'lparen' ||
      token.type === 'bar'
    );
  }

  class Parser {
    constructor(source) {
      this.source = String(source == null ? '' : source);
      this.tokens = tokenize(this.source);
      this.index = 0;
      this.barDepth = 0;
    }

    peek(offset) {
      return this.tokens[this.index + (offset || 0)] || this.tokens[this.tokens.length - 1];
    }

    next() {
      const token = this.tokens[this.index];
      if (this.index < this.tokens.length - 1) this.index += 1;
      return token;
    }

    match(type, value) {
      const token = this.peek();
      if (token.type !== type) return false;
      if (value !== undefined && token.value !== value) return false;
      this.next();
      return true;
    }

    expect(type, message, value) {
      const token = this.peek();
      if (token.type === type && (value === undefined || token.value === value)) {
        this.next();
        return token;
      }
      throw new MathError(message || '表达式不完整', token.pos);
    }

    parse() {
      if (this.peek().type === 'eof') throw new MathError('请输入一个表达式', 0);
      const node = this.parseComparison();
      const rest = this.peek();
      if (rest.type !== 'eof') {
        if (rest.type === 'cmp') throw new MathError('一个表达式只能包含一个关系符号', rest.pos);
        if (rest.type === 'rparen') throw new MathError('多余的右括号', rest.pos);
        throw new MathError('表达式末尾多出了 “' + (rest.raw || rest.value) + '”', rest.pos);
      }
      return node;
    }

    parseComparison() {
      const left = this.parseSum();
      const token = this.peek();
      if (token.type === 'cmp') {
        if (token.value === '!=') throw new MathError('暂不支持“不等于”的不等式', token.pos);
        this.next();
        const right = this.parseSum();
        if (this.peek().type === 'cmp') {
          throw new MathError('一个表达式只能包含一个关系符号', this.peek().pos);
        }
        return { type: 'compare', op: token.value, left, right, pos: token.pos };
      }
      return left;
    }

    parseSum() {
      let node = this.parseProduct();
      while (this.peek().type === 'op' && (this.peek().value === '+' || this.peek().value === '-')) {
        const op = this.next();
        const right = this.parseProduct();
        node = { type: 'binary', op: op.value, left: node, right, pos: op.pos };
      }
      return node;
    }

    parseProduct() {
      let node = this.parseUnary();
      while (true) {
        const token = this.peek();
        if (token.type === 'op' && (token.value === '*' || token.value === '/')) {
          this.next();
          node = { type: 'binary', op: token.value, left: node, right: this.parseUnary(), pos: token.pos };
          continue;
        }
        if (startsPrimary(token) && !(token.type === 'bar' && this.barDepth > 0)) {
          /* 隐式乘法：2x、3(x+1)、(x+1)(x-1)、2|x| */
          node = { type: 'binary', op: '*', left: node, right: this.parseUnary(), pos: token.pos, implicit: true };
          continue;
        }
        break;
      }
      return node;
    }

    parseUnary() {
      const token = this.peek();
      if (token.type === 'op' && (token.value === '+' || token.value === '-')) {
        this.next();
        const operand = this.parseUnary();
        return token.value === '-' ? { type: 'unary', op: '-', operand, pos: token.pos } : operand;
      }
      return this.parsePower();
    }

    parsePower() {
      const base = this.parsePrimary();
      if (this.peek().type === 'op' && this.peek().value === '^') {
        const token = this.next();
        const exponent = this.parseUnary();
        return { type: 'binary', op: '^', left: base, right: exponent, pos: token.pos };
      }
      return base;
    }

    parsePrimeCount() {
      let count = 0;
      while (this.peek().type === 'prime') {
        this.next();
        count += 1;
      }
      return count;
    }

    applyPrime(node, count, pos) {
      let result = node;
      for (let i = 0; i < count; i += 1) {
        result = {
          type: 'call',
          name: 'diff',
          args: [result, { type: 'variable', name: 'x', pos }],
          pos
        };
      }
      return result;
    }

    applyFunctionPrime(name, args, count, pos) {
      const metadata = FUNCTIONS[name];
      const call = { type: 'call', name, args, pos };
      if (!count || !metadata || args.length === 0) {
        return this.applyPrime(call, count, pos);
      }
      if (name === 'zeta') {
        return { type: 'prime', name: 'zeta', args: [args[0]], order: count, pos };
      }
      const argumentIndex = name === 'polygamma' ? 1 : 0;
      const argument = args[argumentIndex] || args[0];
      const dummy = { type: 'variable', name: '__prime', pos };
      const replaced = args.map((value, index) => (index === argumentIndex ? dummy : value));
      try {
        let derivative = { type: 'call', name, args: replaced, pos };
        for (let i = 0; i < count; i += 1) {
          derivative = derivativeOf(derivative, '__prime');
        }
        return substituteAstNode(simplify(derivative), '__prime', argument);
      } catch (error) {
        return this.applyPrime(call, count, pos);
      }
    }

    parsePrimary() {
      const token = this.peek();

      if (token.type === 'number') {
        this.next();
        return { type: 'number', value: token.value, pos: token.pos };
      }

      if (token.type === 'ident') {
        this.next();
        let primeCount = this.parsePrimeCount();
        if (this.peek().type === 'lparen') {
          this.next();
          const args = [];
          if (this.peek().type !== 'rparen') {
            while (true) {
              args.push(this.parseComparison());
              if (this.peek().type === 'comma') {
                this.next();
                if (this.peek().type === 'rparen') {
                  throw new MathError('函数参数不能为空', this.peek().pos);
                }
                continue;
              }
              break;
            }
          }
          this.expect('rparen', '函数调用缺少右括号');
          primeCount += this.parsePrimeCount();
          if (primeCount > 0 && Object.prototype.hasOwnProperty.call(FUNCTIONS, token.value)) {
            return this.applyFunctionPrime(token.value, args, primeCount, token.pos);
          }
          return this.applyPrime(
            { type: 'call', name: token.value, args, pos: token.pos },
            primeCount,
            token.pos
          );
        }

        if (primeCount > 0 && Object.prototype.hasOwnProperty.call(FUNCTIONS, token.value)) {
          const next = this.peek();
          const missing = next.type === 'eof' || next.type === 'rparen' ||
            next.type === 'comma' || next.type === 'cmp' ||
            (next.type === 'op' && next.value !== '+' && next.value !== '-');
          if (missing) {
            throw new MathError('函数 ' + token.value + ' 缺少参数；复合参数请用括号，例如 ' + token.value + '(2x)', token.pos);
          }
          return this.applyFunctionPrime(
            token.value,
            [this.parseUnary()],
            primeCount,
            token.pos
          );
        }

        if (Object.prototype.hasOwnProperty.call(FUNCTIONS, token.value)) {
          const next = this.peek();
          const missing = next.type === 'eof' || next.type === 'rparen' ||
            next.type === 'comma' || next.type === 'cmp' ||
            (next.type === 'op' && next.value !== '+' && next.value !== '-');
          if (missing) {
            throw new MathError('函数 ' + token.value + ' 缺少参数；复合参数请用括号，例如 ' + token.value + '(2x)', token.pos);
          }
          /* 允许 sin x、cos θ 这样的写法；参数只取一个幂，因此 sin 2x 会被理解为 (sin 2)·x。 */
          return { type: 'call', name: token.value, args: [this.parseUnary()], pos: token.pos };
        }

        return this.applyPrime(
          { type: 'variable', name: token.value, pos: token.pos },
          primeCount,
          token.pos
        );
      }

      if (token.type === 'lparen') {
        this.next();
        if (this.peek().type === 'rparen') throw new MathError('括号里缺少表达式', token.pos);
        const inner = this.parseComparison();
        this.expect('rparen', '括号没有闭合');
        return this.applyPrime(inner, this.parsePrimeCount(), token.pos);
      }

      if (token.type === 'bar') {
        this.next();
        if (this.peek().type === 'bar' || this.peek().type === 'eof') {
          throw new MathError('绝对值符号里缺少表达式', token.pos);
        }
        this.barDepth += 1;
        let inner;
        try {
          inner = this.parseSum();
        } finally {
          this.barDepth -= 1;
        }
        this.expect('bar', '绝对值符号没有闭合');
        return this.applyPrime(
          { type: 'abs', operand: inner, pos: token.pos },
          this.parsePrimeCount(),
          token.pos
        );
      }

      if (token.type === 'eof') {
        throw new MathError('表达式不完整，请继续输入', token.pos);
      }

      if (token.type === 'rparen') {
        throw new MathError('多余的右括号', token.pos);
      }

      throw new MathError('这里需要一个数字、变量或括号', token.pos);
    }
  }

  const CONSTANTS = {
    pi: Math.PI,
    e: Math.E,
    tau: Math.PI * 2,
    phi: (1 + Math.sqrt(5)) / 2,
    inf: Infinity,
    infinity: Infinity
  };

  function domainCall(fn, args) {
    try {
      return fn.apply(null, args);
    } catch (error) {
      return NaN;
    }
  }

  /* ------------------------------------------------------------------------
     特殊函数：Gamma、zeta、误差函数与 Lambert W
     ------------------------------------------------------------------------ */

  const GAMMA_COEFFICIENTS = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7
  ];

  function gammaFn(value) {
    let x = Number(value);
    if (!Number.isFinite(x)) return NaN;
    if (Number.isInteger(x) && x <= 0) return NaN;
    if (x < 0.5) {
      return Math.PI / (Math.sin(Math.PI * x) * gammaFn(1 - x));
    }
    x -= 1;
    let sum = GAMMA_COEFFICIENTS[0];
    for (let i = 1; i < GAMMA_COEFFICIENTS.length; i += 1) {
      sum += GAMMA_COEFFICIENTS[i] / (x + i);
    }
    const t = x + 7.5;
    if (t <= 0) return NaN;
    return Math.sqrt(2 * Math.PI) * Math.pow(t, x + 0.5) * Math.exp(-t) * sum;
  }

  function digammaFn(value) {
    let x = Number(value);
    if (!Number.isFinite(x)) return NaN;
    if (Number.isInteger(x) && x <= 0) return NaN;
    let result = 0;
    while (x < 8) {
      result -= 1 / x;
      x += 1;
    }
    const inv = 1 / x;
    const inv2 = inv * inv;
    result += Math.log(x) - 0.5 * inv -
      inv2 * (1 / 12 - inv2 * (1 / 120 - inv2 * (1 / 252 - inv2 * (1 / 240 - inv2 / 132))));
    return result;
  }

  function polygammaFn(order, value) {
    const n = Number(order);
    const x = Number(value);
    if (!Number.isFinite(n) || !Number.isFinite(x) || n < 0 || Math.abs(n - Math.round(n)) > 1e-12) {
      return NaN;
    }
    const degree = Math.round(n);
    if (degree === 0) return digammaFn(x);
    if (Number.isInteger(x) && x <= 0) return NaN;

    const sign = degree % 2 === 1 ? 1 : -1;
    let factorial = 1;
    for (let i = 2; i <= degree; i += 1) factorial *= i;

    let shifted = x;
    let correction = 0;
    while (shifted < 10) {
      correction += sign * factorial / Math.pow(shifted, degree + 1);
      shifted += 1;
    }

    const inv = 1 / shifted;
    let sum = Math.pow(shifted, -degree) / degree;
    sum += 0.5 * Math.pow(shifted, -(degree + 1));
    sum += (degree + 1) / 12 * Math.pow(shifted, -(degree + 2));
    sum -= (degree + 1) * (degree + 2) * (degree + 3) / 720 * Math.pow(shifted, -(degree + 4));
    sum += (degree + 1) * (degree + 2) * (degree + 3) * (degree + 4) * (degree + 5) / 30240 *
      Math.pow(shifted, -(degree + 6));
    return correction + sign * factorial * sum;
  }

  function zetaFn(value) {
    const s = Number(value);
    if (!Number.isFinite(s)) return NaN;
    if (s === 1) return NaN;
    if (s === 0) return -0.5;

    if (s > 1) {
      const n = 60;
      let total = 0;
      for (let k = 1; k < n; k += 1) total += Math.pow(k, -s);
      total += Math.pow(n, 1 - s) / (s - 1);
      total += 0.5 * Math.pow(n, -s);
      total += s / 12 * Math.pow(n, -s - 1);
      total -= s * (s + 1) * (s + 2) / 720 * Math.pow(n, -s - 3);
      total += s * (s + 1) * (s + 2) * (s + 3) * (s + 4) / 30240 * Math.pow(n, -s - 5);
      return total;
    }

    if (s > 0) {
      const n = 80;
      const terms = new Array(n);
      for (let k = 0; k < n; k += 1) terms[k] = Math.pow(k + 1, -s);
      let eta = 0;
      let factor = 0.5;
      for (let k = 0; k < n; k += 1) {
        eta += factor * terms[0];
        for (let i = 0; i < n - k - 1; i += 1) terms[i] = terms[i] - terms[i + 1];
        factor *= 0.5;
      }
      const denominator = 1 - Math.pow(2, 1 - s);
      return denominator === 0 ? NaN : eta / denominator;
    }

    const reflected = 2 ** s * Math.PI ** (s - 1) *
      Math.sin(Math.PI * s / 2) * gammaFn(1 - s) * zetaFn(1 - s);
    return reflected;
  }

  function zetaDerivativeFn(value) {
    const x = Number(value);
    if (!Number.isFinite(x) || Math.abs(x - 1) < 1e-5) return NaN;
    const h = 1e-5 * Math.max(1, Math.abs(x));
    return (zetaFn(x + h) - zetaFn(x - h)) / (2 * h);
  }

  function lambertWFn(value, branch) {
    const x = Number(value);
    const selected = branch === undefined ? 0 : Number(branch);
    if (!Number.isFinite(x) || (selected !== 0 && selected !== -1)) return NaN;
    const edge = -1 / Math.E;
    if (x < edge - 1e-14) return NaN;
    if (selected === -1 && (x >= 0 || x < edge - 1e-14)) return NaN;
    if (selected === 0 && x === 0) return 0;
    if (selected === 0 && x === edge) return -1;

    let w;
    if (selected === 0) {
      if (x > 1) w = Math.log(x) - Math.log(Math.log(x));
      else if (x > -0.3) w = x;
      else w = -1 + Math.sqrt(2 * (Math.E * x + 1));
    } else {
      if (x > -0.1) w = Math.log(-x) - Math.log(-Math.log(-x));
      else w = -1 - Math.sqrt(2 * (Math.E * x + 1));
    }

    for (let i = 0; i < 40; i += 1) {
      const ew = Math.exp(w);
      const f = w * ew - x;
      const wp = ew * (w + 1);
      if (wp === 0) break;
      const wpp = ew * (w + 2);
      const denominator = wp - f * wpp / (2 * wp);
      if (denominator === 0) break;
      const next = w - f / denominator;
      if (Math.abs(next - w) <= 1e-14 * (1 + Math.abs(next))) return next;
      w = next;
    }
    return w;
  }

  const SQRT_PI = Math.sqrt(Math.PI);
  const ERF_SERIES_LIMIT = 1.25;

  function erfSeries(x) {
    if (x === 0) return x;
    const square = x * x;
    let term = x;
    let sum = x;
    for (let n = 1; n <= 32; n += 1) {
      term *= -square / n;
      const delta = term / (2 * n + 1);
      sum += delta;
      if (Math.abs(delta) <= Number.EPSILON * Math.abs(sum)) break;
    }
    return 2 * sum / SQRT_PI;
  }

  function erfcTail(x) {
    if (x >= 28) return 0;
    if (Number.isNaN(x)) return NaN;
    // erfc(x) = Γ(1/2, x²) / √π. Evaluate the equivalent continued
    // fraction with Lentz's recurrence to retain precision in the tail.
    // https://dlmf.nist.gov/7.11.E2 and https://dlmf.nist.gov/8.9.E2
    const square = x * x;
    let denominator = square + 0.5;
    let c = Infinity;
    let d = 1 / denominator;
    let fraction = d;
    for (let n = 1; n <= 128; n += 1) {
      const numerator = n * (0.5 - n);
      denominator += 2;
      c = denominator + numerator / c;
      d = 1 / (denominator + numerator * d);
      const delta = c * d;
      fraction *= delta;
      if (Math.abs(delta - 1) <= Number.EPSILON) break;
    }
    const exponential = Math.exp(-square / 2);
    return exponential * (exponential * x * fraction / SQRT_PI);
  }

  function erfFn(x) {
    const magnitude = Math.abs(x);
    if (magnitude < ERF_SERIES_LIMIT) return erfSeries(x);
    return Math.sign(x) * (1 - erfcTail(magnitude));
  }

  function erfcFn(x) {
    const magnitude = Math.abs(x);
    if (magnitude < ERF_SERIES_LIMIT) return 1 - erfSeries(x);
    const tail = erfcTail(magnitude);
    return x < 0 ? 2 - tail : tail;
  }

  const FUNCTIONS = {
    sin: { arity: [1, 1], trig: true, fn: Math.sin },
    cos: { arity: [1, 1], trig: true, fn: Math.cos },
    tan: { arity: [1, 1], trig: true, fn: Math.tan },
    cot: { arity: [1, 1], trig: true, fn: (x) => 1 / Math.tan(x) },
    sec: { arity: [1, 1], trig: true, fn: (x) => 1 / Math.cos(x) },
    csc: { arity: [1, 1], trig: true, fn: (x) => 1 / Math.sin(x) },
    asin: { arity: [1, 1], inverseTrig: true, fn: Math.asin },
    acos: { arity: [1, 1], inverseTrig: true, fn: Math.acos },
    atan: { arity: [1, 1], inverseTrig: true, fn: Math.atan },
    arcsin: { arity: [1, 1], inverseTrig: true, fn: Math.asin },
    arccos: { arity: [1, 1], inverseTrig: true, fn: Math.acos },
    arctan: { arity: [1, 1], inverseTrig: true, fn: Math.atan },
    atan2: { arity: [2, 2], inverseTrig: true, fn: Math.atan2 },
    sinh: { arity: [1, 1], fn: Math.sinh },
    cosh: { arity: [1, 1], fn: Math.cosh },
    tanh: { arity: [1, 1], fn: Math.tanh },
    asinh: { arity: [1, 1], fn: Math.asinh },
    acosh: { arity: [1, 1], fn: Math.acosh },
    atanh: { arity: [1, 1], fn: Math.atanh },
    arsinh: { arity: [1, 1], fn: Math.asinh },
    arcosh: { arity: [1, 1], fn: Math.acosh },
    artanh: { arity: [1, 1], fn: Math.atanh },
    sqrt: { arity: [1, 1], fn: Math.sqrt },
    cbrt: { arity: [1, 1], fn: Math.cbrt },
    abs: { arity: [1, 1], fn: Math.abs },
    exp: { arity: [1, 1], fn: Math.exp },
    ln: { arity: [1, 1], fn: Math.log },
    log: { arity: [1, 1], fn: Math.log10 },
    log2: { arity: [1, 1], fn: Math.log2 },
    log10: { arity: [1, 1], fn: Math.log10 },
    erf: { arity: [1, 1], fn: erfFn },
    erfc: { arity: [1, 1], fn: erfcFn },
    gamma: { arity: [1, 1], fn: gammaFn },
    zeta: { arity: [1, 1], fn: zetaFn },
    digamma: { arity: [1, 1], fn: digammaFn },
    psi: { arity: [1, 1], fn: digammaFn },
    polygamma: { arity: [2, 2], fn: polygammaFn },
    lambertw: { arity: [1, 2], fn: lambertWFn },
    lambertwminus: { arity: [1, 1], fn: (x) => lambertWFn(x, -1) },
    floor: { arity: [1, 1], fn: Math.floor },
    ceil: { arity: [1, 1], fn: Math.ceil },
    round: { arity: [1, 2], fn: (x, digits) => {
      if (digits === undefined) return Math.round(x);
      const p = Math.pow(10, digits);
      return Math.round(x * p) / p;
    } },
    sign: { arity: [1, 1], fn: Math.sign },
    sgn: { arity: [1, 1], fn: Math.sign },
    min: { arity: [1, Infinity], fn: Math.min },
    max: { arity: [1, Infinity], fn: Math.max },
    mod: { arity: [2, 2], fn: (a, b) => a % b },
    pow: { arity: [2, 2], fn: Math.pow },
    hypot: { arity: [1, Infinity], fn: Math.hypot },
    clamp: { arity: [3, 3], fn: (x, lo, hi) => Math.min(Math.max(x, lo), hi) },
    nthroot: { arity: [2, 2], fn: (x, n) => {
      if (n === 0) return NaN;
      if (x < 0 && Math.abs(n % 2) !== 1) return NaN;
      return Math.sign(x) * Math.pow(Math.abs(x), 1 / n);
    } },
    if: { arity: [3, 3], fn: (condition, yes, no) => (condition ? yes : no) },
    deg: { arity: [1, 1], fn: (x) => x * Math.PI / 180 },
    rad: { arity: [1, 1], fn: (x) => x * 180 / Math.PI },

    diff: { arity: [2, 2] },
    derivative: { arity: [2, 2] },
    integral: { arity: [4, 4] },
    int: { arity: [4, 4] },
    sum: { arity: [4, 4] },
    sigma: { arity: [4, 4] },
    product: { arity: [4, 4] },
    prod: { arity: [4, 4] }
  };

  const SPECIAL_FUNCTIONS = {
    diff: 'diff',
    derivative: 'diff',
    integral: 'integral',
    int: 'integral',
    sum: 'sum',
    sigma: 'sum',
    product: 'product',
    prod: 'product'
  };

  function describeArity(meta) {
    const [min, max] = meta.arity;
    if (max === Infinity) return '至少 ' + min + ' 个参数';
    if (min === max) return min + ' 个参数';
    return min + ' 至 ' + max + ' 个参数';
  }

  /* ------------------------------------------------------------------------
     微积分：AST 简化、符号求导、数值积分
     ------------------------------------------------------------------------ */

  function num(value) {
    return { type: 'number', value, pos: 0 };
  }

  function varNode(name) {
    return { type: 'variable', name, pos: 0 };
  }

  function binary(op, left, right) {
    return { type: 'binary', op, left, right, pos: 0 };
  }

  function unary(operand) {
    return { type: 'unary', op: '-', operand, pos: 0 };
  }

  function callNode(name, args) {
    return { type: 'call', name, args, pos: 0 };
  }

  function isNumber(node, value) {
    return node && node.type === 'number' && (value === undefined || Math.abs(node.value - value) < 1e-14);
  }

  function finiteNumber(value) {
    return Number.isFinite(value) ? num(value) : null;
  }

  function simplify(node) {
    if (!node || typeof node !== 'object') return node;

    if (node.type === 'number' || node.type === 'variable') return node;

    if (node.type === 'prime') {
      return { ...node, args: node.args.map(simplify) };
    }

    if (node.type === 'unary') {
      const operand = simplify(node.operand);
      if (isNumber(operand)) return num(-operand.value);
      if (operand.type === 'unary') return simplify(operand.operand);
      return { ...node, operand };
    }

    if (node.type === 'abs') {
      const operand = simplify(node.operand);
      if (isNumber(operand)) return num(Math.abs(operand.value));
      return { ...node, operand };
    }

    if (node.type === 'compare') {
      return { ...node, left: simplify(node.left), right: simplify(node.right) };
    }

    if (node.type === 'call') {
      return { ...node, args: node.args.map(simplify) };
    }

    if (node.type !== 'binary') return node;

    const left = simplify(node.left);
    const right = simplify(node.right);
    const op = node.op;

    if (op === '+') {
      if (isNumber(left, 0)) return right;
      if (isNumber(right, 0)) return left;
      if (isNumber(left) && isNumber(right)) return finiteNumber(left.value + right.value) || num(NaN);
    }

    if (op === '-') {
      if (isNumber(right, 0)) return left;
      if (isNumber(left, 0)) return simplify(unary(right));
      if (isNumber(left) && isNumber(right)) return finiteNumber(left.value - right.value) || num(NaN);
    }

    if (op === '*') {
      if (isNumber(left, 0) || isNumber(right, 0)) return num(0);
      if (isNumber(left, 1)) return right;
      if (isNumber(right, 1)) return left;
      if (isNumber(left, -1)) return simplify(unary(right));
      if (isNumber(right, -1)) return simplify(unary(left));
      if (isNumber(left) && isNumber(right)) return finiteNumber(left.value * right.value) || num(NaN);
    }

    if (op === '/') {
      if (isNumber(left, 0) && !isNumber(right, 0)) return num(0);
      if (isNumber(right, 1)) return left;
      if (isNumber(left) && isNumber(right) && right.value !== 0) {
        return finiteNumber(left.value / right.value) || num(NaN);
      }
    }

    if (op === '^') {
      if (isNumber(right, 0)) return num(1);
      if (isNumber(right, 1)) return left;
      if (isNumber(left, 1)) return num(1);
      if (isNumber(left) && isNumber(right)) {
        const value = Math.pow(left.value, right.value);
        if (Number.isFinite(value)) return num(value);
      }
    }

    return { ...node, left, right };
  }

  function chainRule(expression, inner) {
    if (inner && inner.type === 'number') {
      if (inner.value === 0) return num(0);
      if (inner.value === 1) return expression;
    }
    return binary('*', expression, inner);
  }

  function derivativeOf(node, variable) {
    if (!node) return num(0);

    if (node.type === 'number') return num(0);
    if (node.type === 'variable') return num(node.name === variable ? 1 : 0);
    if (node.type === 'compare') return num(0);

    if (node.type === 'unary') {
      return unary(derivativeOf(node.operand, variable));
    }

    if (node.type === 'abs') {
      return binary('*', callNode('sign', [node.operand]), derivativeOf(node.operand, variable));
    }

    if (node.type === 'binary') {
      const leftD = derivativeOf(node.left, variable);
      const rightD = derivativeOf(node.right, variable);

      if (node.op === '+' || node.op === '-') {
        return binary(node.op, leftD, rightD);
      }
      if (node.op === '*') {
        return binary('+', binary('*', leftD, node.right), binary('*', node.left, rightD));
      }
      if (node.op === '/') {
        return binary(
          '/',
          binary('-', binary('*', leftD, node.right), binary('*', node.left, rightD)),
          binary('^', node.right, num(2))
        );
      }
      if (node.op === '^') {
        if (isNumber(node.right)) {
          return binary(
            '*',
            binary('*', num(node.right.value), binary('^', node.left, num(node.right.value - 1))),
            leftD
          );
        }
        if (isNumber(node.left)) {
          return binary(
            '*',
            binary('*', node, callNode('ln', [node.left])),
            rightD
          );
        }
        /* d(u^v) = u^v (v' ln u + v u' / u) */
        return binary(
          '*',
          node,
          binary(
            '+',
            binary('*', rightD, callNode('ln', [node.left])),
            binary('/', binary('*', node.right, leftD), node.left)
          )
        );
      }
    }

    if (node.type === 'call') {
      const name = node.name;
      const arg = name === 'polygamma' ? node.args[1] : node.args[0];

      if (SPECIAL_FUNCTIONS[name] === 'diff') {
        if (!node.args[1] || node.args[1].type !== 'variable') {
          throw new MathError('导数需要指定变量，例如 diff(x^2, x)');
        }
        const innerVariable = node.args[1].name;
        if (innerVariable === variable) {
          /* d/dx [ d/dx f ] = d²f/dx²，支持连续多次求导。 */
          return derivativeOf(derivativeOf(arg, variable), variable);
        }
        return callNode('diff', [derivativeOf(arg, variable), node.args[1]]);
      }

      const inner = derivativeOf(arg, variable);

      if (name === 'sqrt') {
        return binary('/', inner, binary('*', num(2), callNode('sqrt', [arg])));
      }
      if (name === 'cbrt') {
        return binary('/', inner, binary('*', num(3), binary('^', callNode('cbrt', [arg]), num(2))));
      }
      if (name === 'sin') return binary('*', callNode('cos', [arg]), inner);
      if (name === 'cos') return binary('*', unary(callNode('sin', [arg])), inner);
      if (name === 'tan') return binary('*', binary('^', callNode('sec', [arg]), num(2)), inner);
      if (name === 'cot') return binary('*', unary(binary('^', callNode('csc', [arg]), num(2))), inner);
      if (name === 'sec') return binary('*', binary('*', callNode('sec', [arg]), callNode('tan', [arg])), inner);
      if (name === 'csc') return binary('*', unary(binary('*', callNode('csc', [arg]), callNode('cot', [arg]))), inner);
      if (name === 'asin' || name === 'arcsin') {
        return binary('/', inner, callNode('sqrt', [binary('-', num(1), binary('^', arg, num(2)))]));
      }
      if (name === 'acos' || name === 'arccos') {
        return unary(binary('/', inner, callNode('sqrt', [binary('-', num(1), binary('^', arg, num(2)))])));
      }
      if (name === 'atan' || name === 'arctan') {
        return binary('/', inner, binary('+', num(1), binary('^', arg, num(2))));
      }
      if (name === 'sinh') return binary('*', callNode('cosh', [arg]), inner);
      if (name === 'cosh') return binary('*', callNode('sinh', [arg]), inner);
      if (name === 'tanh') {
        return binary('/', inner, binary('^', callNode('cosh', [arg]), num(2)));
      }
      if (name === 'asinh' || name === 'arsinh') {
        return binary('/', inner, callNode('sqrt', [binary('+', binary('^', arg, num(2)), num(1))]));
      }
      if (name === 'acosh' || name === 'arcosh') {
        return binary('/', inner, callNode('sqrt', [binary('-', binary('^', arg, num(2)), num(1))]));
      }
      if (name === 'atanh' || name === 'artanh') {
        return binary('/', inner, binary('-', num(1), binary('^', arg, num(2))));
      }
      if (name === 'ln') return binary('/', inner, arg);
      if (name === 'log') {
        return binary('/', inner, binary('*', arg, callNode('ln', [num(10)])));
      }
      if (name === 'log10') {
        return binary('/', inner, binary('*', arg, callNode('ln', [num(10)])));
      }
      if (name === 'log2') {
        return binary('/', inner, binary('*', arg, callNode('ln', [num(2)])));
      }
      if (name === 'exp') return binary('*', callNode('exp', [arg]), inner);
      if (name === 'abs') return binary('*', callNode('sign', [arg]), inner);
      if (name === 'erf' || name === 'erfc') {
        const numerator = num(name === 'erf' ? 2 : -2);
        const coefficient = binary('/', numerator, callNode('sqrt', [{ type: 'variable', name: 'pi' }]));
        return chainRule(binary('*', coefficient, callNode('exp', [unary(binary('^', arg, num(2)))])), inner);
      }
      if (name === 'gamma') {
        return chainRule(
          binary('*', callNode('gamma', [arg]), callNode('digamma', [arg])),
          inner
        );
      }
      if (name === 'digamma' || name === 'psi') {
        return chainRule(callNode('polygamma', [num(1), arg]), inner);
      }
      if (name === 'polygamma') {
        const order = node.args[0];
        const nextOrder = binary('+', order, num(1));
        return chainRule(callNode('polygamma', [nextOrder, arg]), inner);
      }
      if (name === 'zeta') {
        return chainRule(
          { type: 'prime', name: 'zeta', args: [arg], order: 1, pos: node.pos },
          inner
        );
      }
      if (name === 'lambertw') {
        const w = callNode('lambertw', node.args);
        return chainRule(
          binary('/', w, binary('*', arg, binary('+', num(1), w))),
          inner
        );
      }
      if (name === 'lambertwminus') {
        const w = callNode('lambertwminus', [arg]);
        return chainRule(
          binary('/', w, binary('*', arg, binary('+', num(1), w))),
          inner
        );
      }
      if (name === 'pow') {
        const exponent = node.args[1];
        if (isNumber(exponent)) {
          return binary(
            '*',
            binary('*', num(exponent.value), binary('^', arg, num(exponent.value - 1))),
            inner
          );
        }
        return derivativeOf(binary('^', arg, exponent), variable);
      }
      if (name === 'if' && node.args.length >= 3) {
        return callNode('if', [
          node.args[0],
          derivativeOf(node.args[1], variable),
          derivativeOf(node.args[2], variable)
        ]);
      }

      throw new MathError('暂不支持对函数 “' + name + '” 求导');
    }

    throw new MathError('暂不支持对这种表达式求导');
  }

  function differentiate(node, variable) {
    return simplify(derivativeOf(node, variable));
  }

  function substituteAstNode(node, from, replacement) {
    if (!node || typeof node !== 'object') return node;
    if (node.type === 'variable') {
      return node.name === from ? replacement : node;
    }
    if (node.type === 'prime') {
      return { ...node, args: node.args.map((arg) => substituteAstNode(arg, from, replacement)) };
    }
    if (node.type === 'unary') {
      return { ...node, operand: substituteAstNode(node.operand, from, replacement) };
    }
    if (node.type === 'abs') {
      return { ...node, operand: substituteAstNode(node.operand, from, replacement) };
    }
    if (node.type === 'compare') {
      return {
        ...node,
        left: substituteAstNode(node.left, from, replacement),
        right: substituteAstNode(node.right, from, replacement)
      };
    }
    if (node.type === 'binary') {
      return {
        ...node,
        left: substituteAstNode(node.left, from, replacement),
        right: substituteAstNode(node.right, from, replacement)
      };
    }
    if (node.type === 'call') {
      return {
        ...node,
        args: node.args.map((arg) => substituteAstNode(arg, from, replacement))
      };
    }
    return node;
  }

  function substituteVariable(node, from, to) {
    if (!node || typeof node !== 'object') return node;
    if (node.type === 'variable') {
      return node.name === from ? { ...node, name: to } : node;
    }
    if (node.type === 'prime') {
      return { ...node, args: node.args.map((arg) => substituteVariable(arg, from, to)) };
    }
    if (node.type === 'unary') return { ...node, operand: substituteVariable(node.operand, from, to) };
    if (node.type === 'abs') return { ...node, operand: substituteVariable(node.operand, from, to) };
    if (node.type === 'compare') {
      return {
        ...node,
        left: substituteVariable(node.left, from, to),
        right: substituteVariable(node.right, from, to)
      };
    }
    if (node.type === 'binary') {
      return {
        ...node,
        left: substituteVariable(node.left, from, to),
        right: substituteVariable(node.right, from, to)
      };
    }
    if (node.type === 'call') {
      const binding = SPECIAL_FUNCTIONS[node.name];
      const shadows = binding && binding !== 'diff' && node.args[1]?.name === from;
      return {
        ...node,
        args: node.args.map((arg, index) => shadows && index < 2 ? arg : substituteVariable(arg, from, to))
      };
    }
    return node;
  }

  function collectBoundVariables(ast) {
    const found = new Set();
    function walk(node) {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'prime') {
        node.args.forEach(walk);
        return;
      }
      if (node.type === 'call') {
        const special = SPECIAL_FUNCTIONS[node.name];
        if (special && node.args.length > 1 && node.args[1].type === 'variable') {
          found.add(node.args[1].name);
        }
        node.args.forEach(walk);
        return;
      }
      if (node.left) walk(node.left);
      if (node.right) walk(node.right);
      if (node.operand) walk(node.operand);
    }
    walk(ast);
    return found;
  }

  function adaptiveSimpson(fn, a, b, whole, fa, fm, fb, depth, epsilon) {
    const middle = (a + b) / 2;
    const leftMiddle = (a + middle) / 2;
    const rightMiddle = (middle + b) / 2;
    const flm = fn(leftMiddle);
    const frm = fn(rightMiddle);
    const left = (middle - a) * (fa + 4 * flm + fm) / 6;
    const right = (b - middle) * (fm + 4 * frm + fb) / 6;

    if (depth <= 0 || Math.abs(left + right - whole) <= 15 * epsilon) {
      return left + right + (left + right - whole) / 15;
    }
    return adaptiveSimpson(fn, a, middle, left, fa, flm, fm, depth - 1, epsilon / 2) +
      adaptiveSimpson(fn, middle, b, right, fm, frm, fb, depth - 1, epsilon / 2);
  }

  function integrateNumerically(fn, a, b) {
    if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN;
    if (a === b) return 0;
    if (a > b) return -integrateNumerically(fn, b, a);

    let lower = a;
    let upper = b;
    let fa = fn(lower);
    let fb = fn(upper);
    const inset = (upper - lower) * 1e-7;
    if (!Number.isFinite(fa)) {
      lower += inset;
      fa = fn(lower);
    }
    if (!Number.isFinite(fb)) {
      upper -= inset;
      fb = fn(upper);
    }
    if (lower >= upper) return 0;
    const fm = fn((lower + upper) / 2);
    if (!Number.isFinite(fa) || !Number.isFinite(fb) || !Number.isFinite(fm)) return NaN;
    const whole = (upper - lower) * (fa + 4 * fm + fb) / 6;
    if (!Number.isFinite(whole)) return NaN;
    const epsilon = 1e-6 * Math.max(1, Math.abs(whole));
    return adaptiveSimpson(fn, lower, upper, whole, fa, fm, fb, 7, epsilon);
  }

  function derivativeInfo(ast) {
    if (!ast || ast.type !== 'call' || SPECIAL_FUNCTIONS[ast.name] !== 'diff') return null;
    if (ast.args.length < 2 || ast.args[1].type !== 'variable') return null;
    let order = 1;
    let body = ast.args[0];
    while (
      body && body.type === 'call' && SPECIAL_FUNCTIONS[body.name] === 'diff' &&
      body.args.length > 1 && body.args[1].type === 'variable' &&
      body.args[1].name === ast.args[1].name
    ) {
      order += 1;
      body = body.args[0];
    }
    return {
      variable: ast.args[1].name,
      body: ast.args[0],
      order,
      derivative: differentiate(ast.args[0], ast.args[1].name)
    };
  }

  function compile(ast, options) {
    const opts = options || {};
    const angleMode = opts.angleMode === 'deg' ? 'deg' : 'rad';
    const allowed = Array.isArray(opts.allowedVariables)
      ? new Set(opts.allowedVariables.map((name) => String(name).toLowerCase()))
      : null;
    let specialCounter = 0;
    const nextDummy = opts.nextDummy || (() => '__calc' + specialCounter++);

    function build(node) {
      switch (node.type) {
        case 'number': {
          const value = node.value;
          return function () { return value; };
        }
        case 'variable': {
          const name = node.name;
          if (Object.prototype.hasOwnProperty.call(CONSTANTS, name)) {
            const value = CONSTANTS[name];
            return function () { return value; };
          }
          if (allowed && !allowed.has(name)) {
            throw new MathError('未知变量 “' + name + '”', node.pos);
          }
          return function (scope) {
            const value = scope ? scope[name] : undefined;
            return typeof value === 'number' ? value : NaN;
          };
        }
        case 'unary': {
          const valueOf = build(node.operand);
          if (node.op === '-') return function (scope) { return -valueOf(scope); };
          return valueOf;
        }
        case 'abs': {
          const valueOf = build(node.operand);
          return function (scope) { return Math.abs(valueOf(scope)); };
        }
        case 'prime': {
          if (node.name !== 'zeta' || !node.args || node.args.length !== 1) {
            throw new MathError('不支持的导数表达式', node.pos);
          }
          const argument = build(node.args[0]);
          const order = Number(node.order) || 1;
          return function (scope) {
            if (order !== 1) return NaN;
            return zetaDerivativeFn(argument(scope));
          };
        }
        case 'binary': {
          const left = build(node.left);
          const right = build(node.right);
          switch (node.op) {
            case '+': return function (scope) { return left(scope) + right(scope); };
            case '-': return function (scope) { return left(scope) - right(scope); };
            case '*': return function (scope) { return left(scope) * right(scope); };
            case '/': return function (scope) { return left(scope) / right(scope); };
            case '^': return function (scope) { return Math.pow(left(scope), right(scope)); };
            default: throw new MathError('未知运算符 “' + node.op + '”', node.pos);
          }
        }
        case 'compare': {
          const left = build(node.left);
          const right = build(node.right);
          switch (node.op) {
            case '<': return function (scope) { return left(scope) < right(scope) ? 1 : 0; };
            case '>': return function (scope) { return left(scope) > right(scope) ? 1 : 0; };
            case '<=': return function (scope) { return left(scope) <= right(scope) ? 1 : 0; };
            case '>=': return function (scope) { return left(scope) >= right(scope) ? 1 : 0; };
            case '=': return function (scope) { return left(scope) === right(scope) ? 1 : 0; };
            default: return function () { return NaN; };
          }
        }
        case 'call': {
          const name = node.name;
          const meta = FUNCTIONS[name];
          if (!meta) throw new MathError('未知函数 “' + name + '”', node.pos);
          const [minArgs, maxArgs] = meta.arity;
          if (node.args.length < minArgs || node.args.length > maxArgs) {
            throw new MathError('函数 ' + name + ' 需要' + describeArity(meta), node.pos);
          }

          const special = SPECIAL_FUNCTIONS[name];
          if (special) {
            if (!node.args[1] || node.args[1].type !== 'variable') {
              throw new MathError(name + ' 的第二个参数必须是求导/积分/求和的变量，例如 ' + name + '(x^2, x)', node.pos);
            }
            const variable = node.args[1].name;

            if (special === 'diff') {
              return build(differentiate(node.args[0], variable));
            }

            const dummy = nextDummy();
            const bodyAst = substituteVariable(node.args[0], variable, dummy);
            const bodyFn = compile(bodyAst, {
              allowedVariables: allowed ? Array.from(new Set([...allowed, dummy])) : undefined,
              angleMode,
              nextDummy
            });

            if (special === 'integral') {
              if (node.args.length !== 4) {
                throw new MathError('定积分需要 4 个参数（被积函数、积分变量、下限、上限）', node.pos);
              }
              const lowerFn = build(node.args[2]);
              const upperFn = build(node.args[3]);

              return function (scope) {
                const outer = scope || {};
                const local = Object.assign(Object.create(null), outer);
                const evaluateAt = function (t) {
                  local[dummy] = t;
                  return bodyFn(local);
                };
                const lower = lowerFn(outer);
                const upper = upperFn(outer);
                if (!Number.isFinite(lower) || !Number.isFinite(upper)) return NaN;
                return integrateNumerically(evaluateAt, lower, upper);
              };
            }

            const lowerFn = build(node.args[2]);
            const upperFn = build(node.args[3]);
            const isProduct = special === 'product';

            return function (scope) {
              const outer = scope || {};
              const lower = lowerFn(outer);
              const upper = upperFn(outer);
              if (!Number.isFinite(lower) || !Number.isFinite(upper)) return NaN;
              const start = Math.ceil(lower);
              const end = Math.floor(upper);
              if (end < start) return isProduct ? 1 : 0;
              if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end - start > 200000) return NaN;
              const local = Object.assign(Object.create(null), outer);
              let total = isProduct ? 1 : 0;
              for (let index = start; index <= end; index += 1) {
                local[dummy] = index;
                const value = bodyFn(local);
                if (!Number.isFinite(value)) return NaN;
                total = isProduct ? total * value : total + value;
                if (!Number.isFinite(total)) return NaN;
              }
              return total;
            };
          }

          const args = node.args.map(build);
          if (name === 'if') {
            const [condition, yes, no] = args;
            return (scope) => condition(scope) ? yes(scope) : no(scope);
          }
          const fn = meta.fn;
          const toRadians = meta.trig && angleMode === 'deg';
          const fromRadians = meta.inverseTrig && angleMode === 'deg';

          return function (scope) {
            const values = new Array(args.length);
            for (let i = 0; i < args.length; i += 1) values[i] = args[i](scope);
            if (toRadians) {
              for (let i = 0; i < values.length; i += 1) values[i] = values[i] * Math.PI / 180;
            }
            let result = domainCall(fn, values);
            if (fromRadians) result = result * 180 / Math.PI;
            return result;
          };
        }
        default:
          throw new MathError('无法处理这个表达式', node.pos);
      }
    }

    return build(ast);
  }

  function collectVariables(ast) {
    const found = new Set();
    const bound = new Set();
    function walk(node) {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'variable') {
        if (!bound.has(node.name) && !Object.prototype.hasOwnProperty.call(CONSTANTS, node.name)) {
          found.add(node.name);
        }
        return;
      }
      if (node.type === 'prime') {
        node.args.forEach(walk);
        return;
      }
      if (node.type === 'call') {
        const special = SPECIAL_FUNCTIONS[node.name];
        const variable = node.args[1];
        if (special && variable?.type === 'variable') {
          if (special === 'diff') {
            // A differentiation variable can still be free in the result.
            walk(node.args[0]);
          } else {
            const alreadyBound = bound.has(variable.name);
            bound.add(variable.name);
            walk(node.args[0]);
            if (!alreadyBound) bound.delete(variable.name);
            node.args.slice(2).forEach(walk);
          }
          return;
        }
        node.args.forEach(walk);
        return;
      }
      if (node.left) walk(node.left);
      if (node.right) walk(node.right);
      if (node.operand) walk(node.operand);
    }
    walk(ast);
    return found;
  }

  function parse(source) {
    return new Parser(source).parse();
  }

  function evaluate(source, scope, options) {
    const ast = parse(source);
    return compile(ast, options || {})(scope || {});
  }

  Plotsy.math = {
    MathError,
    normalize,
    tokenize,
    parse,
    compile,
    collectVariables,
    collectBoundVariables,
    substituteVariable,
    differentiate,
    simplify,
    derivativeInfo,
    specialFunctions: SPECIAL_FUNCTIONS,
    evaluate,
    constants: CONSTANTS,
    functions: FUNCTIONS
  };
})(typeof window !== 'undefined' ? window : globalThis);
