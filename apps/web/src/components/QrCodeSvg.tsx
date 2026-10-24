import React, { useMemo } from 'react';

interface QrCodeSvgProps {
  value: string;
  size?: number;
  fgColor?: string;
  bgColor?: string;
}

/**
 * Zero-dependency pure TypeScript QR Code generator (Model 2, Byte mode, EC-M).
 * Supports URLs and strings up to 60+ characters. Renders an inline crisp SVG.
 */
export const QrCodeSvg: React.FC<QrCodeSvgProps> = ({
  value,
  size = 180,
  fgColor = '#22d3ee',
  bgColor = '#05050f',
}) => {
  const matrix = useMemo(() => generateQrMatrix(value), [value]);

  if (!matrix || matrix.length === 0) {
    return <div style={{ width: size, height: size, background: bgColor }} />;
  }

  const moduleCount = matrix.length;
  const cellSize = size / moduleCount;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ display: 'block', borderRadius: 6, background: bgColor }}
    >
      <rect width={size} height={size} fill={bgColor} />
      {matrix.map((row, r) =>
        row.map((cell, c) =>
          cell ? (
            <rect
              key={`${r}-${c}`}
              x={c * cellSize}
              y={r * cellSize}
              width={cellSize + 0.3}
              height={cellSize + 0.3}
              fill={fgColor}
            />
          ) : null,
        ),
      )}
    </svg>
  );
};

// ── Minimal QR Code Generator Engine (Versions 1-4, Byte Mode, EC Level M) ─

// GF(256) tables
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_EXP[i + 255] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 256) x ^= 0x11d;
  }
})();

function gfMul(x: number, y: number): number {
  if (x === 0 || y === 0) return 0;
  return GF_EXP[GF_LOG[x]! + GF_LOG[y]!]!;
}

function reedSolomonCompute(data: number[], ecCount: number): number[] {
  let gen = [1];
  for (let i = 0; i < ecCount; i++) {
    const next = new Array(gen.length + 1).fill(0);
    for (let j = 0; j < gen.length; j++) {
      next[j] ^= gfMul(gen[j]!, GF_EXP[i]!);
      next[j + 1] ^= gen[j]!;
    }
    gen = next;
  }

  const res = new Array(ecCount).fill(0);
  for (const byte of data) {
    const factor = byte ^ res[0]!;
    res.shift();
    res.push(0);
    for (let j = 0; j < ecCount; j++) {
      res[j] ^= gfMul(gen[j + 1]!, factor);
    }
  }
  return res;
}

// Version table configs for EC Level M
interface VersionInfo {
  version: number;
  size: number;
  dataCapacity: number;
  ecCount: number;
  alignPos?: number;
}

const VERSIONS: VersionInfo[] = [
  { version: 1, size: 21, dataCapacity: 14, ecCount: 10 },
  { version: 2, size: 25, dataCapacity: 26, ecCount: 16, alignPos: 18 },
  { version: 3, size: 29, dataCapacity: 42, ecCount: 26, alignPos: 22 },
  { version: 4, size: 33, dataCapacity: 62, ecCount: 36, alignPos: 26 },
];

