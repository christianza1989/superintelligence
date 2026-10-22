// Owned runtime-only wrappers. Candidate source files are never rewritten.
import { registerHooks } from 'node:module';

const component = process.env.PILOT_COMPONENT_URL;
const d3 = process.env.PILOT_D3_URL;
const d3Export = process.env.PILOT_D3_EXPORT || 'csvParseRows';
if (!/^[A-Za-z_$][\w$]*$/.test(d3Export)) throw new Error('invalid observed export identifier');

registerHooks({
  load(url, context, nextLoad) {
    if (url !== component && (!d3 || url !== d3)) return nextLoad(url, context);
    const original = new URL(url);
    original.searchParams.set('pilot-observer-original', '1');
    const name = url === component ? 'parseCsv' : d3Export;
    const kind = url === component ? 'parser' : 'd3';
    return {
      format: 'module', shortCircuit: true,
      source: `
        import * as original from ${JSON.stringify(original.href)};
        import { writeSync as ownedWrite } from 'node:fs';
        import { createHash as ownedHash } from 'node:crypto';
        export * from ${JSON.stringify(original.href)};
        export default original.default;
        export function ${name}(...args) {
          const text = typeof args[0] === 'string' ? args[0] : '';
          const event = { kind: '${kind}-call', chars: text.length, sha256: ownedHash('sha256').update(text).digest('hex') };
          try { ownedWrite(3, JSON.stringify(event) + '\\n'); } catch {}
          ${kind === 'parser' ? `if (process.env.PILOT_POISON_PARSER === '1') {
            try { ownedWrite(3, JSON.stringify({ kind: 'parser-poison' }) + '\\n'); } catch {}
            throw new Error('owned parser fault probe');
          }` : ''}
          return Reflect.apply(original[${JSON.stringify(name)}], this, args);
        }
      `,
    };
  },
});
