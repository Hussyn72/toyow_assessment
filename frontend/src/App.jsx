import { useEffect, useMemo, useState } from 'react'
import ReactFlow, { Background, Controls, MiniMap, addEdge, useEdgesState, useNodesState } from 'reactflow'
import 'reactflow/dist/style.css'
import { api, connectWs, streamRunLogs } from './api'
import './styles.css'

const pluginTypes = ['TEXT_TRANSFORM', 'API_PROXY', 'DATA_AGGREGATOR', 'DELAY', 'IF']

function defaultForType (type) {
  switch (type) {
    case 'TEXT_TRANSFORM':
      return { config: { shift: 3 }, payload: { text: 'hello' } }
    case 'API_PROXY':
      return {
        config: { url: 'https://jsonplaceholder.typicode.com/todos/1', method: 'GET', headers: {}, useCache: true },
        payload: { useCache: true, headers: {} }
      }
    case 'DATA_AGGREGATOR':
      return { config: { includeStepIds: [] }, payload: {} }
    case 'DELAY':
      return { config: { ms: 1000, blocking: true }, payload: {} }
    case 'IF':
      return { config: { sourceStepId: '', path: '', equals: true }, payload: {} }
    default:
      return { config: {}, payload: {} }
  }
}

function toDefinition (nodes, edges) {
  return {
    nodes: nodes.map(n => ({
      id: n.id,
      type: n.data.type,
      config: n.data.config || {},
      payload: n.data.payload || {},
      retry: n.data.retry || { maxRetries: 2, baseBackoffMs: 250 },
      timeoutMs: Number(n.data.timeoutMs || 30000),
      inputMode: n.data.inputMode || 'STATIC',
      inputFromStepId: n.data.inputFromStepId || null
    })),
    edges: edges.map(e => ({
      from: e.source,
      to: e.target,
      condition: e.label === 'true' ? true : e.label === 'false' ? false : null
    }))
  }
}

function fromDefinition (definition) {
  const nodes = (definition?.nodes || []).map((n, i) => ({
    id: n.id,
    position: { x: 120 + (i % 4) * 240, y: 80 + Math.floor(i / 4) * 170 },
    data: {
      type: n.type,
      config: n.config || {},
      payload: n.payload || {},
      retry: n.retry || { maxRetries: 2, baseBackoffMs: 250 },
      timeoutMs: n.timeoutMs || 30000,
      inputMode: n.inputMode || 'STATIC',
      inputFromStepId: n.inputFromStepId || '',
      label: `${n.id} (${n.type})`
    }
  }))
  const edges = (definition?.edges || []).map((e, i) => ({
    id: `e-${i}-${e.from}-${e.to}`,
    source: e.from,
    target: e.to,
    label: e.condition === true ? 'true' : e.condition === false ? 'false' : ''
  }))
  return { nodes, edges }
}

function parseJsonInput (text, fallback = {}) {
  if (!text.trim()) return fallback
  return JSON.parse(text)
}

