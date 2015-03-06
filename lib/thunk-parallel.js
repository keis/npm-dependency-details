var parallel = require('run-parallel');

module.exports = function (arr) {
    return function (callback) {
        parallel(arr, callback);
    }
}