function generateQrMatrix(text: string): boolean[][] {
  const encoder = new TextEncoder();
  const bytes = Array.from(encoder.encode(text));

  // Pick smallest version that fits bytes + 4-bit mode + 8-bit length
  const neededDataBytes = bytes.length + 2; // ~2 bytes header
  const v = VERSIONS.find((info) => info.dataCapacity >= neededDataBytes) ?? VERSIONS[3]!;

  // Encode data bitstream
  const bits: number[] = [];
  function pushBits(val: number, length: number) {
    for (let i = length - 1; i >= 0; i--) {
      bits.push((val >>> i) & 1);
    }
  }

  // Byte mode indicator: 0100
  pushBits(0b0100, 4);
  // Character count indicator (8 bits for V1-V9 in byte mode)
  pushBits(bytes.length, 8);
  for (const b of bytes) pushBits(b, 8);

  // Terminator (up to 4 zeroes)
  const capacityBits = v.dataCapacity * 8;
  const padZeros = Math.min(4, capacityBits - bits.length);
  for (let i = 0; i < padZeros; i++) bits.push(0);
  // Pad to byte boundary
  while (bits.length % 8 !== 0) bits.push(0);

  // Pad bytes 0xEC, 0x11
  const padBytes = [0xec, 0x11];
  let pIdx = 0;
  while (bits.length < capacityBits) {
    pushBits(padBytes[pIdx % 2]!, 8);
    pIdx++;
  }

  // Convert bits to data codewords
  const dataCodewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) {
      byte = (byte << 1) | bits[i + j]!;
    }
    dataCodewords.push(byte);
  }

  // Compute Reed-Solomon EC codewords
  const ecCodewords = reedSolomonCompute(dataCodewords, v.ecCount);
  const allCodewords = [...dataCodewords, ...ecCodewords];

  // Initialize matrix and reserved functional module tracker
  const N = v.size;
  const matrix: boolean[][] = Array.from({ length: N }, () => Array(N).fill(false));
  const isFunction: boolean[][] = Array.from({ length: N }, () => Array(N).fill(false));

  function setModule(r: number, c: number, val: boolean, isFunc = true) {
    if (r >= 0 && r < N && c >= 0 && c < N) {
      matrix[r]![c] = val;
      if (isFunc) isFunction[r]![c] = true;
    }
  }

  // 1. Finder patterns (7x7) + separators at (0,0), (0, N-7), (N-7, 0)
  const drawFinder = (top: number, left: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const row = top + r;
        const col = left + c;
        if (row < 0 || row >= N || col < 0 || col >= N) continue;
        const inFinder = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        if (!inFinder) {
          setModule(row, col, false);
          continue;
        }
        const isBlack =
          r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4);
        setModule(row, col, isBlack);
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, N - 7);
  drawFinder(N - 7, 0);

  // 2. Alignment pattern for Version >= 2
  if (v.alignPos) {
    const pos = v.alignPos;
    for (let r = -2; r <= 2; r++) {
      for (let c = -2; c <= 2; c++) {
        const isBlack = Math.max(Math.abs(r), Math.abs(c)) !== 1;
        setModule(pos + r, pos + c, isBlack);
      }
    }
  }

  // 3. Timing patterns
  for (let i = 8; i < N - 8; i++) {
    setModule(6, i, i % 2 === 0);
    setModule(i, 6, i % 2 === 0);
  }

  // Dark module
  setModule(N - 8, 8, true);

  // 4. Reserve format information areas
  for (let i = 0; i < 9; i++) {
    if (i !== 6) {
      isFunction[8]![i] = true;
      isFunction[i]![8] = true;
    }
  }
  for (let i = 0; i < 8; i++) {
    isFunction[8]![N - 1 - i] = true;
    isFunction[N - 1 - i]![8] = true;
  }

  // 5. Place data and error correction codewords in zigzag
  const allBits: number[] = [];
  for (const byte of allCodewords) {
    for (let i = 7; i >= 0; i--) {
      allBits.push((byte >>> i) & 1);
    }
  }

  let bitIdx = 0;
  let upwards = true;
  for (let right = N - 1; right > 0; right -= 2) {
    if (right === 6) right--; // skip vertical timing column
    const rows = upwards
      ? Array.from({ length: N }, (_, i) => N - 1 - i)
      : Array.from({ length: N }, (_, i) => i);

    for (const r of rows) {
      for (const c of [right, right - 1]) {
        if (!isFunction[r]![c]) {
          const bit = bitIdx < allBits.length ? allBits[bitIdx]! : 0;
          matrix[r]![c] = bit === 1;
          bitIdx++;
        }
      }
    }
    upwards = !upwards;
  }

  // 6. Apply Mask Pattern 0: (row + col) % 2 === 0
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (!isFunction[r]![c] && (r + c) % 2 === 0) {
        matrix[r]![c] = !matrix[r]![c];
      }
    }
  }

  // 7. Write Format Information (EC-M: 00, Mask 0: 000 -> 101010000010010)
  // Precomputed 15-bit BCH code for EC-M (00) + Mask 0 (000) ^ 0x5412 = 0x5412 ^ 0x0000 = 0x5412
  // Format bit string for EC-M / Mask 0: 101010000010010 (binary)
  const formatBits = [1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0];

  // Top-left format bits
  setModule(8, 0, formatBits[0] === 1);
  setModule(8, 1, formatBits[1] === 1);
  setModule(8, 2, formatBits[2] === 1);
  setModule(8, 3, formatBits[3] === 1);
  setModule(8, 4, formatBits[4] === 1);
  setModule(8, 5, formatBits[5] === 1);
  setModule(8, 7, formatBits[6] === 1);
  setModule(8, 8, formatBits[7] === 1);
  setModule(7, 8, formatBits[8] === 1);
  setModule(5, 8, formatBits[9] === 1);
  setModule(4, 8, formatBits[10] === 1);
  setModule(3, 8, formatBits[11] === 1);
  setModule(2, 8, formatBits[12] === 1);
  setModule(1, 8, formatBits[13] === 1);
  setModule(0, 8, formatBits[14] === 1);

  // Bottom-left and top-right format bits
  for (let i = 0; i < 7; i++) {
    setModule(N - 1 - i, 8, formatBits[i] === 1);
  }
  for (let i = 0; i < 8; i++) {
    setModule(8, N - 8 + i, formatBits[7 + i] === 1);
  }

  return matrix;
}
