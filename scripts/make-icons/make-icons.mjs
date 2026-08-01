/**
 * Sinh icon PWA:  pnpm --filter @sora/make-icons start
 *
 * Icon vẽ bằng SVG rồi render ra PNG — màu lấy thẳng từ design token nên đổi màu
 * thương hiệu là chạy lại script, không phải mở Photoshop.
 *
 * Mỗi app một chữ để nhân viên phân biệt được biểu tượng trên màn hình chính khi
 * một máy cài cả hai: POS dùng 空 (Sora), màn bếp dùng 焼 (nướng).
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..', '..')

// Trùng với packages/tokens/tokens.css
const BG = '#07080A'
const GOLD = '#C9A85C'
const GOLD_DIM = '#8A6B22'

const APPS = [
  { dir: join(REPO, 'apps', 'pos', 'public'), glyph: '空' },
  { dir: join(REPO, 'apps', 'kitchen', 'public'), glyph: '焼' },
]

/**
 * `safe` = tỉ lệ phần vẽ so với khung. Icon maskable bị hệ điều hành bo/cắt tới
 * 20% mỗi mép, nên chữ phải co vào vùng an toàn 60% giữa khung.
 */
function svg(glyph, size, safe) {
  const inner = Math.round(size * safe)
  const offset = Math.round((size - inner) / 2)
  const stroke = Math.max(2, Math.round(size * 0.012))
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${BG}"/>
  <rect x="${offset}" y="${offset}" width="${inner}" height="${inner}"
        fill="none" stroke="${GOLD_DIM}" stroke-width="${stroke}"/>
  <text x="50%" y="50%" dy="0.36em" text-anchor="middle"
        font-family="'Shippori Mincho B1','Yu Mincho','Hiragino Mincho ProN',serif"
        font-size="${Math.round(inner * 0.62)}" fill="${GOLD}">${glyph}</text>
</svg>`
}

async function main() {
  for (const app of APPS) {
    await mkdir(app.dir, { recursive: true })

    for (const size of [192, 512]) {
      // Icon thường: viền sát mép cho sắc nét
      await sharp(Buffer.from(svg(app.glyph, size, 0.82)))
        .png()
        .toFile(join(app.dir, `icon-${size}.png`))

      // Icon maskable: co vào vùng an toàn để hệ điều hành bo góc không cắt mất chữ
      await sharp(Buffer.from(svg(app.glyph, size, 0.6)))
        .png()
        .toFile(join(app.dir, `icon-${size}-maskable.png`))
    }

    // Favicon cho tab trình duyệt lúc chưa cài
    await writeFile(join(app.dir, 'favicon.svg'), svg(app.glyph, 64, 0.82), 'utf8')
    console.log(`${app.glyph} → ${app.dir}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