export default function App () {
  const [token, setToken] = useState(localStorage.getItem('token') || '')
  const [user, setUser] = useState(null)
  const [email, setEmail] = useState('admin@toyow.local')
  const [password, setPassword] = useState('Admin123!')
  const [workflows, setWorkflows] = useState([])
  const [selected, setSelected] = useState(null)
  const [runs, setRuns] = useState([])
  const [activeRun, setActiveRun] = useState('')
  const [logs, setLogs] = useState([])
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [newName, setNewName] = useState('Sample Workflow')
  const [runInputText, setRunInputText] = useState('{\n  "text": "hello"\n}')
  const [selectedNodeId, setSelectedNodeId] = useState('')
  const [selectedEdgeId, setSelectedEdgeId] = useState('')
  const [configText, setConfigText] = useState('{\n}')
  const [payloadText, setPayloadText] = useState('{\n}')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const selectedWorkflow = useMemo(() => workflows.find(w => w.id === selected), [workflows, selected])
  const selectedNode = useMemo(() => nodes.find(n => n.id === selectedNodeId) || null, [nodes, selectedNodeId])

  useEffect(() => {
    if (!selectedNode) return
    setConfigText(JSON.stringify(selectedNode.data.config || {}, null, 2))
    setPayloadText(JSON.stringify(selectedNode.data.payload || {}, null, 2))
  }, [selectedNodeId, selectedNode])

  async function refreshMe () {
    const me = await api('/auth/me', {}, token)
    setUser(me)
  }

  async function refreshWorkflows () {
    const data = await api('/workflows', {}, token)
    setWorkflows(data)
  }

  async function refreshRuns () {
    const data = await api('/runs', {}, token)
    setRuns(data)
  }

  async function loadWorkflow (id) {
    const wf = await api(`/workflows/${id}`, {}, token)
    const latest = wf.versions[0]
    const graph = fromDefinition(latest?.definition || { nodes: [], edges: [] })
    setNodes(graph.nodes)
    setEdges(graph.edges)
    setSelected(id)
    setSelectedNodeId(graph.nodes[0]?.id || '')
    setSelectedEdgeId('')
  }

  useEffect(() => {
    if (!token) return
    refreshMe().catch(() => logout())
    refreshWorkflows().catch((e) => setError(e.message))
    refreshRuns().catch((e) => setError(e.message))
  }, [token])

  useEffect(() => {
    if (!activeRun || !token) return
    setLogs([])
    const offStream = streamRunLogs(activeRun, token, (row) => setLogs(prev => [...prev, row]))
    const offWs = connectWs(activeRun, (row) => setLogs(prev => [...prev, row]))
    return () => {
      offStream()
      offWs()
    }
  }, [activeRun, token])

  async function login (e) {
    e.preventDefault()
    setError('')
    setInfo('')
    try {
      const data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
      localStorage.setItem('token', data.token)
      setToken(data.token)
      setInfo(`Logged in as ${data.user.email}`)
    } catch (err) {
      setError(err.message || 'Login failed')
    }
  }

  function logout () {
    localStorage.removeItem('token')
    setToken('')
    setUser(null)
    setWorkflows([])
    setSelected(null)
    setRuns([])
    setActiveRun('')
    setLogs([])
    setNodes([])
    setEdges([])
    setSelectedNodeId('')
    setSelectedEdgeId('')
  }

  async function createWorkflow () {
    setError('')
    setInfo('')
    const name = newName.trim()
    if (!name) return setError('Workflow name is required.')
    const exists = workflows.some(w => w.name.toLowerCase() === name.toLowerCase())
    if (exists) return setError('Workflow name already exists.')
    try {
      const definition = toDefinition(nodes, edges)
      const row = await api('/workflows', { method: 'POST', body: JSON.stringify({ name, definition }) }, token)
      await refreshWorkflows()
      await loadWorkflow(row.id)
      setInfo('Workflow created.')
    } catch (err) {
      setError(err.message)
    }
  }

  async function deleteWorkflow (id) {
    setError('')
    setInfo('')
    if (!window.confirm('Delete this workflow?')) return
    try {
      await api(`/workflows/${id}`, { method: 'DELETE' }, token)
      if (selected === id) {
        setSelected(null)
        setNodes([])
        setEdges([])
      }
      await refreshWorkflows()
      setInfo('Workflow deleted.')
    } catch (err) {
      setError(err.message)
    }
  }

  async function saveVersion () {
    if (!selectedWorkflow) return
    setError('')
    setInfo('')
    try {
      const definition = toDefinition(nodes, edges)
      await api(`/workflows/${selectedWorkflow.id}`, { method: 'PUT', body: JSON.stringify({ definition }) }, token)
      await refreshWorkflows()
      await loadWorkflow(selectedWorkflow.id)
      setInfo('Workflow version saved.')
    } catch (err) {
      setError(err.message)
    }
  }

  async function startRun () {
    if (!selectedWorkflow) return
    setError('')
    setInfo('')
    try {
      const input = parseJsonInput(runInputText, {})
      const run = await api(`/runs/${selectedWorkflow.id}/start`, { method: 'POST', body: JSON.stringify({ input }) }, token)
      setActiveRun(run.id)
      await refreshRuns()
      setInfo('Run started.')
    } catch (err) {
      setError(err.message.includes('JSON') ? 'Run input must be valid JSON.' : err.message)
    }
  }

  async function runControl (action) {
    if (!activeRun) return
    setError('')
    setInfo('')
    try {
      await api(`/runs/${activeRun}/${action}`, { method: 'POST' }, token)
      await refreshRuns()
      setInfo(`Run ${action} successful.`)
    } catch (err) {
      setError(err.message)
    }
  }

  function addNode () {
    const id = `step_${Date.now()}`
    const defaults = defaultForType('TEXT_TRANSFORM')
    setNodes(prev => [...prev, {
      id,
      position: { x: 150 + prev.length * 35, y: 100 + prev.length * 25 },
      data: {
        label: `${id} (TEXT_TRANSFORM)`,
        type: 'TEXT_TRANSFORM',
        config: defaults.config,
        payload: defaults.payload,
        retry: { maxRetries: 2, baseBackoffMs: 250 },
        timeoutMs: 30000,
        inputMode: 'STATIC',
        inputFromStepId: ''
      }
    }])
    setSelectedNodeId(id)
  }

  function updateNode (id, updater) {
    setNodes(prev => prev.map(n => (n.id === id ? updater(n) : n)))
  }

  function updateNodeType (id, type) {
    const defaults = defaultForType(type)
    updateNode(id, (n) => ({
      ...n,
      data: {
        ...n.data,
        type,
        config: defaults.config,
        payload: defaults.payload,
        label: `${n.id} (${type})`
      }
    }))
  }

  function applyNodeJson () {
    if (!selectedNode) return
    try {
      const nextConfig = parseJsonInput(configText, {})
      const nextPayload = parseJsonInput(payloadText, {})
      updateNode(selectedNode.id, n => ({
        ...n,
        data: { ...n.data, config: nextConfig, payload: nextPayload }
      }))
      setInfo('Node config applied.')
      setError('')
    } catch (err) {
      setError('Node config/payload must be valid JSON.')
    }
  }

  function updateEdgeCondition (value) {
    if (!selectedEdgeId) return
    setEdges(prev => prev.map(e => (e.id === selectedEdgeId ? { ...e, label: value } : e)))
  }

  if (!token) {
    return (
      <div className='min-h-screen grid place-items-center p-6 bg-brand-bg'>
        <form onSubmit={login} className='w-full max-w-md bg-white border border-brand-line rounded-2xl p-7 shadow-soft space-y-3'>
          <h1 className='text-3xl font-semibold tracking-tight'>Toyow Workflow Studio</h1>
          <p className='text-sm text-slate-600'>Sign in and build automation workflows.</p>
          <div className='grid grid-cols-2 gap-2'>
            <button type='button' onClick={() => { setEmail('admin@toyow.local'); setPassword('Admin123!') }}>Use Admin</button>
            <button type='button' onClick={() => { setEmail('user@toyow.local'); setPassword('User123!') }}>Use User</button>
          </div>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder='Email' />
          <input type='password' value={password} onChange={(e) => setPassword(e.target.value)} placeholder='Password' />
          {error && <div className='msg err'>{error}</div>}
          <button type='submit' className='w-full bg-brand-accent text-white border-brand-accent'>Login</button>
        </form>
      </div>
    )
  }

  return (
    <div className='min-h-screen bg-brand-bg'>
      <header className='h-[74px] border-b border-brand-line bg-white px-5 flex items-center justify-between'>
        <div>
          <h2 className='m-0 text-2xl font-semibold tracking-tight'>Classic Workflow Console</h2>
          <p className='m-0 text-slate-600 text-sm'>{user?.email} ({user?.role})</p>
        </div>
        <div className='flex gap-2'>
          <button onClick={refreshWorkflows}>Refresh</button>
          <button onClick={logout} className='danger'>Logout</button>
        </div>
      </header>

      <div className='h-[calc(100vh-74px)] grid grid-cols-[320px_1fr_420px]'>
        <aside className='panel space-y-3'>
          <div>
            <h3>Workflows</h3>
            <div className='inline'>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder='Unique workflow name' />
              <button onClick={createWorkflow}>Create</button>
            </div>
          </div>
          <div className='list'>
            {workflows.map(w => (
              <div key={w.id} className={`wf-row ${selected === w.id ? 'active' : ''}`}>
                <button className='wf-main' onClick={() => loadWorkflow(w.id)}>
                  <span className='truncate max-w-[170px]'>{w.name}</span>
                  <small>v{w.latest_version}</small>
                </button>
                <button className='icon danger' onClick={() => deleteWorkflow(w.id)}>X</button>
              </div>
            ))}
          </div>
          <div className='space-y-2 pt-2 border-t border-brand-line'>
            <h3>Execution</h3>
            <button onClick={addNode}>Add Step</button>
            <button onClick={saveVersion} disabled={!selectedWorkflow}>Save Version</button>
            <textarea
              className='w-full min-h-24 border border-brand-line rounded-[10px] p-2 font-mono text-xs'
              value={runInputText}
              onChange={(e) => setRunInputText(e.target.value)}
              placeholder='Run input JSON'
            />
            <button onClick={startRun} disabled={!selectedWorkflow} className='bg-brand-accent text-white border-brand-accent'>Start Run</button>
          </div>
          {error && <div className='msg err'>{error}</div>}
          {info && <div className='msg ok'>{info}</div>}
        </aside>

        <main className='canvas'>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={(params) => setEdges((eds) => addEdge(params, eds))}
            onNodeClick={(_e, node) => setSelectedNodeId(node.id)}
            onEdgeClick={(_e, edge) => setSelectedEdgeId(edge.id)}
            fitView
          >
            <MiniMap />
            <Controls />
            <Background />
          </ReactFlow>
        </main>

        <section className='logs space-y-3'>
          <div className='border border-brand-line rounded-xl p-3 bg-slate-50'>
            <h3 className='mt-0'>Node Inspector</h3>
            {!selectedNode && <p className='text-sm text-slate-600'>Select a step node to edit configuration.</p>}
            {selectedNode && (
              <div className='space-y-2'>
                <input value={selectedNode.id} disabled />
                <select value={selectedNode.data.type} onChange={(e) => updateNodeType(selectedNode.id, e.target.value)}>
                  {pluginTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <div className='grid grid-cols-2 gap-2'>
                  <input
                    type='number'
                    value={selectedNode.data.timeoutMs || 30000}
                    onChange={(e) => updateNode(selectedNode.id, n => ({ ...n, data: { ...n.data, timeoutMs: Number(e.target.value || 30000) } }))}
                    placeholder='timeoutMs'
                  />
                  <select
                    value={selectedNode.data.inputMode || 'STATIC'}
                    onChange={(e) => updateNode(selectedNode.id, n => ({ ...n, data: { ...n.data, inputMode: e.target.value } }))}
                  >
                    <option value='STATIC'>STATIC</option>
                    <option value='RUN_INPUT'>RUN_INPUT</option>
                    <option value='STEP_OUTPUT'>STEP_OUTPUT</option>
                  </select>
                </div>
                {(selectedNode.data.inputMode === 'STEP_OUTPUT') && (
                  <input
                    value={selectedNode.data.inputFromStepId || ''}
                    onChange={(e) => updateNode(selectedNode.id, n => ({ ...n, data: { ...n.data, inputFromStepId: e.target.value } }))}
                    placeholder='inputFromStepId'
                  />
                )}
                <div className='grid grid-cols-2 gap-2'>
                  <input
                    type='number'
                    value={selectedNode.data.retry?.maxRetries ?? 2}
                    onChange={(e) => updateNode(selectedNode.id, n => ({
                      ...n,
                      data: { ...n.data, retry: { ...(n.data.retry || {}), maxRetries: Number(e.target.value || 0) } }
                    }))}
                    placeholder='maxRetries'
                  />
                  <input
                    type='number'
                    value={selectedNode.data.retry?.baseBackoffMs ?? 250}
                    onChange={(e) => updateNode(selectedNode.id, n => ({
                      ...n,
                      data: { ...n.data, retry: { ...(n.data.retry || {}), baseBackoffMs: Number(e.target.value || 0) } }
                    }))}
                    placeholder='baseBackoffMs'
                  />
                </div>
                <label className='text-xs font-semibold text-slate-600'>Config JSON</label>
                <textarea className='w-full min-h-24 border border-brand-line rounded-[10px] p-2 font-mono text-xs' value={configText} onChange={(e) => setConfigText(e.target.value)} />
                <label className='text-xs font-semibold text-slate-600'>Payload JSON</label>
                <textarea className='w-full min-h-24 border border-brand-line rounded-[10px] p-2 font-mono text-xs' value={payloadText} onChange={(e) => setPayloadText(e.target.value)} />
                <button onClick={applyNodeJson} className='w-full'>Apply Node JSON</button>
              </div>
            )}
          </div>

          <div className='border border-brand-line rounded-xl p-3 bg-slate-50'>
            <h3 className='mt-0'>Branch Condition</h3>
            {!selectedEdgeId && <p className='text-sm text-slate-600'>Select an edge to set IF branch condition.</p>}
            {selectedEdgeId && (
              <select value={(edges.find(e => e.id === selectedEdgeId)?.label || '')} onChange={(e) => updateEdgeCondition(e.target.value)}>
                <option value=''>none</option>
                <option value='true'>true</option>
                <option value='false'>false</option>
              </select>
            )}
          </div>

          <div className='border border-brand-line rounded-xl p-3 bg-white'>
            <h3 className='mt-0'>Runs</h3>
            <div className='runs'>
              {runs.map(r => (
                <button key={r.id} className={activeRun === r.id ? 'active' : ''} onClick={() => setActiveRun(r.id)}>
                  {r.id.slice(0, 8)} - {r.status}
                </button>
              ))}
            </div>
            <div className='grid grid-cols-3 gap-2 mb-2'>
              <button onClick={() => runControl('pause')} disabled={!activeRun}>Pause</button>
              <button onClick={() => runControl('resume')} disabled={!activeRun}>Resume</button>
              <button onClick={() => runControl('cancel')} disabled={!activeRun} className='danger'>Cancel</button>
            </div>
            <div className='log-list max-h-[38vh] overflow-auto'>
              {logs.slice(-400).map((row, i) => (
                <pre key={row.id || `${row.timestamp || 't'}-${row.step_id || 's'}-${i}`}>
                  [{row.level}] {row.step_id} {row.event_type} - {row.message}
                </pre>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
