import { inflateRawSync } from "node:zlib";

/** Independent bounded ZIP reader for verification; never extracts files to disk. */
export function readZeroZip(input: Uint8Array) {
  const bytes = Buffer.from(input);
  if (bytes.length < 22 || bytes.length > 196608) throw new Error("zip_bounds");
  const end = bytes.length - 22;
  if (
    bytes.readUInt32LE(end) !== 0x06054b50 ||
    bytes.readUInt16LE(end + 20) !== 0 ||
    bytes.readUInt16LE(end + 4) !== 0 ||
    bytes.readUInt16LE(end + 6) !== 0
  )
    throw new Error("zip_directory");
  const count = bytes.readUInt16LE(end + 10);
  const start = bytes.readUInt32LE(end + 16);
  if (
    !count ||
    count > 32 ||
    count !== bytes.readUInt16LE(end + 8) ||
    start + bytes.readUInt32LE(end + 12) !== end
  )
    throw new Error("zip_directory");
  let cursor = start,
    total = 0;
  const files: Record<string, Buffer> = Object.create(null);
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50)
      throw new Error("zip_central_header");
    const flags = bytes.readUInt16LE(cursor + 8),
      method = bytes.readUInt16LE(cursor + 10);
    const crc = bytes.readUInt32LE(cursor + 16),
      compressed = bytes.readUInt32LE(cursor + 20),
      size = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28),
      extra = bytes.readUInt16LE(cursor + 30),
      comment = bytes.readUInt16LE(cursor + 32);
    const local = bytes.readUInt32LE(cursor + 42);
    if (
      flags & ~0x0800 ||
      (method !== 0 && method !== 8) ||
      !nameLength ||
      nameLength > 64 ||
      size > 131072 ||
      cursor + 46 + nameLength + extra + comment > end ||
      local + 30 > start
    )
      throw new Error("zip_entry");
    const nameBytes = bytes.subarray(cursor + 46, cursor + 46 + nameLength);
    const name = new TextDecoder("utf-8", { fatal: true }).decode(nameBytes);
    if (
      !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(name) ||
      name.includes("..") ||
      Object.hasOwn(files, name)
    )
      throw new Error("zip_name");
    if (
      bytes.readUInt32LE(local) !== 0x04034b50 ||
      bytes.readUInt16LE(local + 6) !== flags ||
      bytes.readUInt16LE(local + 8) !== method ||
      bytes.readUInt32LE(local + 14) !== crc ||
      bytes.readUInt32LE(local + 18) !== compressed ||
      bytes.readUInt32LE(local + 22) !== size ||
      bytes.readUInt16LE(local + 26) !== nameLength
    )
      throw new Error("zip_local_header");
    const dataStart = local + 30 + nameLength + bytes.readUInt16LE(local + 28);
    if (
      dataStart + compressed > start ||
      !bytes.subarray(local + 30, local + 30 + nameLength).equals(nameBytes)
    )
      throw new Error("zip_data_bounds");
    const encoded = bytes.subarray(dataStart, dataStart + compressed);
    const decoded =
      method === 0
        ? encoded
        : inflateRawSync(encoded, { maxOutputLength: 131072 });
    total += decoded.length;
    let actualCrc = 0xffffffff;
    for (const byte of decoded) {
      actualCrc ^= byte;
      for (let bit = 0; bit < 8; bit++)
        actualCrc =
          actualCrc & 1 ? (actualCrc >>> 1) ^ 0xedb88320 : actualCrc >>> 1;
    }
    if (
      decoded.length !== size ||
      total > 131072 ||
      (actualCrc ^ 0xffffffff) >>> 0 !== crc
    )
      throw new Error("zip_integrity");
    files[name] = Buffer.from(decoded);
    cursor += 46 + nameLength + extra + comment;
  }
  if (cursor !== end) throw new Error("zip_directory");
  return files;
}
