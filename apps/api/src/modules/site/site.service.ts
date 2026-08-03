import { Inject, Injectable } from '@nestjs/common'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { DB } from '../../common/db.module'
import type { Db } from '../../db/client'
import {
  areas,
  branches,
  categories,
  dishStories,
  dishes,
  setGroupItems,
  setGroups,
  siteJobs,
  sitePosts,
  tables,
} from '../../db/schema'

/**
 * Nội dung website thương hiệu (W1–W9).
 *
 * Website là NGƯỜI ĐỌC của trung tâm sản phẩm, không có bảng món riêng (§18.1):
 * sửa giá ở Office là thực đơn web đổi theo, không có bước đồng bộ tay.
 *
 * Khác `/api/online/menu` ở chỗ: bên kia chỉ món bán online của MỘT chi nhánh để
 * dựng giỏ hàng; bên này là toàn bộ thực đơn cấp chuỗi để đọc và để Google đọc.
 * Cũng khác `/api/config` — bundle đó mang sơ đồ bàn, trạm bếp và tham số vận
 * hành, không việc gì phải phát ra web.
 */
@Injectable()
export class SiteService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * Chi nhánh cho W5 · W9 · chân trang · bước 1 của W6.
   *
   * "Sửa một chỗ mọi nơi đổi" (§A10): địa chỉ, giờ mở, điện thoại lấy thẳng từ
   * bảng chi nhánh; còn số bàn và số phòng riêng đếm từ sơ đồ bàn thật thay vì
   * gõ tay vào một câu quảng cáo rồi quên cập nhật.
   */
  async branches() {
    const [rows, seatRows, areaRows] = await Promise.all([
      this.db
        .select({
          id: branches.id,
          name: branches.name,
          address: branches.address,
          phone: branches.phone,
          email: branches.email,
          openHours: branches.openHours,
        })
        .from(branches)
        .where(eq(branches.active, true))
        .orderBy(asc(branches.id)),
      this.db
        .select({
          branchId: tables.branchId,
          areaId: tables.areaId,
          kind: tables.kind,
          hasGrill: tables.hasGrill,
          count: sql<number>`count(*)::int`,
        })
        .from(tables)
        .where(eq(tables.active, true))
        .groupBy(tables.branchId, tables.areaId, tables.kind, tables.hasGrill),
      this.db.select().from(areas).orderBy(asc(areas.sort)),
    ])

    return rows.map((b) => {
      const mine = seatRows.filter((s) => s.branchId === b.id)
      const count = (kind: string) =>
        mine.filter((s) => s.kind === kind).reduce((sum, s) => sum + Number(s.count), 0)
      return {
        id: b.id,
        name: b.name,
        address: b.address,
        phone: b.phone,
        email: b.email,
        openHours: (b.openHours as { raw?: string } | null)?.raw ?? null,
        // Chỉ khu ĐANG có bàn: khu rỗng còn sót lại sau khi đổi sơ đồ không phải
        // là thứ để quảng cáo với khách
        areas: areaRows
          .filter((a) => a.branchId === b.id && mine.some((s) => s.areaId === a.id))
          .map((a) => a.name),
        seats: {
          total: mine.reduce((sum, s) => sum + Number(s.count), 0),
          grill: mine.filter((s) => s.hasGrill).reduce((sum, s) => sum + Number(s.count), 0),
          standard: count('standard'),
          private: count('private'),
        },
      }
    })
  }

  /**
   * W8 — tin tức, do A8 soạn.
   *
   * Chỉ bài ĐÃ BẬT và ĐÃ TỚI NGÀY ĐĂNG: bài hẹn giờ cho tuần sau mà lọt ra hôm
   * nay thì việc hẹn ngày chẳng còn nghĩa gì. Bài mới nhất đứng đầu và trang tin
   * lấy đó làm bài nổi bật.
   */
  async posts() {
    const today = new Date().toISOString().slice(0, 10)
    const rows = await this.db
      .select({
        id: sitePosts.id,
        title: sitePosts.title,
        category: sitePosts.category,
        excerpt: sitePosts.excerpt,
        publishedOn: sitePosts.publishedOn,
      })
      .from(sitePosts)
      .where(and(eq(sitePosts.published, true), sql`${sitePosts.publishedOn} <= ${today}`))
      .orderBy(desc(sitePosts.publishedOn), desc(sitePosts.id))
      .limit(24)
    return rows
  }

  /** W9 — tin tuyển dụng đang mở. `branchName` null nghĩa là tuyển cả chuỗi. */
  async jobs() {
    const rows = await this.db
      .select({
        id: siteJobs.id,
        title: siteJobs.title,
        branchName: branches.name,
        employment: siteJobs.employment,
        slots: siteJobs.slots,
      })
      .from(siteJobs)
      .leftJoin(branches, eq(branches.id, siteJobs.branchId))
      .where(eq(siteJobs.published, true))
      .orderBy(asc(siteJobs.sort), asc(siteJobs.id))
    return rows
  }

  /**
   * Toàn bộ thực đơn cho W2 · W3 · W7 trong một lượt.
   *
   * Ba mươi lăm món và sáu set là vài chục kilobyte — chia thành ba endpoint chỉ
   * để mỗi trang gọi một cái là đổi một request thành ba, mà trang nào cũng cần
   * cả ba mảnh (W3 phải biết món dùng kèm, W7 phải biết món trong set).
   */
  async menu() {
    const [categoryRows, dishRows, storyRows, groupRows, itemRows] = await Promise.all([
      this.db.select().from(categories).orderBy(asc(categories.sort)),
      this.db
        .select()
        .from(dishes)
        .where(eq(dishes.active, true))
        .orderBy(asc(dishes.sort), asc(dishes.nameVi)),
      this.db.select().from(dishStories),
      this.db.select().from(setGroups).orderBy(asc(setGroups.sort)),
      this.db.select().from(setGroupItems).orderBy(asc(setGroupItems.sort)),
    ])

    return {
      categories: categoryRows.map((c) => ({
        id: c.id,
        nameVi: c.nameVi,
        nameEn: c.nameEn,
        kanji: c.kanji,
      })),
      dishes: dishRows.map((d) => ({
        id: d.id,
        kind: d.kind,
        categoryId: d.categoryId,
        subCategory: d.subCategory,
        nameVi: d.nameVi,
        nameJa: d.nameJa,
        kana: d.kana,
        shortDesc: d.shortDesc,
        longDesc: d.longDesc,
        allergens: d.allergens ?? [],
        tags: d.tags ?? [],
        price: d.basePrice,
        signature: d.signature,
        /** Món không bật bán online thì W3 không mời "Đặt mang về" */
        onlineVisible: d.onlineVisible,
        imageUrl: d.imageUrl,
        /**
         * Phần biên tập của trang chi tiết (W3), nhập ở Office M1. `null` là món
         * chưa được kể — trang tự dựng bản gọn từ tên, giá, mô tả.
         */
        story: storyRows.find((s) => s.dishId === d.id) ?? null,
      })),
      sets: groupRows.reduce<
        {
          setDishId: string
          courses: {
            label: string
            kanji: string | null
            items: { dishId: string; qty: number; portionLabel: string | null }[]
          }[]
        }[]
      >((acc, g) => {
        const entry = acc.find((s) => s.setDishId === g.setDishId) ?? {
          setDishId: g.setDishId,
          courses: [],
        }
        if (!acc.includes(entry)) acc.push(entry)
        entry.courses.push({
          label: g.label,
          kanji: g.kanji,
          items: itemRows
            .filter((i) => i.groupId === g.id)
            .map((i) => ({ dishId: i.dishId, qty: i.qty, portionLabel: i.portionLabel })),
        })
        return acc
      }, []),
    }
  }
}
