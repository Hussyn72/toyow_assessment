const { sortedTopologicalGroups } = require('../src/utils/graph')

describe('graph utils', () => {
  test('returns deterministic groups', () => {
    const groups = sortedTopologicalGroups(
      [{ id: 'b' }, { id: 'a' }, { id: 'c' }],
      [{ from: 'a', to: 'c' }, { from: 'b', to: 'c' }]
    )
    expect(groups[0]).toEqual(['a', 'b'])
    expect(groups[1]).toEqual(['c'])
  })
})
