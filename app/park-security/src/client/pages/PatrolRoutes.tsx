import { useCallback, useEffect, useState } from 'react'
import { Button, Form, Input, Modal, Popconfirm, Space, Spin, Table, message } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, ArrowUpOutlined, ArrowDownOutlined, MinusCircleOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import {
  listPatrolRoutes, createPatrolRoute, updatePatrolRoute, deletePatrolRoute,
  reportError, ApiRequestError,
  type PatrolRoute, type PatrolRouteInput,
} from '../platform/api-client'
import { DetailDrawer, DetailField } from '../components/DetailDrawer'
import { Descriptions, List } from 'antd'

interface PointForm {
  key: string
  name: string
  sequence_order: number
}

let pointKeySeq = 0
function newPointKey() { return `pt-${++pointKeySeq}` }

export default function PatrolRoutes() {
  const [routes, setRoutes] = useState<PatrolRoute[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<PatrolRoute | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<PatrolRoute | null>(null)
  const [points, setPoints] = useState<PointForm[]>([])
  const [form] = Form.useForm()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRoutes(await listPatrolRoutes())
    } catch (e) {
      reportError(e, '加载巡逻路线失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  function showDetail(route: PatrolRoute) {
    setSelected(route)
    setDrawerOpen(true)
  }

  function openCreate() {
    setEditing(null)
    setPoints([{ key: newPointKey(), name: '', sequence_order: 1 }])
    form.resetFields()
    setModalOpen(true)
  }

  function openEdit(route: PatrolRoute) {
    setEditing(route)
    setPoints(route.points.map((p) => ({ key: newPointKey(), name: p.name, sequence_order: p.sequenceOrder })))
    form.setFieldsValue({ name: route.name })
    setModalOpen(true)
  }

  function movePoint(index: number, dir: -1 | 1) {
    const target = index + dir
    if (target < 0 || target >= points.length) return
    const next = [...points]
    ;[next[index], next[target]] = [next[target], next[index]]
    resequence(next)
    setPoints(next)
  }

  function removePoint(index: number) {
    const next = points.filter((_, i) => i !== index)
    resequence(next)
    setPoints(next)
  }

  function addPoint() {
    const next = [...points, { key: newPointKey(), name: '', sequence_order: points.length + 1 }]
    setPoints(next)
  }

  function resequence(arr: PointForm[]) {
    arr.forEach((p, i) => { p.sequence_order = i + 1 })
  }

  async function submit(values: { name: string }) {
    const cleanPoints = points.filter((p) => p.name.trim())
    if (!values.name?.trim()) { message.warning('请输入路线名称'); return }
    if (cleanPoints.length === 0) { message.warning('至少需要一个巡逻点位'); return }
    const input: PatrolRouteInput = {
      name: values.name.trim(),
      points: cleanPoints.map((p) => ({ name: p.name.trim(), sequence_order: p.sequence_order })),
    }
    try {
      if (editing) {
        const updated = await updatePatrolRoute(editing.id, input)
        message.success('路线已更新')
        await load()
        if (selected?.id === editing.id) { setSelected(updated); }
      } else {
        await createPatrolRoute(input)
        message.success('路线已创建')
        await load()
      }
      setModalOpen(false)
    } catch (e) {
      reportError(e, '保存路线失败')
    }
  }

  async function onDelete(route: PatrolRoute) {
    try {
      await deletePatrolRoute(route.id)
      message.success('路线已删除')
      if (selected?.id === route.id) { setDrawerOpen(false); setSelected(null) }
      await load()
    } catch (e) {
      reportError(e, '删除路线失败')
    }
  }

  const columns: ColumnsType<PatrolRoute> = [
    { title: '路线名称', dataIndex: 'name', key: 'name' },
    { title: '点位数', key: 'pointCount', width: 90, render: (_, r) => r.points.length },
    { title: '更新时间', dataIndex: 'updatedAt', key: 'updatedAt', width: 180 },
    {
      title: '操作', key: 'action', width: 200,
      render: (_, r) => (
        <Space>
          <Button type="link" size="small" onClick={() => showDetail(r)}>详情</Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>编辑</Button>
          <Popconfirm title="确认删除该路线？" onConfirm={() => onDelete(r)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建巡逻路线</Button>
      </div>
      <Spin spinning={loading}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={routes}
          locale={{ emptyText: '暂无巡逻路线' }}
          onRow={(r) => ({ onClick: () => showDetail(r), style: { cursor: 'pointer' } })}
        />
      </Spin>

      <DetailDrawer open={drawerOpen} title="巡逻路线详情" onClose={() => setDrawerOpen(false)}>
        {selected && (
          <>
            <Descriptions column={1} bordered size="small">
              <DetailField label="路线名称">{selected.name}</DetailField>
              <DetailField label="路线ID">{selected.id}</DetailField>
              <DetailField label="创建时间">{selected.createdAt}</DetailField>
              <DetailField label="更新时间">{selected.updatedAt}</DetailField>
            </Descriptions>
            <h4 style={{ marginTop: 16, marginBottom: 8 }}>巡逻点位（按顺序）</h4>
            <List
              size="small"
              bordered
              dataSource={selected.points}
              renderItem={(p, idx) => (
                <List.Item>
                  <span style={{ color: '#999', marginRight: 8 }}>{idx + 1}.</span> {p.name}
                </List.Item>
              )}
            />
          </>
        )}
      </DetailDrawer>

      <Modal
        open={modalOpen}
        title={editing ? '编辑巡逻路线' : '新建巡逻路线'}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        destroyOnClose
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={submit}>
          <Form.Item name="name" label="路线名称" rules={[{ required: true, message: '请输入路线名称' }]}>
            <Input placeholder="请输入路线名称" />
          </Form.Item>
          <div style={{ marginBottom: 8 }}>
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <span>巡逻点位</span>
              <Button size="small" icon={<PlusOutlined />} onClick={addPoint}>添加点位</Button>
            </Space>
          </div>
          {points.map((p, idx) => (
            <div key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ color: '#999', width: 24 }}>{idx + 1}</span>
              <Input
                placeholder="点位名称"
                value={p.name}
                onChange={(e) => {
                  const next = [...points]; next[idx] = { ...next[idx], name: e.target.value }; setPoints(next)
                }}
                style={{ flex: 1 }}
              />
              <Button size="small" icon={<ArrowUpOutlined />} disabled={idx === 0} onClick={() => movePoint(idx, -1)} />
              <Button size="small" icon={<ArrowDownOutlined />} disabled={idx === points.length - 1} onClick={() => movePoint(idx, 1)} />
              <Button size="small" danger icon={<MinusCircleOutlined />} disabled={points.length === 1} onClick={() => removePoint(idx)} />
            </div>
          ))}
        </Form>
      </Modal>
    </div>
  )
}
