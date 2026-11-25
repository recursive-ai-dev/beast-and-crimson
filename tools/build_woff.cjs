#!/usr/bin/env node
/**
 * Convert bundled TTF fonts in assets/fonts/ to W3C WOFF 1.0 using built-in node:zlib.
 * Zero external dependencies; validated by Chromium's OpenType Sanitizer in browser tests.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const FONTS_DIR = path.resolve(__dirname, "..", "assets", "fonts");
const pad4 = (n) => (n + 3) & ~3;

function ttfToWoff(ttf) {
  const flavor = ttf.readUInt32BE(0);
  const numTables = ttf.readUInt16BE(4);
  const tables = [];
  for (let i = 0; i < numTables; i++) {
    const pos = 12 + i * 16;
    const tag = ttf.readUInt32BE(pos);
    const checkSum = ttf.readUInt32BE(pos + 4);
    const origOffset = ttf.readUInt32BE(pos + 8);
    const origLength = ttf.readUInt32BE(pos + 12);
    const raw = ttf.subarray(origOffset, origOffset + origLength);
    const deflated = zlib.deflateSync(raw, { level: 9 });
    // WOFF 1.0 spec §4: compressed data is used strictly when smaller than uncompressed.
    const payload = deflated.length < origLength ? deflated : raw;
    tables.push({ tag, checkSum, origLength, compLength: payload.length, payload });
  }
  tables.sort((a, b) => a.tag - b.tag);

  let totalSfntSize = 12 + 16 * numTables;
  let dataOffset = 44 + 20 * numTables;
  for (const t of tables) {
    totalSfntSize += pad4(t.origLength);
    t.woffOffset = dataOffset;
    dataOffset += pad4(t.compLength);
  }

  const out = Buffer.alloc(dataOffset, 0);
  out.writeUInt32BE(0x774F4646, 0);   // 'wOFF'
  out.writeUInt32BE(flavor, 4);
  out.writeUInt32BE(dataOffset, 8);
  out.writeUInt16BE(numTables, 12);
  out.writeUInt16BE(0, 14);
  out.writeUInt32BE(totalSfntSize, 16);
  out.writeUInt16BE(1, 20);
  out.writeUInt16BE(0, 22);

  tables.forEach((t, i) => {
    const dirPos = 44 + i * 20;
    out.writeUInt32BE(t.tag, dirPos);
    out.writeUInt32BE(t.woffOffset, dirPos + 4);
    out.writeUInt32BE(t.compLength, dirPos + 8);
    out.writeUInt32BE(t.origLength, dirPos + 12);
    out.writeUInt32BE(t.checkSum, dirPos + 16);
    t.payload.copy(out, t.woffOffset);
  });
  return out;
}

let beforeTotal = 0, afterTotal = 0;
for (const file of fs.readdirSync(FONTS_DIR).filter(f => f.endsWith(".ttf")).sort()) {
  const srcPath = path.join(FONTS_DIR, file);
  const dstPath = path.join(FONTS_DIR, file.replace(/\.ttf$/, ".woff"));
  const ttf = fs.readFileSync(srcPath);
  const woff = ttfToWoff(ttf);
  fs.writeFileSync(dstPath, woff);
  beforeTotal += ttf.length;
  afterTotal += woff.length;
  const pct = ((1 - woff.length / ttf.length) * 100).toFixed(1);
  console.log(`  ${file.padEnd(32)} ${(ttf.length / 1024).toFixed(0).padStart(4)}KB -> ${(woff.length / 1024).toFixed(0).padStart(4)}KB (-${pct}%)`);
}
console.log(`[OK] Built WOFF fonts: ${(beforeTotal / 1024).toFixed(0)}KB -> ${(afterTotal / 1024).toFixed(0)}KB (-${((1 - afterTotal / beforeTotal) * 100).toFixed(1)}%)`);
