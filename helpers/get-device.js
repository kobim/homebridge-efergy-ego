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
  device.state = Device.UNKNOWN
  setInterval(() => {
    try {
      ping.sys.probe(device.host.address, active => {
        device.check_power() // Will sync the state
        if (!active && device.reachability === Device.ACTIVE) {
          log(`Broadlink RM device at ${device.host.address} (${device.host.macAddress || ''}) is no longer reachable.`)

          device.reachability = Device.INACTIVE
        } else if (active && device.state !== 'active') {
          if (device.state === Device.INACTIVE) {
            log(`Broadlink RM device at ${device.host.address} (${device.host.macAddress || ''}) has been re-discovered.`)
          }

          device.state = Device.ACTIVE
        }
        device.emit('reachability', Device.ACTIVE)
      })
    } catch (err) {}
  }, pingFrequency)
}

const discoveredDevices = {}
let discoverDevicesInterval

const addDevice = (device, cb) => {
  if (!device.isUnitTestDevice && (discoveredDevices[device.host.address] || discoveredDevices[device.host.macAddress])) {
    return
  }

  const isNew = discoveredDevices[device.host.macAddress] === undefined

  discoveredDevices[device.host.address] = device
  discoveredDevices[device.host.macAddress] = device
  if (isNew && cb) {
    cb(device)
  }
}

const discoverDevices = (automatic = true, log, deviceDiscoveryTimeout = 60, addDeviceCb = undefined) => {
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
    const macAddress = macAddressParts.join(':')
    device.host.macAddress = macAddress

    log(`\u001B[35m[INFO]\u001B[0m Discovered ${device.model} (${device.type.toString(16)}) at ${device.host.address} (${device.host.macAddress})`)
    addDevice(device, addDeviceCb)
    startPing(device, log)
  })
}

module.exports = {
  addDevice,
  discoverDevices
}
