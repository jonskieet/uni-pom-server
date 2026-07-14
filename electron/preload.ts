import { contextBridge, ipcRenderer } from 'electron'

const api = {
  planner: {
    // Plans
    getPlans:        ()                              => ipcRenderer.invoke('planner:getPlans'),
    createPlan:      (data: any)                     => ipcRenderer.invoke('planner:createPlan', data),
    updatePlan:      (id: number, data: any)         => ipcRenderer.invoke('planner:updatePlan', id, data),
    deletePlan:      (id: number)                    => ipcRenderer.invoke('planner:deletePlan', id),
    // Plan Members (Team)
    getPlanMembers:  (planId: number)                => ipcRenderer.invoke('planner:getPlanMembers', planId),
    addPlanMembers:  (planId: number, userIds: number[]) => ipcRenderer.invoke('planner:addPlanMembers', planId, userIds),
    removePlanMember:(planId: number, userId: number) => ipcRenderer.invoke('planner:removePlanMember', planId, userId),
    // Buckets
    getBuckets:      (planId: number)                => ipcRenderer.invoke('planner:getBuckets', planId),
    createBucket:    (planId: number, name: string)  => ipcRenderer.invoke('planner:createBucket', planId, name),
    updateBucket:    (id: number, name: string)      => ipcRenderer.invoke('planner:updateBucket', id, name),
    deleteBucket:    (id: number)                    => ipcRenderer.invoke('planner:deleteBucket', id),
    reorderBuckets:  (data: { plan_id: number; ordered_ids: number[] }) => ipcRenderer.invoke('planner:reorderBuckets', data),
    // Tasks
    getTasks:        (filters?: any)                 => ipcRenderer.invoke('planner:getTasks', filters),
    getTask:         (id: number)                    => ipcRenderer.invoke('planner:getTask', id),
    createTask:      (data: any)                     => ipcRenderer.invoke('planner:createTask', data),
    updateTask:      (id: number, data: any)         => ipcRenderer.invoke('planner:updateTask', id, data),
    deleteTask:      (id: number)                    => ipcRenderer.invoke('planner:deleteTask', id),
    reorderTask:     (id: number, data: { bucket_id: number | null; ordered_ids: number[] }) => ipcRenderer.invoke('planner:reorderTask', id, data),
    copyTask:        (id: number, data?: any)        => ipcRenderer.invoke('planner:copyTask', id, data),
    // Checklists
    addChecklist:    (taskId: number, title: string) => ipcRenderer.invoke('planner:addChecklist', taskId, title),
    toggleChecklist: (taskId: number, itemId: number)=> ipcRenderer.invoke('planner:toggleChecklist', taskId, itemId),
    updateChecklist: (taskId: number, itemId: number, title: string) => ipcRenderer.invoke('planner:updateChecklist', taskId, itemId, title),
    deleteChecklist: (taskId: number, itemId: number)=> ipcRenderer.invoke('planner:deleteChecklist', taskId, itemId),
    // Comments
    addComment:      (taskId: number, content: string) => ipcRenderer.invoke('planner:addComment', taskId, content),
    deleteComment:   (taskId: number, commentId: number) => ipcRenderer.invoke('planner:deleteComment', taskId, commentId),
    // Stats
    getPlanStats:    (planId: number)                => ipcRenderer.invoke('planner:getPlanStats', planId),
    // Users picker
    getUsers:        ()                              => ipcRenderer.invoke('planner:getUsers'),
    // My Tasks
    getMyTasks:      (filters?: any)                 => ipcRenderer.invoke('planner:getMyTasks', filters),
  },
  window: {
    minimize:    () => ipcRenderer.invoke('window:minimize'),
    maximize:    () => ipcRenderer.invoke('window:maximize'),
    close:       () => ipcRenderer.invoke('window:close'),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized'),
    resetSize:   () => ipcRenderer.invoke('window:resetSize'),
  },
  brands: {
    getAll:  ()         => ipcRenderer.invoke('brands:getAll'),
    create:  (data)     => ipcRenderer.invoke('brands:create', data),
    update:  (id, data) => ipcRenderer.invoke('brands:update', id, data),
    delete:  (id)       => ipcRenderer.invoke('brands:delete', id),
  },
  categories: {
    getAll:  (params?: any)              => ipcRenderer.invoke('categories:getAll', params),
    getById: (id: number)               => ipcRenderer.invoke('categories:getById', id),
    create:  (data: any)                => ipcRenderer.invoke('categories:create', data),
    update:  (id: number, data: any)    => ipcRenderer.invoke('categories:update', id, data),
    delete:  (id: number)               => ipcRenderer.invoke('categories:delete', id),
  },
  products: {
    getAll:          (filters?)  => ipcRenderer.invoke('products:getAll', filters),
    getById:         (id)        => ipcRenderer.invoke('products:getById', id),
    create:          (data)      => ipcRenderer.invoke('products:create', data),
    update:          (id, data)  => ipcRenderer.invoke('products:update', id, data),
    delete:          (id)        => ipcRenderer.invoke('products:delete', id),
    getPriceHistory: (id)        => ipcRenderer.invoke('products:getPriceHistory', id),
  },
  settings: {
    getAll: ()                        => ipcRenderer.invoke('settings:getAll'),
    get:    (key: string)             => ipcRenderer.invoke('settings:get', key),
    set:    (key: string, value: any) => ipcRenderer.invoke('settings:set', key, value),
  },

  solutions: {
    getAll:  ()                          => ipcRenderer.invoke('solutions:getAll'),
    getById: (id: number)               => ipcRenderer.invoke('solutions:getById', id),
    create:  (data: any)                => ipcRenderer.invoke('solutions:create', data),
    update:  (id: number, data: any)    => ipcRenderer.invoke('solutions:update', id, data),
    delete:  (id: number)               => ipcRenderer.invoke('solutions:delete', id),
  },
  poms: {
    getAll:       (filters?)              => ipcRenderer.invoke('poms:getAll', filters),
    getById:      (id)                    => ipcRenderer.invoke('poms:getById', id),
    create:       (data)                  => ipcRenderer.invoke('poms:create', data),
    update:       (id, data)              => ipcRenderer.invoke('poms:update', id, data),
    updateStatus: (id, status, reviewer?) => ipcRenderer.invoke('poms:updateStatus', id, status, reviewer),
    return:       (id, reason)            => ipcRenderer.invoke('poms:return', id, reason),
    approve:      (id)                    => ipcRenderer.invoke('poms:approve', id),
    exportExcel:  (id, isPreview)         => ipcRenderer.invoke('poms:exportExcel', id, isPreview),
    exportBaoGia: (id)                    => ipcRenderer.invoke('poms:exportBaoGia', id),
    delete:       (id)                    => ipcRenderer.invoke('poms:delete', id),
    // State machine v2
    submit:        (id: number)                                  => ipcRenderer.invoke('poms:submit', id),
    reapprove:     (id: number)                                  => ipcRenderer.invoke('poms:reapprove', id),
    price:         (id: number, data: any)                       => ipcRenderer.invoke('poms:price', id, data),
    sendToClient:  (id: number)                                  => ipcRenderer.invoke('poms:sendToClient', id),
    feedback:      (id: number, note?: string)                   => ipcRenderer.invoke('poms:feedback', id, note),
    returnToPrice: (id: number, reason: string)                  => ipcRenderer.invoke('poms:returnToPrice', id, reason),
    returnToTech:  (id: number, reason: string)                  => ipcRenderer.invoke('poms:returnToTech', id, reason),
    close:         (id: number, result: string, note?: string)   => ipcRenderer.invoke('poms:close', id, result, note),
    resubmitToSale: (id: number)                                 => ipcRenderer.invoke('poms:resubmitToSale', id),
  },
  pomItems: {
    upsert:     (pom_id, items)      => ipcRenderer.invoke('pomItems:upsert', pom_id, items),
    updateItem: (itemId, data)       => ipcRenderer.invoke('pomItems:updateItem', itemId, data),
  },
  users: {
    getAll:        ()                        => ipcRenderer.invoke('users:getAll'),
    login:         (username, password_hash, remember = true) =>
      ipcRenderer.invoke('users:login', username, password_hash, remember),
    create:        (data: any)               => ipcRenderer.invoke('users:create', data),
    update:        (id: number, data: any)   => ipcRenderer.invoke('users:update', id, data),
    updateAvatar:  (id: number, url: string) => ipcRenderer.invoke('users:updateAvatar', id, url),
    updateEmail:   (id: number, email: string | null) => ipcRenderer.invoke('users:updateEmail', id, email),
    resetPassword: (id: number, pw: string)  => ipcRenderer.invoke('users:resetPassword', id, pw),
    delete:        (id: number)              => ipcRenderer.invoke('users:delete', id),
    getBankInfo:         ()                       => ipcRenderer.invoke('users:getBankInfo'),
    saveBankInfo:        (data: any)              => ipcRenderer.invoke('users:saveBankInfo', data),
    getBankInfoByUserId: (userId: number)         => ipcRenderer.invoke('users:getBankInfoByUserId', userId),
  },
  survey: {
    getAll:      (filters?: any)            => ipcRenderer.invoke('survey:getAll', filters),
    getById:     (id: number)               => ipcRenderer.invoke('survey:getById', id),
    create:      (data: any)                => ipcRenderer.invoke('survey:create', data),
    update:      (id: number, data: any)    => ipcRenderer.invoke('survey:update', id, data),
    updateItems: (id: number, items: any[]) => ipcRenderer.invoke('survey:updateItems', id, items),
    delete:      (id: number)               => ipcRenderer.invoke('survey:delete', id),
    exportWord:  (id: number)               => ipcRenderer.invoke('survey:exportWord', id),
    getSyncDiff: (id: number)               => ipcRenderer.invoke('survey:getSyncDiff', id),
    sync:        (id: number, payload?: any) => ipcRenderer.invoke('survey:sync', id, payload),
    addItem:     (id: number, data: any)    => ipcRenderer.invoke('survey:addItem', id, data),
    updateItem:  (itemId: number, data: any)=> ipcRenderer.invoke('survey:updateItem', itemId, data),
    deleteItem:  (itemId: number)           => ipcRenderer.invoke('survey:deleteItem', itemId),
    // File Word upload thẳng (.docx) — thay thế/bổ sung cho điền form online
    uploadWordFile:   (id: number) => ipcRenderer.invoke('survey:uploadWordFile', id),
    downloadWordFile: (id: number) => ipcRenderer.invoke('survey:downloadWordFile', id),
    previewWordFile:  (id: number) => ipcRenderer.invoke('survey:previewWordFile', id),
    deleteWordFile:   (id: number) => ipcRenderer.invoke('survey:deleteWordFile', id),
  },
  formTemplates: {
    getAll:  (solution_id?: number)      => ipcRenderer.invoke('formTemplates:getAll', solution_id),
    getById: (id: number)               => ipcRenderer.invoke('formTemplates:getById', id),
    create:  (data: any)                => ipcRenderer.invoke('formTemplates:create', data),
    update:  (id: number, data: any)    => ipcRenderer.invoke('formTemplates:update', id, data),
    delete:  (id: number)               => ipcRenderer.invoke('formTemplates:delete', id),
  },
  upload: {
    // Mở file dialog → upload Supabase (dùng cho ImageUploader component)
    image: (folder: string, oldUrl?: string) =>
      ipcRenderer.invoke('upload:image', folder, oldUrl),

    // Nhận base64 từ renderer → upload Supabase (dùng cho FormRenderer image fields)
    imageBuffer: (
      folder:   string,
      base64:   string,
      filename: string,
      mimeType: string,
      oldUrl?:  string,
    ) => ipcRenderer.invoke('upload:image-buffer', folder, base64, filename, mimeType, oldUrl),
  },
  gemini: {
    extractPrice: (sheetText: string, fileName: string) =>
      ipcRenderer.invoke('gemini:extractPrice', sheetText, fileName),
  },
  pricing: {
    pickFile:    () =>
      ipcRenderer.invoke('pricing:pickFile'),
    analyzeFile: (sheetText: string, fileName: string) =>
      ipcRenderer.invoke('pricing:analyzeFile', sheetText, fileName),
    applyImport: (items: any[]) =>
      ipcRenderer.invoke('pricing:applyImport', items),
    onStatus: (cb: (payload: { status: string; detail?: string }) => void) => {
      const handler = (_: any, payload: any) => cb(payload)
      ipcRenderer.on('pricing:status', handler)
      return () => ipcRenderer.removeListener('pricing:status', handler)
    },
  },
  productsImport: {
    pickFile:    () =>
      ipcRenderer.invoke('products:importPickFile'),
    analyzeFile: (sheetText: string, fileName: string) =>
      ipcRenderer.invoke('products:importAnalyze', sheetText, fileName),
    applyImport: (items: any[]) =>
      ipcRenderer.invoke('products:importApply', items),
    onStatus: (cb: (payload: { status: string; detail?: string }) => void) => {
      const handler = (_: any, payload: any) => cb(payload)
      ipcRenderer.on('products:importStatus', handler)
      return () => ipcRenderer.removeListener('products:importStatus', handler)
    },
  },
  auth: {
    restoreToken: (token: string) => ipcRenderer.invoke('auth:restoreToken', token),
    // Gọi lúc app khởi động: thử đăng nhập lại bằng session đã lưu từ trước.
    // Trả về user (đã kèm token mới) nếu còn hợp lệ, hoặc null nếu cần đăng nhập lại.
    tryAutoLogin: () => ipcRenderer.invoke('auth:tryAutoLogin'),
    // Xoá session đã lưu (gọi khi người dùng bấm "Đăng xuất")
    logout: () => ipcRenderer.invoke('auth:logout'),
    // Tên đăng nhập được ghi nhớ — điền sẵn vào ô input khi "đăng nhập tự động" tắt
    getRememberedUsername: () => ipcRenderer.invoke('auth:getRememberedUsername'),
  },
  provinces: {
    getAll: () => ipcRenderer.invoke('provinces:getAll'),
  },
  districts: {
    getAll: (params?: any) => ipcRenderer.invoke('districts:getAll', params),
  },
  wards: {
    getAll:     (params?: any)          => ipcRenderer.invoke('wards:getAll', params),
    getSummary: ()                      => ipcRenderer.invoke('wards:getSummary'),
    getById:    (id: number)            => ipcRenderer.invoke('wards:getById', id),
    create:     (data: any)             => ipcRenderer.invoke('wards:create', data),
    update:     (id: number, data: any) => ipcRenderer.invoke('wards:update', id, data),
    delete:     (id: number)            => ipcRenderer.invoke('wards:delete', id),
  },
  contacts: {
    getAll:  (params?: any)             => ipcRenderer.invoke('contacts:getAll', params),
    create:  (data: any)                => ipcRenderer.invoke('contacts:create', data),
    update:  (id: number, data: any)    => ipcRenderer.invoke('contacts:update', id, data),
    delete:  (id: number)               => ipcRenderer.invoke('contacts:delete', id),
  },
  wardActivities: {
    getAll:  (ward_id: number)          => ipcRenderer.invoke('wardActivities:getAll', ward_id),
    create:  (data: any)                => ipcRenderer.invoke('wardActivities:create', data),
  },
  admin: {
    getDashboard:    ()              => ipcRenderer.invoke('admin:getDashboard'),
    getAllPoms:       (filters?: any) => ipcRenderer.invoke('admin:getAllPoms', filters),
    getPomTimeline:  (pomId: number) => ipcRenderer.invoke('admin:getPomTimeline', pomId),
    getKpi:          (days?: number) => ipcRenderer.invoke('admin:getKpi', days),
    getPriceHistory: (params?: any)  => ipcRenderer.invoke('admin:getPriceHistory', params),
  },
  notifications: {
    getAll:          (params?: { unread?: boolean; limit?: number }) => ipcRenderer.invoke('notifications:getAll', params),
    getUnreadCount:  ()              => ipcRenderer.invoke('notifications:getUnreadCount'),
    markAsRead:      (id: number)    => ipcRenderer.invoke('notifications:markAsRead', id),
    markAllAsRead:   ()              => ipcRenderer.invoke('notifications:markAllAsRead'),
    delete:          (id: number)    => ipcRenderer.invoke('notifications:delete', id),
  },
  // ============================================================
// THÊM VÀO TRONG OBJECT `api` CỦA preload.ts
// (ngay trước dòng `contextBridge.exposeInMainWorld(...)`)
// ============================================================

  attendance: {
    checkIn:      (note?: string)         => ipcRenderer.invoke('attendance:checkIn', note),
    checkOut:     (note?: string)         => ipcRenderer.invoke('attendance:checkOut', note),
    getToday:     ()                      => ipcRenderer.invoke('attendance:getToday'),
    getMy:        (params?: any)          => ipcRenderer.invoke('attendance:getMy', params),
    getAll:       (params?: any)          => ipcRenderer.invoke('attendance:getAll', params),
    getStats:     (params?: any)          => ipcRenderer.invoke('attendance:getStats', params),
    exportExcel:  (params?: any)          => ipcRenderer.invoke('attendance:exportExcel', params),
    getWorkWeek:  ()                      => ipcRenderer.invoke('attendance:getWorkWeek'),
    setWorkWeek:  (config: Record<number, string>) => ipcRenderer.invoke('attendance:setWorkWeek', config),
    getWorkHours: ()                      => ipcRenderer.invoke('attendance:getWorkHours'),
    setWorkHours: (payload: { work_start: string; work_end: string }) =>
                                              ipcRenderer.invoke('attendance:setWorkHours', payload),
  },

  leave: {
    getMy:        (params?: any)              => ipcRenderer.invoke('leave:getMy', params),
    getAll:       (params?: any)              => ipcRenderer.invoke('leave:getAll', params),
    create:       (data: any)                 => ipcRenderer.invoke('leave:create', data),
    update:       (id: number, data: any)     => ipcRenderer.invoke('leave:update', id, data),
    cancel:       (id: number)                => ipcRenderer.invoke('leave:cancel', id),
    approve:      (id: number)                => ipcRenderer.invoke('leave:approve', id),
    reject:       (id: number, note?: string) => ipcRenderer.invoke('leave:reject', id, note),
    getMyBalance: (year?: number)             => ipcRenderer.invoke('leave:getMyBalance', year),
    getAllBalances: (year?: number)           => ipcRenderer.invoke('leave:getAllBalances', year),
    setBalance:   (userId: number, year: number, total_days: number) =>
                                                  ipcRenderer.invoke('leave:setBalance', userId, year, total_days),
    recalculateBalances: (year?: number)      => ipcRenderer.invoke('leave:recalculateBalances', year),
  },

  businessTrips: {
    getAllowance:    ()                     => ipcRenderer.invoke('businessTrips:getAllowance'),
    setAllowance:   (amount: number)       => ipcRenderer.invoke('businessTrips:setAllowance', amount),
    getMy:          (params?: any)         => ipcRenderer.invoke('businessTrips:getMy', params),
    getAll:         (params?: any)         => ipcRenderer.invoke('businessTrips:getAll', params),
    getById:        (id: number)           => ipcRenderer.invoke('businessTrips:getById', id),
    create:         (data: any)            => ipcRenderer.invoke('businessTrips:create', data),
    update:         (id: number, data: any)=> ipcRenderer.invoke('businessTrips:update', id, data),
    delete:         (id: number)           => ipcRenderer.invoke('businessTrips:delete', id),
    approve:        (id: number)           => ipcRenderer.invoke('businessTrips:approve', id),
    reject:         (id: number, note?: string) => ipcRenderer.invoke('businessTrips:reject', id, note),
    markPaid:       (id: number)           => ipcRenderer.invoke('businessTrips:markPaid', id),
    exportExcel:    (id: number)           => ipcRenderer.invoke('businessTrips:exportExcel', id),
    exportSummary:  (params?: any)         => ipcRenderer.invoke('businessTrips:exportSummary', params),
  },

  schedule: {
    getAll:  (params: { week_start: string; week_end: string }) => ipcRenderer.invoke('schedule:getAll', params),
    create:  (data: any)                => ipcRenderer.invoke('schedule:create', data),
    update:  (id: number, data: any)    => ipcRenderer.invoke('schedule:update', id, data),
    delete:  (id: number)               => ipcRenderer.invoke('schedule:delete', id),
  },

  places: {
    search:  (query: string)                          => ipcRenderer.invoke('places:search', query),
    detail:  (place_id: string, osm_type?: string)     => ipcRenderer.invoke('places:detail', place_id, osm_type),
  },

  workflows: {
    getAll:          ()                           => ipcRenderer.invoke('workflows:getAll'),
    getById:         (id: number)                => ipcRenderer.invoke('workflows:getById', id),
    create:          (data: any)                 => ipcRenderer.invoke('workflows:create', data),
    update:          (id: number, data: any)     => ipcRenderer.invoke('workflows:update', id, data),
    delete:          (id: number)                => ipcRenderer.invoke('workflows:delete', id),
    getInstances:    ()                          => ipcRenderer.invoke('workflows:getInstances'),
    createInstance:  (data: any)                 => ipcRenderer.invoke('workflows:createInstance', data),
    updateInstance:  (id: number, data: any)     => ipcRenderer.invoke('workflows:updateInstance', id, data),
    getStats:        ()                          => ipcRenderer.invoke('workflows:getStats'),
    getLinked:       ()                          => ipcRenderer.invoke('workflows:getLinked'),
    updateInstanceStep:   (instanceId: number, stepId: number, data: any) => ipcRenderer.invoke('workflows:updateInstanceStep', instanceId, stepId, data),
    getMyProgress:        ()       => ipcRenderer.invoke('workflows:getMyProgress'),
    getAdminOverview:     ()       => ipcRenderer.invoke('workflows:getAdminOverview'),
    transitionPom:        (p: { pomId: number; action: string; note?: string; reason?: string }) =>
                                       ipcRenderer.invoke('workflows:transitionPom', p),
    addConstructionLog:   (p: { pomId: number; log_type: string; title: string; content?: string }) =>
                                       ipcRenderer.invoke('workflows:addConstructionLog', p),
    getConstructionLogs:  (p: { pomId: number }) =>
                                       ipcRenderer.invoke('workflows:getConstructionLogs', p),
  },

  updater: {
    // Chủ động yêu cầu kiểm tra cập nhật (vd: nút "Kiểm tra cập nhật" trong Cài đặt)
    check: () => ipcRenderer.invoke('updater:check'),
    // Người dùng bấm "Cập nhật ngay" sau khi bản mới đã tải xong
    installNow: () => ipcRenderer.invoke('updater:installNow'),
    // Lắng nghe trạng thái cập nhật đẩy từ main process (checking/available/
    // downloading/downloaded/error) — trả về hàm để gỡ listener khi unmount
    onStatus: (cb: (status: any) => void) => {
      const handler = (_: any, status: any) => cb(status)
      ipcRenderer.on('updater:status', handler)
      return () => ipcRenderer.removeListener('updater:status', handler)
    },
  },
}

contextBridge.exposeInMainWorld('api', api)