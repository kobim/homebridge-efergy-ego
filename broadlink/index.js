const EventEmitter = require('events')
const dgram = require('dgram')
const os = require('os')
const { EGO } = require('./device')
const { _checksum } = require('./helpers')

class Broadlink extends EventEmitter {
  constructor() {
    super()
    this.devices = {}
  }

  genDevice(devtype, host, mac, name) {
    if (devtype === 0x271D) {
      return new EGO(host, mac, name)
    }
    return null
  }

  discover(localIP) {
    let address = localIP
    if (!address) {
      const addresses = []
      Object.values(os.networkInterfaces()).forEach(interfaces => {
        interfaces.forEach(addr => {
          if (addr.family === 'IPv4' && !addr.internal) {
            addresses.push(addr.address)
          }
        })
      })
      address = addresses[0]
    }

    const cs = dgram.createSocket({ type: 'udp4', reuseAddr: true })
    cs.on('listening', () => {
      cs.setBroadcast(true)

      const { port } = cs.address()
      const now = new Date()
      const timezone = now.getTimezoneOffset() / -3600

      const packet = Buffer.alloc(0x30, 0)

      const year = now.getYear()
      if (timezone < 0) {
        packet[0x09] = 0xFF + timezone - 1
        packet.fill(0xFF, 0x09, 0x0B)
      } else {
        packet[0x09] = timezone
      }
      packet[0x0C] = year & 0xFF
      packet[0x0D] = year >> 8
      packet[0x0E] = now.getMinutes()
      packet[0x0F] = now.getHours()
      packet[0x10] = year % 100
      packet[0x11] = now.getDay()
      packet[0x12] = now.getDate()
      packet[0x13] = now.getMonth()

      const addressParts = address.split('.')
      packet[0x18] = parseInt(addressParts[0], 10)
      packet[0x19] = parseInt(addressParts[1], 10)
      packet[0x1A] = parseInt(addressParts[2], 10)
      packet[0x1B] = parseInt(addressParts[3], 10)
      packet[0x1C] = port & 0xFF
      packet[0x1D] = port >> 8
      packet[0x26] = 0x06

      const checksum = _checksum(packet)
      packet[0x20] = checksum & 0xFF
      packet[0x21] = checksum >> 8

      cs.sendto(packet, 0, packet.length, 80, '255.255.255.255')
    })

    cs.on('message', (msg, host) => {
      const mac = Buffer.alloc(0x06, 0)
      msg.copy(mac, 0x00, 0x3F)
      msg.copy(mac, 0x01, 0x3E)
      msg.copy(mac, 0x02, 0x3D)
      msg.copy(mac, 0x03, 0x3C)
      msg.copy(mac, 0x04, 0x3B)
      msg.copy(mac, 0x05, 0x3A)

      const nameBuf = Buffer.alloc(0x40, 0)
      let firstNull = -1
      for (let i = 0; i < nameBuf.length; i++) {
        nameBuf[i] = msg[0x40 + i]
        if (firstNull === -1 && nameBuf[i] === 0) {
          firstNull = i
        }
      }
      const name = nameBuf.toString('utf8', 0, firstNull)

      const devtype = msg[0x34] | (msg[0x35] << 8)
      if (!this.devices[mac]) {
        const device = this.genDevice(devtype, host, mac, name)
        if (device) {
          this.devices[mac] = device
          device.on('deviceReady', () => this.emit('deviceReady', device))
          device.auth()
        }
      }
    })

    cs.bind(0, address)
    setTimeout(() => {
      cs.close()
    }, 300)
    return cs
  }
}

module.exports = Broadlink
