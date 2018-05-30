const helpers = require('./helpers')

describe('_checksum function', () => {
  const { _checksum } = helpers

  test('empty payload', () => {
    expect(_checksum(Buffer.alloc(0, 0))).toBe(0xBEAF)
  })

  test('works', () => {
    const payload = Buffer.from([0x01, 0x02, 0x03])

    expect(_checksum(payload)).toBe(48821)
  })
})
