function sortedTopologicalGroups (nodes, edges) {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  const incoming = new Map()
  const outgoing = new Map()
  for (const node of nodes) {
    incoming.set(node.id, 0)
    outgoing.set(node.id, [])
  }
  for (const e of edges) {
    if (!nodeMap.has(e.from) || !nodeMap.has(e.to)) {
      throw new Error(`Invalid edge ${e.from} -> ${e.to}`)
    }
    incoming.set(e.to, incoming.get(e.to) + 1)
    outgoing.get(e.from).push(e)
  }

  const queue = [...nodes.filter(n => incoming.get(n.id) === 0).map(n => n.id)].sort()
  const groups = []
  let processed = 0
  while (queue.length > 0) {
    const currentGroup = [...queue]
    queue.length = 0
    currentGroup.sort()
    groups.push(currentGroup)
    for (const id of currentGroup) {
      processed++
      for (const edge of outgoing.get(id)) {
        incoming.set(edge.to, incoming.get(edge.to) - 1)
        if (incoming.get(edge.to) === 0) queue.push(edge.to)
      }
    }
  }
  if (processed !== nodes.length) {
    throw new Error('Workflow graph must be a DAG')
  }
  return groups
}

function buildDependencyMap (nodes, edges) {
  const dependencies = new Map(nodes.map(n => [n.id, []]))
  for (const e of edges) {
    dependencies.get(e.to).push(e)
  }
  return dependencies
}

module.exports = { sortedTopologicalGroups, buildDependencyMap }
