var _ = require('underscore'),
    async = require('async'),
    url = require('url'),
    rapidus = require('rapidus'),
    readInstalled = require('read-installed'),
    RegClient = require('npm-registry-client'),
    npmconf = require('npmconf'),
    npmLogger;

function logFunction(level) {
    return function () {
        var cat = arguments[0],
            args = Array.prototype.slice.call(arguments, 1),
            logger = rapidus.getLogger(cat);

        args.unshift(level);
        logger.log.apply(logger, args);
    };
}

npmLogger = {
    silly: logFunction(1),
    verbose: logFunction('DEBUG'),
    info: logFunction('INFO'),
    warn: logFunction('WARN'),
    error: logFunction('ERROR'),
    silent: logFunction(0),
    http: function () {
        var logger = rapidus.getLogger('http');
        logger.info.apply(logger, arguments);
    }
};

function asyncEachThunk (arr, fun, callback) {
    async.parallel(arr.map(fun), callback);
}

function fetchPackageInfo(npm, deps, callback) {
    var packageInfo = {};

    function getLatestVersion(name) {
        var uri = url.resolve(npm.config.get('registry'), name);

        return function (callback) {
            npm.registry.get(uri, {}, function (err, data) {
                if (err) {
                    return callback(err.code === 'E404' ? null : err);
                }
                packageInfo[name] = data;
                callback();
            });
        };
    }

    asyncEachThunk(deps, getLatestVersion, function (err) {
        callback(err, packageInfo);
    });
}

function investigate(npm, path, callback) {
    function log() {
        var log = npm.config.get('log'),
            args = Array.prototype.slice.call(arguments);

        args.unshift('read-installed');
        log.info.apply(log, args);
    }

    var options = {dev: false, log: log}

    readInstalled(path, options, function (err, localPackageInfo) {
        if (err) {
            return console.error('oh no', err);
        }

        var deps = _.union(Object.keys(localPackageInfo.dependencies),
                           Object.keys(localPackageInfo._dependencies),
                           Object.keys(localPackageInfo.devDependencies));
        fetchPackageInfo(npm, deps, function (err, remotePackageInfo) {
            if (err) {
                console.error('oh no', err);
            }

            var versionInfo = {};
            deps.forEach(function (name) {
                var current = localPackageInfo._dependencies[name],
                    currentDev = localPackageInfo.devDependencies[name],
                    local = localPackageInfo.dependencies[name] || {},
                    remote = remotePackageInfo[name];

                versionInfo[name] = {
                    dev: !!currentDev,
                    current: current || currentDev,
                    installed: local.version,
                    latest: remote ? remote['dist-tags'].latest : void 0
                };
            });
            callback(err, versionInfo);
        });
    });
}

function main() {
    var npm = {},
        path;

    rapidus.getLogger().addSink(require('rapidus/lib/sinks').console());
    path = process.argv[2];

    npmconf.load({log: npmLogger}, function (err, config) {
        if (err) {
            return console.error('oh no', err);
        }

        npm.config = config;
        npm.registry = new RegClient(config);

        investigate(npm, path, function (err, data) {
            console.log(data);
        });
    });
}

main();
