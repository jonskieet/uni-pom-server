type PomStatus = 'draft' | 'submitted' | 'reviewed' | 'exported' | 'pricing_done' | 'revision_tech' | 'sent_to_client' | 'feedback' | 'won' | 'lost'

interface SurveySyncDiff {
  has_changes: boolean
  added: Array<{ pom_item_id: number; product_id: number; product_name: string; quantity: number }>
  removed: Array<{ survey_item_id: number; product_id: number }>
  pom_items_updated_at: string | null
  items_synced_at: string | null
}

interface PriceImportItem {
  model:        string
  price:        number        // raw price từ file
  new_price:    number        // giá sau khi quy đổi chưa VAT
  old_price:    number | null // giá hiện tại trong DB
  vat_rate:     number
  unit?:        string
  confidence:   number
  match_type:   'exact' | 'fuzzy' | 'not_found'
  product_id:   number | null
  product_name: string | null
  brand_name:   string | null
  source_file?: string
  selected?:    boolean       // user chọn để apply
}

declare global {
  interface Window {
    api: {
      window: {
        minimize:    () => void
        maximize:    () => void
        close:       () => void
        isMaximized: () => Promise<boolean>
        resetSize:   () => void
      }
      brands: {
        getAll:  () => Promise<any[]>
        create:  (data: any) => Promise<any>
        update:  (id: number, data: any) => Promise<any>
        delete:  (id: number) => Promise<any>
      }
      categories: {
        getAll:  (params?: any) => Promise<any[]>
        getById: (id: number) => Promise<any>
        create:  (data: any) => Promise<any>
        update:  (id: number, data: any) => Promise<any>
        delete:  (id: number) => Promise<any>
      }
      products: {
        getAll:          (filters?: any) => Promise<any[]>
        getById:         (id: number) => Promise<any>
        create:          (data: any) => Promise<any>
        update:          (id: number, data: any) => Promise<any>
        delete:          (id: number) => Promise<any>
        getPriceHistory: (id: number) => Promise<any[]>
      }
      solutions: {
        getAll:  () => Promise<any[]>
        getById: (id: number) => Promise<any>
        create:  (data: any) => Promise<any>
        update:  (id: number, data: any) => Promise<any>
        delete:  (id: number) => Promise<any>
      }
      poms: {
        getAll:       (filters?: any) => Promise<any[]>
        getById:      (id: number) => Promise<any>
        create:       (data: any) => Promise<any>
        update:       (id: number, data: any) => Promise<any>
        updateStatus: (id: number, status: PomStatus, reviewed_by?: number) => Promise<any>
        return:       (id: number, reason: string) => Promise<any>
        approve:      (id: number) => Promise<any>
        submit:       (id: number) => Promise<any>
        reapprove:    (id: number) => Promise<any>
        price:        (id: number, data: any) => Promise<any>
        sendToClient: (id: number) => Promise<any>
        feedback:     (id: number, note?: string) => Promise<any>
        returnToPrice: (id: number, reason: string) => Promise<any>
        returnToTech:  (id: number, reason: string) => Promise<any>
        close:        (id: number, result: 'won' | 'lost', note?: string) => Promise<any>
        exportExcel:  (id: number, isPreview: boolean) => Promise<any>
        exportBaoGia: (id: number) => Promise<any>
        delete:       (id: number) => Promise<any>
      }
      pomItems: {
        upsert: (pom_id: number, items: any[]) => Promise<any>
      }
      users: {
        getAll:        () => Promise<any[]>
        login:         (username: string, password_hash: string, remember?: boolean) => Promise<any>
        create:        (data: any) => Promise<any>
        update:        (id: number, data: any) => Promise<any>
        updateAvatar:  (id: number, url: string) => Promise<any>
        updateEmail:   (id: number, email: string | null) => Promise<any>
        resetPassword: (id: number, pw: string) => Promise<any>
        delete:        (id: number) => Promise<any>
        getBankInfo:         () => Promise<any>
        saveBankInfo:        (data: any) => Promise<any>
        getBankInfoByUserId: (userId: number) => Promise<any>
      }
      survey: {
        getAll:      (filters?: any) => Promise<any[]>
        getById:     (id: number) => Promise<any>
        create:      (data: any) => Promise<any>
        update:      (id: number, data: any) => Promise<any>
        updateItems: (id: number, items: any[]) => Promise<any>
        exportWord:  (id: number) => Promise<any>
        delete:      (id: number) => Promise<any>
        getSyncDiff: (id: number) => Promise<SurveySyncDiff | { error: string }>
        sync:        (id: number, payload?: { accept_all?: boolean; add_product_ids?: number[]; remove_survey_item_ids?: number[] }) => Promise<any>
        addItem:     (id: number, data: any) => Promise<any>
        updateItem:  (itemId: number, data: any) => Promise<any>
        deleteItem:  (itemId: number) => Promise<any>
        uploadWordFile:   (id: number) => Promise<{ canceled?: boolean; success?: boolean; survey?: any; error?: string }>
        downloadWordFile: (id: number) => Promise<{ success?: boolean; filePath?: string; error?: string }>
        previewWordFile:  (id: number) => Promise<{ html?: string; file_name?: string; warnings?: string[]; error?: string }>
        deleteWordFile:   (id: number) => Promise<any>
      }
      formTemplates: {
        getAll:  (solution_id?: number) => Promise<any[]>
        getById: (id: number) => Promise<any>
        create:  (data: any) => Promise<any>
        update:  (id: number, data: any) => Promise<any>
        delete:  (id: number) => Promise<any>
      }
      pricing: {
        pickFile: () => Promise<{
          cancelled?: boolean
          error?: string
          fileName?: string
          sheetText?: string
        }>
        analyzeFile: (sheetText: string, fileName: string) => Promise<{
          error?: string
          file_name?: string
          vat_rate?: number
          items?: PriceImportItem[]
          ai_notes?: string
        }>
        applyImport: (items: PriceImportItem[]) => Promise<{ succeeded: number; failed: number }>
      }
      auth: {
        restoreToken: (token: string) => Promise<void>
      }
      provinces: {
        getAll: () => Promise<any>
      }
      districts: {
        getAll: (params?: { province_id?: number }) => Promise<any>
      }
      wards: {
        getAll:     (params?: any) => Promise<any>
        getSummary: () => Promise<any>
        getById:    (id: number) => Promise<any>
        create:     (data: any) => Promise<any>
        update:     (id: number, data: any) => Promise<any>
        delete:     (id: number) => Promise<any>
      }
      contacts: {
        getAll:  (params?: any) => Promise<any>
        create:  (data: any) => Promise<any>
        update:  (id: number, data: any) => Promise<any>
        delete:  (id: number) => Promise<any>
      }
      wardActivities: {
        getAll:  (ward_id: number) => Promise<any>
        create:  (data: any) => Promise<any>
      }
      upload: {
        image:       (folder: string, oldUrl?: string) => Promise<any>
        imageBuffer: (folder: string, base64: string, filename: string, mimeType: string, oldUrl?: string) => Promise<any>
      }
      admin: {
        getDashboard:    () => Promise<any>
        getAllPoms:      (filters?: any) => Promise<any[]>
        getPomTimeline:  (pomId: number) => Promise<any>
        getKpi:          (days?: number) => Promise<any>
        getPriceHistory: (params?: any) => Promise<any[]>
      }
      settings: {
        getAll: () => Promise<any>
        get:    (key: string) => Promise<any>
        set:    (key: string, value: any) => Promise<any>
      }
      places: {
        search: (query: string)                      => Promise<any>
        detail: (place_id: string, osm_type?: string) => Promise<any>
      }
      leave: {
        getMy:     (params?: any)              => Promise<any>
        getAll:    (params?: any)              => Promise<any>
        create:    (data: any)                 => Promise<any>
        update:    (id: number, data: any)     => Promise<any>
        cancel:    (id: number)                => Promise<any>
        approve:   (id: number)                => Promise<any>
        reject:    (id: number, note?: string) => Promise<any>
      }
      planner: {
        getPlans:        ()                              => Promise<any>
        createPlan:      (data: any)                     => Promise<any>
        updatePlan:      (id: number, data: any)         => Promise<any>
        deletePlan:      (id: number)                    => Promise<any>
        getPlanMembers:  (planId: number)                => Promise<any>
        addPlanMembers:  (planId: number, userIds: number[]) => Promise<any>
        removePlanMember:(planId: number, userId: number) => Promise<any>
        getBuckets:      (planId: number)                => Promise<any>
        createBucket:    (planId: number, name: string)  => Promise<any>
        updateBucket:    (id: number, name: string)      => Promise<any>
        deleteBucket:    (id: number)                    => Promise<any>
        reorderBuckets:  (data: { plan_id: number; ordered_ids: number[] }) => Promise<any>
        getTasks:        (filters?: any)                 => Promise<any>
        getTask:         (id: number)                    => Promise<any>
        createTask:      (data: any)                     => Promise<any>
        updateTask:      (id: number, data: any)         => Promise<any>
        deleteTask:      (id: number)                    => Promise<any>
        reorderTask:     (id: number, data: any)         => Promise<any>
        copyTask:        (id: number, data?: any)        => Promise<any>
        addChecklist:    (taskId: number, title: string) => Promise<any>
        toggleChecklist: (taskId: number, itemId: number)=> Promise<any>
        updateChecklist: (taskId: number, itemId: number, title: string) => Promise<any>
        deleteChecklist: (taskId: number, itemId: number)=> Promise<any>
        addComment:      (taskId: number, content: string) => Promise<any>
        deleteComment:   (taskId: number, commentId: number) => Promise<any>
        getPlanStats:    (planId: number)                => Promise<any>
        getUsers:        ()                              => Promise<any>
        getMyTasks:      (filters?: any)                 => Promise<any>
      }
    }
  }
}

export {}