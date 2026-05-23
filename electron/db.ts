import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { app } from 'electron'

// Fix cho ES Module — __filename và __dirname không tồn tại trong ESM
const require = createRequire(import.meta.url)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Import better-sqlite3 bằng require (native module, không dùng import được)
const Database = require('better-sqlite3')
type Database = import('better-sqlite3').Database

let db: Database

export function getDb(): Database {
  if (!db) throw new Error('Database chưa được khởi tạo. Gọi initDb() trước.')
  return db
}

export function initDb(): void {
  const userDataPath = app.getPath('userData')
  const dbPath = path.join(userDataPath, 'uni-pom.db')

  console.log('[DB] Database path:', dbPath)

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  runMigrations(db)
  console.log('[DB] Khởi tạo thành công.')
}

function runMigrations(db: Database): void {
  db.exec(`
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
      return_reason TEXT,
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
  `)

  // Migration an toàn cho DB cũ: thêm cột return_reason nếu chưa có
  const pomCols = (db.prepare(`PRAGMA table_info(poms)`).all() as { name: string }[]).map(c => c.name)
  if (!pomCols.includes('return_reason')) {
    db.exec(`ALTER TABLE poms ADD COLUMN return_reason TEXT`)
    console.log('[DB] Migration: thêm cột return_reason vào bảng poms.')
  }

  // Migration: tạo bảng survey_reports + survey_items nếu chưa có
  const surveyTable = (db.prepare(`SELECT COUNT(*) as c FROM sqlite_master WHERE type='table' AND name='survey_reports'`).get() as { c: number }).c
  if (surveyTable === 0) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS survey_reports (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        report_code      TEXT    NOT NULL UNIQUE,
        report_type      TEXT    NOT NULL,
        pom_id           INTEGER NOT NULL REFERENCES poms(id) ON DELETE RESTRICT,
        created_by       INTEGER NOT NULL REFERENCES users(id),
        project_name     TEXT    NOT NULL,
        customer_name    TEXT,
        site_address     TEXT,
        survey_date      TEXT,
        surveyor_name    TEXT,
        status           TEXT    NOT NULL DEFAULT 'draft'
                         CHECK(status IN ('draft','completed')),
        general_note     TEXT,
        created_at       DATETIME NOT NULL DEFAULT (datetime('now','localtime')),
        updated_at       DATETIME NOT NULL DEFAULT (datetime('now','localtime'))
      );

      CREATE TABLE IF NOT EXISTS survey_items (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        report_id         INTEGER NOT NULL REFERENCES survey_reports(id) ON DELETE CASCADE,
        product_id        INTEGER REFERENCES products(id) ON DELETE SET NULL,
        product_name      TEXT    NOT NULL,
        quantity_proposed INTEGER NOT NULL DEFAULT 0,
        quantity_actual   INTEGER NOT NULL DEFAULT 0,
        unit              TEXT    NOT NULL DEFAULT 'Cái',
        location          TEXT,
        condition_note    TEXT,
        sort_order        INTEGER NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_survey_pom    ON survey_reports(pom_id);
      CREATE INDEX IF NOT EXISTS idx_survey_status ON survey_reports(status);
      CREATE INDEX IF NOT EXISTS idx_survey_items  ON survey_items(report_id);
    `)
    console.log('[DB] Migration: tạo bảng survey_reports và survey_items.')
  }

  seedInitialData(db)
}

function seedInitialData(db: Database): void {
  const brandCount = (db.prepare('SELECT COUNT(*) as c FROM brands').get() as { c: number }).c

  // Migration mật khẩu: nếu DB cũ vẫn còn plaintext "CHANGE_ME" thì cập nhật sang hash
  const HASHED_CHANGE_ME = '442cbf3fdf0f24777036e660c32d6e4b5f7621231bff2754673c5a188a2f614a'
  db.prepare(`UPDATE users SET password_hash = ? WHERE password_hash = 'CHANGE_ME'`).run(HASHED_CHANGE_ME)

  if (brandCount > 0) return

  console.log('[DB] Đang thêm dữ liệu mẫu...')

  db.prepare(`INSERT OR IGNORE INTO users (username, full_name, role, password_hash) VALUES
    ('admin',   'Quản trị viên',     'admin',     '442cbf3fdf0f24777036e660c32d6e4b5f7621231bff2754673c5a188a2f614a'),
    ('sales01', 'Phan Thị Bích Liên','sales',     '442cbf3fdf0f24777036e660c32d6e4b5f7621231bff2754673c5a188a2f614a'),
    ('tech01',  'Nguyễn Tấn Đạt',   'technical', '442cbf3fdf0f24777036e660c32d6e4b5f7621231bff2754673c5a188a2f614a')
  `).run()

  const insertBrand = db.prepare(
    'INSERT OR IGNORE INTO brands (name, short_name, country) VALUES (?, ?, ?)'
  )
  ;[
    ['Cisco Systems',       'Cisco',    'USA'],
    ['HP Enterprise',       'HPE',      'USA'],
    ['Huawei Technologies', 'Huawei',   'China'],
    ['Poly (HP)',           'Poly',     'USA'],
    ['Yealink',             'Yealink',  'China'],
    ['Hikvision',           'Hikvision','China'],
    ['Dahua Technology',    'Dahua',    'China'],
    ['Ubiquiti',            'Ubiquiti', 'USA'],
    ['Fortinet',            'Fortinet', 'USA'],
    ['Aruba Networks (HP)', 'Aruba',    'USA'],
  ].forEach(([n, s, c]) => insertBrand.run(n, s, c))

  const insertCat = db.prepare(
    'INSERT OR IGNORE INTO categories (name, description) VALUES (?, ?)'
  )
  ;[
    ['Switch',            'Thiết bị chuyển mạch mạng LAN'],
    ['Router',            'Thiết bị định tuyến'],
    ['Firewall',          'Thiết bị tường lửa bảo mật'],
    ['Wireless AP',       'Điểm truy cập không dây'],
    ['Camera IP',         'Camera giám sát IP'],
    ['NVR/DVR',           'Đầu ghi hình camera'],
    ['Video Conference',  'Thiết bị hội nghị truyền hình'],
    ['Audio/Visual',      'Thiết bị âm thanh hình ảnh'],
    ['UPS',               'Bộ lưu điện'],
    ['Cable & Accessory', 'Cáp và phụ kiện mạng'],
    ['IP Phone',          'Điện thoại IP / VoIP'],
    ['Server',            'Máy chủ'],
  ].forEach(([n, d]) => insertCat.run(n, d))

  const insertSol = db.prepare(
    'INSERT OR IGNORE INTO solutions (name, code, description) VALUES (?, ?, ?)'
  )
  ;[
    ['Mạng LAN văn phòng',       'LAN',  'Hạ tầng mạng nội bộ LAN cho văn phòng'],
    ['Phòng họp hội nghị',       'CONF', 'Giải pháp phòng họp: màn hình, âm thanh, camera'],
    ['Hệ thống camera giám sát', 'CCTV', 'Camera IP, NVR, hạ tầng truyền dẫn'],
    ['Wifi toàn diện',           'WIFI', 'Hệ thống wifi doanh nghiệp, controller, AP'],
    ['Tổng đài IP / VoIP',       'VOIP', 'Hệ thống điện thoại nội bộ IP'],
    ['Bảo mật & Firewall',       'SEC',  'Tường lửa, VPN, IDS/IPS'],
    ['Trung tâm dữ liệu',        'DC',   'Server, storage, rack, UPS cho data center'],
  ].forEach(([n, c, d]) => insertSol.run(n, c, d))

  console.log('[DB] Seed dữ liệu mẫu xong.')
}

export function generatePomCode(): string {
  const db = getDb()
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const row = db.prepare(
    `SELECT COUNT(*) as c FROM poms WHERE pom_code LIKE ?`
  ).get(`POM-${dateStr}-%`) as { c: number }
  const seq = String(row.c + 1).padStart(3, '0')
  return `POM-${dateStr}-${seq}`
}
