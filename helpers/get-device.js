const ping = require('ping')
const Broadlink = require('../broadlink')
const Device = require('../broadlink/device')

const broadlink = new Broadlink()

const delayForDuration = duration => {
  let timerID
  let endTimer

  const promiseFunc = (resolve, reject) => {
    endTimer = reject

    timerID = setTimeout(() => {
      resolve('Timeout Complete')
      this.isCancelled = true
    }, duration * 1000)
  }

  class Timer extends Promise {
    cancel() {
      if (this.isCancelled) {
        return
      }

      clearTimeout(timerID)
      this.isCancelled = true

      endTimer(new Error('Timeout Cancelled'))
    }
  }

  const timer = new Timer(promiseFunc)
  timer.isCancelled = false

  return timer
}

const pingFrequency = 5000

const startPing = (device, log) => {
  device.reachability = Device.UNKNOWN
  setInterval(() => {
    try {
      ping.sys.probe(device.host.address, active => {
        if (!active && device.reachability === Device.ACTIVE) {
          log(`\u001B[35m[INFO]\u001B[0m Efergy EGO device at ${device.host.address} (${device.host.macAddress}) is no longer reachable.`)

          device.reachability = Device.INACTIVE
        } else if (active && device.reachability !== 'active') {
          if (device.reachability === Device.INACTIVE) {
            log(`\u001B[35m[INFO]\u001B[0m Efergy EGO device at ${device.host.address} (${device.host.macAddress}) has been re-discovered.`)
          }

          device.reachability = Device.ACTIVE
        }
        device.emit('reachability', device.reachability)
        if (active) {
          device.check_power() // Sync the device state
        }
      })
    } catch (err) {}
  }, pingFrequency)
}

const discoveredDevices = {}
let discoverDevicesInterval

const addDevice = (device, cb) => {
  if (!device.isUnitTestDevice && discoveredDevices[device.host.macAddress]) {
    return
  }

  const isNew = discoveredDevices[device.host.macAddress] === undefined

  discoveredDevices[device.host.macAddress] = device

  if (isNew && cb) {
    cb(device)
  }
}

const discoverDevices = (log, addDeviceCb, automatic = true, deviceDiscoveryTimeout = 60) => {
  if (automatic) {
    discoverDevicesInterval = setInterval(() => {
      broadlink.discover()
    }, 2000)

    delayForDuration(deviceDiscoveryTimeout).then(() => { // eslint-disable-line promise/prefer-await-to-then
      clearInterval(discoverDevicesInterval)
    })

    broadlink.discover()
  }

  broadlink.on('deviceReady', device => {
    const macAddressParts = device.mac.toString('hex').match(/[\s\S]{1,2}/g) || []
    const macAddress = macAddressParts.join(':').toUpperCase()
    device.host.macAddress = macAddress

    log(`\u001B[35m[INFO]\u001B[0m Discovered ${device.model} (${device.getType()}) at ${device.host.address} (${device.host.macAddress})`)
    addDevice(device, addDeviceCb)
    startPing(device, log)
  })
}

module.exports = {
  addDevice,
  discoverDevices
}
