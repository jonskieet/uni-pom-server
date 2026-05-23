import { app, BrowserWindow, Menu } from "electron";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
const require$1 = createRequire(import.meta.url);
const __filename$1 = fileURLToPath(import.meta.url);
path.dirname(__filename$1);
const Database = require$1("better-sqlite3");
let db;
function getDb() {
  if (!db) throw new Error("Database chưa được khởi tạo. Gọi initDb() trước.");
  return db;
}
function initDb() {
  const userDataPath = app.getPath("userData");
  const dbPath = path.join(userDataPath, "uni-pom.db");
  console.log("[DB] Database path:", dbPath);
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  console.log("[DB] Khởi tạo thành công.");
}
function runMigrations(db2) {
  db2.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT    NOT NULL UNIQUE,
      full_name     TEXT    NOT NULL,
      role          TEXT    NOT NULL CHECK(role IN ('admin', 'sales', 'technical')),
      password_hash TEXT    NOT NULL,
      is_active     INTEGER NOT NULL DEFAULT 1,
      created_at    DATETIME NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at    DATETIME NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS brands (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL UNIQUE,
      short_name TEXT,
      country    TEXT,
      website    TEXT,
      logo_path  TEXT,
      is_active  INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS categories (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL UNIQUE,
      description TEXT,
      created_at  DATETIME NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      brand_id     INTEGER NOT NULL REFERENCES brands(id)     ON DELETE RESTRICT,
      category_id  INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
      name         TEXT    NOT NULL,
      part_number  TEXT    UNIQUE,
      unit         TEXT    NOT NULL DEFAULT 'Cái',
      price        REAL    NOT NULL DEFAULT 0,
      vat_rate     REAL    NOT NULL DEFAULT 0.10,
      status       TEXT    NOT NULL DEFAULT 'active'
                   CHECK(status IN ('active', 'discontinued', 'draft')),
      description  TEXT,
      spec         TEXT,
      image_path   TEXT,
      created_by   INTEGER REFERENCES users(id),
      created_at   DATETIME NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at   DATETIME NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS price_history (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      old_price  REAL    NOT NULL,
      new_price  REAL    NOT NULL,
      changed_by INTEGER REFERENCES users(id),
      changed_at DATETIME NOT NULL DEFAULT (datetime('now','localtime')),
      note       TEXT
    );

    CREATE TABLE IF NOT EXISTS solutions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL UNIQUE,
      code        TEXT    NOT NULL UNIQUE,
      description TEXT,
      is_active   INTEGER NOT NULL DEFAULT 1,
      created_at  DATETIME NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS poms (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      pom_code      TEXT    NOT NULL UNIQUE,
      solution_id   INTEGER REFERENCES solutions(id) ON DELETE SET NULL,
      created_by    INTEGER NOT NULL REFERENCES users(id),
      reviewed_by   INTEGER REFERENCES users(id),
      project_name  TEXT    NOT NULL,
      customer_name TEXT,
      status        TEXT    NOT NULL DEFAULT 'draft'
                    CHECK(status IN ('draft','submitted','reviewed','exported')),
      note          TEXT,
      exported_at   DATETIME,
      created_at    DATETIME NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at    DATETIME NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS pom_items (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      pom_id      INTEGER NOT NULL REFERENCES poms(id) ON DELETE CASCADE,
      product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      quantity    INTEGER NOT NULL DEFAULT 1 CHECK(quantity > 0),
      unit_price  REAL    NOT NULL,
      vat_rate    REAL    NOT NULL DEFAULT 0.10,
      note        TEXT,
      sort_order  INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_products_brand    ON products(brand_id);
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
    CREATE INDEX IF NOT EXISTS idx_products_status   ON products(status);
    CREATE INDEX IF NOT EXISTS idx_poms_status       ON poms(status);
    CREATE INDEX IF NOT EXISTS idx_poms_created_by   ON poms(created_by);
    CREATE INDEX IF NOT EXISTS idx_pom_items_pom     ON pom_items(pom_id);
    CREATE INDEX IF NOT EXISTS idx_pom_items_product ON pom_items(product_id);
  `);
  seedInitialData(db2);
}
function seedInitialData(db2) {
  const brandCount = db2.prepare("SELECT COUNT(*) as c FROM brands").get().c;
  if (brandCount > 0) return;
  console.log("[DB] Đang thêm dữ liệu mẫu...");
  db2.prepare(`INSERT OR IGNORE INTO users (username, full_name, role, password_hash) VALUES
    ('admin',   'Quản trị viên', 'admin',     'CHANGE_ME'),
    ('sales01', 'Nguyễn Văn A',  'sales',     'CHANGE_ME'),
    ('tech01',  'Trần Kỹ Thuật', 'technical', 'CHANGE_ME')
  `).run();
  const insertBrand = db2.prepare(
    "INSERT OR IGNORE INTO brands (name, short_name, country) VALUES (?, ?, ?)"
  );
  [
    ["Cisco Systems", "Cisco", "USA"],
    ["HP Enterprise", "HPE", "USA"],
    ["Huawei Technologies", "Huawei", "China"],
    ["Poly (HP)", "Poly", "USA"],
    ["Yealink", "Yealink", "China"],
    ["Hikvision", "Hikvision", "China"],
    ["Dahua Technology", "Dahua", "China"],
    ["Ubiquiti", "Ubiquiti", "USA"],
    ["Fortinet", "Fortinet", "USA"],
    ["Aruba Networks (HP)", "Aruba", "USA"]
  ].forEach(([n, s, c]) => insertBrand.run(n, s, c));
  const insertCat = db2.prepare(
    "INSERT OR IGNORE INTO categories (name, description) VALUES (?, ?)"
  );
  [
    ["Switch", "Thiết bị chuyển mạch mạng LAN"],
    ["Router", "Thiết bị định tuyến"],
    ["Firewall", "Thiết bị tường lửa bảo mật"],
    ["Wireless AP", "Điểm truy cập không dây"],
    ["Camera IP", "Camera giám sát IP"],
    ["NVR/DVR", "Đầu ghi hình camera"],
    ["Video Conference", "Thiết bị hội nghị truyền hình"],
    ["Audio/Visual", "Thiết bị âm thanh hình ảnh"],
    ["UPS", "Bộ lưu điện"],
    ["Cable & Accessory", "Cáp và phụ kiện mạng"],
    ["IP Phone", "Điện thoại IP / VoIP"],
    ["Server", "Máy chủ"]
  ].forEach(([n, d]) => insertCat.run(n, d));
  const insertSol = db2.prepare(
    "INSERT OR IGNORE INTO solutions (name, code, description) VALUES (?, ?, ?)"
  );
  [
    ["Mạng LAN văn phòng", "LAN", "Hạ tầng mạng nội bộ LAN cho văn phòng"],
    ["Phòng họp hội nghị", "CONF", "Giải pháp phòng họp: màn hình, âm thanh, camera"],
    ["Hệ thống camera giám sát", "CCTV", "Camera IP, NVR, hạ tầng truyền dẫn"],
    ["Wifi toàn diện", "WIFI", "Hệ thống wifi doanh nghiệp, controller, AP"],
    ["Tổng đài IP / VoIP", "VOIP", "Hệ thống điện thoại nội bộ IP"],
    ["Bảo mật & Firewall", "SEC", "Tường lửa, VPN, IDS/IPS"],
    ["Trung tâm dữ liệu", "DC", "Server, storage, rack, UPS cho data center"]
  ].forEach(([n, c, d]) => insertSol.run(n, c, d));
  console.log("[DB] Seed dữ liệu mẫu xong.");
}
function generatePomCode() {
  const db2 = getDb();
  const dateStr = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10).replace(/-/g, "");
  const row = db2.prepare(
    `SELECT COUNT(*) as c FROM poms WHERE pom_code LIKE ?`
  ).get(`POM-${dateStr}-%`);
  const seq = String(row.c + 1).padStart(3, "0");
  return `POM-${dateStr}-${seq}`;
}
createRequire(import.meta.url);
const __dirname$1 = path.dirname(fileURLToPath(import.meta.url));
fileURLToPath(import.meta.url);
process.env.APP_ROOT = path.join(__dirname$1, "..");
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, "public") : RENDERER_DIST;
let win;
function createWindow() {
  win = new BrowserWindow({
    frame: true,
    autoHideMenuBar: true,
    icon: path.join(process.env.VITE_PUBLIC, ""),
    webPreferences: {
      preload: path.join(__dirname$1, "preload.mjs")
    }
  });
  Menu.setApplicationMenu(null);
  win.webContents.on("did-finish-load", () => {
    win == null ? void 0 : win.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  });
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
}
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
app.whenReady().then(async () => {
  initDb();
  await import("./ipcHandlers-BlAVopzy.js");
  createWindow();
});
export {
  MAIN_DIST as M,
  RENDERER_DIST as R,
  VITE_DEV_SERVER_URL as V,
  generatePomCode as a,
  getDb as g
};
