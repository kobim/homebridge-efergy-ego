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

  accessories(callback) {
    this.log('yeah')
    callback(this.devices)
  }

  discover() {
    this.log('Discovery started')
    discoverDevices(true, this.log, this.config.deviceDiscoveryTimeout, this.addDevice.bind(this))
  }

  addDevice(device) {
    this.log('Discovered', device)
    const accessoryName = device.name
    const uuid = UUIDGen.generate(accessoryName)
    let accessory
    let isNew = false

    for (let i = 0; i < this.devices.length; i++) {
      if (this.devices[i].UUID === uuid) {
        accessory = this.devices[i]
        this.log('Skipping the discovery of', accessoryName)
      }
    }
    if (!accessory) {
      isNew = true
      accessory = new Accessory(accessoryName, uuid)
      accessory.addService(Service.Outlet, device.name)
    }
    accessory.reachable = true
    accessory.on('identify', (paired, callback) => {
      this.log(accessory.displayName, 'Identify!!!')
      callback()
    })
    const service = accessory.getService(Service.Outlet)
    let fromSet = false
    service.getCharacteristic(Characteristic.On)
      // .removeAllListeners('get').on('get', () => {
      //   console.log('woo hoo', arguments)
      //   if (!accessory.reachable) {
      //     return cb('Not reachable')
      //   }
      //   cb(true);
      // })
      .removeAllListeners('set').on('set', (value, cb) => {
        if (!accessory.reachable) {
          return cb('Not reachable')
        }
        if (!fromSet) {
          device.set_power(value)
        }
        fromSet = false
        cb()
      })
    device.on('power', power => {
      fromSet = true
      service.setCharacteristic(Characteristic.On, power)
    })
    device.on('reachability', reachability => {
      accessory.reachable = reachability === Device.ACTIVE
    })

    if (isNew) {
      this.devices.push(accessory)
      this.homebridge.registerPlatformAccessories('homebridge-efergy-ego', 'EfergyEGO', [accessory])
      this.log('Added new accessory:', accessoryName)
    }
  }

  configureAccessory(accessory) {
    this.log('config accessory', accessory)
    this.devices.push(accessory)
    accessory.reachable = false
    const service = accessory.getService(Service.Outlet)
    service.getCharacteristic(Characteristic.On)
      // .on('get', () => {
      //   return cb('Not reachable')
      // })
      .on('set', (value, cb) => {
        return cb('Not reachable')
      })
  }
}

module.exports = homebridge => {
  /* eslint-disable-next-line func-call-spacing,no-unexpected-multiline */
  ({ Service, Characteristic, uuid: UUIDGen } = homebridge.hap)

  Accessory = homebridge.platformAccessory

  homebridge.registerPlatform('homebridge-efergy-ego', 'EfergyEGO', EfergyEGO, true)
}
