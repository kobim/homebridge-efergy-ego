const _checksum = payload => payload.reduce((val, cur) => (cur + val) & 0xFFFF, 0xBEAF)

module.exports = {
  _checksum
}
