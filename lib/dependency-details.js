var _ = require('underscore'),
    async = require('async'),
    url = require('url'),
    readInstalled = require('read-installed'),
    RegClient = require('npm-registry-client');

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

function dependencyInfo(map) {
    var out = {};
    _.each(map, function (val, key) {
        out[key] = packageInfo(val);
    });
    return out;
}

function packageInfo(raw) {
    return {
        name: raw.name,
        version: raw.version,
        installed: dependencyInfo(raw.dependencies),
        dependencies: raw._dependencies || {},
        devDependencies: raw.devDependencies || {}
    };
}

function readLocalePackages(path, options, callback) {
    readInstalled(path, options, function (err, localPackages) {
        if (err) {
            return callback(err);
        }

        callback(null, packageInfo(localPackages));
    });
}

function investigate(config, path, callback) {
    function log() {
        var log = npm.config.get('log'),
            args = Array.prototype.slice.call(arguments);

        args.unshift('read-installed');
        log.info.apply(log, args);
    }

    var npm = {},
        options = {dev: false, log: log}

    npm.config = config;
    npm.registry = new RegClient(config);

    readLocalePackages(path, options, function (err, localPackageInfo) {
        if (err) {
            return callback(err);
        }

        var deps = _.union(Object.keys(localPackageInfo.installed),
                           Object.keys(localPackageInfo.dependencies),
                           Object.keys(localPackageInfo.devDependencies));

        fetchPackageInfo(npm, deps, function (err, remotePackageInfo) {
            if (err) {
                return callback(err);
            }

            var versionInfo = {};
            deps.forEach(function (name) {
                var current = localPackageInfo.dependencies[name],
                    currentDev = localPackageInfo.devDependencies[name],
                    local = localPackageInfo.installed[name] || {},
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

    return function (fun) {
        callback = fun;
    };
}

module.exports = investigate;
