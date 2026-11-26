import { inflateRawSync } from 'node:zlib';

/**
 * Extracts the first subtitle file (.vtt or .srt) from a PKZIP buffer.
 * Supports both STORED (0) and DEFLATE (8) compression using central directory or local headers.
 */
export function extractSubtitleFromZip(buf: Buffer): string | null {
  // Prefer Central Directory end signature (EOCD) for reliable sizes when data descriptors (bit 3) are used
  const eocdSig = 0x06054b50;
  let eocdOffset = -1;
  for (let i = Math.max(0, buf.length - 65557); i <= buf.length - 22; i++) {
    if (buf.readUInt32LE(i) === eocdSig) {
      eocdOffset = i;
    }
  }

  const candidates: Array<{ name: string; content: string }> = [];

  if (eocdOffset >= 0) {
    const cdSize = buf.readUInt32LE(eocdOffset + 12);
    const cdOffset = buf.readUInt32LE(eocdOffset + 16);
    let pos = cdOffset;
    const cdEnd = Math.min(buf.length, cdOffset + cdSize);

    while (pos + 46 <= cdEnd && buf.readUInt32LE(pos) === 0x02014b50) {
      const method = buf.readUInt16LE(pos + 10);
      const compSize = buf.readUInt32LE(pos + 20);
      const nameLen = buf.readUInt16LE(pos + 28);
      const extraLen = buf.readUInt16LE(pos + 30);
      const commentLen = buf.readUInt16LE(pos + 32);
      const localOffset = buf.readUInt32LE(pos + 42);
      const fileName = buf.subarray(pos + 46, pos + 46 + nameLen).toString('utf8');
      pos += 46 + nameLen + extraLen + commentLen;

      if (!/\.(srt|vtt)$/i.test(fileName)) continue;
      if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== 0x04034b50) continue;

      const lNameLen = buf.readUInt16LE(localOffset + 26);
      const lExtraLen = buf.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + lNameLen + lExtraLen;
      const dataEnd = Math.min(buf.length, dataStart + compSize);
      const rawData = buf.subarray(dataStart, dataEnd);

      try {
        const out = method === 0 ? rawData : method === 8 ? inflateRawSync(rawData) : null;
        if (out) {
          candidates.push({ name: fileName, content: out.toString('utf8') });
        }
      } catch (_) {}
    }
  }

  if (candidates.length === 0) return null;
  const vttOrId = candidates.find((c) => /\.vtt$/i.test(c.name) || /\b(ind|id|indonesia)\b/i.test(c.name));
  return (vttOrId ?? candidates[0]).content;
}
