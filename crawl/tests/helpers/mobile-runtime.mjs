import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

export function mobileModule(path, imports) {
  const exports = {};
  const source = readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports, AbortController, setTimeout, clearTimeout, setInterval, clearInterval, console, __DEV__: false, process: { env: {} },
    require: (name) => { if (!(name in imports)) throw new Error(`Unmocked mobile import: ${name}`); return imports[name]; },
  });
  return exports;
}

export function hookRuntime() {
  let position = 0;
  const hooks = [];
  const effects = [];
  const react = {
    useState(initial) {
      const index = position++;
      if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial;
      return [hooks[index], (value) => { hooks[index] = typeof value === 'function' ? value(hooks[index]) : value; }];
    },
    useRef(initial) { const index = position++; return hooks[index] ??= { current: initial }; },
    useCallback(fn, deps) {
      const index = position++;
      const prior = hooks[index];
      if (prior && deps?.every((value, i) => Object.is(value, prior.deps?.[i]))) return prior.value;
      hooks[index] = { deps, value: fn };
      return fn;
    },
    useMemo(fn, deps) {
      const index = position++;
      const prior = hooks[index];
      if (prior && deps?.every((value, i) => Object.is(value, prior.deps?.[i]))) return prior.value;
      const value = fn();
      hooks[index] = { deps, value };
      return value;
    },
    useEffect(fn, deps) {
      const index = position++;
      const prior = hooks[index];
      if (prior && deps?.every((value, index) => Object.is(value, prior.deps?.[index]))) return;
      effects.push(() => { prior?.cleanup?.(); hooks[index] = { deps, cleanup: fn() }; });
    },
  };
  const jsx = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'fragment' };
  return { react, jsx, hooks,
    render(component, props) { position = 0; const tree = component(props); while(effects.length) effects.shift()(); return tree; },
    unmount() { for (const hook of hooks) hook?.cleanup?.(); },
  };
}

export function findElement(tree, testID) {
  if (!tree) return null;
  if (Array.isArray(tree)) return tree.map((node) => findElement(node, testID)).find(Boolean) || null;
  if (tree.props?.testID === testID) return tree;
  return findElement(tree.props?.children, testID);
}
