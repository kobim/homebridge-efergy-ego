const { discoverDevices } = require('./helpers/get-device')
const Device = require('./broadlink/device')

let Accessory
let Service
let Characteristic
let UUIDGen

class EfergyEGO {
  constructor(log, config, homebridge) {
    this.log = log
    this.config = config || {}
    this.homebridge = homebridge

    this.devices = []

    this.homebridge.on('didFinishLaunching', this.discover.bind(this))
  }

  discover() {
    this.log('Discovery started')
    discoverDevices(this.log, this.addDevice.bind(this), true, this.config.deviceDiscoveryTimeout)
  }

  addDevice(device) {
    this.log('Discovered', device)
    const uuid = UUIDGen.generate(device.host.macAddress)
    let accessory
    let isNew = false

    for (let i = 0; i < this.devices.length; i++) {
      if (this.devices[i].UUID === uuid) {
        accessory = this.devices[i]
        this.log(`Attaching the device to an existing accessory: ${accessory.displayName}`)
      }
    }
    if (!accessory) {
      isNew = true
      accessory = new Accessory(device.name, uuid, 7) // Accessory.Categories.OUTLET = 7
      accessory.addService(Service.Outlet, device.name)
    }
    accessory.reachable = true
    device.on('reachability', reachability => {
      accessory.reachable = reachability === Device.ACTIVE
    })
    device.on('power', power => {
      // If power has been changed remotely
      accessory.getService(Service.Outlet)
        .getCharacteristic(Characteristic.On)
        .updateValue(power)
    })

    this.prepareAccessory(accessory, device)

    if (isNew) {
      this.devices.push(accessory)
      this.homebridge.registerPlatformAccessories('homebridge-efergy-ego', 'EfergyEGO', [accessory])
      this.log('Added new accessory:', accessory.displayName)
    }
  }

  configureAccessory(accessory) {
    this.log('Configuring accessory', accessory)
    this.devices.push(accessory)
    accessory.reachable = false
    this.prepareAccessory(accessory)
  }

  prepareAccessory(accessory, device) {
    if (accessory.device) {
      this.log('Attempted to attach a device to an accessory with attached device!')
      return
    }
    accessory.device = device

    if (accessory.configured) {
      return
    }

    accessory.on('identify', (paired, callback) => {
      this.log(`${accessory.displayName} identified!`)
      callback()
    })

    const service = accessory.getService(Service.Outlet)
    service.getCharacteristic(Characteristic.On)
      .on('set', (value, cb) => {
        const accessoryDevice = accessory.device
        if (!accessoryDevice || !accessory.reachable) {
          return cb('Unreachable')
        }
        accessoryDevice.set_power(value)
        return cb()
      })
      .on('get', cb => {
        const accessoryDevice = accessory.device
        if (!accessoryDevice || !accessory.reachable) {
          return cb('Unreachable')
        }
        accessoryDevice.once('power', (power) => {
          cb(null, power)
        })
      })
    accessory.configured = true
  }
}

module.exports = homebridge => {
  /* eslint-disable-next-line func-call-spacing,no-unexpected-multiline */
  ({ Service, Characteristic, uuid: UUIDGen } = homebridge.hap)

  Accessory = homebridge.platformAccessory

  homebridge.registerPlatform('homebridge-efergy-ego', 'EfergyEGO', EfergyEGO, true)
}
