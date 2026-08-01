/**
 * Trích dữ liệu mẫu từ 5 prototype designs/*.dc.html.
 *
 * Mỗi file có đúng 1 khối `<script type="text/x-dc" data-dc-script data-props="{...}">`
 * chứa `class Component extends DCLogic { state = {...}; D = {...}; ... }` — toàn bộ
 * dữ liệu mẫu là object literal thuần (không computed key, không function value),
 * nên chỉ cần stub DCLogic rồi khởi tạo là đọc được.
 *
 * Đầu ra:
 *   out/raw/<app>.json   — dump nguyên trạng D/OLD/data-props (tham chiếu khi cần)
 *   out/*.json           — dữ liệu đã chuẩn hoá cho seeder GĐ1
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const DESIGNS = join(HERE, '..', '..', 'designs')
const OUT = join(HERE, 'out')

const FILES = {
  web: 'Sora Web.dc.html',
  table: 'Sora Table.dc.html',
  pos: 'Sora POS.dc.html',
  kitchen: 'Sora Kitchen.dc.html',
  office: 'Sora Office.dc.html',
}

// ---------- Trích + khởi tạo logic class ----------

function unescapeHtml(s) {
  return s
    .replaceAll('&quot;', '"')
    .replaceAll('&#34;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
}

function extractScriptBlock(html, name) {
  const m = html.match(/<script[^>]*data-dc-script[^>]*>([\s\S]*?)<\/script>/)
  if (!m) throw new Error(`${name}: không tìm thấy khối data-dc-script`)
  return m[1]
}

function extractProps(html) {
  const tagMatch = html.match(/<script[^>]*data-dc-script[^>]*>/)
  if (!tagMatch) return null
  const tag = tagMatch[0]
  const pm = tag.match(/data-props='([\s\S]*?)'/) ?? tag.match(/data-props="([\s\S]*?)"/)
  if (!pm) return null
  try {
    return JSON.parse(unescapeHtml(pm[1]))
  } catch {
    return { __parseError: pm[1].slice(0, 200) }
  }
}

function instantiate(src, props, name) {
  class DCLogic {
    constructor(p = {}) {
      this.props = p
      this.state = {}
    }
    setState() {}
  }
  const stubWindow = { addEventListener() {}, location: { search: '' } }
  const fn = new Function(
    'DCLogic',
    'props',
    'window',
    'document',
    `${src}\n;return new Component(props);`,
  )
  try {
    return fn(DCLogic, props ?? {}, stubWindow, undefined)
  } catch (err) {
    throw new Error(`${name}: khởi tạo Component thất bại — ${err.message}`)
  }
}

/** Lọc ra các field dữ liệu thuần (bỏ method/hàm), serialize an toàn */
function plainData(obj) {
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'function') continue
    try {
      out[k] = JSON.parse(JSON.stringify(v))
    } catch {
      /* bỏ field không serialize được */
    }
  }
  return out
}

// ---------- Chuẩn hoá ----------

/** '285.000₫' | 285000 → 285000 (integer VND) */
function toVnd(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v)
  if (typeof v === 'string') {
    const digits = v.replace(/[^\d]/g, '')
    if (digits) return Number(digits)
  }
  return null
}

