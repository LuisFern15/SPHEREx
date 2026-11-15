export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function decodeBase64Float32LE(b64: string, expectedLength: number): Float32Array {
  const bytes = base64ToBytes(b64);
  const expectedBytes = expectedLength * 4;
  if (bytes.byteLength < expectedBytes) {
    throw new Error(
      `Datos binarios truncados (esperados ${expectedBytes} bytes, recibidos ${bytes.byteLength}). / Truncated binary payload (expected ${expectedBytes} bytes, got ${bytes.byteLength}).`
    );
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Float32Array(expectedLength);
  for (let i = 0; i < expectedLength; i++) {
    out[i] = view.getFloat32(i * 4, true);
  }
  return out;
}

export function decodeBase64Uint32LE(b64: string, expectedLength: number): Uint32Array {
  const bytes = base64ToBytes(b64);
  const expectedBytes = expectedLength * 4;
  if (bytes.byteLength < expectedBytes) {
    throw new Error(
      `Máscara de banderas truncada (esperados ${expectedBytes} bytes, recibidos ${bytes.byteLength}). / Truncated flag mask payload (expected ${expectedBytes} bytes, got ${bytes.byteLength}).`
    );
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Uint32Array(expectedLength);
  for (let i = 0; i < expectedLength; i++) {
    out[i] = view.getUint32(i * 4, true);
  }
  return out;
}

export function encodeFloat32LEBase64(arr: Float32Array): string {
  const bytes = new Uint8Array(arr.length * 4);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < arr.length; i++) {
    view.setFloat32(i * 4, arr[i], true);
  }
  return bytesToBase64(bytes);
}

export function encodeUint32LEBase64(arr: Uint32Array): string {
  const bytes = new Uint8Array(arr.length * 4);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < arr.length; i++) {
    view.setUint32(i * 4, arr[i], true);
  }
  return bytesToBase64(bytes);
}
