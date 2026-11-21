(function (global) {
  'use strict';

  const Plotsy = (global.Plotsy = global.Plotsy || {});
  const HEADER = 'plotsy 1';
  const EXTENSION = '.psy';
  const DISPLAY_SETTINGS = { grid: 'grid', 'minor-grid': 'minorGrid', axes: 'axes', labels: 'labels' };
  const NAME_KINDS = new Set(['function', 'graph', 'parameter']);

  function encode(project) {
    const { viewport, settings, expressions } = project;
    const defaults = Plotsy.expr.defaults;
    const quote = (value) => JSON.stringify(value);
    const lines = [HEADER, 'view ' + [viewport.x, viewport.y, viewport.scale].join(' ')];
    for (const [command, key] of Object.entries(DISPLAY_SETTINGS)) {
      if (settings[key] === false) lines.push(command + ' off');
    }
    if (settings.angleMode === 'deg') lines.push('angle deg');

    for (const entry of expressions) {
      lines.push('expr ' + quote(entry.raw));
      if (entry.latex) lines.push('  latex ' + quote(entry.latex));
      if (entry.color) lines.push('  color ' + entry.color);
      if (entry.name && NAME_KINDS.has(entry.nameKind)) {
        lines.push('  name ' + entry.nameKind + ' ' + quote(entry.name));
      }
      if (entry.hidden) lines.push('  hidden');
      const { bounds, slider } = entry;
      if (bounds && (bounds.min !== defaults.bounds.min || bounds.max !== defaults.bounds.max)) {
        lines.push('  bounds ' + quote(bounds.min) + ' ' + quote(bounds.max));
      }
      if (slider && (slider.min !== defaults.slider.min || slider.max !== defaults.slider.max ||
          slider.step !== defaults.slider.step)) {
        lines.push('  slider ' + [slider.min, slider.max, slider.step].join(' '));
      }
    }
    return lines.join('\n') + '\n';
  }

  function tokenize(line) {
    const pattern = /("(?:[^"\\\x00-\x1f]|\\.)*"|[^\s"]+)(?:\s+|$)/gy;
    const tokens = [];
    while (pattern.lastIndex < line.length) {
      const match = pattern.exec(line);
      if (!match || tokens.length === 4) throw new SyntaxError();
      tokens.push(match[1]);
    }
    return tokens;
  }

  function readString(token) {
    if (!token?.startsWith('"')) throw new SyntaxError();
    return JSON.parse(token);
  }

  function readNumber(token) {
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(token)) throw new SyntaxError();
    const value = Number(token);
    if (!Number.isFinite(value)) throw new SyntaxError();
    return value;
  }

  function readProjectField(project, command, args) {
    if (Object.hasOwn(DISPLAY_SETTINGS, command) && args.length === 1 && ['on', 'off'].includes(args[0])) {
      project.settings[DISPLAY_SETTINGS[command]] = args[0] === 'on';
    } else if (command === 'angle' && args.length === 1 && ['rad', 'deg'].includes(args[0])) {
      project.settings.angleMode = args[0];
    } else if (command === 'view' && args.length === 3) {
      const [x, y, scale] = args.map(readNumber);
      if (scale < 0) throw new SyntaxError();
      project.viewport = { x, y, scale };
    } else {
      throw new SyntaxError();
    }
  }

  function readExpressionField(expression, command, args) {
    if (command === 'latex' && args.length === 1) {
      expression.latex = readString(args[0]);
    } else if (command === 'color' && args.length === 1 && /^#[0-9a-f]{6}$/i.test(args[0])) {
      expression.color = args[0];
    } else if (command === 'name' && args.length === 2 && NAME_KINDS.has(args[0])) {
      expression.nameKind = args[0];
      expression.name = readString(args[1]);
    } else if (command === 'hidden' && args.length === 0) {
      expression.hidden = true;
    } else if (command === 'bounds' && args.length === 2) {
      const [min, max] = args.map(readString);
      expression.bounds = { min, max };
    } else if (command === 'slider' && args.length === 3) {
      const [min, max, step] = args.map(readNumber);
      if (min >= max || step <= 0) throw new SyntaxError();
      expression.slider = { min, max, step };
    } else {
      throw new SyntaxError();
    }
  }

  function decode(text, maxExpressions) {
    const lines = text.split(/\r\n|[\r\n]/);
    const header = lines.findIndex((line) => line.trim());
    if (header < 0 || lines[header].trim() !== HEADER) {
      throw new Error('不支持此 Plotsy 项目格式或版本');
    }

    const project = { settings: {}, expressions: [] };
    let current = null;
    const seen = new Set();
    for (let index = header + 1; index < lines.length; index += 1) {
      const line = lines[index].trim();
      if (!line) continue;
      try {
        const [command, ...args] = tokenize(line);
        if (command === 'expr' && args.length === 1) {
          if (project.expressions.length >= maxExpressions) {
            throw new Error('表达式数量超过上限（' + maxExpressions + ' 条）');
          }
          current = { raw: readString(args[0]) };
          project.expressions.push(current);
          seen.clear();
        } else {
          if (seen.has(command)) throw new SyntaxError();
          if (current) readExpressionField(current, command, args);
          else readProjectField(project, command, args);
          seen.add(command);
        }
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        throw new Error('项目文件第 ' + (index + 1) + ' 行格式不正确。');
      }
    }
    return project;
  }

  Plotsy.projectFile = { extension: EXTENSION, encode, decode };
})(typeof window !== 'undefined' ? window : globalThis);
