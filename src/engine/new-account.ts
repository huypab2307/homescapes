/** Experimental recovery trigger: preserve JSON tokens, pretty print, remove root close. */
import { decodeSave, encodeSave } from './codec.ts';
export const NEW_ACCOUNT_CONFIRMATION = 'FORMAT_REMOVE_FINAL_BRACE';
const LIMIT = 64 * 1024 * 1024;
export function formatWithoutRootBrace(input: Uint8Array): Uint8Array {
  let source = new TextDecoder('utf-8', { fatal: true }).decode(input).replace(/[\x00\s]+$/, '');
  let root: unknown;
  try { root = JSON.parse(source); }
  catch {
    // Accept only the exact one-brace-short case seen in the user's second sample.
    source += '}';
    root = JSON.parse(source);
  }
  if (!root || typeof root !== 'object' || Array.isArray(root)) throw Error('Expected a save JSON object');
  const tokens = source.match(/"(?:\\.|[^"\\])*"|[{}\[\],:]|[^\s{}\[\],:]+/g);
  if (!tokens?.length) throw Error('Empty save');
  const output: string[] = []; let depth = 0; let length = 0;
  const add = (text: string) => { length += text.length; if (length > LIMIT) throw Error('Formatted save exceeds 64 MB'); output.push(text); };
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!; const previous = tokens[i - 1]; const next = tokens[i + 1];
    if (token === '{' || token === '[') {
      add(token); depth++; if (depth > 128) throw Error('Save nesting is too deep');
      if (next !== '}' && next !== ']') add('\r\n' + '    '.repeat(depth));
    } else if (token === '}' || token === ']') {
      depth--; if (depth < 0) throw Error('Invalid save nesting');
      if (previous !== '{' && previous !== '[') add('\r\n' + '    '.repeat(depth));
      add(token);
    } else if (token === ',') add(',\r\n' + '    '.repeat(depth));
    else if (token === ':') add(': ');
    else add(token);
  }
  const formatted = output.join('');
  if (depth !== 0 || !formatted.endsWith('}')) throw Error('Save root is incomplete');
  // Validate the formatted object before deliberately removing one root brace.
  JSON.parse(formatted);
  const result = new TextEncoder().encode(formatted.slice(0, -1) + '\r\n');
  if (result.byteLength > LIMIT) throw Error('Formatted save exceeds 64 MB');
  return result;
}
export function prepareNewAccount(container: Uint8Array) {
  const codec = decodeSave(container);
  const plain = formatWithoutRootBrace(codec.bytes);
  const bytes = encodeSave(plain, codec);
  if (bytes.byteLength > LIMIT) throw Error('Save output exceeds 64 MB');
  return { bytes, wasEncrypted: codec.wasEncrypted, method: NEW_ACCOUNT_CONFIRMATION };
}
