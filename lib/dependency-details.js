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

    readInstalled(path, options, function (err, localPackageInfo) {
        if (err) {
            return console.error('oh no', err);
        }

        if (!localPackageInfo.dependencies) {
            localPackageInfo.dependencies = {};
        }

        if (!localPackageInfo._dependencies) {
            localPackageInfo._dependencies = {};
        }

        if (!localPackageInfo.devDependencies) {
            localPackageInfo.devDependencies = {};
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

    return function (fun) {
        callback = fun;
    };
}

module.exports = investigate;
