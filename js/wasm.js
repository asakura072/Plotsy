/*
 * Plotsy · WASM 数值核心适配层
 *
 * - 表达式 AST 编译为 f64 字节码
 * - 批量采样交给 Rust/WASM
 * - 离线：WASM 以 base64 内嵌，不依赖 fetch，可直接 file:// 打开
 */
(function (global) {
  'use strict';

  const Plotsy = (global.Plotsy = global.Plotsy || {});
  const OP = {
    END: 0, PUSH: 1, X: 2, Y: 3,
    ADD: 10, SUB: 11, MUL: 12, DIV: 13, POW: 14, MOD: 15,
    NEG: 20, ABS: 21, SIGN: 22, FLOOR: 23, CEIL: 24, ROUND: 25,
    SQRT: 26, CBRT: 27,
    SIN: 30, COS: 31, TAN: 32, ASIN: 33, ACOS: 34, ATAN: 35,
    SINH: 36, COSH: 37, TANH: 38, ATAN2: 39, HYPOT: 40,
    LN: 45, LOG10: 46, LOG2: 47, EXP: 48,
    MIN: 50, MAX: 51, CLAMP: 52, IF: 53,
    LT: 60, GT: 61, LE: 62, GE: 63, EQ: 64
  };

  const SIMPLE_FUNCTIONS = {
    sin: OP.SIN, cos: OP.COS, tan: OP.TAN,
    asin: OP.ASIN, acos: OP.ACOS, atan: OP.ATAN,
    arcsin: OP.ASIN, arccos: OP.ACOS, arctan: OP.ATAN,
    sinh: OP.SINH, cosh: OP.COSH, tanh: OP.TANH,
    ln: OP.LN, log: OP.LOG10, log10: OP.LOG10, log2: OP.LOG2,
    exp: OP.EXP, sqrt: OP.SQRT, cbrt: OP.CBRT,
    abs: OP.ABS, floor: OP.FLOOR, ceil: OP.CEIL, round: OP.ROUND,
    sign: OP.SIGN, sgn: OP.SIGN
  };

  const TRIG_INPUT = new Set(['sin', 'cos', 'tan', 'cot', 'sec', 'csc']);
  const TRIG_OUTPUT = new Set([
    'asin', 'acos', 'atan', 'arcsin', 'arccos', 'arctan', 'atan2'
  ]);
  const SPECIAL = new Set([
    'diff', 'derivative', 'integral', 'int', 'sum', 'sigma', 'product', 'prod'
  ]);

  function compile(ast, options) {
    const opts = options || {};
    const vars = opts.vars || { x: 0 };
    const scope = opts.scope || {};
    const constants = (Plotsy.math && Plotsy.math.constants) || {};
    const angleMode = opts.angleMode === 'deg' ? 'deg' : 'rad';
    const out = [];
    let failed = false;

    const emit = (...values) => out.push(...values);
    const emitNumber = (value) => emit(OP.PUSH, value);
    const degToRad = () => emitNumber(Math.PI / 180), radToDeg = () => emitNumber(180 / Math.PI);

    function build(node) {
      if (!node || failed) return;
      switch (node.type) {
        case 'number':
          emitNumber(node.value);
          return;
        case 'variable': {
          const name = String(node.name || '').toLowerCase();
          if (Object.prototype.hasOwnProperty.call(vars, name)) {
            emit(vars[name] === 1 ? OP.Y : OP.X);
            return;
          }
          if (Object.prototype.hasOwnProperty.call(scope, name)) {
            emitNumber(scope[name]);
            return;
          }
          if (Object.prototype.hasOwnProperty.call(constants, name)) {
            emitNumber(constants[name]);
            return;
          }
          failed = true;
          return;
        }
        case 'unary':
          build(node.operand);
          if (node.op === '-') emit(OP.NEG);
          return;
        case 'abs':
          build(node.operand);
          emit(OP.ABS);
          return;
        case 'compare':
          build(node.left);
          build(node.right);
          emit({
            '<': OP.LT, '>': OP.GT, '<=': OP.LE, '>=': OP.GE, '=': OP.EQ
          }[node.op] || OP.EQ);
          return;
        case 'binary':
          build(node.left);
          build(node.right);
          emit({
            '+': OP.ADD, '-': OP.SUB, '*': OP.MUL, '/': OP.DIV,
            '^': OP.POW, '%': OP.MOD
          }[node.op] || OP.ADD);
          return;
        case 'call': {
          const name = node.name;
          if (SPECIAL.has(name)) {
            failed = true;
            return;
          }
          if (name === 'cot' || name === 'sec' || name === 'csc') {
            emitNumber(1);
            build(node.args[0]);
            if (angleMode === 'deg') {
              degToRad();
              emit(OP.MUL);
            }
            emit(name === 'cot' ? OP.TAN : name === 'sec' ? OP.COS : OP.SIN);
            emit(OP.DIV);
            return;
          }

          if (name === 'if') {
            build(node.args[0]);
            build(node.args[1]);
            build(node.args[2]);
            emit(OP.IF);
            return;
          }
          if (name === 'clamp') {
            build(node.args[0]);
            build(node.args[1]);
            build(node.args[2]);
            emit(OP.CLAMP);
            return;
          }
          if (name === 'min' || name === 'max') {
            build(node.args[0]);
            for (let i = 1; i < node.args.length; i += 1) {
              build(node.args[i]);
              emit(name === 'min' ? OP.MIN : OP.MAX);
            }
            return;
          }
          if (name === 'hypot') {
            build(node.args[0]);
            for (let i = 1; i < node.args.length; i += 1) {
              build(node.args[i]);
              emit(OP.HYPOT);
            }
            return;
          }
          if (name === 'pow') {
            build(node.args[0]);
            build(node.args[1]);
            emit(OP.POW);
            return;
          }
          if (name === 'mod') {
            build(node.args[0]);
            build(node.args[1]);
            emit(OP.MOD);
            return;
          }
          if (name === 'atan2') {
            build(node.args[0]);
            build(node.args[1]);
            emit(OP.ATAN2);
            if (angleMode === 'deg') {
              radToDeg();
              emit(OP.MUL);
            }
            return;
          }
          if (name === 'nthroot') {
            // sign(x) * |x|^(1/n)
            build(node.args[0]);
            emit(OP.SIGN);
            build(node.args[0]);
            emit(OP.ABS);
            emitNumber(1);
            build(node.args[1]);
            emit(OP.DIV);
            emit(OP.POW);
            emit(OP.MUL);
            return;
          }
          if (name === 'deg' || name === 'rad') {
            build(node.args[0]);
            emitNumber(name === 'deg' ? Math.PI / 180 : 180 / Math.PI);
            emit(OP.MUL);
            return;
          }
          if (name === 'round' && node.args.length === 2) {
            build(node.args[0]);
            emitNumber(10);
            build(node.args[1]);
            emit(OP.POW);
            emit(OP.MUL);
            emit(OP.ROUND);
            emitNumber(10);
            build(node.args[1]);
            emit(OP.POW);
            emit(OP.DIV);
            return;
          }

          const opcode = SIMPLE_FUNCTIONS[name];
          if (!opcode) {
            failed = true;
            return;
          }
          build(node.args[0]);
          if (TRIG_INPUT.has(name) && angleMode === 'deg') {
            degToRad();
            emit(OP.MUL);
          }
          emit(opcode);
          if (TRIG_OUTPUT.has(name) && angleMode === 'deg') {
            radToDeg();
            emit(OP.MUL);
          }
          return;
        }
        default:
          failed = true;
      }
    }

    build(ast);
    if (failed) return null;
    emit(OP.END);
    return new Float64Array(out);
  }

  const base64 = Plotsy.wasmBase64 || '';
  let exports = null;
  let ready = false;
  let error = null;
  const stats = { calls: 0, samples: 0 };

  function decodeBase64(text) {
    const binary = global.atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  const readyPromise = (async () => {
    if (!base64) return false;
    try {
      const bytes = decodeBase64(base64);
      const result = await WebAssembly.instantiate(bytes, {});
      exports = result.instance.exports;
      ready = true;
      global.setTimeout(() => {
        global.dispatchEvent(new CustomEvent('plotsy-wasm-ready'));
      }, 0);
      return true;
    } catch (err) {
      error = err;
      console.warn('[Plotsy] WASM 加载失败，使用 JS 回退', err);
      return false;
    }
  })();

  function alloc(values) {
    const length = values.length !== undefined ? values.length : values;
    const count = Number(length) || 0;
    if (!count) return 0;
    const ptr = exports.x_alloc(count);
    if (!ptr) throw new Error('WASM 内存分配失败');
    if (values.length !== undefined) {
      new Float64Array(exports.memory.buffer, ptr, count).set(values);
    }
    return ptr;
  }

  function evalMany(program, xs, ys) {
    if (!ready || !exports || !program || !xs || xs.length === 0) return null;
    const count = xs.length;
    stats.calls += 1;
    stats.samples += count;
    let programPtr = 0;
    let xsPtr = 0;
    let ysPtr = 0;
    let outPtr = 0;
    try {
      programPtr = alloc(program);
      xsPtr = alloc(xs);
      if (ys && ys.length === count) {
        ysPtr = alloc(ys);
      } else {
        ysPtr = alloc(count);
        new Float64Array(exports.memory.buffer, ysPtr, count).fill(0);
      }
      outPtr = alloc(count);
      const written = exports.x_eval_many(
        programPtr, program.length, xsPtr, ysPtr, count, outPtr
      );
      if (written !== count) return null;
      const view = new Float64Array(exports.memory.buffer, outPtr, count);
      return new Float64Array(view);
    } catch (err) {
      console.warn('[Plotsy] WASM 批量求值失败', err);
      return null;
    } finally {
      try {
        if (programPtr) exports.x_free(programPtr, program.length);
        if (xsPtr) exports.x_free(xsPtr, count);
        if (ysPtr) exports.x_free(ysPtr, count);
        if (outPtr) exports.x_free(outPtr, count);
      } catch (err) { /* 内存释放失败不阻断渲染 */ }
    }
  }

  function evalOne(program, x, y) {
    if (!ready || !exports || !program) return NaN;
    let ptr = 0;
    try {
      ptr = alloc(program);
      return exports.x_eval_one(ptr, program.length, x, y || 0);
    } finally {
      if (ptr) {
        try { exports.x_free(ptr, program.length); } catch (err) { /* 忽略 */ }
      }
    }
  }

  Plotsy.wasm = {
    OP,
    compile,
    evalMany,
    evalOne,
    readyPromise,
    stats,
    get ready() { return ready; },
    get error() { return error; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