/** So khớp tên không dấu, không hoa thường (KDS ghi 'BA CHỈ BÒ') */
function foldName(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Vài id lệch giữa các file — hợp nhất về id chuẩn (ghi chú trong kế hoạch mục 3.2) */
const ID_ALIASES = { setsora: 'sora', setsumi: 'sumi', setkiwami: 'kiwami' }
const canonicalId = (id) => ID_ALIASES[id] ?? id

/** Tên trên vé KDS viết tắt/lệch so với tên menu — map thẳng về id (đã đối chiếu tay) */
const KITCHEN_NAME_ALIASES = {
  'suon heo miso': 'suonheo', // menu: 'Sườn heo ướp miso'
  'nam dui ga': 'namdui', // menu: 'Nấm đùi gà nướng'
  'banh pho mai': 'phomai', // menu: 'Bánh phô mai Hokkaido'
}

async function main() {
  await mkdir(join(OUT, 'raw'), { recursive: true })

  const apps = {}
  for (const [app, file] of Object.entries(FILES)) {
    const html = await readFile(join(DESIGNS, file), 'utf8')
    const props = extractProps(html)
    const inst = instantiate(extractScriptBlock(html, file), props, file)
    const data = plainData(inst)
    apps[app] = { props, data }
    await writeFile(
      join(OUT, 'raw', `${app}.json`),
      JSON.stringify({ props, data }, null, 2),
      'utf8',
    )
  }

  const summary = {}

  // ----- Món: nền = Table (giá số + cờ), phủ thêm Web (mô tả dài) + Office (mã/giá vốn/trạm) -----
  const tableDishes = apps.table.data.D?.dishes ?? []
  const webDishes = apps.web.data.D?.dishes ?? []
  const officeM1 = apps.office.data.D?.m1 ?? []

  const webById = new Map(webDishes.map((d) => [canonicalId(d.id), d]))
  const officeByName = new Map(officeM1.map((d) => [foldName(d.vi), d]))

  const dishes = tableDishes.map((d) => {
    const id = canonicalId(d.id)
    const web = webById.get(id)
    const office = officeByName.get(foldName(d.vi))
    return {
      id,
      code: office?.code ?? null,
      nameVi: d.vi ?? null,
      nameJa: d.ja ?? null,
      kana: d.k ?? null,
      group: d.g ?? null,
      subGroup: d.s ?? null,
      priceVnd: toVnd(d.pr ?? d.p ?? office?.price),
      promoPriceVnd: toVnd(d.pm),
      costVnd: toVnd(office?.cost),
      station: office?.st ?? null,
      isRaw: d.raw === 1 || d.raw === true,
      // Ba cờ ăn kiêng — nguồn của bộ lọc T5. Chỉ bản thiết kế Table có, và chỉ
      // đánh cho món ĐÚNG là như vậy: không suy từ tên món, "bí ngòi nướng" là
      // chay còn "cơm trộn bò" thì không, đoán sai một món là khách ăn nhầm.
      isVegetarian: d.veg === 1 || d.veg === true,
      isSpicy: d.spicy === 1 || d.spicy === true,
      hasSeafood: d.sea === 1 || d.sea === true,
      isSignature: web?.sig === 1 || web?.sig === true,
      allergens: d.al ?? web?.al ?? null,
      descShort: d.d ?? null,
      descLong: web?.L ?? null,
      active: office ? office.active === 1 || office.active === true : true,
    }
  })

  // Món có trong Web nhưng thiếu ở Table (nếu có) — ghi nhận để không mất dữ liệu
  const tableIds = new Set(dishes.map((d) => d.id))
  const webOnly = webDishes.filter((d) => !tableIds.has(canonicalId(d.id)))

  summary.dishes = dishes.length
  summary.webOnlyDishes = webOnly.length
  summary.dishesWithCost = dishes.filter((d) => d.costVnd != null).length
  summary.dishesWithStation = dishes.filter((d) => d.station).length

  // ----- Nhóm menu + set + modifier -----
  const cats = apps.table.data.D?.cats ?? apps.web.data.D?.groups ?? []
  await writeFile(join(OUT, 'categories.json'), JSON.stringify(cats, null, 2), 'utf8')
  summary.categories = Array.isArray(cats) ? cats.length : Object.keys(cats).length

  const sets = {
    sets: apps.web.data.D?.sets ?? [],
    setDetails: apps.web.data.D?.setDetails ?? null,
  }
  await writeFile(join(OUT, 'sets.json'), JSON.stringify(sets, null, 2), 'utf8')
  summary.sets = Array.isArray(sets.sets) ? sets.sets.length : 0

  const modifiers = {}
  for (const key of Object.keys(apps.table.data.D ?? {})) {
    if (key.startsWith('mod')) modifiers[key] = apps.table.data.D[key]
  }
  await writeFile(join(OUT, 'modifiers.json'), JSON.stringify(modifiers, null, 2), 'utf8')
  summary.modifierGroups = Object.keys(modifiers).length

  // ----- Trạm bếp + map món→trạm (KDS join theo TÊN HOA → đổi về id) -----
  const stations = apps.kitchen.data.D?.stations ?? []
  const stationMenuRaw = apps.kitchen.data.D?.menu ?? {}
  const byFold = new Map(dishes.map((d) => [foldName(d.nameVi), d.id]))
  const unmatchedKitchenNames = []
  const stationMenu = {}
  for (const [st, names] of Object.entries(stationMenuRaw)) {
    stationMenu[st] = (Array.isArray(names) ? names : []).map((n) => {
      const name = typeof n === 'string' ? n : (n?.vi ?? n?.name ?? '')
      const folded = foldName(name)
      const id = byFold.get(folded) ?? KITCHEN_NAME_ALIASES[folded]
      if (!id) unmatchedKitchenNames.push({ station: st, name })
      return { name, dishId: id ?? null }
    })
  }

  // Backfill: món chưa có trạm từ Office → gắn danh sách trạm xuất hiện trong map bếp.
  // Món LINH HOẠT xuất hiện ở cả ST-02 và ST-06 — giữ mảng, seeder GĐ1 tự quyết 2 cột trạm.
  const stationsByDish = new Map()
  for (const [st, items] of Object.entries(stationMenu)) {
    for (const it of items) {
      if (!it.dishId) continue
      if (!stationsByDish.has(it.dishId)) stationsByDish.set(it.dishId, [])
      stationsByDish.get(it.dishId).push(st)
    }
  }
  for (const d of dishes) {
    d.stationsFromKitchen = stationsByDish.get(d.id) ?? []
  }
  await writeFile(join(OUT, 'dishes.json'), JSON.stringify({ dishes, webOnly }, null, 2), 'utf8')
  await writeFile(
    join(OUT, 'stations.json'),
    JSON.stringify({ stations, stationMenu, unmatchedKitchenNames }, null, 2),
    'utf8',
  )
  summary.stations = stations.length
  summary.unmatchedKitchenNames = unmatchedKitchenNames.length

  // ----- Bàn + khu (POS) -----
  const tables = apps.pos.data.D?.tables ?? []
  const tableStates = apps.pos.data.D?.states ?? null
  await writeFile(
    join(OUT, 'tables.json'),
    JSON.stringify({ tables, tableStates }, null, 2),
    'utf8',
  )
  summary.tables = tables.length

  // ----- Chi nhánh (Web) -----
  const branches = apps.web.data.D?.branches ?? []
  await writeFile(join(OUT, 'branches.json'), JSON.stringify(branches, null, 2), 'utf8')
  summary.branches = branches.length

  // ----- Nhân viên + ca (POS) -----
  const staff = {
    staff: apps.pos.data.D?.staff ?? [],
    shifts: apps.pos.data.D?.shifts ?? [],
  }
  await writeFile(join(OUT, 'staff.json'), JSON.stringify(staff, null, 2), 'utf8')
  summary.staff = Array.isArray(staff.staff) ? staff.staff.length : 0

  // ----- Tham số nghiệp vụ từ data-props (hạt giống Trung tâm tham số A6) -----
  const params = Object.fromEntries(Object.entries(apps).map(([k, v]) => [k, v.props]))
  await writeFile(join(OUT, 'params.json'), JSON.stringify(params, null, 2), 'utf8')

  // ----- Fixture đơn online (khối OLD trùng lặp — lấy bản POS) -----
  const old = apps.pos.data.OLD ?? apps.office.data.OLD ?? apps.web.data.OLD ?? null
  if (old) {
    await writeFile(join(OUT, 'online-orders.sample.json'), JSON.stringify(old, null, 2), 'utf8')
  }
  summary.onlineSample = old ? Object.keys(old).length : 0

  // ----- Registry màn hình Office (SPEC/LINK): taxonomy 5 mẫu trang DS/CH/BDK/WZ/CT -----
  const officeScreens = {
    spec: apps.office.data.SPEC ?? null,
    link: apps.office.data.LINK ?? null,
  }
  if (officeScreens.spec || officeScreens.link) {
    await writeFile(
      join(OUT, 'office-screens.json'),
      JSON.stringify(officeScreens, null, 2),
      'utf8',
    )
    summary.officeScreenSpecs = officeScreens.spec ? Object.keys(officeScreens.spec).length : 0
  }

  // ----- Danh mục field lạ để rà tay -----
  summary.dataKeysPerApp = Object.fromEntries(
    Object.entries(apps).map(([k, v]) => [k, Object.keys(v.data)]),
  )

  await writeFile(join(OUT, 'SUMMARY.json'), JSON.stringify(summary, null, 2), 'utf8')
  console.log(JSON.stringify(summary, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
