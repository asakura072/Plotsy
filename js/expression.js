/*
 * Plotsy · 表达式分类与编译
 * 把一条用户输入翻译成绘图引擎可以直接消费的图元。
 */
(function (global) {
  'use strict';

  const Plotsy = (global.Plotsy = global.Plotsy || {});
  const math = Plotsy.math;
  const MathError = math.MathError;

  const RESERVED = new Set(['x', 'y', 'r', 't', 'theta', ...Object.keys(math.constants)]);
  const SLIDER_NAME = /^[a-z\u0370-\u03ff](?:_[a-z0-9\u0370-\u03ff]+)?$/i;
  const DEFAULT_BOUNDS = { min: '0', max: '2π' };
  const DEFAULT_SLIDER = { min: -10, max: 10, step: 0.1 };

  function attachWasm(drawable, ast, vars, scope, opts) {
    attachWasmKey(drawable, 'wasmProgram', ast, vars, scope, opts);
  }

  function attachWasmKey(drawable, key, ast, vars, scope, opts) {
    if (!Plotsy.wasm || typeof Plotsy.wasm.compile !== 'function') return;
    const program = Plotsy.wasm.compile(ast, {
      vars,
      scope,
      angleMode: opts.angleMode
    });
    if (program) drawable[key] = program;
  }

  const LABELS = {
    explicit: '函数',
    explicitInequality: '不等式',
    implicit: '隐函数',
    implicitInequality: '不等式',
    vertical: '隐函数',
    verticalInequality: '不等式',
    polar: '极坐标',
    parametric: '参数曲线',
    point: '点',
    parameter: '滑块',
    constant: '数值',
    empty: '空白'
  };

  function labelFor(kind, op) {
    if (kind === 'explicit') return op === '=' ? LABELS.explicit : LABELS.explicitInequality;
    if (kind === 'implicit') return op === '=' ? LABELS.implicit : LABELS.implicitInequality;
    if (kind === 'vertical') return op === '=' ? LABELS.vertical : LABELS.verticalInequality;
    return LABELS[kind] || '表达式';
  }

  function splitRelation(text) {
    const hits = [];
    let depth = 0;
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (ch === '(') {
        depth += 1;
        continue;
      }
      if (ch === ')') {
        depth -= 1;
        continue;
      }
      if (depth !== 0) continue;

      const two = text.slice(i, i + 2);
      if (two === '<=' || two === '>=' || two === '!=') {
        hits.push({ pos: i, op: two });
        i += 1;
        continue;
      }
      if (ch === '<' || ch === '>' || ch === '=') {
        hits.push({ pos: i, op: ch });
      }
    }
    return hits;
  }

  function parseEqualitySides(text, relation) {
    const lhs = text.slice(0, relation.pos).trim();
    const rhs = text.slice(relation.pos + relation.op.length).trim();
    if (!lhs) throw new MathError('关系符号左侧缺少表达式', relation.pos);
    if (!rhs) throw new MathError('关系符号右侧缺少表达式，请继续输入', relation.pos + relation.op.length);
    return { lhs, rhs };
  }

  function extractTuple(text) {
    if (text[0] !== '(') return null;
    let depth = 0;
    let commaPos = -1;
    let closedAt = -1;

    for (let i = 0; i < text.length; i += 1) {
      if (text[i] === '(') depth += 1;
      else if (text[i] === ')') {
        depth -= 1;
        if (depth === 0) {
          closedAt = i;
          if (i !== text.length - 1) return null;
          break;
        }
        if (depth < 0) return null;
      } else if (text[i] === ',' && depth === 1) {
        if (commaPos !== -1) {
          throw new MathError('坐标或参数曲线只能有两个分量', i);
        }
        commaPos = i;
      }
    }

    if (closedAt !== text.length - 1 || commaPos === -1) return null;
    const first = text.slice(1, commaPos).trim();
    const second = text.slice(commaPos + 1, text.length - 1).trim();
    if (!first || !second) throw new MathError('坐标的两个分量都不能为空', commaPos);
    return { first, second, commaPos };
  }

  function analyze(raw, config) {
    const text = math.normalize(raw);
    if (!/[{}]/.test(text)) return analyzePlot(text, config);

    const start = text.indexOf('{');
    const source = text.slice(0, start).trim();
    const restrictions = [];
    let offset = start;
    while (offset >= 0 && offset < text.length) {
      const match = /^\{([^{}]+)\}\s*/.exec(text.slice(offset));
      if (!match) break;
      const condition = match[1];
      const relations = splitRelation(condition);
      if (!relations.length || relations.some(({ op }) => op === '!=')) {
        throw new MathError('限制条件需要比较符号，例如 {0 < x < 2}');
      }
      let left = math.parse(condition.slice(0, relations[0].pos));
      for (let index = 0; index < relations.length; index += 1) {
        const { pos, op } = relations[index];
        const right = math.parse(condition.slice(pos + op.length, relations[index + 1]?.pos));
        restrictions.push({ type: 'compare', op, left, right, pos });
        left = right;
      }
      offset += match[0].length;
    }
    if (!source || !restrictions.length || offset !== text.length) {
      throw new MathError('请在表达式末尾填写完整的花括号限制');
    }

    const plot = analyzePlot(source, config);
    const restrictedVariables = new Set(restrictions.flatMap((node) => [...math.collectVariables(node)]));
    const restrict = (ast) => restrictions.reduceRight((body, condition) => ({
      type: 'call', name: 'if', args: [condition, body, { type: 'number', value: NaN }]
    }), ast);
    const variables = new Set([...plot.variables, ...restrictedVariables]);
    const analysis = { ...plot, text, variables, plot, restrictions };
    if (plot.kind === 'explicit' && !restrictedVariables.has('y')) {
      return { ...analysis, ast: restrict(plot.ast) };
    }
    if (plot.kind === 'implicit') return { ...analysis, equationAst: restrict(plot.equationAst) };
    if (plot.kind === 'vertical' || (plot.kind === 'explicit' && !plot.definition)) {
      const lhs = math.parse(plot.kind === 'vertical' ? 'x' : 'y');
      return {
        ...analysis,
        kind: 'implicit',
        label: labelFor('implicit', plot.op),
        equationAst: restrict({ type: 'binary', op: '-', left: lhs, right: plot.ast })
      };
    }
    throw new MathError('此处的限制条件需要使用直角坐标曲线或不等式');
  }

  function analyzePlot(text, config) {
    const options = config || {};
    if (!text) return { kind: 'empty', text: '', label: LABELS.empty };

    const relations = splitRelation(text);

    if (relations.length > 1) {
      throw new MathError('一个表达式只能包含一个关系符号，请拆成多条表达式', relations[1].pos);
    }

    if (relations.length === 0) {
      const tuple = extractTuple(text);
      if (tuple) {
        const firstAst = math.parse(tuple.first);
        const secondAst = math.parse(tuple.second);
        const firstVars = math.collectVariables(firstAst);
        const secondVars = math.collectVariables(secondAst);
        const variables = new Set([...firstVars, ...secondVars]);

        if (variables.has('x') || variables.has('y')) {
          throw new MathError('坐标点与参数曲线不能直接使用 x 或 y，请改用 t 或滑块变量', tuple.commaPos);
        }

        if (variables.has('t') && variables.has('theta')) {
          throw new MathError('参数曲线只能使用一个参数：t 或 θ', tuple.commaPos);
        }

        const paramVar = variables.has('t') ? 't' : (variables.has('theta') ? 'theta' : null);
        if (paramVar) {
          return {
            kind: 'parametric',
            text,
            label: LABELS.parametric,
            firstAst,
            secondAst,
            paramVar,
            variables,
            bounds: normalizeBounds(options.bounds)
          };
        }

        return {
          kind: 'point',
          text,
          label: LABELS.point,
          firstAst,
          secondAst,
          variables
        };
      }

      const ast = math.parse(text);
      const variables = math.collectVariables(ast);
      if (variables.has('y')) {
        const lhsAst = math.parse('y');
        return {
          kind: 'implicit',
          text,
          op: '=',
          label: LABELS.implicit,
          equationAst: { type: 'binary', op: '-', left: lhsAst, right: ast, pos: 0 },
          lhsAst,
          rhsAst: ast,
          variables: new Set([...variables, 'y'])
        };
      }
      return {
        kind: 'explicit',
        text,
        op: '=',
        label: LABELS.explicit,
        ast,
        variables,
        bare: true,
        bounds: null
      };
    }

    const relation = relations[0];
    if (relation.op === '!=') throw new MathError('暂不支持“不等于”的不等式', relation.pos);
    const sides = parseEqualitySides(text, relation);
    const functionMatch = /^([a-z\u0370-\u03ff])\s*\(\s*x\s*\)$/i.exec(sides.lhs.trim());
    if (functionMatch) {
      if (relation.op !== '=') throw new MathError('函数定义只能使用等号', relation.pos);
      const functionName = functionMatch[1].toLowerCase();
      if (RESERVED.has(functionName) || Object.prototype.hasOwnProperty.call(math.functions, functionName)) {
        throw new MathError('“' + functionName + '” 不能作为函数名，请使用 f、g、h 等字母', relation.pos);
      }
      const ast = math.parse(sides.rhs);
      return {
        kind: 'explicit',
        text,
        op: '=',
        label: LABELS.explicit,
        ast,
        variables: math.collectVariables(ast),
        functionName,
        definition: true,
        bare: false
      };
    }
    const nameMatch = /^[a-z_\u0370-\u03ff][a-z0-9_\u0370-\u03ff]*$/i.exec(sides.lhs);
    const name = nameMatch ? nameMatch[0].toLowerCase() : null;

    if (name === 'r') {
      if (relation.op !== '=') throw new MathError('极坐标暂不支持不等式', relation.pos);
      const ast = math.parse(sides.rhs);
      return {
        kind: 'polar',
        text,
        op: '=',
        label: LABELS.polar,
        ast,
        variables: math.collectVariables(ast),
        bounds: normalizeBounds(options.bounds),
        paramVar: 'theta'
      };
    }

    if (name === 'y') {
      const rhsAst = math.parse(sides.rhs);
      const rhsVars = math.collectVariables(rhsAst);
      if (rhsVars.has('y')) {
        const lhsAst = math.parse(sides.lhs);
        const variables = new Set([...rhsVars, ...math.collectVariables(lhsAst)]);
        return {
          kind: 'implicit',
          text,
          op: relation.op,
          label: labelFor('implicit', relation.op),
          equationAst: { type: 'binary', op: '-', left: lhsAst, right: rhsAst, pos: relation.pos },
          lhsAst,
          rhsAst,
          variables
        };
      }
      return {
        kind: 'explicit',
        text,
        op: relation.op,
        label: labelFor('explicit', relation.op),
        ast: rhsAst,
        variables: rhsVars,
        bare: false
      };
    }

    if (name === 'x') {
      const rhsAst = math.parse(sides.rhs);
      const rhsVars = math.collectVariables(rhsAst);
      if (rhsVars.has('x') || rhsVars.has('y')) {
        const lhsAst = math.parse(sides.lhs);
        const variables = new Set([...rhsVars, ...math.collectVariables(lhsAst)]);
        return {
          kind: 'implicit',
          text,
          op: relation.op,
          label: labelFor('implicit', relation.op),
          equationAst: { type: 'binary', op: '-', left: lhsAst, right: rhsAst, pos: relation.pos },
          lhsAst,
          rhsAst,
          variables
        };
      }
      return {
        kind: 'vertical',
        text,
        op: relation.op,
        label: labelFor('vertical', relation.op),
        ast: rhsAst,
        variables: rhsVars
      };
    }

    if (name) {
      if (RESERVED.has(name)) {
        throw new MathError('“' + name + '” 是保留名称，请换一个滑块变量名', relation.pos);
      }
      if (!SLIDER_NAME.test(name)) {
        throw new MathError('滑块变量请使用单个字母或带下标的字母，例如 a、b、a_1', relation.pos);
      }
      if (relation.op !== '=') throw new MathError('滑块定义只能使用等号', relation.pos);
      const ast = math.parse(sides.rhs);
      return {
        kind: 'parameter',
        text,
        op: '=',
        label: LABELS.parameter,
        name,
        ast,
        variables: math.collectVariables(ast),
        slider: normalizeSlider(options.slider)
      };
    }

    const lhsAst = math.parse(sides.lhs);
    const rhsAst = math.parse(sides.rhs);
    const variables = new Set([...math.collectVariables(lhsAst), ...math.collectVariables(rhsAst)]);
    if (!variables.has('x') && !variables.has('y')) {
      throw new MathError('方程或不等式中需要包含 x 或 y', relation.pos);
    }
    return {
      kind: 'implicit',
      text,
      op: relation.op,
      label: labelFor('implicit', relation.op),
      equationAst: { type: 'binary', op: '-', left: lhsAst, right: rhsAst, pos: relation.pos },
      lhsAst,
      rhsAst,
      variables
    };
  }

  function normalizeBounds(bounds) {
    const source = bounds && typeof bounds === 'object' ? bounds : {};
    return {
      min: source.min === undefined || source.min === null || source.min === '' ? DEFAULT_BOUNDS.min : String(source.min),
      max: source.max === undefined || source.max === null || source.max === '' ? DEFAULT_BOUNDS.max : String(source.max)
    };
  }

  function normalizeSlider(slider) {
    const source = slider && typeof slider === 'object' ? slider : {};
    const min = Number(source.min);
    const max = Number(source.max);
    const step = Number(source.step);
    const valid = Number.isFinite(min) && Number.isFinite(max) && Number.isFinite(step) && min < max && step > 0;
    return valid ? { min, max, step } : { ...DEFAULT_SLIDER };
  }

  function safeCompile(ast, allowed, settings) {
    return math.compile(ast, {
      allowedVariables: allowed,
      angleMode: settings.angleMode
    });
  }

  function cloneAst(node) {
    if (!node || typeof node !== 'object') return node;
    const copy = { ...node };
    if (Array.isArray(node.args)) copy.args = node.args.map(cloneAst);
    if (node.left) copy.left = cloneAst(node.left);
    if (node.right) copy.right = cloneAst(node.right);
    if (node.operand) copy.operand = cloneAst(node.operand);
    return copy;
  }

  let nextBindingId = 0;

  function substituteAst(node, name, replacement, free = math.collectVariables(replacement)) {
    if (!node || typeof node !== 'object') return node;
    const replace = (child) => substituteAst(child, name, replacement, free);
    if (node.type === 'variable') {
      return node.name === name ? cloneAst(replacement) : node;
    }
    if (node.type === 'prime') {
      return { ...node, args: node.args.map(replace) };
    }
    if (node.type === 'unary' || node.type === 'abs') return { ...node, operand: replace(node.operand) };
    if (node.type === 'compare' || node.type === 'binary') {
      return { ...node, left: replace(node.left), right: replace(node.right) };
    }
    if (node.type === 'call') {
      const special = math.specialFunctions[node.name];
      const variable = node.args[1]?.type === 'variable' ? node.args[1].name : null;
      if (!special || !variable) return { ...node, args: node.args.map(replace) };
      const [body, binding, ...limits] = node.args;
      if (special === 'diff') return replace(math.differentiate(body, variable));
      if (variable === name) return { ...node, args: [body, binding, ...limits.map(replace)] };
      if (!free.has(variable)) return { ...node, args: [replace(body), binding, ...limits.map(replace)] };

      // An argument can use the same name as a local integration or summation variable.
      const renamed = '__bind' + nextBindingId++;
      return {
        ...node,
        args: [replace(math.substituteVariable(body, variable, renamed)), { ...binding, name: renamed }, ...limits.map(replace)]
      };
    }
    return node;
  }

  function expandNamedCalls(node, definitions, stack) {
    if (!node || typeof node !== 'object') return node;
    if (node.type === 'prime') {
      return { ...node, args: node.args.map((arg) => expandNamedCalls(arg, definitions, stack)) };
    }
    if (node.type === 'call') {
      const definition = definitions.get(node.name);
      if (definition) {
        if (stack.has(node.name)) {
          throw new MathError('函数 “' + node.name + '” 出现了循环引用');
        }
        if (node.args.length !== 1) {
          throw new MathError('函数 “' + node.name + '” 需要 1 个参数');
        }
        const argument = expandNamedCalls(node.args[0], definitions, stack);
        let body = expandNamedCalls(definition.ast, definitions, new Set([...stack, node.name]));
        for (let order = 0; order < (node.primeCount || 0); order += 1) {
          body = math.differentiate(body, 'x');
        }
        return substituteAst(body, 'x', argument);
      }
      if (/^[a-z]$/i.test(node.name) && !math.functions[node.name] && !math.constants[node.name]) {
        throw new MathError('函数 “' + node.name + '” 未定义');
      }
      return {
        ...node,
        args: node.args.map((arg) => expandNamedCalls(arg, definitions, stack))
      };
    }
    if (node.type === 'unary') return { ...node, operand: expandNamedCalls(node.operand, definitions, stack) };
    if (node.type === 'abs') return { ...node, operand: expandNamedCalls(node.operand, definitions, stack) };
    if (node.type === 'compare') {
      return {
        ...node,
        left: expandNamedCalls(node.left, definitions, stack),
        right: expandNamedCalls(node.right, definitions, stack)
      };
    }
    if (node.type === 'binary') {
      return {
        ...node,
        left: expandNamedCalls(node.left, definitions, stack),
        right: expandNamedCalls(node.right, definitions, stack)
      };
    }
    return node;
  }

  function expandAnalysis(analysis, ownName, definitions) {
    if (!analysis || analysis.kind === 'error' || analysis.kind === 'empty') return;
    const stack = ownName ? new Set([ownName]) : new Set();
    if (analysis.kind === 'explicit') {
      analysis.compiledAst = expandNamedCalls(analysis.ast, definitions, stack);
      analysis.variables = math.collectVariables(analysis.compiledAst);
    } else if (analysis.kind === 'implicit') {
      analysis.compiledEquationAst = expandNamedCalls(analysis.equationAst, definitions, stack);
      analysis.variables = math.collectVariables(analysis.compiledEquationAst);
    } else if (analysis.kind === 'vertical' || analysis.kind === 'polar') {
      analysis.compiledAst = expandNamedCalls(analysis.ast, definitions, stack);
      analysis.variables = math.collectVariables(analysis.compiledAst);
    } else if (analysis.kind === 'parametric' || analysis.kind === 'point') {
      analysis.compiledFirstAst = expandNamedCalls(analysis.firstAst, definitions, stack);
      analysis.compiledSecondAst = expandNamedCalls(analysis.secondAst, definitions, stack);
      analysis.variables = new Set([
        ...math.collectVariables(analysis.compiledFirstAst),
        ...math.collectVariables(analysis.compiledSecondAst)
      ]);
    } else if (analysis.kind === 'parameter') {
      analysis.compiledAst = expandNamedCalls(analysis.ast, definitions, stack);
      analysis.variables = math.collectVariables(analysis.compiledAst);
    }
  }

  function unresolvedParameter(variables, paramNames, scope) {
    for (const name of variables) {
      if (paramNames.has(name) && !Number.isFinite(scope[name])) return name;
    }
    return null;
  }

  function readBoundary(text, paramNames, scope, settings, label) {
    const source = String(text == null ? '' : text).trim();
    if (!source) throw new MathError(label + '不能为空');
    const ast = math.parse(source);
    const vars = math.collectVariables(ast);
    for (const name of vars) {
      if (!paramNames.has(name)) {
        throw new MathError(label + '不能使用变量 “' + name + '”');
      }
    }
    const value = safeCompile(ast, Array.from(paramNames), settings)(scope);
    if (!Number.isFinite(value)) throw new MathError(label + '不是有效数值');
    return value;
  }

  function getRange(analysis, expression, paramNames, scope, settings) {
    const bounds = normalizeBounds(expression.bounds || analysis.bounds);
    const min = readBoundary(bounds.min, paramNames, scope, settings, '范围起点');
    const max = readBoundary(bounds.max, paramNames, scope, settings, '范围终点');
    if (min >= max) throw new MathError('范围起点必须小于终点');
    return { min, max, minText: bounds.min, maxText: bounds.max };
  }

  function prepare(expressions, settings) {
    const opts = settings || {};
    const list = Array.isArray(expressions) ? expressions : [];
    const analyses = new Map();
    const results = Object.create(null);
    const drawables = [];

    for (const expression of list) {
      try {
        analyses.set(expression.id, analyze(expression.raw, expression));
      } catch (error) {
        analyses.set(expression.id, {
          kind: 'error',
          text: '',
          label: '表达式',
          error: error instanceof MathError ? error : new MathError('无法解析这个表达式')
        });
      }
    }

    const functionDefinitions = new Map();
    const duplicateFunctions = new Set();
    for (const expression of list) {
      const analysis = analyses.get(expression.id);
      if (analysis.kind !== 'explicit' || analysis.op !== '=') continue;
      const name = analysis.functionName || (expression.nameKind === 'function' && expression.name);
      if (!name) continue;
      if (functionDefinitions.has(name)) duplicateFunctions.add(name);
      else functionDefinitions.set(name, { ast: analysis.ast, expression });
    }
    for (const name of duplicateFunctions) functionDefinitions.delete(name);

    for (const expression of list) {
      const analysis = analyses.get(expression.id);
      if (!analysis) continue;
      try {
        if (duplicateFunctions.has(analysis.functionName)) {
          throw new MathError('函数 “' + analysis.functionName + '” 被重复定义');
        }
        expandAnalysis(
          analysis,
          analysis.functionName || (expression.nameKind === 'function' ? expression.name : null),
          functionDefinitions
        );
      } catch (error) {
        analyses.set(expression.id, {
          kind: 'error',
          text: analysis.text || '',
          label: analysis.label || '表达式',
          error: error instanceof MathError ? error : new MathError('无法展开函数引用')
        });
      }
    }

    const parameterAnalyses = [];
    const paramNames = new Set();
    for (const expression of list) {
      const analysis = analyses.get(expression.id);
      if (analysis && analysis.kind === 'parameter') {
        parameterAnalyses.push({ expression, analysis });
        paramNames.add(analysis.name);
      }
    }

    const scope = Object.create(null);
    const parameterErrors = new Map();
    const parameterValues = new Map();
    const nameCounts = new Map();
    for (const { analysis } of parameterAnalyses) {
      nameCounts.set(analysis.name, (nameCounts.get(analysis.name) || 0) + 1);
    }
    for (const { expression, analysis } of parameterAnalyses) {
      if ((nameCounts.get(analysis.name) || 0) > 1) {
        parameterErrors.set(
          expression.id,
          new MathError('变量 “' + analysis.name + '” 被重复定义，请保留一条滑块定义')
        );
      }
    }

    for (const { expression, analysis } of parameterAnalyses) {
      if (parameterErrors.has(expression.id)) continue;
      let fn;
      try {
        fn = safeCompile(analysis.compiledAst, Array.from(paramNames), opts);
      } catch (error) {
        parameterErrors.set(expression.id, error instanceof MathError ? error : new MathError('滑块值无法解析'));
        continue;
      }
      parameterValues.set(expression.id, { fn, analysis });
    }

    for (let pass = 0; pass < parameterValues.size; pass += 1) {
      let progressed = false;
      for (const { expression } of parameterAnalyses) {
        const entry = parameterValues.get(expression.id);
        if (!entry || Object.hasOwn(scope, entry.analysis.name)) continue;
        if (unresolvedParameter(entry.analysis.variables, paramNames, scope)) continue;
        let value;
        try {
          value = entry.fn(scope);
        } catch (error) {
          value = NaN;
        }
        if (Number.isFinite(value)) {
          scope[entry.analysis.name] = value;
          progressed = true;
        }
      }
      if (!progressed) break;
    }

    for (const { expression, analysis } of parameterAnalyses) {
      if (parameterErrors.has(expression.id)) {
        const error = parameterErrors.get(expression.id);
        results[expression.id] = errorResult(expression, error, '滑块');
        continue;
      }
      const value = scope[analysis.name];
      if (!Number.isFinite(value)) {
        results[expression.id] = errorResult(
          expression,
          new MathError('无法计算滑块值，请检查是否存在循环引用或无效运算'),
          '滑块'
        );
        continue;
      }
      const slider = normalizeSlider(expression.slider);
      results[expression.id] = {
        id: expression.id,
        status: 'ok',
        kind: 'parameter',
        label: LABELS.parameter,
        name: analysis.name,
        value,
        range: slider,
        message: ''
      };
    }

    for (const expression of list) {
      if (results[expression.id]) continue;
      const analysis = analyses.get(expression.id);

      if (!analysis || analysis.kind === 'empty') {
        results[expression.id] = emptyResult(expression);
        continue;
      }

      if (analysis.kind === 'error') {
        results[expression.id] = errorResult(expression, analysis.error, analysis.label);
        continue;
      }

      const missingVariables = [...analysis.variables].filter((name) =>
        SLIDER_NAME.test(name) && !RESERVED.has(name) && !paramNames.has(name)
      );
      if (missingVariables.length) {
        results[expression.id] = {
          ...errorResult(expression, new MathError('未定义变量：' + missingVariables.join(', ')), analysis.label),
          missingVariables
        };
        continue;
      }

      try {
        const missing = unresolvedParameter(analysis.variables, paramNames, scope);
        if (missing) {
          throw new MathError('依赖的滑块 “' + missing + '” 没有有效数值');
        }

        const allowedParams = Array.from(paramNames);
        const common = { id: expression.id, color: expression.color, hidden: !!expression.hidden };

        if (analysis.kind === 'explicit') {
          const compiled = safeCompile(analysis.compiledAst, [...allowedParams, 'x'], opts);
          const boundScope = Object.assign(Object.create(null), scope);
          const fn = function (x) {
            boundScope.x = x;
            return compiled(boundScope);
          };

          const derivative = analysis.bare && math.derivativeInfo(analysis.compiledAst);
          const variables = derivative ? math.collectVariables(derivative.derivative) : analysis.variables;
          if (analysis.bare && !variables.has('x')) {
            const value = fn(0);
            analysis.isConstant = true;
            analysis.constantValue = value;
            results[expression.id] = {
              id: expression.id,
              status: 'ok',
              kind: 'constant',
              label: LABELS.constant,
              value,
              message: ''
            };
            continue;
          }

          results[expression.id] = {
            id: expression.id,
            status: 'ok',
            kind: analysis.kind,
            label: analysis.label,
            message: ''
          };
          const expressionDrawable = {
            ...common,
            type: 'explicit',
            relation: analysis.op,
            fn
          };
          attachWasm(expressionDrawable, analysis.compiledAst, { x: 0 }, scope, opts);
          drawables.push(expressionDrawable);
          continue;
        }

        if (analysis.kind === 'implicit') {
          const compiled = safeCompile(analysis.compiledEquationAst, [...allowedParams, 'x', 'y'], opts);
          const boundScope = Object.assign(Object.create(null), scope);
          const fn = function (x, y) {
            boundScope.x = x;
            boundScope.y = y;
            return compiled(boundScope);
          };
          results[expression.id] = {
            id: expression.id,
            status: 'ok',
            kind: analysis.kind,
            label: analysis.label,
            message: ''
          };
          const implicitDrawable = {
            ...common,
            type: 'implicit',
            relation: analysis.op,
            fn
          };
          attachWasm(implicitDrawable, analysis.compiledEquationAst, { x: 0, y: 1 }, scope, opts);
          drawables.push(implicitDrawable);
          continue;
        }

        if (analysis.kind === 'vertical') {
          const fn = safeCompile(analysis.compiledAst, allowedParams, opts);
          const x = fn(scope);
          if (!Number.isFinite(x)) throw new MathError('竖线的位置不是有效数值');
          results[expression.id] = {
            id: expression.id,
            status: 'ok',
            kind: analysis.kind,
            label: analysis.label,
            message: ''
          };
          drawables.push({
            ...common,
            type: 'vertical',
            relation: analysis.op,
            x
          });
          continue;
        }

        if (analysis.kind === 'polar') {
          const compiled = safeCompile(analysis.compiledAst, [...allowedParams, 'theta'], opts);
          const range = getRange(analysis, expression, paramNames, scope, opts);
          const boundScope = Object.assign(Object.create(null), scope);
          const rFn = function (theta) {
            boundScope.theta = theta;
            return compiled(boundScope);
          };
          results[expression.id] = {
            id: expression.id,
            status: 'ok',
            kind: analysis.kind,
            label: analysis.label,
            message: '',
            paramVar: 'θ',
            range
          };
          const polarDrawable = {
            ...common,
            type: 'polar',
            rFn,
            min: range.min,
            max: range.max
          };
          attachWasm(polarDrawable, analysis.compiledAst, { theta: 0 }, scope, opts);
          drawables.push(polarDrawable);
          continue;
        }

        if (analysis.kind === 'parametric') {
          const allowed = [...allowedParams, analysis.paramVar];
          const compiledX = safeCompile(analysis.compiledFirstAst, allowed, opts);
          const compiledY = safeCompile(analysis.compiledSecondAst, allowed, opts);
          const range = getRange(analysis, expression, paramNames, scope, opts);
          const boundScope = Object.assign(Object.create(null), scope);
          const xFn = function (t) {
            boundScope[analysis.paramVar] = t;
            return compiledX(boundScope);
          };
          const yFn = function (t) {
            boundScope[analysis.paramVar] = t;
            return compiledY(boundScope);
          };
          results[expression.id] = {
            id: expression.id,
            status: 'ok',
            kind: analysis.kind,
            label: analysis.label,
            message: '',
            paramVar: analysis.paramVar === 'theta' ? 'θ' : 't',
            range
          };
          const parametricDrawable = {
            ...common,
            type: 'parametric',
            xFn,
            yFn,
            min: range.min,
            max: range.max
          };
          attachWasm(parametricDrawable, analysis.compiledFirstAst, { [analysis.paramVar]: 0 }, scope, opts);
          attachWasmKey(
            parametricDrawable,
            'wasmProgramY',
            analysis.compiledSecondAst,
            { [analysis.paramVar]: 0 },
            scope,
            opts
          );
          drawables.push(parametricDrawable);
          continue;
        }

        if (analysis.kind === 'point') {
          const xFn = safeCompile(analysis.compiledFirstAst, allowedParams, opts);
          const yFn = safeCompile(analysis.compiledSecondAst, allowedParams, opts);
          const x = xFn(scope);
          const y = yFn(scope);
          if (!Number.isFinite(x) || !Number.isFinite(y)) {
            throw new MathError('坐标不是有效数值');
          }
          results[expression.id] = {
            id: expression.id,
            status: 'ok',
            kind: analysis.kind,
            label: analysis.label,
            message: '',
            point: { x, y }
          };
          drawables.push({ ...common, type: 'point', x, y });
          continue;
        }

        throw new MathError('暂不支持这种表达式');
      } catch (error) {
        const normalized = error instanceof MathError ? error : new MathError('无法绘制这个表达式');
        results[expression.id] = errorResult(expression, normalized, analysis.label);
      }
    }

    return { results, drawables, scope, analyses };
  }

  function errorResult(expression, error, label) {
    return {
      id: expression.id,
      status: 'error',
      kind: 'error',
      label: label || '表达式',
      message: error && error.message ? error.message : '无法解析这个表达式',
      position: error && Number.isFinite(error.position) ? error.position : 0
    };
  }

  function emptyResult(expression) {
    return {
      id: expression.id,
      status: 'empty',
      kind: 'empty',
      label: LABELS.empty,
      message: ''
    };
  }

  Plotsy.expr = {
    analyze,
    prepare,
    normalizeBounds,
    normalizeSlider,
    labels: LABELS,
    defaults: {
      bounds: DEFAULT_BOUNDS,
      slider: DEFAULT_SLIDER
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
