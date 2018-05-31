const { createCipheriv, createDecipheriv } = require('crypto')
const deviceLib = require('./device')
const { _checksum } = require('./helpers')

const FIRST_KEY = Buffer.from([0x09, 0x76, 0x28, 0x34, 0x3F, 0xE9, 0x9E, 0x23, 0x76, 0x5C, 0x15, 0x13, 0xAC, 0xCF, 0x8B, 0x02])
const FIRST_IV = Buffer.from([0x56, 0x2E, 0x17, 0x99, 0x6D, 0x09, 0x3D, 0x28, 0xDD, 0xB3, 0xBA, 0x69, 0x5A, 0x2E, 0x6F, 0x58])

const enc = (payload, key = FIRST_KEY, iv = FIRST_IV) => {
  const cipher = createCipheriv('aes-128-cbc', key, iv)
  const concat = [cipher.update(payload)]
  const final = cipher.final()
  if (final) {
    concat.push(final)
  }
  return Buffer.concat(concat)
}

const dec = (payload, key = FIRST_KEY, iv = FIRST_IV) => {
  const decipher = createDecipheriv('aes-128-cbc', key, iv)
  decipher.setAutoPadding(false)
  const concat = [decipher.update(payload)]
  const final = decipher.final()
  if (final) {
    concat.push(final)
  }
  return Buffer.concat(concat)
}

describe('Device', () => {
  const { Device } = deviceLib
  const host = {
    address: '127.0.0.1',
    port: 1234
  }
  const mac = Buffer.from([0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF])
  const name = 'Test Device'

  const gen = length => {
    const buffer = Buffer.alloc(length, 0)
    for (let i = 0; i < length; i++) {
      buffer[i] = Math.random() * 0xFFFF
    }
    return buffer
  }

  let device
  beforeEach(() => {
    device = new Device(host, mac, name)
  })

  test('initial values', () => {
    expect(device.host).toEqual(host)
    expect(device.mac).toBe(mac)
    expect(device.name).toBe(name)

    expect(device.key).toEqual(FIRST_KEY)
    expect(device.iv).toEqual(FIRST_IV)
    expect(device.id).toEqual(Buffer.from([0, 0, 0, 0]))

    expect(device.getType()).toBe(Device.UNKNOWN)
    expect(device.reachability).toBe(Device.UNKNOWN)
    expect(device.model).toBe(Device.UNKNOWN)
  })

  describe('sendPacket', () => {
    test('general', done => {
      expect.assertions(6)

      const payload = gen(0x50)
      const command = parseInt(Math.random() * 0xFFFF, 10) & 0xFF

      device.cs.sendto = jest.fn((packet, start, end, port, addr) => { // eslint-disable-line max-params
        expect(packet.length).toEqual(end)
        expect(addr).toBe(host.address)
        expect(port).toBe(host.port)

        expect(packet[0x26]).toBe(command)

        const packetWithoutCS = Buffer.from(packet, 0, packet.length)
        packetWithoutCS[0x20] = 0
        packetWithoutCS[0x21] = 0
        const checksum = _checksum(packetWithoutCS)
        expect(packet[0x20]).toBe(checksum & 0xFF)
        expect(packet[0x21]).toBe(checksum >> 8)

        done()
      })

      device.sendPacket(command, payload)
    })

    test('cipher', done => {
      expect.assertions(3)

      const payload = gen(0x50)
      const checksum = _checksum(payload)

      device.cs.sendto = jest.fn((packet, start, end) => {
        const encPayload = Buffer.alloc(end - 0x38, 0)
        packet.copy(encPayload, 0, 0x38)
        const decPayload = dec(encPayload)
        const withoutFinal = Buffer.alloc(payload.length, 0)
        decPayload.copy(withoutFinal, 0, 0, withoutFinal.length)

        expect(withoutFinal).toEqual(payload)

        expect(packet[0x34]).toBe(checksum & 0xFF)
        expect(packet[0x35]).toBe(checksum >> 8)

        done()
      })

      device.sendPacket(0x01, payload)
    })
  })

  describe('authentication', () => {
    test('payload', done => {
      expect.assertions(3)

      device.sendPacket = jest.fn((cmd, packet) => {
        expect(cmd).toBe(0x65)
        expect(packet.length).toBe(0x50)
        expect(packet.toString('utf8', 0x30, 0x37)).toBe('Test  1')

        done()
      })

      device.auth()
    })

    test('deviceReady', done => {
      expect.assertions(2)

      const authHeader = Buffer.alloc(0x38, 0)
      authHeader[0x26] = 0xE9 // Command

      const newId = gen(0x04)
      const newKey = gen(0x10)
      const authPayload = Buffer.alloc(0x50, 0)
      newId.copy(authPayload, 0, 0, 0x04)
      newKey.copy(authPayload, 0x04, 0, 0x10)

      device.on('deviceReady', () => {
        expect(device.id).toEqual(newId)
        expect(device.key).toEqual(newKey)
        done()
      })

      device.cs.emit('message', Buffer.concat([authHeader, enc(authPayload)]))
    })
  })

  describe('receive', () => {
    test('error', () => {
      const header = Buffer.alloc(0x38, 0)
      header[0x22] = 0xFE // ERR
      header[0x26] = 0xEE // Command
      const payload = Buffer.alloc(0x10, 0)
      payload.write('Hi', 0, 2)

      const errFn = jest.fn(err => {
        expect(err).toBe(0xFE)
      })
      device.on('error', errFn)
      device.cs.emit('message', Buffer.concat([header, enc(payload)]))

      expect(errFn).toHaveBeenCalledTimes(1)
    })
    test('empty payload', () => {
      const header = Buffer.alloc(0x38, 0)
      header[0x26] = 0xEE // Command
      const payload = Buffer.alloc(0x0, 0)

      const errFn = jest.fn()
      device.on('error', errFn)
      device.cs.emit('message', Buffer.concat([header, enc(payload)]))

      expect(errFn).toHaveBeenCalledTimes(0)
    })
    test('on payload', done => {
      expect.assertions(2)

      const header = Buffer.alloc(0x38, 0)
      header[0x26] = 0xEE // Command

      const errFn = jest.fn()
      device.on('error', errFn)

      const payload = Buffer.alloc(0x10, 0)
      payload.write('Hi', 0, 2)

      device.on('payload', recvPayload => {
        expect(recvPayload.toString('utf8', 0, 2)).toEqual('Hi')
        done()
      })

      device.cs.emit('message', Buffer.concat([header, enc(payload)]))
      expect(errFn).toHaveBeenCalledTimes(0)
    })
  })

  describe('session', () => {
    test('connect and receive multiple payloads', done => {
      expect.assertions(4)

      const authHeader = Buffer.alloc(0x38, 0)
      authHeader[0x26] = 0xE9 // Command

      const newId = gen(0x04)
      const newKey = gen(0x10)
      const authPayload = Buffer.alloc(0x50, 0)
      newId.copy(authPayload, 0, 0, 0x04)
      newKey.copy(authPayload, 0x04, 0, 0x10)

      device.on('deviceReady', () => {
        expect(device.id).toEqual(newId)
        expect(device.key).toEqual(newKey)

        const header = Buffer.alloc(0x38, 0)
        header[0x26] = 0xEE

        const successPayload = Buffer.alloc(0x10, 0)
        successPayload.write('SUCCESS', 0)

        device.cs.emit('message', Buffer.concat([header, enc(successPayload, newKey)]))
      })

      const successVerify = jest.fn()
        .mockImplementationOnce(payload => {
          expect(payload.toString('utf8', 0, 7)).toBe('SUCCESS')

          const header = Buffer.alloc(0x38, 0)
          header[0x26] = 0xEE

          const successPayload = Buffer.alloc(0x10, 0)
          successPayload.write('REMARKABLE', 0)

          device.cs.emit('message', Buffer.concat([header, enc(successPayload, newKey)]))
        })
        .mockImplementationOnce(payload => {
          expect(payload.toString('utf8', 0, 10)).toBe('REMARKABLE')
          done()
        })

      device.on('payload', successVerify)

      device.cs.emit('message', Buffer.concat([authHeader, enc(authPayload)]))
    })
  })

  test('exit after 500ms', done => {
    device.cs.on('close', () => {
      device = null // So it won't be closed in the end
      done()
    })
    device.exit()
  })

  afterEach(done => {
    if (!device) {
      return done()
    }
    device.exit(done)
  })
})

