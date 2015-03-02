var _ = require('underscore'),
    url = require('url'),
    readInstalled = require('read-installed'),
    RegClient = require('npm-registry-client'),
    each = require('./thunk-each'),
    waterfall = require('./thunk-waterfall');

function fetchPackageInfo(npm, deps) {
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

    return waterfall([
        function () {
            return each(deps, getLatestVersion);
        },
        function () {
            return function (callback) {
                callback(null, packageInfo);
            }
        }
    ]);
}

function dependencyInfo(pcache, map) {
    var out = {},
        info;

    _.each(map, function (val, key) {
        out[key] = pcache[val.path] || new PackageInfo(pcache, val);
    });

    return out;
}

function PackageInfo(pcache, raw) {
    pcache[raw.path] = this;

    this.name = raw.name;
    this.path = raw.path;
    this.version = raw.version;
    this.installed = dependencyInfo(pcache, raw.dependencies);
    this.dependencies = raw._dependencies || {};
    this.devDependencies = raw.devDependencies || {};
}

function readLocalPackages(path, options) {
    var pcache = {};

    return function (callback) {
        readInstalled(path, options, function (err, localPackages) {
            if (err) {
                return callback(err);
            }

            callback(null, new PackageInfo(pcache, localPackages));
        });
    };
}

function packageNames(packageInfo) {
    return _.union(Object.keys(packageInfo.installed),
                   Object.keys(packageInfo.dependencies),
                   Object.keys(packageInfo.devDependencies));
}

function allPackageNames(packageInfo) {
    var source = [packageNames(packageInfo)],
        visited = {};

    function inner(packageInfo) {
        visited[packageInfo.path] = true;

        _.each(packageInfo.installed, function (val, key) {
            source.push(Object.keys(val.installed));
            if (visited[val.path] == void 0) {
                inner(val);
            }
        });
    }

    inner(packageInfo);

    return _.union.apply(null, source);
}

function versionInfo(packageInfo, remoteInfo) {
    var visited = {};

    function inner(packageInfo, packages) {
        var deps = packages || Object.keys(packageInfo.installed),
            info = {};

        visited[packageInfo.path] = true;

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
                dependencies: visited[local.path] ? {} : inner(local)
            };
        });

        return info;
    }

    return function (callback) {
        callback(null, inner(packageInfo, packageNames(packageInfo)));
    }
}

function investigate(options, path) {
    function log() {
        var log = npm.config.get('log'),
            args = Array.prototype.slice.call(arguments);

        args.unshift('read-installed');
        log.info.apply(log, args);
    }

    var npm = {};

    _.defaults(options, {dev: false, log: log});

    npm.config = options.config;
    npm.registry = new RegClient(npm.config);

    return waterfall([
        function () {
            return readLocalPackages(path, options);
        },
        function (localPackageInfo) {
            var deps = allPackageNames(localPackageInfo);

            return waterfall([
                function () {
                    return fetchPackageInfo(npm, deps);
                },
                function (remotePackageInfo) {
                    return function (callback) {
                        callback(null, localPackageInfo, remotePackageInfo);
                    }
                }
            ]);
        },
        versionInfo
    ]);
}

module.exports = function (options, path, callback) {
    var i = investigate(options, path);

    return callback ? i(callback) : i;
}
