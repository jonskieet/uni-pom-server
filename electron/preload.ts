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
    delete:       (id)                    => ipcRenderer.invoke('poms:delete', id),
  },
  pomItems: {
    upsert: (pom_id, items) => ipcRenderer.invoke('pomItems:upsert', pom_id, items),
  },
  users: {
    getAll:        ()                        => ipcRenderer.invoke('users:getAll'),
    login:         (username, password_hash) => ipcRenderer.invoke('users:login', username, password_hash),
    create:        (data: any)               => ipcRenderer.invoke('users:create', data),
    update:        (id: number, data: any)   => ipcRenderer.invoke('users:update', id, data),
    updateAvatar:  (id: number, url: string) => ipcRenderer.invoke('users:updateAvatar', id, url),
    resetPassword: (id: number, pw: string)  => ipcRenderer.invoke('users:resetPassword', id, pw),
    delete:        (id: number)              => ipcRenderer.invoke('users:delete', id),
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
    getAll:  (solution_id?: number)      => ipcRenderer.invoke('formTemplates:getAll', solution_id),
    getById: (id: number)               => ipcRenderer.invoke('formTemplates:getById', id),
    create:  (data: any)                => ipcRenderer.invoke('formTemplates:create', data),
    update:  (id: number, data: any)    => ipcRenderer.invoke('formTemplates:update', id, data),
    delete:  (id: number)               => ipcRenderer.invoke('formTemplates:delete', id),
  },
  upload: {
    image:       (folder: string, oldUrl?: string) => ipcRenderer.invoke('upload:image', folder, oldUrl),
    imageBase64: (folder: string, base64: string, mimeType: string, oldUrl?: string) =>
      ipcRenderer.invoke('upload:imageBase64', folder, base64, mimeType, oldUrl),
  },
}

contextBridge.exposeInMainWorld('api', api)