describe('EGO', () => {
  const { EGO } = deviceLib
  const host = {
    address: '127.0.0.1',
    port: 2345
  }
  const mac = 'aa:bb:cc:dd:ee:ee'
  const name = 'Test Efergy EGO'

  let device
  beforeEach(() => {
    device = new EGO(host, mac, name)
  })

  test('initial values', () => {
    expect(device.type).toBe('Efergy EGO')
    expect(device.model).toBe('Outlet')
  })

  describe('power', () => {
    test('power on', () => {
      const powerOn = jest.fn()
      device.on('power', powerOn)

      const VARIATIONS = ['1', '3', 1, 3]
      VARIATIONS.forEach(v => {
        const payload = Buffer.alloc(0x10, 0)
        payload[0x00] = 0x01
        payload[0x04] = v

        device.emit('payload', payload)
      })

      expect(powerOn).toHaveBeenCalledTimes(VARIATIONS.length)
      powerOn.mock.calls.forEach(call => {
        expect(call).toEqual([true])
      })
    })
    test('power off', () => {
      const powerOff = jest.fn()
      device.on('power', powerOff)

      const VARIATIONS = [0, '2']
      VARIATIONS.forEach(v => {
        const payload = Buffer.alloc(0x10, 0)
        payload[0x00] = 0x01
        payload[0x04] = v

        device.emit('payload', payload)
      })

      expect(powerOff).toHaveBeenCalledTimes(VARIATIONS.length)
      powerOff.mock.calls.forEach(call => {
        expect(call).toEqual([false])
      })
    })
    test('checkPower', () => {
      device.sendPacket = jest.fn()
        .mockImplementationOnce((cmd, payload) => {
          expect(cmd).toBe(0x6A)
          expect(payload[0x00]).toBe(0x01)
        })

      device.checkPower()
    })
  })

  test('setPower', () => {
    device.sendPacket = jest.fn()
      .mockImplementationOnce((cmd, payload) => {
        expect(cmd).toBe(0x6A)
        expect(payload[0x00]).toBe(0x02)
        expect(payload[0x04]).toBe(0x03)
      })
      .mockImplementationOnce((cmd, payload) => {
        expect(cmd).toBe(0x6A)
        expect(payload[0x00]).toBe(0x02)
        expect(payload[0x04]).toBe(0x02)
      })

    device.setPower(true)
    device.setPower(false)
  })

  test('unknown payload', () => {
    const powerFn = jest.fn()
    device.on('power', powerFn)

    const payload = Buffer.alloc(0x10, 0)
    payload[0x00] = 0xFF

    device.emit('payload', payload)

    expect(powerFn).toHaveBeenCalledTimes(0)
  })

  afterEach(done => {
    device.exit(done)
  })
})
