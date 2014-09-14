var dd = require('./lib/dependency-details'),
    npmconf = require('npmconf');

npmconf.load({}, function (err, config) {
    dd(config, process.argv[2], function (err, details) {
        var key,
            data;

        if (err) {
            return console.error(err);
        }

        for (key in details) {
            data = details[key];
            console.log(key, data.current, data.installed, data.latest, data.dev ? '[DEV]' : '');
        }
    });
});
