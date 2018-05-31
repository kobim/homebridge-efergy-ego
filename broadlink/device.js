const EventEmitter = require('events')
const dgram = require('dgram')
const { createCipheriv, createDecipheriv } = require('crypto')
const { _checksum } = require('./helpers')

const CIPHER = 'aes-128-cbc'

class Device extends EventEmitter {
  static get ACTIVE() {
    return 'active'
  }

  static get INACITVE() {
    return 'inactive'
  }

  static get UNKNOWN() {
    return 'unknown'
  }

  constructor(host, mac, name) {
    super()

    this.host = host
    this.mac = mac
    this.name = name

    this.count = Math.random() * 0xFFFF
    this.key = Buffer.from([0x09, 0x76, 0x28, 0x34, 0x3F, 0xE9, 0x9E, 0x23, 0x76, 0x5C, 0x15, 0x13, 0xAC, 0xCF, 0x8B, 0x02])
    this.iv = Buffer.from([0x56, 0x2E, 0x17, 0x99, 0x6D, 0x09, 0x3D, 0x28, 0xDD, 0xB3, 0xBA, 0x69, 0x5A, 0x2E, 0x6F, 0x58])
    this.id = Buffer.alloc(0x04, 0)

    this.cs = dgram.createSocket({ type: 'udp4', reuseAddr: true })
    this.type = Device.UNKNOWN
    this.model = Device.UNKNOWN
    this.reachability = Device.UNKNOWN

    this.setupSocket()
  }

  setupSocket() {
    this.cs.on('message', response => {
      const encPayload = Buffer.alloc(response.length - 0x38, 0)
      response.copy(encPayload, 0, 0x38)

      const decipher = createDecipheriv(CIPHER, this.key, this.iv)
      decipher.setAutoPadding(false)
      let payload = decipher.update(encPayload)
      const final = decipher.final()
      if (final) {
        payload = Buffer.concat([payload, final])
      }

      if (!payload) {
        return false
      }

      const command = response[0x26]
      const err = response[0x22] | (response[0x23] << 8)
      if (err !== 0) {
        this.emit('error', err, payload)
        return
      }

      if (command === 0xE9) {
        payload.copy(this.key, 0, 0x04, 0x14)
        payload.copy(this.id, 0, 0x00, 0x04)
        this.emit('deviceReady')
      } else if (command === 0xEE) {
        this.emit('payload', payload)
      }
    })

    this.cs.bind()
  }

  exit(cb) {
    setTimeout(() => {
      this.cs.close(cb)
    }, cb ? 50 : 500)
  }

  getType() {
    return this.type
  }

  auth() {
    const payload = Buffer.alloc(0x50, 0)
    payload.fill(0x31, 0x04, 0x12)
    payload[0x1E] = 0x01
    payload[0x2D] = 0x01
    payload.write('Test  1', 0x30, 7)

    this.sendPacket(0x65, payload)
  }

  sendPacket(command, payload) {
    this.count = (this.count + 1) & 0xFFFFF

    let packet = Buffer.alloc(0x38, 0)
    packet[0x00] = 0x5A
    packet[0x01] = 0xA5
    packet[0x02] = 0xAA
    packet[0x03] = 0x55
    packet[0x04] = 0x5A
    packet[0x05] = 0xA5
    packet[0x06] = 0xAA
    packet[0x07] = 0x55
    packet[0x24] = 0x2A
    packet[0x25] = 0x27
    packet[0x26] = command
    packet[0x28] = this.count & 0xFF
    packet[0x29] = this.count >> 8
    this.mac.copy(packet, 0x2A, 0, 0x06)
    this.id.copy(packet, 0x30, 0, 0x04)

    const checksum = _checksum(payload)
    packet[0x34] = checksum & 0xFF
    packet[0x35] = checksum >> 8

    const cipher = createCipheriv(CIPHER, this.key, this.iv)
    packet = Buffer.concat([packet, cipher.update(payload)])
    const allChecksum = _checksum(packet)
    packet[0x20] = allChecksum & 0xFF
    packet[0x21] = allChecksum >> 8

    this.cs.sendto(packet, 0, packet.length, this.host.port, this.host.address)
  }
}

class EGO extends Device {
  constructor(host, mac, name) {
    super(host, mac, name)
    this.type = 'Efergy EGO'
    this.model = 'Outlet'

    this.on('payload', this.onPayload.bind(this))
  }

  onPayload(payload) {
    const param = payload[0]
    if (param === 0x01) {
      const power = payload[0x04]
      this.emit('power', power === '1' || power === '3' || power === 1 || power === 3)
    }
  }

  setPower(state) {
    const payload = this._payload(0x02)
    payload[0x04] = state ? 0x03 : 0x02
    this.sendPacket(0x6A, payload)
  }

  checkPower() {
    const payload = this._payload(0x01)
    this.sendPacket(0x6A, payload)
  }

  _payload(cmd) {
    const payload = Buffer.alloc(0x10, 0)
    payload[0x00] = cmd
    return payload
  }
}

module.exports = {
  Device,
  EGO
}
