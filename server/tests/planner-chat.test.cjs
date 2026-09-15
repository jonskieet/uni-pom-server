const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function fixture() {
  let content = 'Hello'
  const db = {
    $queryRaw: async (parts, ...values) => {
      const sql = parts.join('?')
      if (sql.includes('SELECT created_by, assigned_to, plan_id')) return [{ created_by: 1, assigned_to: 2, plan_id: 10 }]
      if (sql.includes('SELECT user_id FROM task_assignees')) return [{ user_id: 3 }]
      if (sql.includes('UNION SELECT user_id FROM plan_members')) return [{ user_id: 4 }, { user_id: 5 }]
      if (sql.includes('SELECT user_id FROM task_comments')) return [{ user_id: 2 }]
      if (sql.includes('INSERT INTO task_comments')) { content = values[2]; return [{ id: 100 }] }
      if (sql.includes('FROM task_comments cm')) return [{ id: 100, user_id: 2, content, full_name: 'Sender' }]
      if (sql.includes('SELECT full_name FROM users')) return [{ full_name: 'Sender' }]
      if (sql.includes('SELECT title FROM tasks')) return [{ title: 'Task' }]
      return []
    },
    $executeRaw: async (parts, ...values) => {
      if (parts.join('?').includes('UPDATE task_comments')) {
        if (values[3] !== 2) return 0
        content = values[0]
      }
      return 1
    },
    notification: { createMany: async () => ({ count: 4 }) },
  }
  class AppError extends Error { constructor(status, message) { super(message); this.status = status } }
  const mod = { exports: {} }
  const source = fs.readFileSync(path.join(__dirname, '../src/controllers/tasks.ts'), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  vm.runInNewContext(compiled, {
    exports: mod.exports, module: mod, global: {}, console,
    require: name => {
      if (name === '@prisma/client') return { PrismaClient: class { constructor() { return db } } }
      if (name.includes('response')) return { successResponse: data => data }
      if (name.includes('errorHandler')) return { AppError, asyncHandler: fn => fn }
      if (name.includes('emailService')) return {}
      throw new Error(`Unexpected import: ${name}`)
    },
  })
  return mod.exports
}
function request(id, role = 'technical', content = 'New message') {
  return { params: { taskId: '9', commentId: '100' }, user: { id, role }, body: { content } }
}
function response() { return { status() { return this }, json(data) { this.data = data } } }

for (const id of [1, 2, 3, 4, 5]) test(`participant ${id} can read chat`, async () => {
  const res = response(); await fixture().getComments(request(id), res)
  assert.equal(res.data[0].id, 100)
})
test('outsider cannot read chat', async () => {
  await assert.rejects(fixture().getComments(request(99), response()), e => e.status === 403)
})
test('admin can read chat', async () => {
  await fixture().getComments(request(99, 'admin'), response())
})
test('sending returns persisted content and sender information', async () => {
  const res = response(); await fixture().addComment(request(2), res)
  assert.equal(res.data.content, 'New message'); assert.equal(res.data.full_name, 'Sender')
})
test('empty or oversized messages are rejected', async () => {
  for (const content of ['', ' '.repeat(5), 'x'.repeat(10001), {}]) {
    await assert.rejects(fixture().addComment(request(2, 'technical', content), response()), e => e.status === 400)
  }
})
test('only author can edit message', async () => {
  const res = response(); await fixture().updateComment(request(2), res)
  assert.equal(res.data.content, 'New message')
  await assert.rejects(fixture().updateComment(request(3), response()), e => e.status === 403)
})
test('only author can delete message', async () => {
  await fixture().deleteComment(request(2), response())
  await assert.rejects(fixture().deleteComment(request(3), response()), e => e.status === 403)
})
