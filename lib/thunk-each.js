var parallel = require('run-parallel');

module.exports = function (arr, fun) {
    return function (callback) {
        parallel(arr.map(fun), callback);
    }
}
