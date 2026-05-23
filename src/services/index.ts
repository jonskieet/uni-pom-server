// src/services/index.ts
// FIX: IPC handlers không throw khi lỗi — chúng return { error: "..." }
// checkIpc() phát hiện pattern này và throw Error đúng cách
// Nhờ đó catch block trong modal hoạt động, và onSaved/reload chỉ
// chạy khi thao tác THỰC SỰ thành công trên Supabase.

// ── Error checker ─────────────────────────────────────────────
function checkIpc<T>(result: T): T {
  if (
    result !== null &&
    typeof result === 'object' &&
    'error' in (result as object) &&
    (result as any).error
  ) {
    throw new Error((result as any).error)
  }
  return result
}

// Helper: wrap một IPC call và đảm bảo nó throw nếu có lỗi
const ipc = <T>(promise: Promise<T>): Promise<T> =>
  promise.then(checkIpc)

// ── BrandService ──────────────────────────────────────────────
export const BrandService = {
  getAll:  ()             => window.api.brands.getAll(),
  create:  (data: any)    => ipc(window.api.brands.create(data)),
  update:  (id: number, data: any) => ipc(window.api.brands.update(id, data)),
  delete:  (id: number)   => ipc(window.api.brands.delete(id)),
}

// ── CategoryService ───────────────────────────────────────────
export const CategoryService = {
  getAll: () => window.api.categories.getAll(),
}

// ── ProductService ────────────────────────────────────────────
export const ProductService = {
  getAll:          (filters?: any)           => window.api.products.getAll(filters),
  getById:         (id: number)              => window.api.products.getById(id),
  create:          (data: any)               => ipc(window.api.products.create(data)),
  update:          (id: number, data: any)   => ipc(window.api.products.update(id, data)),
  delete:          (id: number)              => ipc(window.api.products.delete(id)),
  getPriceHistory: (id: number)              => window.api.products.getPriceHistory(id),
}

// ── SolutionService ───────────────────────────────────────────
export const SolutionService = {
  getAll: () => window.api.solutions.getAll(),
}

// ── PomService ────────────────────────────────────────────────
export const PomService = {
  getAll:       (filters?: any)                         => window.api.poms.getAll(filters),
  getById:      (id: number)                            => window.api.poms.getById(id),
  create:       (data: any)                             => ipc(window.api.poms.create(data)),
  update:       (id: number, data: any)                 => ipc(window.api.poms.update(id, data)),
  updateStatus: (id: number, status: string, reviewer?: number) =>
                                                          ipc(window.api.poms.updateStatus(id, status as any, reviewer)),
  delete:       (id: number)                            => ipc(window.api.poms.delete(id)),
  approve:      (id: number)                            => ipc(window.api.poms.approve(id)),
}

// ── PomItemService ────────────────────────────────────────────
export const PomItemService = {
  upsert: (pom_id: number, items: any[]) =>
    ipc(window.api.pomItems.upsert(pom_id, items)),
}

// ── UserService ───────────────────────────────────────────────
export const UserService = {
  getAll: ()                                  => window.api.users.getAll(),
  login:  (username: string, password_hash: string) =>
    ipc(window.api.users.login(username, password_hash)),
}

// ── FormTemplateService ───────────────────────────────────────
export const FormTemplateService = {
  getAll:   ()                         => (window as any).api.formTemplates.getAll(),
  getByType:(type: string)             => (window as any).api.formTemplates.getByType(type),
  create:   (data: any)                => ipc((window as any).api.formTemplates.create(data)),
  update:   (id: number, data: any)    => ipc((window as any).api.formTemplates.update(id, data)),
  delete:   (id: number)               => ipc((window as any).api.formTemplates.delete(id)),
  seed:     ()                         => ipc((window as any).api.formTemplates.seed()),
}
