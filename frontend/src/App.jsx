import { useEffect, useMemo, useState } from 'react'
import ReactFlow, { Background, Controls, MiniMap, addEdge, useEdgesState, useNodesState } from 'reactflow'
import 'reactflow/dist/style.css'
import { api, connectWs, streamRunLogs } from './api'
import './styles.css'

const pluginTypes = ['TEXT_TRANSFORM', 'API_PROXY', 'DATA_AGGREGATOR', 'DELAY', 'IF']

function toDefinition (nodes, edges) {
  return {
    nodes: nodes.map(n => ({
      id: n.id,
      type: n.data.type,
      config: n.data.config || {},
      payload: n.data.payload || {}
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
    position: { x: 80 + (i % 4) * 220, y: 50 + Math.floor(i / 4) * 150 },
    data: { type: n.type, config: n.config || {}, payload: n.payload || {}, label: `${n.id} (${n.type})` }
  }))
  const edges = (definition?.edges || []).map((e, i) => ({
    id: `e-${i}-${e.from}-${e.to}`,
    source: e.from,
    target: e.to,
    label: e.condition === true ? 'true' : e.condition === false ? 'false' : ''
  }))
  return { nodes, edges }
}

export default function App () {
  const [token, setToken] = useState(localStorage.getItem('token') || '')
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

  const selectedWorkflow = useMemo(() => workflows.find(w => w.id === selected), [workflows, selected])

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
  }

  useEffect(() => {
    if (!token) return
    refreshWorkflows().catch(() => {})
    refreshRuns().catch(() => {})
  }, [token])

  useEffect(() => {
    if (!activeRun || !token) return
    setLogs([])
    const offStream = streamRunLogs(activeRun, token, row => setLogs(prev => [...prev, row]))
    const offWs = connectWs(activeRun, row => setLogs(prev => [...prev, row]))
    return () => {
      offStream()
      offWs()
    }
  }, [activeRun, token])

  async function login (e) {
    e.preventDefault()
    const data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
    localStorage.setItem('token', data.token)
    setToken(data.token)
  }

  async function createWorkflow () {
    const definition = toDefinition(nodes, edges)
    const row = await api('/workflows', { method: 'POST', body: JSON.stringify({ name: newName, definition }) }, token)
    await refreshWorkflows()
    await loadWorkflow(row.id)
  }

  async function saveVersion () {
    if (!selectedWorkflow) return
    const definition = toDefinition(nodes, edges)
    await api(`/workflows/${selectedWorkflow.id}`, { method: 'PUT', body: JSON.stringify({ definition }) }, token)
    await loadWorkflow(selectedWorkflow.id)
    await refreshWorkflows()
  }

  async function startRun () {
    if (!selectedWorkflow) return
    const run = await api(`/runs/${selectedWorkflow.id}/start`, { method: 'POST', body: JSON.stringify({ input: { text: 'hello' } }) }, token)
    setActiveRun(run.id)
    await refreshRuns()
  }

  function addNode () {
    const id = `step_${Date.now()}`
    setNodes(prev => [...prev, {
      id,
      position: { x: 100 + prev.length * 30, y: 100 + prev.length * 25 },
      data: { label: `${id} (TEXT_TRANSFORM)`, type: 'TEXT_TRANSFORM', config: { shift: 3 }, payload: { text: 'abc' } }
    }])
  }

  function updateNodeType (id, type) {
    setNodes(prev => prev.map(n => n.id === id ? {
      ...n,
      data: { ...n.data, type, label: `${n.id} (${type})` }
    } : n))
  }

  if (!token) {
    return (
      <div className='auth'>
        <form onSubmit={login} className='card'>
          <h1>Toyow Workflow Runtime</h1>
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder='Email' />
          <input type='password' value={password} onChange={e => setPassword(e.target.value)} placeholder='Password' />
          <button type='submit'>Login</button>
        </form>
      </div>
    )
  }

  return (
    <div className='layout'>
      <aside className='panel'>
        <h2>Workflows</h2>
        <input value={newName} onChange={e => setNewName(e.target.value)} />
        <button onClick={createWorkflow}>Create</button>
        {workflows.map(w => (
          <button key={w.id} className={selected === w.id ? 'active' : ''} onClick={() => loadWorkflow(w.id)}>
            {w.name} v{w.latest_version}
          </button>
        ))}
        <h2>Builder</h2>
        <button onClick={addNode}>Add Step</button>
        <button onClick={saveVersion}>Save Version</button>
        <button onClick={startRun}>Start Run</button>
        <h2>Runs</h2>
        {runs.map(r => (
          <button key={r.id} onClick={() => setActiveRun(r.id)}>
            {r.id.slice(0, 8)} {r.status}
          </button>
        ))}
      </aside>

      <main className='canvas'>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={(params) => setEdges((eds) => addEdge(params, eds))}
          fitView
        >
          <MiniMap />
          <Controls />
          <Background />
        </ReactFlow>
        <div className='node-editor'>
          <h3>Node Types</h3>
          {nodes.map(n => (
            <div key={n.id} className='row'>
              <span>{n.id}</span>
              <select value={n.data.type} onChange={e => updateNodeType(n.id, e.target.value)}>
                {pluginTypes.map(t => <option value={t} key={t}>{t}</option>)}
              </select>
            </div>
          ))}
        </div>
      </main>

      <section className='logs'>
        <h2>Live Logs {activeRun ? `(${activeRun.slice(0, 8)})` : ''}</h2>
        <div className='log-list'>
          {logs.slice(-300).map(row => (
            <pre key={row.id || `${row.timestamp}-${Math.random()}`}>
              [{row.level}] {row.step_id} {row.event_type} - {row.message}
            </pre>
          ))}
        </div>
      </section>
    </div>
  )
}
