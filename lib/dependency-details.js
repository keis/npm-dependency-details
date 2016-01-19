var url = require('url')
var union = require('array-union')
var defaults = require('defaults')
var thunkify = require('thunkify')
var readInstalled = thunkify(require('read-installed'))
var RegClient = require('npm-registry-client')
var parallel = require('./thunk-parallel')
var each = require('./thunk-each')
var eachSync = require('util-each')
var waterfall = require('./thunk-waterfall')

function splat (arr) {
  arr = [null].concat(arr)

  return function (callback) {
    callback.apply(undefined, arr)
  }
}

function value (val) {
  return function (callback) {
    callback(null, val)
  }
}

function fetchPackageInfo (npm, deps) {
  function fetch (name) {
    var uri = url.resolve(npm.config.get('registry'), name)

    return function (callback) {
      npm.registry.get(uri, {}, function (err, data) {
        if (err) {
          return callback(err.code === 'E404' ? null : err)
        }
        callback(null, data)
      })
    }
  }

  return waterfall([
    function () {
      return each(deps, fetch)
    },
    function (packages) {
      var packageInfo = {}

      packages.forEach(function (val) {
        if (val) {
          packageInfo[val.name] = val
        }
      })

      return value(packageInfo)
    }
  ])
}

function packageNames (packageInfo, options) {
  return union(
         Object.keys(packageInfo._dependencies || {}),
         options.dev ? Object.keys(packageInfo.devDependencies || {}) : [])
}

function allPackageNames (packageInfo, options) {
  var source = [packageNames(packageInfo, options)]
  var visited = {}

  function inner (packageInfo) {
    visited[packageInfo.path] = true

    eachSync(packageNames(packageInfo, options), function (key) {
      var val = packageInfo.dependencies[key]

      if (val == null) {
        console.warn("not found", key)
        return
      }

      if (val._dependencies) {
        source.push(Object.keys(val._dependencies))
      }

      if (visited[val.path] == null) {
        inner(val)
      }
    })
  }

  inner(packageInfo)
  return union.apply(null, source)
}

function dependencyInfo (packageInfo, remoteInfo, options) {
  var visited = {}

  function inner (packageInfo, packages) {
    var deps = packages || Object.keys(packageInfo.dependencies || {})
    var info = {}

    visited[packageInfo.path] = true

    deps.forEach(function (name) {
      var current = (packageInfo._dependencies || {})[name]
      var currentDev = (packageInfo.devDependencies || {})[name]
      var local = (packageInfo.dependencies || {})[name]
      var remote = remoteInfo[name]

      if (remote == null) { console.log("no remote", name) }

      info[name] = {
        dev: !!currentDev,
        current: current || currentDev,
        installed: local && local.version,
        latest: remote ? remote['dist-tags'].latest : void 0,
        dependencies: !local || visited[local.path] ? {} : inner(local),
        license: packageInfo.license,
        author: packageInfo.author
      }
    })

    return info
  }

  return function (callback) {
    callback(null, inner(packageInfo, packageNames(packageInfo, options)))
  }
}

function investigate (options, path) {
  function log () {
    var log = npm.config.get('log')
    var args = Array.prototype.slice.call(arguments)

    args.unshift('read-installed')
    log.info.apply(log, args)
  }

  defaults(options, {dev: false, log: log})

  var npm = {}
  var config = npm.config = options.config

  npm.registry = new RegClient({
    proxy: {
      http: config.get('proxy'),
      https: config.get('https-proxy'),
      localAddress: config.get('local-address')
    },
    ssl: {
      certificate: config.get('cert'),
      key: config.get('key'),
      ca: config.get('ca'),
      strict: config.get('strict-ssl')
    },
    retry: {
      retries: config.get('fetch-retries'),
      factor: config.get('fetch-retry-factor'),
      minTimeout: config.get('fetch-retry-mintimeout'),
      maxTimeout: config.get('fetch-retry-maxtimeout')
    },
    userAgent: 'npm-dependency-details',
    log: npm.config.get('log'),
    defaultTag: config.get('tag'),
    couchToken: config.get('_token')
  })

  return waterfall([
    function () {
      return readInstalled(path, options)
    },
    function (localPackageInfo) {
      var deps = allPackageNames(localPackageInfo, options)
      return parallel([
        value(localPackageInfo),
        fetchPackageInfo(npm, deps),
        value(options)
      ])
    },
    splat,
    function (packageInfo, remoteInfo) {
      return dependencyInfo(packageInfo, remoteInfo, options)
    }
  ])
}

module.exports = function (options, path, callback) {
  var i = investigate(options, path)

  return callback ? i(callback) : i
}
