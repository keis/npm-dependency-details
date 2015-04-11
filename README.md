# npm-dependency-details

Gather details of dependencies of a package. Lets you know if any package is
out of date.

## Usage

    var npmConfig = {} // opts for the npm registry client
    require('npm-dependency-details')({config: npmConfig}, '/path/to/project', function (err, data) {
        // do stuff with data
    }
