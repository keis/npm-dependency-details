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
        out[key] = new PackageInfo(val);
    });
    return out;
}

function PackageInfo(raw) {
    this.name = raw.name;
    this.path = raw.path;
    this.version = raw.version;
    this.installed = dependencyInfo(raw.dependencies);
    this.dependencies = raw._dependencies || {};
    this.devDependencies = raw.devDependencies || {};
}

function readLocalePackages(path, options, callback) {
    readInstalled(path, options, function (err, localPackages) {
        if (err) {
            return callback(err);
        }

        callback(null, new PackageInfo(localPackages));
    });
}

function packageNames(packageInfo) {
    return _.union(Object.keys(packageInfo.installed),
                   Object.keys(packageInfo.dependencies),
                   Object.keys(packageInfo.devDependencies));
}

function allPackageNames(packageInfo) {
    var source = [packageNames(packageInfo)];

    function inner(packageInfo) {
        _.each(packageInfo.installed, function (val, key) {
            source.push(Object.keys(val.installed));
            inner(val);
        });
    }

    inner(packageInfo);

    return _.union.apply(null, source);
}

function versionInfo(packageInfo, remoteInfo, packages) {
    var deps = packages || Object.keys(packageInfo.installed),
        info = {};

    deps.forEach(function (name) {
        var current = packageInfo.dependencies[name],
            currentDev = packageInfo.devDependencies[name],
            local = packageInfo.installed[name] || {},
            remote = remoteInfo[name];

        info[name] = {
            dev: !!currentDev,
            current: current || currentDev,
            installed: local.version,
            latest: remote ? remote['dist-tags'].latest : void 0,
            dependencies: versionInfo(local, remoteInfo)
        };
    });

    return info;
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

        var deps = allPackageNames(localPackageInfo),
            localDeps = packageNames(localPackageInfo);

        fetchPackageInfo(npm, deps, function (err, remotePackageInfo) {
            if (err) {
                return callback(err);
            }

            callback(err, versionInfo(localPackageInfo,
                                      remotePackageInfo,
                                      localDeps));
        });
    });

    return function (fun) {
        callback = fun;
    };
}

module.exports = investigate;
