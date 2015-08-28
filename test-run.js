var dd = require('./lib/dependency-details')
var npmconf = require('npmconf')

function ws (n) {
  var out = ''
  while (n-- > 0) {
    out += ' '
  }
  return out
}

function pad (s, n) {
  s = '' + s
  return s + ws(n - s.length)
}

function outputTable (details, level) {
  var data
  var key
  level = level || 0
  for (key in details) {
    data = details[key]
    console.log(pad(ws(level) + key, 32),
          '\t', pad(data.current, 12),
          '\t', pad(data.installed, 12),
          '\t', pad(data.latest, 12),
          data.dev ? '[DEV]' : '')
    outputTable(data.dependencies, level + 1)
  }
}

npmconf.load({}, function (err, config) {
  var options = {config: config}

  if (err) {
    return console.error(err)
  }

  dd(options, process.argv[2], function (err, details) {
    if (err) {
      return console.error(err)
    }

    outputTable(details)
  })
})
