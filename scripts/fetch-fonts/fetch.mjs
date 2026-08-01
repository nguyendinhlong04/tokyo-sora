/**
 * Tự host font — chạy 1 lần (và khi đổi danh sách):
 *
 * 1. Be Vietnam Pro / Cormorant Garamond / IBM Plex Mono: lấy woff2 subset
 *    latin + vietnamese CHÍNH CHỦ từ Google Fonts CSS API (kèm unicode-range
 *    của Google) → không cần tự subset, chất lượng dấu tiếng Việt đã được
 *    Google kiểm định.
 * 2. Shippori Mincho B1: tải TTF gốc (repo google/fonts) rồi micro-subset
 *    bằng subset-font (harfbuzz wasm) về đúng bộ kanji trang trí §11.3
 *    + katakana (kana đầu tên món trên đĩa ảnh) → vài KB.
 * 3. Sinh packages/tokens/fonts.css với @font-face + unicode-range.
 *
 * LƯU Ý: bộ kanji phải được người biết tiếng Nhật duyệt trước khi dùng in ấn
 * (quy tắc §11.3) — danh sách để ở KANJI bên dưới, sửa xong chạy lại script.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import subsetFont from 'subset-font'

const HERE = dirname(fileURLToPath(import.meta.url))
const FONT_DIR = join(HERE, '..', '..', 'packages', 'tokens', 'fonts')
const CSS_OUT = join(HERE, '..', '..', 'packages', 'tokens', 'fonts.css')

// UA Chrome để Google trả woff2 + unicode-range
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

const GOOGLE_FAMILIES = [
  {
    family: 'Be Vietnam Pro',
    axis: 'wght@400;500;600;700',
    subsets: ['latin', 'vietnamese'],
    slug: 'be-vietnam-pro',
  },
  {
    family: 'Cormorant Garamond',
    axis: 'wght@300;600',
    subsets: ['latin', 'vietnamese'],
    slug: 'cormorant-garamond',
  },
  {
    family: 'IBM Plex Mono',
    axis: 'wght@400;500',
    subsets: ['latin', 'vietnamese'],
    slug: 'ibm-plex-mono',
  },
]

/** §11.3 — bảng kanji chuẩn (23 chữ) — CẦN NGƯỜI BIẾT TIẾNG NHẬT DUYỆT */
const KANJI = '東京空炭火焼膳鮮揚鍋汁甘麦酒茶牛豚海野生御美味'
/** Katakana đầy đủ + chấm giữa + trường âm (kana đầu tên món, tên JA ngắn) */
const KATAKANA = Array.from({ length: 0x30ff - 0x30a0 + 1 }, (_, i) =>
  String.fromCodePoint(0x30a0 + i),
).join('')
const SHIPPORI_TEXT = KANJI + KATAKANA + '々〆〤 '

const SHIPPORI_SOURCES = [
  {
    weight: 400,
    url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/shipporiminchob1/ShipporiMinchoB1-Regular.ttf',
  },
  {
    weight: 600,
    url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/shipporiminchob1/ShipporiMinchoB1-SemiBold.ttf',
  },
]

async function fetchBuffer(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA } })
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`)
  return Buffer.from(await res.arrayBuffer())
}

async function googleFamily({ family, axis, subsets, slug }) {
  const cssUrl = `https://fonts.googleapis.com/css2?family=${family.replaceAll(' ', '+')}:${axis}&display=swap`
  const css = await (await fetch(cssUrl, { headers: { 'user-agent': UA } })).text()

  // Từng khối: /* subset */ @font-face { ... }
  const blocks = [...css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*\{([^}]+)\}/g)]
  const faces = []
  for (const [, subset, body] of blocks) {
    if (!subsets.includes(subset)) continue
    const weight = body.match(/font-weight:\s*(\d+)/)?.[1]
    const url = body.match(/src:\s*url\((\S+?\.woff2)\)/)?.[1]
    const range = body.match(/unicode-range:\s*([^;]+);/)?.[1]?.trim()
    if (!weight || !url || !range) continue
    const file = `${slug}-${weight}-${subset}.woff2`
    await writeFile(join(FONT_DIR, file), await fetchBuffer(url))
    faces.push({ family, weight: Number(weight), file, range })
  }
  if (!faces.length) throw new Error(`${family}: không parse được css2 (${cssUrl})`)
  return faces
}

async function shippori() {
  const faces = []
  for (const { weight, url } of SHIPPORI_SOURCES) {
    const ttf = await fetchBuffer(url)
    const woff2 = await subsetFont(ttf, SHIPPORI_TEXT, { targetFormat: 'woff2' })
    const file = `shippori-mincho-b1-${weight}-micro.woff2`
    await writeFile(join(FONT_DIR, file), woff2)
    faces.push({
      family: 'Shippori Mincho B1',
      weight,
      file,
      // katakana + dấu lặp + khoảng ideographic + 23 kanji cụ thể
      range:
        'U+30A0-30FF, U+3005, U+3006, U+3000, ' +
        [...new Set(KANJI)].map((c) => `U+${c.codePointAt(0).toString(16).toUpperCase()}`).join(', '),
    })
  }
  return faces
}

function cssFor(faces) {
  const lines = [
    '/* SINH TỰ ĐỘNG bởi scripts/fetch-fonts — đừng sửa tay, sửa fetch.mjs rồi chạy lại.',
    '   Subset latin+vietnamese lấy nguyên bản từ Google Fonts; Shippori micro-subset',
    `   ${[...new Set(KANJI)].length} kanji §11.3 + katakana. font-display: swap chống CLS. */`,
    '',
  ]
  for (const f of faces) {
    lines.push(
      '@font-face {',
      `  font-family: '${f.family}';`,
      '  font-style: normal;',
      `  font-weight: ${f.weight};`,
      '  font-display: swap;',
      `  src: url('./fonts/${f.file}') format('woff2');`,
      `  unicode-range: ${f.range};`,
      '}',
      '',
    )
  }
  return lines.join('\n')
}

async function main() {
  await mkdir(FONT_DIR, { recursive: true })
  const all = []
  for (const fam of GOOGLE_FAMILIES) all.push(...(await googleFamily(fam)))
  all.push(...(await shippori()))
  await writeFile(CSS_OUT, cssFor(all), 'utf8')

  const { stat } = await import('node:fs/promises')
  let total = 0
  for (const f of all) {
    const s = await stat(join(FONT_DIR, f.file))
    total += s.size
    console.log(`${f.file.padEnd(46)} ${(s.size / 1024).toFixed(1)} KB`)
  }
  console.log(`— ${all.length} file, tổng ${(total / 1024).toFixed(0)} KB`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
