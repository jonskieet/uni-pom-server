import { ipcMain } from "electron";
import { g as getDb, a as generatePomCode } from "./main-BOqlpV74.js";
ipcMain.handle("brands:getAll", () => {
  return getDb().prepare(`
    SELECT id, name, short_name, country, website, is_active, created_at
    FROM brands ORDER BY name
  `).all();
});
ipcMain.handle("brands:create", (_e, data) => {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO brands (name, short_name, country, website)
    VALUES (@name, @short_name, @country, @website)
  `).run(data);
  return { id: result.lastInsertRowid, ...data };
});
ipcMain.handle("brands:update", (_e, id, data) => {
  const fields = Object.keys(data).map((k) => `${k} = @${k}`).join(", ");
  getDb().prepare(`UPDATE brands SET ${fields} WHERE id = @id`).run({ ...data, id });
  return { success: true };
});
ipcMain.handle("brands:delete", (_e, id) => {
  try {
    getDb().prepare("DELETE FROM brands WHERE id = ?").run(id);
    return { success: true };
  } catch {
    return { success: false, error: "Không thể xóa — hãng đang có sản phẩm liên kết." };
  }
});
ipcMain.handle("categories:getAll", () => {
  return getDb().prepare("SELECT * FROM categories ORDER BY name").all();
});
ipcMain.handle("products:getAll", (_e, filters) => {
  let query = `
    SELECT p.*, b.name AS brand_name, b.short_name AS brand_short, c.name AS category_name
    FROM products p
    LEFT JOIN brands b ON p.brand_id = b.id
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE 1=1
  `;
  const params = {};
  if (filters == null ? void 0 : filters.brand_id) {
    query += " AND p.brand_id = @brand_id";
    params.brand_id = filters.brand_id;
  }
  if (filters == null ? void 0 : filters.category_id) {
    query += " AND p.category_id = @category_id";
    params.category_id = filters.category_id;
  }
  if (filters == null ? void 0 : filters.status) {
    query += " AND p.status = @status";
    params.status = filters.status;
  }
  if (filters == null ? void 0 : filters.search) {
    query += " AND (p.name LIKE @search OR p.part_number LIKE @search)";
    params.search = `%${filters.search}%`;
  }
  query += " ORDER BY b.name, p.name";
  return getDb().prepare(query).all(params);
});
ipcMain.handle("products:getById", (_e, id) => {
  return getDb().prepare(`
    SELECT p.*, b.name AS brand_name, c.name AS category_name
    FROM products p
    LEFT JOIN brands b ON p.brand_id = b.id
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.id = ?
  `).get(id);
});
ipcMain.handle("products:create", (_e, data) => {
  const result = getDb().prepare(`
    INSERT INTO products (brand_id, category_id, name, part_number, unit, price, vat_rate, status, description, spec, created_by)
    VALUES (@brand_id, @category_id, @name, @part_number, @unit, @price, @vat_rate, @status, @description, @spec, @created_by)
  `).run({
    part_number: null,
    // ← default null cho các field optional
    description: null,
    spec: null,
    created_by: null,
    unit: "Cái",
    vat_rate: 0.1,
    status: "active",
    ...data
    // ← data từ form sẽ ghi đè lên defaults ở trên
  });
  return { id: result.lastInsertRowid, ...data };
});
ipcMain.handle("products:update", (_e, id, data) => {
  const db = getDb();
  const old = db.prepare("SELECT price FROM products WHERE id = ?").get(id);
  if (!old) return { success: false, error: "Không tìm thấy sản phẩm." };
  if (data.price !== void 0 && data.price !== old.price) {
    db.prepare(`
      INSERT INTO price_history (product_id, old_price, new_price, changed_by)
      VALUES (?, ?, ?, ?)
    `).run(id, old.price, data.price, data.updated_by ?? null);
  }
  const fields = Object.keys(data).filter((k) => k !== "updated_by").map((k) => `${k} = @${k}`).join(", ");
  db.prepare(`UPDATE products SET ${fields}, updated_at = datetime('now','localtime') WHERE id = @id`).run({ ...data, id });
  return { success: true };
});
ipcMain.handle("products:delete", (_e, id) => {
  try {
    getDb().prepare("DELETE FROM products WHERE id = ?").run(id);
    return { success: true };
  } catch {
    return { success: false, error: "Không thể xóa — sản phẩm đang được dùng trong POM." };
  }
});
ipcMain.handle("products:getPriceHistory", (_e, product_id) => {
  return getDb().prepare(`
    SELECT ph.*, u.full_name AS changed_by_name
    FROM price_history ph
    LEFT JOIN users u ON ph.changed_by = u.id
    WHERE ph.product_id = ?
    ORDER BY ph.changed_at DESC
  `).all(product_id);
});
ipcMain.handle("solutions:getAll", () => {
  return getDb().prepare("SELECT * FROM solutions WHERE is_active = 1 ORDER BY name").all();
});
ipcMain.handle("poms:getAll", (_e, filters) => {
  let query = `
    SELECT p.*, s.name AS solution_name, s.code AS solution_code,
           u.full_name AS created_by_name,
           (SELECT COUNT(*) FROM pom_items WHERE pom_id = p.id) AS item_count,
           (SELECT SUM(quantity * unit_price * (1 + vat_rate)) FROM pom_items WHERE pom_id = p.id) AS total_amount
    FROM poms p
    LEFT JOIN solutions s ON p.solution_id = s.id
    LEFT JOIN users u ON p.created_by = u.id
    WHERE 1=1
  `;
  const params = {};
  if (filters == null ? void 0 : filters.status) {
    query += " AND p.status = @status";
    params.status = filters.status;
  }
  if (filters == null ? void 0 : filters.created_by) {
    query += " AND p.created_by = @created_by";
    params.created_by = filters.created_by;
  }
  if (filters == null ? void 0 : filters.search) {
    query += " AND (p.pom_code LIKE @search OR p.project_name LIKE @search OR p.customer_name LIKE @search)";
    params.search = `%${filters.search}%`;
  }
  query += " ORDER BY p.created_at DESC";
  return getDb().prepare(query).all(params);
});
ipcMain.handle("poms:getById", (_e, id) => {
  const db = getDb();
  const pom = db.prepare(`
    SELECT p.*, s.name AS solution_name, s.code AS solution_code,
           u.full_name AS created_by_name
    FROM poms p
    LEFT JOIN solutions s ON p.solution_id = s.id
    LEFT JOIN users u ON p.created_by = u.id
    WHERE p.id = ?
  `).get(id);
  if (!pom) return null;
  const items = db.prepare(`
    SELECT pi.*, pr.name AS product_name, pr.part_number,
           pr.unit, b.name AS brand_name, b.short_name AS brand_short,
           c.name AS category_name,
           (pi.quantity * pi.unit_price * (1 + pi.vat_rate)) AS total_price
    FROM pom_items pi
    JOIN products pr ON pi.product_id = pr.id
    LEFT JOIN brands b ON pr.brand_id = b.id
    LEFT JOIN categories c ON pr.category_id = c.id
    WHERE pi.pom_id = ?
    ORDER BY pi.sort_order, pi.id
  `).all(id);
  return { ...pom, items };
});
ipcMain.handle("poms:create", (_e, data) => {
  const pom_code = generatePomCode();
  const result = getDb().prepare(`
    INSERT INTO poms (pom_code, solution_id, created_by, project_name, customer_name, note)
    VALUES (@pom_code, @solution_id, @created_by, @project_name, @customer_name, @note)
  `).run({ pom_code, ...data });
  return { id: result.lastInsertRowid, pom_code };
});
ipcMain.handle("poms:updateStatus", (_e, id, status, reviewed_by) => {
  const extra = status === "exported" ? `, exported_at = datetime('now','localtime')` : "";
  getDb().prepare(`
    UPDATE poms SET status = ?, reviewed_by = ?${extra},
    updated_at = datetime('now','localtime') WHERE id = ?
  `).run(status, reviewed_by ?? null, id);
  return { success: true };
});
ipcMain.handle("poms:delete", (_e, id) => {
  getDb().prepare("DELETE FROM poms WHERE id = ?").run(id);
  return { success: true };
});
ipcMain.handle("pomItems:upsert", (_e, pom_id, items) => {
  const db = getDb();
  const deleteOld = db.prepare("DELETE FROM pom_items WHERE pom_id = ?");
  const insert = db.prepare(`
    INSERT INTO pom_items (pom_id, product_id, quantity, unit_price, vat_rate, note, sort_order)
    VALUES (@pom_id, @product_id, @quantity, @unit_price, @vat_rate, @note, @sort_order)
  `);
  const saveAll = db.transaction(() => {
    deleteOld.run(pom_id);
    items.forEach((item, i) => insert.run({
      pom_id,
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      vat_rate: item.vat_rate,
      note: item.note ?? null,
      sort_order: item.sort_order ?? i
    }));
  });
  saveAll();
  return { success: true };
});
ipcMain.handle("users:getAll", () => {
  return getDb().prepare(`
    SELECT id, username, full_name, role, is_active, created_at FROM users ORDER BY full_name
  `).all();
});
ipcMain.handle("users:login", (_e, username, password_hash) => {
  const user = getDb().prepare(`
    SELECT id, username, full_name, role FROM users
    WHERE username = ? AND password_hash = ? AND is_active = 1
  `).get(username, password_hash);
  return user ?? null;
});
