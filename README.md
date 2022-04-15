[![npm version](https://badge.fury.io/js/homebridge-efergy-ego.svg)](https://badge.fury.io/js/homebridge-efergy-ego)
[![License](http://img.shields.io/:license-mit-blue.svg)](http://doge.mit-license.org)

# Homebridge-Efergy-EGO

Efergy EGO is a smart outlet which communicates over WiFi. This [homebridge](https://github.com/nfarina/homebridge) plugin allows control via HomeKit devices.

## Installation

**Please make sure you use Node.js 8 or higher**

Install the plugin:
```npm install -g homebridge-efergy-ego```

Add the platform _EfergyEGO_ to your config.json:
```json
{
  "platforms": [
    {
      "platform": "EfergyEGO",
      "name": "EGO"
    }
  ]
}
```

## Acknowledgement
- [homebridge-broadlink-rm](https://github.com/lprhodes/homebridge-broadlink-rm) for the inspiration

## License

Copyright 2018 by Kobi Meirson. Licensed under MIT.