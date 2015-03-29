'use strict'

var $ = require('NodObjC');
$.framework('Cocoa');
$.framework('Foundation');

var pool;

var init = function() {
    pool = $.NSAutoreleasePool('alloc')('init');
}

var getMousePos = function() {
    var ourEvent = $.CGEventCreate(null); 
    var pos = $.CGEventGetLocation(ourEvent);
    return {x: pos.x << 0, y: pos.y << 0}
}

var setMouse = function(x, y) {
    var e = $.CGEventCreateMouseEvent(null, $.kCGEventMouseMoved, $.CGPointMake(x, y), $.kCGMouseButtonLeft);
    $.CGEventPost($.kCGHIDEventTap, e);
    // $.CFRelease(e);
}

var mouseDown = function(x, y, right) {
    if (right == undefined) {
        right = false;
    }
    var kCGEvent = right ? $.kCGEventRightMouseDown : $.kCGEventLeftMouseDown;
    var kCGMouseButton = right ? $.kCGMouseButtonRight : $.kCGMouseButtonLeft;
    var e = $.CGEventCreateMouseEvent(null, kCGEvent, $.CGPointMake(x, y), kCGMouseButton);
    $.CGEventPost($.kCGHIDEventTap, e);
    // $.CFRelease(e);
}

var mouseUp = function(x, y, right) {
    if (right == undefined) {
        right = false;
    }
    var kCGEvent = right ? $.kCGEventRightMouseUp : $.kCGEventLeftMouseUp;
    var kCGMouseButton = right ? $.kCGMouseButtonRight : $.kCGMouseButtonLeft;
    var e = $.CGEventCreateMouseEvent(null, kCGEvent, $.CGPointMake(x, y), kCGMouseButton);
    $.CGEventPost($.kCGHIDEventTap, e);
    // $.CFRelease(e);
}

var jsCharToMacKeyCode = function (key) {
    var map = {'a': 0, 'b': 11, 'c': 8, 'd': 2, 'e': 14, 'f': 3, 'g': 5, 'h': 4, 'i': 34, 'j': 38, 'k': 40, 'l': 37, 'm': 46, 'n': 45, 'o': 31, 'p': 35, 'q': 12, 'r': 15, 's': 1, 't': 17, 'u': 32, 'v': 9, 'w': 13, 'x': 7, 'y': 16, 'z': 6};
    return map[key];
}

// Keycodes defined in https://gist.github.com/willwade/5330474
var keyDown = function(char) {
    var keyCode = jsCharToMacKeyCode(char);
    if (keyCode == undefined) {
        throw 'Unrecognised character in keyDown';
    }
    var e = $.CGEventCreateKeyboardEvent(null, keyCode, true);
    $.CGEventPost($.kCGHIDEventTap, e);
    // $.CFRelease(e);
}

var keyUp = function(char) {
    var keyCode = jsCharToMacKeyCode(char);
    if (keyCode == undefined) {
        throw 'Unrecognised character in keyDown';
    }
    var e = $.CGEventCreateKeyboardEvent(null, keyCode, false);
    $.CGEventPost($.kCGHIDEventTap, e);
    // $.CFRelease(e);
}

var getDisplayId = function() {
    return $.CGMainDisplayID();
}

var getBitmap = function(xs, ys, xe, ye) {
    var displayID = getDisplayId();
    var image = $.CGDisplayCreateImageForRect(displayID, $.CGRectMake(xs, ys, xe - xs + 1, ye - ys + 1));
    var bitmap = $.NSBitmapImageRep('alloc')('initWithCGImage', image);
    $.CGImageRelease(image);
    return bitmap;
}

var getColor = function (x, y) {
    var displayID = getDisplayId();
    var cGImageRef = $.CGDisplayCreateImageForRect(displayID, $.CGRectMake(x, y, 1, 1));
    var width = $.CGImageGetWidth(cGImageRef);
    var height = $.CGImageGetHeight(cGImageRef);
    var data = new Buffer(height * width * 4);
    var bytesPerPixel = 4;
    var bytesPerRow = bytesPerPixel * width;
    var bitsPerComponent = 8;
    var cGColorSpaceRef = $.CGColorSpaceCreateDeviceRGB();
    var cGContextRef = $.CGBitmapContextCreate(data, width, height, bitsPerComponent, bytesPerRow, cGColorSpaceRef, $.kCGImageAlphaPremultipliedLast | $.kCGBitmapByteOrder32Big);
    $.CGContextDrawImage(cGContextRef, $.CGRectMake(0, 0, width, height), cGImageRef);
    $.CGContextRelease(cGContextRef);
    return {r: data[0], g: data[1], b: data[2]};    
}

var getRealColor = function(x, y) {
    var nSBitmapImageRep = getBitmap(x, y, x, y);
    var nSColor = nSBitmapImageRep('colorAtX', 0, 'y', 0);  
    nSBitmapImageRep('release');
    var red = nSColor('redComponent') * 255;
    var green = nSColor('greenComponent') * 255;
    var blue = nSColor('blueComponent') * 255;
    return {r: red, g: green, b: blue};    
}

var findColor = function(target, xs, ys, xe, ye) {
    var startTime = Date.now();
    var displayID = getDisplayId();
    var cGImageRef = $.CGDisplayCreateImageForRect(displayID, $.CGRectMake(xs, ys, xe - xs + 1, ye - ys + 1));
    var width = $.CGImageGetWidth(cGImageRef);
    var height = $.CGImageGetHeight(cGImageRef);
    var data = new Buffer(height * width * 4);
    var bytesPerPixel = 4;
    var bytesPerRow = bytesPerPixel * width;
    var bitsPerComponent = 8;
    var cGColorSpaceRef = $.CGColorSpaceCreateDeviceRGB();
    var cGContextRef = $.CGBitmapContextCreate(data, width, height, bitsPerComponent, bytesPerRow, cGColorSpaceRef, $.kCGImageAlphaPremultipliedLast | $.kCGBitmapByteOrder32Big);
    $.CGContextDrawImage(cGContextRef, $.CGRectMake(0, 0, width, height), cGImageRef);
    $.CGContextRelease(cGContextRef);
    // console.log(data.toJSON());
    for (var y = 0; y <= 2 * (ye - ys); y += 2) {
        for (var x = 0; x <= 2 * (xe - xs); x += 2) {
            var r = data[4*(x + y * width)];
            var g = data[4*(x + y * width) + 1];
            var b = data[4*(x + y * width) + 2];
            // console.log('red is at '+4*(x + y * width)+', green is at '+4*(x + y * width + 1)+', blue is at '+4*(x + y * width + 2));
            // console.log('color at '+(xs + x/2)+', '+(ys + y/2) + ' is '+r+', '+g+', '+b);
            if (r == target.r && g == target.g && b == target.b) {
                // setMouse(xs + x/2, ys + y/2);
                return {x: xs + x/2, y: ys + y/2};
            }
        }
    }
    var endTime = Date.now();
    var timeDelta = endTime-startTime;
    console.log('Done. Took '+timeDelta+'ms, or '+(timeDelta/((xe-xs)*(ye-ys)))+'ms per pixel.');
    return {x: -1, y: -1}
}


var quit = function() {
    pool('drain');
}

module.exports = {
    init: init,
    getMousePos: getMousePos,
    setMouse: setMouse,
    mouseDown: mouseDown,
    mouseUp: mouseUp,
    keyDown: keyDown,
    keyUp: keyUp,
    getColor: getColor,
    getRealColor: getRealColor,
    findColor: findColor,
    quit: quit
}
