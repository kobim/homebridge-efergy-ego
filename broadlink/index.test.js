const dgram = require('dgram')
const os = require('os')
const { Device } = require('./device')
const Broadlink = require('.')

const getMyIP = () => {
  const addresses = []
  Object.values(os.networkInterfaces()).forEach(interfaces => {
    interfaces.forEach(addr => {
      if (addr.family === 'IPv4' && !addr.internal) {
        addresses.push(addr.address)
      }
    })
  })
  return addresses[0]
}

describe('Broadlink discovery', () => {
  let mockSendto
  let originalSendto

  beforeAll(() => {
    originalSendto = dgram.Socket.prototype.sendto
    mockSendto = jest.fn()
    dgram.Socket.prototype.sendto = mockSendto
  })

  const validateMyIP = (ip, packet) => {
    const addressParts = ip.split('.')
    return packet[0x18] === parseInt(addressParts[0], 10) &&
      packet[0x19] === parseInt(addressParts[1], 10) &&
      packet[0x1A] === parseInt(addressParts[2], 10) &&
      packet[0x1B] === parseInt(addressParts[3], 10)
  }

  test('discovery is being broadcasted', done => {
    expect.assertions(3)

    const myIP = getMyIP()

    mockSendto.mockImplementationOnce((packet, start, end, port, addr) => { // eslint-disable-line max-params
      expect(addr).toBe('255.255.255.255')
      expect(port).toBe(80)
      expect(validateMyIP(myIP, packet)).toBeTruthy()
    })

    const broadlink = new Broadlink()
    const socket = broadlink.discover()
    socket.on('close', done)
  })

  test('discovery with an IP parameter', done => {
    expect.assertions(5)
    const paramIP = '10.20.30.40'

    const addressOriginal = dgram.Socket.prototype.address
    const addressMock = jest.fn().mockImplementation(() => {
      dgram.Socket.prototype.address = addressOriginal
      return { port: 0 }
    })
    dgram.Socket.prototype.address = addressMock

    const bindOriginal = dgram.Socket.prototype.bind
    const bindMock = jest.fn().mockImplementation(function (port, addr) {
      expect(port).toBe(0)
      expect(addr).toBe(paramIP)
      dgram.Socket.prototype.bind = bindOriginal
      bindOriginal.call(this, port, getMyIP())
    })
    dgram.Socket.prototype.bind = bindMock

    mockSendto.mockImplementationOnce((packet, start, end, port, addr) => { // eslint-disable-line max-params
      expect(addr).toBe('255.255.255.255')
      expect(port).toBe(80)
      expect(validateMyIP(paramIP, packet)).toBeTruthy()
    })

    const broadlink = new Broadlink()
    const socket = broadlink.discover(paramIP)
    socket.on('close', done)
  })

  test('deviceReady is emitted with EGO device', done => {
    expect.assertions(4)
    const deviceMac = 'AA:BB:CC:EE:DD:FF'
    const deviceHost = '192.168.1.200'
    const deviceName = 'My Long Name!!!!'
    const macParts = deviceMac.split(':')

    const egoDevice = Buffer.alloc(0x60, 0)
    egoDevice[0x3A] = parseInt(macParts[5], 16)
    egoDevice[0x3B] = parseInt(macParts[4], 16)
    egoDevice[0x3C] = parseInt(macParts[3], 16)
    egoDevice[0x3D] = parseInt(macParts[2], 16)
    egoDevice[0x3E] = parseInt(macParts[1], 16)
    egoDevice[0x3F] = parseInt(macParts[0], 16)
    egoDevice[0x34] = 0x1D
    egoDevice[0x35] = 0x27
    egoDevice.write(deviceName, 0x40)

    const deviceAuthOriginal = Device.prototype.auth
    const deviceAuthMock = jest.fn().mockImplementationOnce(function () {
      Device.prototype.auth = deviceAuthOriginal
      this.emit('deviceReady')
    })
    Device.prototype.auth = deviceAuthMock

    const broadlink = new Broadlink()
    broadlink.on('deviceReady', device => {
      expect(device.getType()).toBe('Efergy EGO')
      const macAddressParts = device.mac.toString('hex').match(/[\s\S]{1,2}/g) || []
      const macAddress = macAddressParts.join(':').toUpperCase()
      expect(macAddress).toBe(deviceMac)
      expect(device.name).toBe(deviceName)
      expect(device.host).toBe(deviceHost)
      device.cs.close(done)
    })
    mockSendto.mockImplementationOnce(function () {
      this.emit('message', egoDevice, deviceHost)
    })
    broadlink.discover()
  })

  test('deviceReady isn\'t emitted for unknown device', done => {
    expect.assertions(1)
    const deviceHost = '192.168.1.200'
    const deviceName = 'My Long Name!!!!'

    const egoDevice = Buffer.alloc(0x60, 0)
    egoDevice[0x34] = 0x1D
    egoDevice[0x35] = 0x33
    egoDevice.write(deviceName, 0x40)

    const broadlink = new Broadlink()
    const deviceReady = jest.fn()
    broadlink.on('deviceReady', deviceReady)
    mockSendto.mockImplementationOnce(function () {
      this.emit('message', egoDevice, deviceHost)
      expect(deviceReady).toHaveBeenCalledTimes(0)
    })
    const socket = broadlink.discover()
    socket.on('close', done)
  })

  afterAll(() => {
    dgram.Socket.prototype.sendto = originalSendto
  })
})
