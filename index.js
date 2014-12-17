var fs = require('fs-extra');
var path = require('path');
var semver = require('semver');
var Crawler = require('crawler');

var outputDir = './';

var startUrl = 'https://developers.google.com/speed/libraries/devguide';
var libUrlPrefix = 'http://ajax.googleapis.com/ajax/libs/';

var libFilter = {
  jquery: '>=1.6.4'
};

var requestCount = 0;
var fileCount = 0;

var libPaths = {
  'angularjs': 'angularjs/{{version}}/MANIFEST', 
  'angularmaterial': 'angular_material/{{version}}/MANIFEST',
  'dojo': 'dojo/{{version}}/dojo/dojo.js',
  'ext-core': 'ext-core/{{version}}/MANIFEST',
  'jquery': 'jquery/{{version}}/MANIFEST',
  'jquery-mobile': 'jquerymobile/{{version}}/MANIFEST',
  'jquery-ui': 'jqueryui/{{version}}/MANIFEST',
  'mootools': 'mootools/{{version}}/MANIFEST',
  'prototype': 'prototype/{{version}}/prototype.js',
  'scriptaculous': 'scriptaculous/{{version}}/MANIFEST',
  'spf': 'spf/{{version}}/MANIFEST',
  'swfobject': 'swfobject/{{version}}/MANIFEST',
  'threejs': 'threejs/{{version}}/MANIFEST',
  'webfont': 'webfont/{{version}}/MANIFEST'
};

var createLibUrls = function(name, versions, urlPrefix) {
  var urls = [];

  if (libFilter && !libFilter[name]) return urls;

  urlPrefix = urlPrefix || '';

  if (libFilter && libFilter[name]) {
    versions = versions.filter(function(version) {
      return semver.satisfies(version, libFilter[name]);
    });
  }

  versions.forEach(function(version) {
    urls.push(urlPrefix + libPaths[name].replace('{{version}}', version));
  });

  return urls;
}

var removeExists = function(libUrls) {
  return libUrls.filter(function(libUrl) {
    var filePath = path.join(outputDir, libUrl.replace(/.*\/\/.*?\//, ''));
    if (fs.existsSync(filePath)) {
      return false;
    } else {
      return true;
    }
  });
}

var c = new Crawler({
  maxConnections: 20,
  callback: function(err, result, $) {
    if (err) throw err;
    
    var request = result.request;

    var libs = {};
    var libUrls = [];
    var contentType = result.headers['content-type'];

    console.log(requestCount);
    console.log(request.path);
    console.log(contentType);
    if (contentType.indexOf('text/html') > -1) {
      var $libDivs = $('#gc-content div[itemprop="articleBody"] > div');
      
      $libDivs.each(function(index, libDiv) {
        var $libDiv = $(libDiv);
        var libname = $libDiv.attr('id');
        var versions = $libDiv.find('span.versions').eq(0).html()
                              .replace(/\s+/g, '').split(',');

        libs[libname] = versions;
      });

      for (var lib in libs) {
        if (libs.hasOwnProperty(lib)) {
          libUrls = libUrls.concat(createLibUrls(lib, libs[lib], libUrlPrefix));
        }
      }

      libUrls = removeExists(libUrls);
      requestCount += libUrls.length;

      c.queue(libUrls);

    } else if (path.basename(request.path) === 'MANIFEST') {

      var manifestPaths = result.body.trim().split('\n').map(function(item) {
        return item.slice(0, item.indexOf(' ') > -1 ? item.indexOf(' ') : item.length);
      });

      var fileUrls = manifestPaths.map(function(path) {
        return request.href.slice(0, request.href.lastIndexOf('/') + 1) + path;
      });

      fileUrls = removeExists(fileUrls);
      requestCount += fileUrls.length;

      c.queue(fileUrls);

    } else if (contentType.indexOf('application/javascript') === -1) {

      var filePath = path.join(outputDir, request.path);

      fs.ensureDir(path.dirname(filePath), function(err) {
        if (err) throw err;

        fs.writeFile(filePath, result.body, function(err) {
          if (err) throw err;
          fileCount++;
          console.log(fileCount + ' - ' + filePath + ' is saved!');
        });
      });
    }
  }
});

c.queue(startUrl);
