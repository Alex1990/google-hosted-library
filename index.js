var path = require('path');
var fs = require('fs-extra');
var yaml = require('js-yaml');
var semver = require('semver');
var extend = require('extend');
var Crawler = require('crawler');

// Default settings.
var defaults = {
  outputDir: '.',
  maxConnections: 10,
  libFilter: null,
  logConfig: true 
}

// This page is the guide of the libraries.
var startUrl = 'https://developers.google.com/speed/libraries/devguide';

// The library host.
var libUrlPrefix = 'http://ajax.googleapis.com/ajax/libs/';

// Count the request and file.
var requestCount = 0;
var fileCount = 0;

// All libraries path template.
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

// Export the method.
module.exports = function(opts) {

  var configFile = './_config.yml';
  
  var config = yaml.safeLoad(fs.readFileSync(configFile, 'utf8'));
  
  opts = extend(true, {}, defaults, config, opts);
  
  var outputDir = opts.outputDir;
  var libFilter = opts.libFilter;
  var logConfig = opts.logConfig;

  // The crawler to download the libraries.
  var c = new Crawler({
    maxConnections: opts.maxConnections,
    callback: function(err, result, $) {
      if (err) throw err;
      
      var request = result.request;
  
      var libs = {};
      var libUrls = [];
      var contentType = result.headers['content-type'];
  
      if (opts.logInfo) {
         console.log(requestCount);
         console.log(request.path);
      }

      // Parse the guide page and generate the request urls.
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
  
      // Request all files in the minifest.
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
  
      // Save the files. The below check can exclude some advertisement URLs from the sick ISP. 
      } else if (/^\/ajax\/libs\//.test(request.path)) {
  
        var filePath = path.join(outputDir, request.path);
  
        fs.ensureDir(path.dirname(filePath), function(err) {
          if (err) throw err;
  
          fs.writeFile(filePath, result.body, function(err) {
            if (err) throw err;
            
            fileCount++;
            
           if (opts.logInfo)  console.log(fileCount + ' - ' + filePath + ' is saved!');
          });
        });
      }
    }
  });
  
  // Start the crawler.
  c.queue(startUrl);
}

// Generate the request URL according to the name and version of the library.
function createLibUrls(name, versions, urlPrefix, libFilter) {
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

// Remove the request if the file exists.
function removeExists(libUrls) {
  return libUrls.filter(function(libUrl) {
    var filePath = path.join(outputDir, libUrl.replace(/.*\/\/.*?\//, ''));
    if (fs.existsSync(filePath)) {
      return false;
    } else {
      return true;
    }
  });
}
