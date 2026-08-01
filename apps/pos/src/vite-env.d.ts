/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** Gốc của Sora Table — mã QR dán bàn trỏ về đây. Trống thì lấy chính gốc của POS. */
  readonly VITE_TABLE_ORIGIN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
