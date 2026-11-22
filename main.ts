// Tiny stack VM (make.fun tiny-stack-vm-01). Runs every program in
// <input>/<id>/ (program.bin + input.bin), writes <output>/<id>/stdout.bin
// and <output>/<id>/exit.txt. Usage: node main.ts [input-dir] [output-dir]
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
const A = process.argv[2] || "/input", B = process.argv[3] || "/output";
// Opcode table, groups of [byte, immediate bytes, pops, pushes].
const T = [0,0,0,0, 1,1,0,1, 2,4,0,1, 3,0,1,0, 4,0,1,2, 5,0,2,2, 6,0,2,3, 7,0,3,3, 16,0,2,1, 17,0,2,1, 18,0,2,1, 19,0,2,1, 20,0,2,1, 21,0,2,1, 22,0,2,1, 23,0,1,1, 24,0,2,1, 25,0,2,1, 26,0,2,1, 27,0,1,1, 28,0,2,1, 29,0,2,1, 30,0,2,1, 32,0,2,1, 33,0,2,1, 34,0,2,1, 48,2,0,0, 49,2,1,0, 50,2,1,0, 51,2,0,0, 52,0,0,0, 64,0,1,1, 65,0,2,0, 80,0,1,0, 81,0,1,0, 82,0,0,1, 83,0,1,0];
const I = new Int8Array(256).fill(-1), O = new Int8Array(256), H = new Int8Array(256);
for (let k = 0; k < T.length; k += 4) { I[T[k]] = T[k + 1]; O[T[k]] = T[k + 2]; H[T[k]] = T[k + 3]; }

// Runs one program; returns [bytes written, exit code]. A trap ends the run
// at once with the trap's code, keeping the output written before it.
function run(p, q) {
  const n = p.length, s = new Int32Array(256);
  let d = 0;
  const c = new Int32Array(64);
  let g = 0;
  const m = new Int32Array(256), o = new Uint8Array(65536);
  let l = 0, j = 0, t = 0, u = 0, e = 0;
  top: for (;;) {
    if (u >= 1000000) { e = 10; break; } // step limit
    if (t < 0 || t >= n) { e = 9; break; } // pc outside the program
    const v = p[t], w = I[v];
    if (w < 0) { e = 5; break; } // unknown opcode
    if (t + w >= n) { e = 9; break; } // immediate cut off by the end
    u++;
    const x = t + 1 + w; // address of the next instruction
    if (d < O[v]) { e = 2; break; } // stack underflow
    if (d - O[v] + H[v] > 256) { e = 3; break; } // stack overflow
    t = x;
    switch (v) {
      case 0: e = 0; break top; // HALT
      case 1: s[d++] = (p[x - 1] << 24) >> 24; break; // PUSH8, sign-extended
      case 2: s[d++] = p[x - 4] | (p[x - 3] << 8) | (p[x - 2] << 16) | (p[x - 1] << 24); break; // PUSH32
      case 3: d--; break; // POP
      case 4: s[d] = s[d - 1]; d++; break; // DUP
      case 5: { const a = s[d - 1]; s[d - 1] = s[d - 2]; s[d - 2] = a; break; } // SWAP
      case 6: s[d] = s[d - 2]; d++; break; // OVER
      case 7: { const a = s[d - 3]; s[d - 3] = s[d - 2]; s[d - 2] = s[d - 1]; s[d - 1] = a; break; } // ROT
      case 23: s[d - 1] = -s[d - 1] | 0; break; // NEG, wraps
      case 27: s[d - 1] = ~s[d - 1]; break; // NOT
      case 48: t = x + (((p[x - 2] | (p[x - 1] << 8)) << 16) >> 16); break; // JMP
      case 49: case 50: { // JZ / JNZ, signed 16-bit relative offset
        const r = ((p[x - 2] | (p[x - 1] << 8)) << 16) >> 16, a = s[--d];
        if ((v === 49) === (a === 0)) t = x + r;
        break;
      }
      case 51: // CALL, unsigned 16-bit target
        if (g === 64) { e = 7; break top; }
        c[g++] = x; t = p[x - 2] | (p[x - 1] << 8); break;
      case 52: // RET
        if (g === 0) { e = 8; break top; }
        t = c[--g]; break;
      case 64: { // LOAD
        const a = s[d - 1];
        if (a < 0 || a > 255) { e = 6; break top; }
        s[d - 1] = m[a]; break;
      }
      case 65: { // STORE (v addr -- ), addr is the top
        const a = s[d - 1];
        if (a < 0 || a > 255) { e = 6; break top; }
        d -= 2; m[a] = s[d]; break;
      }
      case 80: { // PRINT, decimal ASCII, no newline
        const y = "" + s[d - 1];
        if (l + y.length > 65536) { e = 11; break top; }
        for (let k = 0; k < y.length; k++) o[l++] = y.charCodeAt(k);
        d--; break;
      }
      case 81: // PUTC, low byte
        if (l + 1 > 65536) { e = 11; break top; }
        o[l++] = s[--d] & 255; break;
      case 82: s[d++] = j < q.length ? q[j++] : -1; break; // IN, -1 past the end
      case 83: e = s[--d] & 255; break top; // EXIT, low byte
      default: { // two-operand arithmetic / logic / compare
        const b = s[d - 1], a = s[d - 2];
        let r;
        if (v > 18 && v < 23 && b === 0) { e = 4; break top; } // division by zero
        if (v === 16) r = a + b | 0;
        else if (v === 17) r = a - b | 0;
        else if (v === 18) r = Math.imul(a, b);
        else if (v === 19) r = a === -2147483648 && b === -1 ? a : (a / b) | 0;
        else if (v === 20) r = b === -1 ? 0 : (a % b) | 0;
        else if (v === 21) r = Math.floor((a >>> 0) / (b >>> 0)) | 0;
        else if (v === 22) r = ((a >>> 0) % (b >>> 0)) | 0;
        else if (v === 24) r = a & b;
        else if (v === 25) r = a | b;
        else if (v === 26) r = a ^ b;
        else if (v === 28) r = a << (b & 31);
        else if (v === 29) r = a >> (b & 31);
        else if (v === 30) r = (a >>> (b & 31)) | 0;
        else if (v === 32) r = a === b ? 1 : 0;
        else if (v === 33) r = a < b ? 1 : 0;
        else r = (a >>> 0) < (b >>> 0) ? 1 : 0; // LTU
        d -= 2; s[d++] = r; break;
      }
    }
  }
  return [o.subarray(0, l), e];
}

for (const id of readdirSync(A, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
  const p = readFileSync(`${A}/${id}/program.bin`);
  let q;
  try { q = readFileSync(`${A}/${id}/input.bin`); } catch { q = Buffer.alloc(0); }
  const [o, e] = run(p, q), D = `${B}/${id}`;
  mkdirSync(D, { recursive: true });
  writeFileSync(`${D}/stdout.bin`, o);
  writeFileSync(`${D}/exit.txt`, e + "\n");
}
