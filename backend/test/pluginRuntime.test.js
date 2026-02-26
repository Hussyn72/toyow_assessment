const { executePlugin } = require('../src/services/pluginRuntime')

describe('plugin runtime', () => {
  test('TEXT_TRANSFORM applies shift+reverse+checksum', async () => {
    const output = await executePlugin('TEXT_TRANSFORM', { text: 'abc' }, { shift: 1 }, { stepOutputs: {}, cache: new Map() })
    expect(output.shifted).toBe('bcd')
    expect(output.reversed).toBe('dcb')
    expect(output.checksum).toHaveLength(64)
  })

  test('DATA_AGGREGATOR builds summary hash map', async () => {
    const output = await executePlugin('DATA_AGGREGATOR', {}, {}, { stepOutputs: { a: { x: 1 } } })
    expect(output.count).toBe(1)
    expect(output.summaryHashMap.a).toHaveLength(64)
  })
})
