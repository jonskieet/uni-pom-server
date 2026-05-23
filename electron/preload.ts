import { contextBridge, ipcRenderer } from 'electron'

const api = {
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
  categories: { getAll: () => ipcRenderer.invoke('categories:getAll') },
  products: {
    getAll:          (filters?)  => ipcRenderer.invoke('products:getAll', filters),
    getById:         (id)        => ipcRenderer.invoke('products:getById', id),
    create:          (data)      => ipcRenderer.invoke('products:create', data),
    update:          (id, data)  => ipcRenderer.invoke('products:update', id, data),
    delete:          (id)        => ipcRenderer.invoke('products:delete', id),
    getPriceHistory: (id)        => ipcRenderer.invoke('products:getPriceHistory', id),
  },
  solutions: { getAll: () => ipcRenderer.invoke('solutions:getAll') },
  poms: {
    getAll:       (filters?)              => ipcRenderer.invoke('poms:getAll', filters),
    getById:      (id)                    => ipcRenderer.invoke('poms:getById', id),
    create:       (data)                  => ipcRenderer.invoke('poms:create', data),
    update:       (id, data)              => ipcRenderer.invoke('poms:update', id, data),
    updateStatus: (id, status, reviewer?) => ipcRenderer.invoke('poms:updateStatus', id, status, reviewer),
    return:       (id, reason)            => ipcRenderer.invoke('poms:return', id, reason),
    approve:      (id)                    => ipcRenderer.invoke('poms:approve', id),
    exportExcel:  (id, isPreview)         => ipcRenderer.invoke('poms:exportExcel', id, isPreview),
    delete:       (id)                    => ipcRenderer.invoke('poms:delete', id),
  },
  pomItems: {
    upsert: (pom_id, items) => ipcRenderer.invoke('pomItems:upsert', pom_id, items),
  },
  users: {
    getAll: ()                        => ipcRenderer.invoke('users:getAll'),
    login:  (username, password_hash) => ipcRenderer.invoke('users:login', username, password_hash),
  },
  survey: {
    getAll:      (filters?: any)            => ipcRenderer.invoke('survey:getAll', filters),
    getById:     (id: number)               => ipcRenderer.invoke('survey:getById', id),
    create:      (data: any)                => ipcRenderer.invoke('survey:create', data),
    update:      (id: number, data: any)    => ipcRenderer.invoke('survey:update', id, data),
    updateItems: (id: number, items: any[]) => ipcRenderer.invoke('survey:updateItems', id, items),
    delete:      (id: number)               => ipcRenderer.invoke('survey:delete', id),
  },
  formTemplates: {
    getAll:    ()                         => ipcRenderer.invoke('formTemplates:getAll'),
    getByType: (type: string)             => ipcRenderer.invoke('formTemplates:getByType', type),
    create:    (data: any)                => ipcRenderer.invoke('formTemplates:create', data),
    update:    (id: number, data: any)    => ipcRenderer.invoke('formTemplates:update', id, data),
    delete:    (id: number)               => ipcRenderer.invoke('formTemplates:delete', id),
    seed:      ()                         => ipcRenderer.invoke('formTemplates:seed'),
  },
}

contextBridge.exposeInMainWorld('api', api)
