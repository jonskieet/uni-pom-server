import { net, ipcMain, dialog, app, BrowserWindow } from "electron";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
const API_URL = process.env.UNI_POM_API_URL || "https://uni-pom-server.onrender.com/api";
let _token = null;
function setToken(token) {
  _token = token;
}
async function apiFetch(path2, options = {}) {
  const { method = "GET", body, params } = options;
  let url = `${API_URL}${path2}`;
  if (params) {
    const qs = Object.entries(params).filter(([, v]) => v !== void 0 && v !== null && v !== "").map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("&");
    if (qs) url += `?${qs}`;
  }
  const res = await net.fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ..._token ? { Authorization: `Bearer ${_token}` } : {}
    },
    body: body ? JSON.stringify(body) : void 0
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error((data == null ? void 0 : data.error) || `HTTP ${res.status}: ${path2}`);
  }
  return (data == null ? void 0 : data.data) !== void 0 ? data.data : data;
}
const api = {
  get: (path2, params) => apiFetch(path2, { method: "GET", params }),
  post: (path2, body) => apiFetch(path2, { method: "POST", body }),
  put: (path2, body) => apiFetch(path2, { method: "PUT", body }),
  delete: (path2) => apiFetch(path2, { method: "DELETE" })
};
const require$1 = createRequire(import.meta.url);
ipcMain.handle("users:login", async (_e, username, password_hash) => {
  try {
    const res = await api.post("/auth/login", {
      username,
      password: password_hash
    });
    setToken(res.token);
    return res.user;
  } catch (err) {
    return { error: err.message };
  }
});
ipcMain.handle("users:getAll", async () => {
  try {
    return await api.get("/users");
  } catch {
    return [];
  }
});
ipcMain.handle("brands:getAll", async () => {
  try {
    return await api.get("/brands");
  } catch {
    return [];
  }
});
ipcMain.handle("brands:create", async (_e, data) => {
  try {
    return await api.post("/brands", data);
  } catch (err) {
    return { error: err.message };
  }
});
ipcMain.handle("brands:update", async (_e, id, data) => {
  try {
    return await api.put(`/brands/${id}`, data);
  } catch (err) {
    return { error: err.message };
  }
});
ipcMain.handle("brands:delete", async (_e, id) => {
  try {
    return await api.delete(`/brands/${id}`);
  } catch (err) {
    return { error: err.message };
  }
});
ipcMain.handle("categories:getAll", async () => {
  try {
    return await api.get("/categories");
  } catch {
    return [];
  }
});
ipcMain.handle("solutions:getAll", async () => {
  try {
    return await api.get("/solutions");
  } catch {
    return [];
  }
});
ipcMain.handle("products:getAll", async (_e, filters) => {
  try {
    return await api.get("/products", filters);
  } catch {
    return [];
  }
});
ipcMain.handle("products:getById", async (_e, id) => {
  try {
    return await api.get(`/products/${id}`);
  } catch {
    return null;
  }
});
ipcMain.handle("products:create", async (_e, data) => {
  return await api.post("/products", data);
});
ipcMain.handle("products:update", async (_e, id, data) => {
  try {
    return await api.put(`/products/${id}`, data);
  } catch (err) {
    return { error: err.message };
  }
});
ipcMain.handle("products:delete", async (_e, id) => {
  try {
    return await api.delete(`/products/${id}`);
  } catch (err) {
    return { error: err.message };
  }
});
ipcMain.handle("products:getPriceHistory", async (_e, id) => {
  try {
    return await api.get(`/products/${id}/price-history`);
  } catch {
    return [];
  }
});
ipcMain.handle("poms:getAll", async (_e, filters) => {
  try {
    const res = await api.get("/poms", filters);
    const list = Array.isArray(res) ? res : (res == null ? void 0 : res.data) ?? [];
    const mapped = list.map((pom) => ({
      ...pom,
      item_count: pom.item_count ?? (Array.isArray(pom.items) ? pom.items.length : 0),
      total_amount: pom.total_amount ?? (Array.isArray(pom.items) ? pom.items.reduce((s, i) => s + Number(i.unit_price) * Number(i.quantity) * (1 + Number(i.vat_rate)), 0) : 0)
    }));
    return Array.isArray(res) ? mapped : { ...res, data: mapped };
  } catch {
    return [];
  }
});
ipcMain.handle("poms:getById", async (_e, id) => {
  try {
    const pom = await api.get(`/poms/${id}`);
    if (!pom) return null;
    if (Array.isArray(pom.items)) {
      pom.items = pom.items.map((item) => {
        const p = item.product ?? {};
        const b = p.brand ?? {};
        const c = p.category ?? {};
        return {
          ...item,
          product_name: item.product_name ?? p.name ?? "",
          part_number: item.part_number ?? p.part_number ?? null,
          unit: item.unit ?? p.unit ?? "Cái",
          brand_name: item.brand_name ?? b.name ?? "",
          brand_short: item.brand_short ?? b.short_name ?? b.name ?? "",
          category_name: item.category_name ?? c.name ?? "",
          total_price: item.total_price ?? Number(item.unit_price) * Number(item.quantity) * (1 + Number(item.vat_rate))
        };
      });
    }
    return pom;
  } catch {
    return null;
  }
});
ipcMain.handle("poms:create", async (_e, data) => {
  return await api.post("/poms", data);
});
ipcMain.handle("poms:update", async (_e, id, data) => {
  try {
    return await api.put(`/poms/${id}`, data);
  } catch (err) {
    return { error: err.message };
  }
});
ipcMain.handle("poms:approve", async (_e, id) => {
  return await api.put(`/poms/${id}/approve`, {});
});
ipcMain.handle("poms:updateStatus", async (_e, id, status, reviewer) => {
  try {
    return await api.put(`/poms/${id}/status`, { status, reviewer });
  } catch (err) {
    return { error: err.message };
  }
});
ipcMain.handle("poms:return", async (_e, id, reason) => {
  try {
    return await api.put(`/poms/${id}/return`, { reason });
  } catch (err) {
    return { error: err.message };
  }
});
ipcMain.handle("poms:delete", async (_e, id) => {
  try {
    return await api.delete(`/poms/${id}`);
  } catch (err) {
    return { error: err.message };
  }
});
ipcMain.handle("pomItems:upsert", async (_e, pom_id, items) => {
  try {
    return await api.put(`/poms/${pom_id}/items`, { items });
  } catch (err) {
    return { error: err.message };
  }
});
ipcMain.handle("poms:exportExcel", async (_e, id, isPreview) => {
  try {
    const ExcelJS = require$1("exceljs");
    const pom = await api.get(`/poms/${id}`);
    const items = pom.items ?? [];
    const { filePath } = await dialog.showSaveDialog({
      title: "Xuất POM ra Excel",
      defaultPath: path.join(
        app.getPath("downloads"),
        `${pom.pom_code}${isPreview ? "_preview" : ""}.xlsx`
      ),
      filters: [{ name: "Excel", extensions: ["xlsx"] }]
    });
    if (!filePath) return { success: false, error: "Hủy" };
    const wb = new ExcelJS.Workbook();
    wb.creator = "UNI POM System";
    const ws = wb.addWorksheet("POM");
    ws.mergeCells("A1:I1");
    const titleCell = ws.getCell("A1");
    titleCell.value = isPreview ? "⚠  PHIẾU ĐỀ XUẤT VẬT TƯ — BẢN PREVIEW (CHƯA DUYỆT)" : "PHIẾU ĐỀ XUẤT VẬT TƯ — ĐÃ DUYỆT";
    titleCell.font = { bold: true, size: 14, color: { argb: isPreview ? "FF854F0B" : "FF0C447C" } };
    titleCell.alignment = { horizontal: "center" };
    titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: isPreview ? "FFFAEEDA" : "FFE6F1FB" } };
    ws.getRow(1).height = 30;
    const info = [
      ["Mã POM:", pom.pom_code, "Giải pháp:", pom.solution_name ?? "—"],
      ["Dự án:", pom.project_name, "Khách hàng:", pom.customer_name ?? "—"],
      ["Người tạo:", pom.created_by_name, "Ngày tạo:", new Date(pom.created_at).toLocaleDateString("vi-VN")],
      [
        "Trạng thái:",
        isPreview ? "Preview — chưa duyệt" : "Đã duyệt",
        "Người duyệt:",
        pom.reviewed_by_name ?? "—"
      ]
    ];
    info.forEach((row, i) => {
      const r = ws.getRow(i + 2);
      r.values = ["", row[0], row[1], "", row[2], row[3]];
      r.getCell(2).font = { bold: true, size: 10, color: { argb: "FF6B7280" } };
      r.getCell(4).font = { bold: true, size: 10, color: { argb: "FF6B7280" } };
      r.getCell(3).font = { size: 10 };
      r.getCell(6).font = { size: 10 };
      r.height = 18;
    });
    if (pom.note) {
      ws.getRow(6).values = ["", "Ghi chú:", pom.note];
      ws.getRow(6).getCell(2).font = { bold: true, size: 10, color: { argb: "FF6B7280" } };
      ws.getRow(6).height = 18;
    }
    const headerRow = ws.getRow(8);
    const headers = ["#", "Tên thiết bị", "Mã Part", "Hãng", "Danh mục", "ĐVT", "Số lượng", "Đơn giá", "VAT", "Thành tiền"];
    headerRow.values = ["", ...headers];
    headerRow.height = 22;
    headerRow.eachCell((cell, col) => {
      if (col < 2) return;
      cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF3C3489" } };
      cell.alignment = { horizontal: col >= 8 ? "right" : col === 7 ? "center" : "left", vertical: "middle" };
      cell.border = { bottom: { style: "thin", color: { argb: "FF185FA5" } } };
    });
    items.forEach((item, i) => {
      const r = ws.getRow(9 + i);
      r.values = [
        "",
        i + 1,
        item.product_name,
        item.part_number ?? "—",
        item.brand_short ?? item.brand_name,
        item.category_name,
        item.unit,
        item.quantity,
        item.unit_price,
        (item.vat_rate * 100).toFixed(0) + "%",
        item.total_price
      ];
      r.height = 18;
      r.eachCell((cell, col) => {
        if (col < 2) return;
        cell.font = { size: 10 };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: i % 2 === 0 ? "FFFFFFFF" : "FFF9FAFB" } };
        if (col === 8 || col === 9 || col === 11) cell.alignment = { horizontal: "right" };
        if (col === 9 || col === 11) cell.numFmt = "#,##0";
        cell.border = { bottom: { style: "hair", color: { argb: "FFE5E7EB" } } };
      });
    });
    const totalRow = items.length + 9;
    const totalAmount = items.reduce((s, i) => s + (i.total_price ?? 0), 0);
    const sumRow = ws.getRow(totalRow);
    sumRow.values = ["", "", "", "", "", "", "", "", "Tổng cộng (đã VAT):", "", totalAmount];
    sumRow.height = 22;
    sumRow.getCell(10).font = { bold: true, size: 11 };
    sumRow.getCell(11).font = { bold: true, size: 11, color: { argb: "FF3C3489" } };
    sumRow.getCell(11).numFmt = "#,##0";
    sumRow.getCell(11).alignment = { horizontal: "right" };
    ws.mergeCells(`B${totalRow}:I${totalRow}`);
    sumRow.getCell(2).alignment = { horizontal: "right" };
    sumRow.getCell(2).font = { bold: true, size: 11 };
    if (isPreview) {
      const wRow = ws.getRow(totalRow + 2);
      wRow.values = ["", "⚠  Bản này chưa được duyệt chính thức — chỉ dùng để tham khảo trước khi xác nhận"];
      wRow.getCell(2).font = { italic: true, size: 10, color: { argb: "FF854F0B" } };
      wRow.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFAEEDA" } };
      ws.mergeCells(`B${totalRow + 2}:K${totalRow + 2}`);
    }
    ws.columns = [
      { width: 2 },
      { width: 5 },
      { width: 38 },
      { width: 16 },
      { width: 16 },
      { width: 16 },
      { width: 7 },
      { width: 8 },
      { width: 14 },
      { width: 7 },
      { width: 16 }
    ];
    await wb.xlsx.writeFile(filePath);
    if (!isPreview) {
      await api.put(`/poms/${id}/status`, { status: "exported" });
    }
    return { success: true, filePath };
  } catch (err) {
    console.error("[exportExcel]", err);
    return { success: false, error: err.message };
  }
});
ipcMain.handle("survey:getAll", async (_e, filters) => {
  try {
    const res = await api.get("/surveys", filters);
    const list = Array.isArray(res) ? res : (res == null ? void 0 : res.data) ?? [];
    return list.map((r) => {
      var _a, _b, _c;
      return {
        ...r,
        pom_code: r.pom_code ?? ((_a = r.pom) == null ? void 0 : _a.pom_code) ?? "",
        pom_project: r.pom_project ?? ((_b = r.pom) == null ? void 0 : _b.project_name) ?? "",
        created_by_name: r.created_by_name ?? ((_c = r.creator) == null ? void 0 : _c.full_name) ?? "",
        item_count: r.item_count ?? (Array.isArray(r.items) ? r.items.length : 0)
      };
    });
  } catch {
    return [];
  }
});
ipcMain.handle("survey:getById", async (_e, id) => {
  var _a, _b, _c;
  try {
    const r = await api.get(`/surveys/${id}`);
    if (!r) return null;
    return {
      ...r,
      pom_code: r.pom_code ?? ((_a = r.pom) == null ? void 0 : _a.pom_code) ?? "",
      pom_project: r.pom_project ?? ((_b = r.pom) == null ? void 0 : _b.project_name) ?? "",
      created_by_name: r.created_by_name ?? ((_c = r.creator) == null ? void 0 : _c.full_name) ?? "",
      item_count: r.item_count ?? (Array.isArray(r.items) ? r.items.length : 0)
    };
  } catch {
    return null;
  }
});
ipcMain.handle("survey:create", async (_e, data) => {
  try {
    return await api.post("/surveys", data);
  } catch (err) {
    return { error: err.message };
  }
});
ipcMain.handle("survey:update", async (_e, id, data) => {
  try {
    return await api.put(`/surveys/${id}`, data);
  } catch (err) {
    return { error: err.message };
  }
});
ipcMain.handle("survey:updateItems", async (_e, id, items) => {
  try {
    return await api.put(`/surveys/${id}/items`, { items });
  } catch (err) {
    return { error: err.message };
  }
});
ipcMain.handle("survey:delete", async (_e, id) => {
  try {
    return await api.delete(`/surveys/${id}`);
  } catch (err) {
    return { error: err.message };
  }
});
createRequire(import.meta.url);
const __dirname$1 = path.dirname(fileURLToPath(import.meta.url));
process.env.APP_ROOT = path.join(__dirname$1, "..");
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, "public") : RENDERER_DIST;
process.env.UNI_POM_API_URL = VITE_DEV_SERVER_URL ? process.env.UNI_POM_API_URL || "http://localhost:3001/api" : "https://uni-pom-api.onrender.com/api";
let win;
function registerWindowControls() {
  ipcMain.handle("window:minimize", (e) => {
    var _a;
    (_a = BrowserWindow.fromWebContents(e.sender)) == null ? void 0 : _a.minimize();
  });
  ipcMain.handle("window:maximize", (e) => {
    const win2 = BrowserWindow.fromWebContents(e.sender);
    if (!win2) return;
    win2.isMaximized() ? win2.unmaximize() : win2.maximize();
  });
  ipcMain.handle("window:close", (e) => {
    var _a;
    (_a = BrowserWindow.fromWebContents(e.sender)) == null ? void 0 : _a.close();
  });
  ipcMain.handle("window:isMaximized", (e) => {
    var _a;
    return ((_a = BrowserWindow.fromWebContents(e.sender)) == null ? void 0 : _a.isMaximized()) ?? false;
  });
  ipcMain.handle("window:resetSize", (e) => {
    const win2 = BrowserWindow.fromWebContents(e.sender);
    if (!win2) return;
    win2.unmaximize();
    win2.setSize(1280, 800);
    win2.center();
  });
}
function createWindow() {
  win = new BrowserWindow({
    frame: false,
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    icon: path.join(process.env.VITE_PUBLIC, "logo.ico"),
    webPreferences: {
      preload: path.join(__dirname$1, "preload.mjs")
    }
  });
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
app.whenReady().then(() => {
  registerWindowControls();
  createWindow();
});
export {
  MAIN_DIST,
  RENDERER_DIST,
  VITE_DEV_SERVER_URL
};
