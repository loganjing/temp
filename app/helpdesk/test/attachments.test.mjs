// 附件行为测试：草稿暂存与隐私（§3.2/§12）、工单附件与对象级下载可见性、
// multipart 校验与 10MB 上限（413 FILE_TOO_LARGE）。
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createSubmittedTicket,
  jsonCall,
  loginAs,
  multipartCall,
  seedScenario,
  withIsolatedPlatform,
} from './api-helpers.mjs'

function textFile(name, content) {
  return new File([content], name, { type: 'text/plain' })
}

test('草稿暂存：创建人可下载，其他提交人 404', async () => {
  await withIsolatedPlatform({}, async ({ platform, app }) => {
    await seedScenario(platform.db)
    const requester = await loginAs(app, 'requester@corp.test')
    const requester2 = await loginAs(app, 'other-requester@corp.test')

    const form = new FormData()
    form.append('file', textFile('hello.txt', 'hello attachment'))
    const upload = await multipartCall(app, '/api/attachments', { token: requester, form })
    assert.equal(upload.status, 201)
    assert.ok(upload.json.id)
    assert.equal(upload.json.fileName, 'hello.txt')
    assert.equal(upload.json.sizeBytes, 'hello attachment'.length)

    const download = await jsonCall(app, 'GET', `/api/attachments/${upload.json.id}/download`, { token: requester })
    assert.equal(download.status, 200)
    assert.equal(download.text, 'hello attachment')
    assert.ok((download.headers.get('content-disposition') ?? '').includes('hello.txt'))

    const stranger = await jsonCall(app, 'GET', `/api/attachments/${upload.json.id}/download`, { token: requester2 })
    assert.equal(stranger.status, 404)
    assert.equal(stranger.json.error.code, 'NOT_FOUND')
  })
})

test('工单附件：请求人可传，处理人可下载，无关人员 404', async () => {
  await withIsolatedPlatform({}, async ({ platform, app }) => {
    await seedScenario(platform.db)
    const requester = await loginAs(app, 'requester@corp.test')
    const requester2 = await loginAs(app, 'other-requester@corp.test')
    const agentA1 = await loginAs(app, 'agent-a1@corp.test')
    const agentX = await loginAs(app, 'agent-x@corp.test')
    const { id } = await createSubmittedTicket(app, requester, { key: 'attach-1' })

    const form = new FormData()
    form.append('file', textFile('evidence.txt', 'ticket attachment'))
    form.append('ticketId', String(id))
    const upload = await multipartCall(app, '/api/attachments', { token: requester, form })
    assert.equal(upload.status, 201)

    const agentDownload = await jsonCall(app, 'GET', `/api/attachments/${upload.json.id}/download`, { token: agentA1 })
    assert.equal(agentDownload.status, 200)
    assert.equal(agentDownload.text, 'ticket attachment')

    const strangerDownload = await jsonCall(app, 'GET', `/api/attachments/${upload.json.id}/download`, { token: agentX })
    assert.equal(strangerDownload.status, 404)

    const strangerUploadForm = new FormData()
    strangerUploadForm.append('file', textFile('evil.txt', 'evil'))
    strangerUploadForm.append('ticketId', String(id))
    const strangerUpload = await multipartCall(app, '/api/attachments', { token: requester2, form: strangerUploadForm })
    assert.equal(strangerUpload.status, 404)
  })
})

test('上传校验：非 multipart/缺文件/非法 ticketId/未知工单/超限', async () => {
  await withIsolatedPlatform({}, async ({ platform, app }) => {
    await seedScenario(platform.db)
    const requester = await loginAs(app, 'requester@corp.test')
    const { id } = await createSubmittedTicket(app, requester, { key: 'attach-validate-1' })

    const jsonUpload = await jsonCall(app, 'POST', '/api/attachments', { token: requester, body: { file: 'x' } })
    assert.equal(jsonUpload.status, 422)
    assert.ok(jsonUpload.json.error.details.fields.includes('file'))

    const emptyForm = new FormData()
    const missingFile = await multipartCall(app, '/api/attachments', { token: requester, form: emptyForm })
    assert.equal(missingFile.status, 422)
    assert.ok(missingFile.json.error.details.fields.includes('file'))

    const badTicketForm = new FormData()
    badTicketForm.append('file', textFile('x.txt', 'x'))
    badTicketForm.append('ticketId', 'abc')
    const badTicket = await multipartCall(app, '/api/attachments', { token: requester, form: badTicketForm })
    assert.equal(badTicket.status, 422)
    assert.ok(badTicket.json.error.details.fields.includes('ticketId'))

    const unknownForm = new FormData()
    unknownForm.append('file', textFile('x.txt', 'x'))
    unknownForm.append('ticketId', '999999')
    const unknownTicket = await multipartCall(app, '/api/attachments', { token: requester, form: unknownForm })
    assert.equal(unknownTicket.status, 404)

    const bigForm = new FormData()
    bigForm.append('file', new File([Buffer.alloc(10 * 1024 * 1024 + 1)], 'big.bin', { type: 'application/octet-stream' }))
    bigForm.append('ticketId', String(id))
    const tooLarge = await multipartCall(app, '/api/attachments', { token: requester, form: bigForm })
    assert.equal(tooLarge.status, 413)
    assert.equal(tooLarge.json.error.code, 'FILE_TOO_LARGE')
  })
})
