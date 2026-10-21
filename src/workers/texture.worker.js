import { pngDimensions, validateTextureSize, validateXnbHeader } from '../platform/files/textureFiles.js';

self.onmessage = async ({ data: { file } }) => {
  try {
    const buffer = await file.arrayBuffer();
    if (/\.png$/i.test(file.name)) {
      pngDimensions(buffer);
      const bitmap = await createImageBitmap(new Blob([buffer], { type: 'image/png' }));
      self.postMessage({ bitmap }, [bitmap]);
      return;
    }
    validateXnbHeader(buffer);
    // Kept as a separately replaceable module; no library code in the app bundle.
    const { bufferToXnb, Readers, addReaders } = await import(/* @vite-ignore */ `${import.meta.env.BASE_URL}vendor/xnb/xnb.module.js`);
    class BoundedTextureReader extends Readers.Texture2DReader {
      static type() { return 'Texture2D'; }
      read(input) {
        const position = input.bytePosition;
        const format = input.readInt32(), width = input.readUInt32(), height = input.readUInt32();
        const mips = input.readUInt32(), bytes = input.readUInt32();
        validateTextureSize(width, height);
        // Terraria sheets in this first group use uncompressed Color pixels.
        // Reject other payload types before the library allocates/converts them.
        if (format !== 0 || mips !== 1 || bytes !== width * height * 4) throw new Error('暂不支持这张 XNB 贴图格式。');
        input.bytePosition = position;
        return super.read(input);
      }
    }
    addReaders(Object.fromEntries(Object.entries(Readers).filter(([key]) => key !== 'Texture2DReader').map(([key, Reader]) => [key, class extends Reader {
      static type() { return Reader.type(); }
      read() { throw new Error('只接受 Texture2D 资源。'); }
    }])));
    addReaders({ Texture2DReader: BoundedTextureReader });
    const texture = bufferToXnb(buffer).content.export;
    validateTextureSize(texture.width, texture.height);
    const pixels = new Uint8ClampedArray(texture.data);
    if (pixels.byteLength !== texture.width * texture.height * 4) throw new Error('贴图数据长度无效。');
    const bitmap = await createImageBitmap(new ImageData(pixels, texture.width, texture.height));
    self.postMessage({ bitmap }, [bitmap]);
  } catch (error) {
    self.postMessage({ error: error.message || '贴图读取失败。' });
  }
};
