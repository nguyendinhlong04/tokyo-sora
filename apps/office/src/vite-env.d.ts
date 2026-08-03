/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Gốc của Sora Staff — link cá nhân cấp ở H1 trỏ về đây. Trống thì lấy chính
   * gốc của Office, đủ để thử ở máy dev nhưng không mở đúng app.
   */
  readonly VITE_STAFF_ORIGIN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
