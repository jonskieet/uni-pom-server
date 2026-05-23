"use strict";
const electron = require("electron");
const api = {
  window: {
    minimize: () => electron.ipcRenderer.invoke("window:minimize"),
    maximize: () => electron.ipcRenderer.invoke("window:maximize"),
    close: () => electron.ipcRenderer.invoke("window:close"),
    isMaximized: () => electron.ipcRenderer.invoke("window:isMaximized"),
    resetSize: () => electron.ipcRenderer.invoke("window:resetSize")
  },
  brands: {
    getAll: () => electron.ipcRenderer.invoke("brands:getAll"),
    create: (data) => electron.ipcRenderer.invoke("brands:create", data),
    update: (id, data) => electron.ipcRenderer.invoke("brands:update", id, data),
    delete: (id) => electron.ipcRenderer.invoke("brands:delete", id)
  },
  categories: { getAll: () => electron.ipcRenderer.invoke("categories:getAll") },
  products: {
    getAll: (filters) => electron.ipcRenderer.invoke("products:getAll", filters),
    getById: (id) => electron.ipcRenderer.invoke("products:getById", id),
    create: (data) => electron.ipcRenderer.invoke("products:create", data),
    update: (id, data) => electron.ipcRenderer.invoke("products:update", id, data),
    delete: (id) => electron.ipcRenderer.invoke("products:delete", id),
    getPriceHistory: (id) => electron.ipcRenderer.invoke("products:getPriceHistory", id)
  },
  solutions: { getAll: () => electron.ipcRenderer.invoke("solutions:getAll") },
  poms: {
    getAll: (filters) => electron.ipcRenderer.invoke("poms:getAll", filters),
    getById: (id) => electron.ipcRenderer.invoke("poms:getById", id),
    create: (data) => electron.ipcRenderer.invoke("poms:create", data),
    update: (id, data) => electron.ipcRenderer.invoke("poms:update", id, data),
    updateStatus: (id, status, reviewer) => electron.ipcRenderer.invoke("poms:updateStatus", id, status, reviewer),
    return: (id, reason) => electron.ipcRenderer.invoke("poms:return", id, reason),
    approve: (id) => electron.ipcRenderer.invoke("poms:approve", id),
    exportExcel: (id, isPreview) => electron.ipcRenderer.invoke("poms:exportExcel", id, isPreview),
    delete: (id) => electron.ipcRenderer.invoke("poms:delete", id)
  },
  pomItems: {
    upsert: (pom_id, items) => electron.ipcRenderer.invoke("pomItems:upsert", pom_id, items)
  },
  users: {
    getAll: () => electron.ipcRenderer.invoke("users:getAll"),
    login: (username, password_hash) => electron.ipcRenderer.invoke("users:login", username, password_hash)
  },
  survey: {
    getAll: (filters) => electron.ipcRenderer.invoke("survey:getAll", filters),
    getById: (id) => electron.ipcRenderer.invoke("survey:getById", id),
    create: (data) => electron.ipcRenderer.invoke("survey:create", data),
    update: (id, data) => electron.ipcRenderer.invoke("survey:update", id, data),
    updateItems: (id, items) => electron.ipcRenderer.invoke("survey:updateItems", id, items),
    delete: (id) => electron.ipcRenderer.invoke("survey:delete", id)
  }
};
electron.contextBridge.exposeInMainWorld("api", api);
