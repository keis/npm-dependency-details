var parallel = require('./thunk-parallel')

module.exports = function (arr, fun) {
  return parallel(arr.map(fun))
}
