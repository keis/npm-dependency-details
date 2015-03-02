module.exports = function (tasks) {
    return function (callback) {
        var current = 0

        function done (err) {
            var args = Array.prototype.slice.call(arguments, 1);

            if (err) {
                return callback(err, args);
            }

            if (++current >= tasks.length) {
                callback.apply(undefined, [null].concat(args));
            } else {
                tasks[current].apply(undefined, args)(done);
            }
        }

        tasks[0]()(done);
    }
}
