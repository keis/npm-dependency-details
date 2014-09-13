var _ = require('underscore'),
    async = require('async'),
    url = require('url'),
    readInstalled = require('read-installed'),
    RegClient = require('npm-registry-client'),
    npmconf = require('npmconf');

function log() {
    console.log('log', arguments)
}

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
                    return callback(err);
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
    var options = {dev: false, log: log}

    readInstalled(path, options, function (err, localPackageInfo) {
        if (err) {
            return console.error('oh no', err);
        }

        var deps = _.union(Object.keys(localPackageInfo.dependencies),
                           Object.keys(localPackageInfo._dependencies),
                           Object.keys(localPackageInfo.devDependencies));
        fetchPackageInfo(npm, deps, function (err, remotePackageInfo) {
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
                    latest: remote['dist-tags'].latest
                };
            });
            callback(err, versionInfo);
        });
    });
}

function main() {
    var npm = {},
        path;

    path = process.argv[2];

    npmconf.load({}, function (err, config) {
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
