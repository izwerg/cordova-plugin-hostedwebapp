﻿var _manifest;
var _manifestError;
var _offlineView;
var _mainView;
var _zIndex = 10000;
var _enableOfflineSupport = true;
var _lastKnownLocation;
var _lastKnownLocationFailed = false;
var _externalWhiteList = [];

// creates a webview to host content
function configureHost(url, zOrder, display) {
    var webView = document.createElement(cordova.platformId === 'windows8' ? 'iframe' : 'x-ms-webview');
    var style = webView.style;
    style.position = 'absolute';
    style.top = 0;
    style.left = 0;
    style.zIndex = zOrder;
    style.width = window.innerWidth + 'px';
    style.height = window.innerHeight + 'px';
    if (display) {
        style.display = display;
    }

    if (url) {
        webView.src = url;
    }

    webView.addEventListener("MSWebViewNavigationCompleted", navigationCompletedEvent, false);
    webView.addEventListener("MSWebViewNavigationStarting", navigationStartingEvent, false);

    document.body.appendChild(webView);

    return webView;
}

// handles webview's navigation starting event
function navigationStartingEvent(evt) {
    // if the url to navigate to matches any of the rules in the external whitelist, open it outside de app
    _externalWhiteList.forEach(function (rule) {
        if (rule.test(evt.url)) {
            e.stopImmediatePropagation();
            e.preventDefault();
            console.log("Popping out URL: " + evt.url);
            Windows.System.Launcher.launchUriAsync(new Windows.Foundation.Uri(evt.url));
        }
    });
}

// handles webview's navigation completed event
function navigationCompletedEvent(evt) {
    if (evt.uri && evt.uri !== "") {
        if (evt.isSuccess) {
            _lastKnownLocationFailed = false;
            _offlineView.style.display = 'none';
        } else {
            _lastKnownLocationFailed = true;
        }

        _lastKnownLocation = evt.uri;
    }
}

// handles network connectivity change events
function connectivityEvent(evt) {
    console.log('Received a network connectivity change notification. The device is currently ' + evt.type + '.');
    if (_enableOfflineSupport) {
        if (evt.type === 'offline') {
            _offlineView.style.display = 'block';
        } else if (evt.type === 'online') {
            if (_lastKnownLocationFailed) {
                if (_lastKnownLocation) {
                    console.log("Reload last known location: '" + _lastKnownLocation + "'");
                    _mainView.src = _lastKnownLocation;
                }
            } else {
                _offlineView.style.display = 'none';
            }
        }
    }
}

// sets up a secondary webview to host the offline page
function configureOfflineSupport(offlinePage) {
    var offlinePageUrl = '///www/' + offlinePage;
    var url = new Windows.Foundation.Uri('ms-appx:' + offlinePageUrl);
    Windows.Storage.StorageFile.getFileFromApplicationUriAsync(url).then(
        function (file) {
            _offlineView = configureHost('ms-appx-web:' + offlinePageUrl, 10001, 'none');
        },
        function (err) {
            var message = 'It looks like you are offline. Please reconnect to use this application.';
            var offlinePageTemplate = '<html><body><div style="font-size: x-large; position: absolute; left: 0; top: 0; bottom: 0; right: 0; height: 0; text-align: center; margin: auto">' + message + '</div></body></html>';
            _offlineView = configureHost(null, _zIndex + 1, 'none');

            if (cordova.platformId === 'windows8') {
                _offlineView.style.backgroundColor = 'white';
                _offlineView.contentDocument.write(offlinePageTemplate);
            } else {
                _offlineView.navigateToString(offlinePageTemplate);
            }
        }).done(function () {
            document.addEventListener('offline', connectivityEvent, false);
            document.addEventListener('online', connectivityEvent, false);
        });
}

// escapes regular expression reserved symbols
function escapeRegex(str) {
    return ("" + str).replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1");
}    

// converts a string pattern to a regular expression
function convertPatternToRegex(pattern, excludeLineStart, excludeLineEnd) {
    var isNot = (pattern[0] == '!');
    if (isNot) { pattern = pattern.substr(1) };

    var regexBody = WAT.escapeRegex(pattern);

    excludeLineStart = !!excludeLineStart;
    excludeLineEnd = !!excludeLineEnd;

    regexBody = regexBody.replace(/\\\?/g, ".?").replace(/\\\*/g, ".*?");
    if (isNot) { regexBody = "((?!" + regexBody + ").)*"; }
    if (!excludeLineStart) { regexBody = "^" + regexBody; }
    if (!excludeLineEnd) { regexBody += "$"; }

    return new RegExp(regexBody);
}

// initializes an array of the external access rules defined in the manifest
function configureExternalWhiteList(manifest) {
    if (manifest && manifest.hap_urlAccess && manifest.hap_urlAccess.length) {
        manifest.hap_urlAccess.forEach(function (rule) {
            if (rule.external) {
                _externalWhiteList.push(convertPatternToRegex(rule));
            }
        });
    }
}

module.exports = {
    // loads the W3C manifest file and parses it
    loadManifest: function (successCallback, errorCallback, args) {
        var manifestFileName = (args && args instanceof Array && args.length > 0) ? args[0] : 'manifest.json';
        var configFile = 'ms-appx:///www/' + manifestFileName;
        var uri = new Windows.Foundation.Uri(configFile);
        Windows.Storage.StorageFile.getFileFromApplicationUriAsync(uri).then(
            function (file) {
                Windows.Storage.FileIO.readTextAsync(file).then(function (data) {
                    try {
                        _manifest = JSON.parse(data);
                        if (successCallback) {
                            successCallback(_manifest);
                        }
                    } catch (err) {
                        _manifestError = 'Error parsing manifest file: ' + manifestFileName + ' - ' + err.message;
                        console.log(_manifestError);
                    }
                });
            },
            function (err) {
                _manifestError = 'Error reading manifest file: ' + manifestFileName + ' - ' + err;
                console.log(_manifestError);
                if (errorCallback) {
                    errorCallback(err);
                }
            });
    },

    // returns the currently loaded manifest
    getManifest: function (successCallback, errorCallback) {
        if (_manifest) {
            if (successCallback) {
                successCallback(_manifest);
            }
        } else {
            if (errorCallback) {
                errorCallback(new Error(_manifestError));
            }
        }
    },

    // enables offline page support
    enableOfflinePage: function () {
        _enableOfflineSupport = true;
    },

    // disables offline page support
    disableOfflinePage: function () {
        _enableOfflineSupport = false;
    }
}; // exports

cordova.commandProxy.add('HostedWebApp', module.exports);

module.exports.loadManifest(
    function (manifest) {
        configureOfflineSupport('offline.html');
        configureExternalWhiteList(manifest);
        _mainView = configureHost(manifest ? manifest.start_url : 'about:blank', _zIndex);
    });
