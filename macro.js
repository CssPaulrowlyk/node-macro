/* 

Welcome to macrojs. $ supports the following methods:

    setMouse(x, y) moves the mouse to x, y immediately
    moveMouseHuman(x, y, speed) moves the mouse to x, y like a human. Speed defaults to 25 if unspecified.
    getMousePos() returns the current position in an object {x: x, y: y}
    clickMouse(x, y, right) clicks the mouse like a human at x, y. Set right to true if it should right click.
    mouseDown(x, y, right) presses the mouse down at x, y. Set right to true if it should right click.
    mouseUp(x, y, right) releases the mouse down at x, y. Set right to true if it should right click.
    sendKeysHuman(str) types the string str like a human. It only supports letters (upper and lowercase) and the space bar.
    keyDown(char) presses the char.
    keyUp(char) presses the char.
    getColor(x, y) returns the color at x, y in an object {r: r, g: g, b: b} where r, g and b take values from 0 to 255.
    findColor(target, xs, ys, xe, ye) returns the {x: x, y: y} coordinates of the target color in the box defined by xs, ys, xe, ye. The color must be provided as {r: r, g: g, b: b}
    findColorTolerance(target, xs, ys, xe, ye, tolerance) does the same as findColor but allows you to specify a tolerance. Increasing the tolerance returns less perfect matches.
    random(from, to) returns a random integer
    wait(ms) waits for ms milliseconds

    To call any of these you *must* use the yield keyword before the call. To learn why read http://www.html5rocks.com/en/tutorials/es6/promises/

    If you implement a function which uses a call from $ you must include the boilerplate Promise and spawn function as in the moveMouseToColorInBoxWithTolerance example.
    If you implement a function which doesn't call $ you may do it in the normal way.

*/


'use strict'

var $ = require('NodObjC');
$.framework('Cocoa');
$.framework('Foundation');

var Canvas = require('canvas');
var Image = Canvas.Image;

var fs = require('fs');

var pool, cGEventSourceRef;

// Borrowed from Q
function spawn(generatorFunc) {
  function continuer(verb, arg) {
    var result;
    try {
      result = generator[verb](arg);
    } catch (err) {
      return Promise.reject(err);
    }
    if (result.done) {
      return result.value;
    } else {
      return Promise.resolve(result.value).then(onFulfilled, onRejected);
    }
  }
  var generator = generatorFunc();
  var onFulfilled = continuer.bind(continuer, "next");
  var onRejected = continuer.bind(continuer, "throw");
  return onFulfilled();
}

var getMousePos = function() {
    return new Promise(function(resolve, reject){
        var ourEvent = $.CGEventCreate(cGEventSourceRef); 
        var pos = $.CGEventGetLocation(ourEvent);
        resolve({x: pos.x << 0, y: pos.y << 0});
    });
}

var setMouse = function(x, y) {
    return new Promise(function(resolve, reject){
        var e = $.CGEventCreateMouseEvent(cGEventSourceRef, $.kCGEventMouseMoved, $.CGPointMake(x, y), $.kCGMouseButtonLeft);
        $.CGEventPost($.kCGHIDEventTap, e);
        // $.CFRelease(e);
        resolve();
    });
}

var mouseDown = function(x, y, right) {
    return new Promise(function(resolve, reject){
        if (right == undefined) {
            right = false;
        }
        var kCGEvent = right ? $.kCGEventRightMouseDown : $.kCGEventLeftMouseDown;
        var kCGMouseButton = right ? $.kCGMouseButtonRight : $.kCGMouseButtonLeft;
        var e = $.CGEventCreateMouseEvent(cGEventSourceRef, kCGEvent, $.CGPointMake(x, y), kCGMouseButton);
        $.CGEventPost($.kCGHIDEventTap, e);
        // $.CFRelease(e);
        resolve();
    });
}

var mouseUp = function(x, y, right) {
    return new Promise(function(resolve, reject){
        if (right == undefined) {
            right = false;
        }
        var kCGEvent = right ? $.kCGEventRightMouseUp : $.kCGEventLeftMouseUp;
        var kCGMouseButton = right ? $.kCGMouseButtonRight : $.kCGMouseButtonLeft;
        var e = $.CGEventCreateMouseEvent(cGEventSourceRef, kCGEvent, $.CGPointMake(x, y), kCGMouseButton);
        $.CGEventPost($.kCGHIDEventTap, e);
        // $.CFRelease(e);
        resolve();
    });
}

var jsCharToMacKeyCode = function (key) {
    var map = {'a': 0, 'b': 11, 'c': 8, 'd': 2, 'e': 14, 'f': 3, 'g': 5, 'h': 4, 'i': 34, 'j': 38, 'k': 40, 'l': 37, 'm': 46, 'n': 45, 'o': 31, 'p': 35, 'q': 12, 'r': 15, 's': 1, 't': 17, 'u': 32, 'v': 9, 'w': 13, 'x': 7, 'y': 16, 'z': 6, ' ': 49, 'shift': 56};
    return map[key];
}

// Keycodes defined in https://gist.github.com/willwade/5330474
var keyDown = function(char) {
    return new Promise(function(resolve, reject){
        var keyCode = jsCharToMacKeyCode(char);
        if (keyCode == undefined) {
            throw 'Unrecognised character in keyDown';
        }
        var e = $.CGEventCreateKeyboardEvent(cGEventSourceRef, keyCode, true);
        $.CGEventPost($.kCGHIDEventTap, e);
        // $.CFRelease(e);
        resolve();
    });
}

var keyUp = function(char) {
    return new Promise(function(resolve, reject){
        var keyCode = jsCharToMacKeyCode(char);
        if (keyCode == undefined) {
            throw 'Unrecognised character in keyUp';
        }
        var e = $.CGEventCreateKeyboardEvent(cGEventSourceRef, keyCode, false);
        $.CGEventPost($.kCGHIDEventTap, e);
        // $.CFRelease(e);
        resolve();
    });
}

var getDisplayId = function() {
    return $.CGMainDisplayID();
}

var getColor = function (x, y) {
    return new Promise(function(resolve, reject){
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
        resolve({r: data[0], g: data[1], b: data[2]});
    });
}

var getBitmap = function(xs, ys, xe, ye) {
    var displayID = getDisplayId();
    var image = $.CGDisplayCreateImageForRect(displayID, $.CGRectMake(xs, ys, xe - xs + 1, ye - ys + 1));
    var bitmap = $.NSBitmapImageRep('alloc')('initWithCGImage', image);
    $.CGImageRelease(image);
    return bitmap;
}

var getRealColor = function(x, y) {
    return new Promise(function(resolve, reject){
        var nSBitmapImageRep = getBitmap(x, y, x, y);
        var nSColor = nSBitmapImageRep('colorAtX', 0, 'y', 0);  
        nSBitmapImageRep('release');
        var red = nSColor('redComponent') * 255;
        var green = nSColor('greenComponent') * 255;
        var blue = nSColor('blueComponent') * 255;
        resolve({r: red, g: green, b: blue});
    });
}

var findColor = function(target, xs, ys, xe, ye) {
    return findColorTolerance(target, xs, ys, xe, ye, 0);
}

var getScreenData = function(xs, ys, xe, ye) {
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
    return data;
}

var findColorTolerance = function(target, xs, ys, xe, ye, tol) {
    return new Promise(function(resolve, reject){
        var startTime = Date.now();
        var width = 2 * (xe - xs + 1);
        var height = 2 * (ye - ys + 1);
        var data = getScreenData(xs, ys, xe, ye);
        var abs = Math.abs;
        for (var y = 0; y <= 2 * (ye - ys); y += 2) {
            for (var x = 0; x <= 2 * (xe - xs); x += 2) {
                var r = data[4*(x + y * width)];
                var g = data[4*(x + y * width) + 1];
                var b = data[4*(x + y * width) + 2];
                // console.log('red is at '+4*(x + y * width)+', green is at '+4*(x + y * width + 1)+', blue is at '+4*(x + y * width + 2));
                // console.log('color at '+(xs + x/2)+', '+(ys + y/2) + ' is '+r+', '+g+', '+b);
                var error = abs(r - target.r);
                if (error <= tol) {
                    error += abs(g - target.g);
                    if (error <= tol) {
                        error += abs(b - target.b);
                        if (error <= tol) {
                            // setMouse(xs + x/2, ys + y/2);
                            resolve({x: xs + x/2, y: ys + y/2});
                        }
                    }
                }
            }
        }
        var endTime = Date.now();
        var timeDelta = endTime-startTime;
        // console.log('Done. Took '+timeDelta+'ms, or '+(timeDelta/((xe-xs)*(ye-ys)))+'ms per pixel.');
        resolve({x: -1, y: -1});
    });
}

var findBitmap = function(imageName, xs, ys, xe, ye, tolerance) {
    return new Promise(function(resolve, reject){
        var imageSrc = fs.readFileSync(__dirname + '/' + imageName);
        var image = new Image;
        var abs = Math.abs;
        image.onload = function () {
            var canvas = new Canvas(image.width, image.height);
            var ctx = canvas.getContext('2d');
            ctx.drawImage(image, 0, 0, image.width, image.height);
            var imageData = ctx.getImageData(0, 0, image.width, image.height).data;
            var imageWidth = image.width;
            var imageHeight = image.height;
            var screenData = getScreenData(xs, ys, xe, ye);
            var screenWidth = 2 * (xe - xs + 1);
            var screenHeight = 2 * (ye - ys + 1);
            // Increment by 1 instead of 2 incase the bitmap is offset
            for (var screenStartY = 0; screenStartY <= 2 * (ye - ys - imageHeight); screenStartY++) {
                for (var screenStartX = 0; screenStartX <= 2 * (xe - xs - imageWidth); screenStartX++) {
                    var match = true;
                    var foundX = screenStartX;
                    var foundY = screenStartY;
                    for (var imageY = 0; imageY < imageHeight; imageY++) {
                        var screenY = screenStartY + imageY;
                            for (var imageX = 0; imageX < imageWidth; imageX++) {
                            var screenX = screenStartX + imageX;
                            // console.log('Comparing '+imageX+', '+imageY+' to '+screenX +', '+screenY);
                            var screenR = screenData[4*(screenX + screenY * screenWidth)];
                            var screenG = screenData[4*(screenX + screenY * screenWidth) + 1];
                            var screenB = screenData[4*(screenX + screenY * screenWidth) + 2];
                            var imageR = imageData[4*(imageX + imageY * imageWidth)];
                            var imageG = imageData[4*(imageX + imageY * imageWidth) + 1];
                            var imageB = imageData[4*(imageX + imageY * imageWidth) + 2];
                            // console.log({r: imageR, g: imageG, b: imageB});
                            var error = abs(screenR - imageR) + abs(screenG - imageG) + abs(screenB - imageB);
                            // console.log(abs(screenR - imageR) + abs(screenG - imageG) + abs(screenB - imageB));
                            if (error > tolerance) {
                                match = false;
                                break;
                            } else {
                                // console.log('Partial match');
                            }
                        }
                        if (!match) {
                            break;
                        }
                    }
                    if (match) {
                        resolve({x: foundX/2 << 0, y: foundY/2 << 0});
                        return;
                    }
                }
            }
            resolve({x: -1, y: -1});    
        }
        image.src = imageSrc;
    });
}

// Convenience functions


var random = function (from, to) {
    return from + (Math.random() * (to - from) + 0.5) << 0;
}

var wait = function (time) {
    return new Promise(function(resolve, reject){
        setTimeout(resolve, time);
    });
}

var clickMouse = function (x, y, right) {
    return new Promise(function (resolve, reject) {
        spawn(function*() {
            if (right == undefined) {
                right == false;
            }
            yield mouseDown(x, y, right);
            yield wait(random(40, 100));
            yield mouseUp(x, y, right);
            resolve();
        })
    });
}

var moveMouse = function (endX, endY, speed) {
    return new Promise(function(resolve, reject) {
        spawn(function*(){
            if (speed == undefined) {
                speed = 25;
            }
            var speedModifier = Math.min(speed, 1) * 5;
            var currPos = yield getMousePos();
            var currX = currPos.x;
            var currY = currPos.y;
            var bigDX = endX - currX;
            var bigDY = endY - currY;
            var movingRight = (bigDX > 0) ? 1 : -1;
            var movingDown = (bigDY > 0) ? 1 : -1;
            var time = Math.sqrt(Math.pow(bigDX, 2) + Math.pow(bigDY, 2)) * speedModifier << 0;
            var moveEveryX = time/bigDX;
            var moveEveryY = time/bigDY;
            moveEveryX = Math.abs(moveEveryX);
            moveEveryY = Math.abs(moveEveryY);
            var xCounter = 0;
            var yCounter = 0;
            while (true) {
                var doneX = (movingRight == 1 && currX >= endX) || (movingRight == -1 && currX <= endX);
                var doneY = (movingDown == 1 && currY >= endY) || (movingDown == -1 && currY <= endY);
                if (doneX && doneY) {
                    resolve();
                    break;
                } else {
                    xCounter += speedModifier; 
                    yCounter += speedModifier;
                    if (xCounter >= moveEveryX) {
                        xCounter -= moveEveryX;
                        currX += movingRight * speedModifier;
                    }
                    if (yCounter >= moveEveryY) {
                        yCounter -= moveEveryY;
                        currY += movingDown * speedModifier;
                    }
                    yield setMouse(currX, currY);
                    yield wait(1);
                }
            }
        });
    });
}

// A port of humanWindMouse from https://github.com/SRL/SRL-6/
var moveMouseHuman = function(xe, ye, speed) {
    return new Promise(function(resolve, reject){
        spawn(function*() {
            var distance = function(start, end) {
                return Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2)) << 0;
            }
            var pos = yield getMousePos();

            var xs = pos.x;
            var ys = pos.y;
            var targetArea = ((Math.random() * speed) / 2.0 + speed);
            var gravity = 7;
            var wind = 5;
            var x = xs;
            var y = ys;
            var veloX = 0, veloY = 0;
            var veloMag, dist, randomDist, d;
            var windX = 0, windY = 0;
            var lastX, lastY, w, tDist;
            var timeOut;
            var sqrt2, sqrt3, sqrt5, maxStep;
            var startPoint = {x: xs, y: ys};
            var endPoint = {x: xe, y: ye};

            sqrt2 = Math.sqrt(2);
            sqrt3 = Math.sqrt(3);
            sqrt5 = Math.sqrt(5);

            tDist = distance(startPoint, endPoint);
            timeOut = Date.now() + 10000;

            while (Date.now() < timeOut) {
                dist = distance({x: x, y: y}, {x: xe, y: ye});
                wind = Math.min(wind, dist);

                dist = Math.max(dist, 1);
                d = tDist * 0.04 << 0;
                d = Math.min(d, 25);
                d = Math.max(d, 5);

                if (random(1,5) == 1) {
                    d = random(1, 5);
                }

                maxStep = Math.min(d, dist);

                if (dist >= targetArea) {
                    windX = windX / sqrt3 + (Math.random() * (wind * 2 + 1) - wind) / sqrt5;
                    windY = windY / sqrt3 + (Math.random() * (wind * 2 + 1) - wind) / sqrt5;
                } else {
                    windX = windX / sqrt2;
                    windY = windY / sqrt2;
                }

                veloX += windX;
                veloY += windY;

                veloX += gravity * (xe - x) / dist;
                veloY += gravity * (ye - y) / dist;

                if (Math.sqrt(Math.pow(veloX, 2) + Math.pow(veloY, 2)) > maxStep) {
                    randomDist = maxStep / 2 + (Math.random() * (maxStep / 2));
                    veloMag = Math.sqrt(veloX * veloX + veloY * veloY);
                    veloX = (veloX / veloMag) * randomDist;
                    veloY = (veloY / veloMag) * randomDist;
                }

                lastX = x;
                lastY = y;

                x = x + veloX << 0;
                y = y + veloY << 0;

                if (lastX !== x || lastY !== y) {
                    yield setMouse(x, y);
                }

                w = Math.random() * (600 / speed);
                yield wait(w);

                if (distance({x: x, y: y}, {x: xe, y: ye}) <= 1) {
                    break;
                }
            }

            if (xe !== x || ye !== y) {
                yield setMouse(xe, ye);
            }
            resolve();
        });
    });
}


var sendKeysHuman = function (str) {
    return new Promise(function(resolve, reject) {
        spawn(function*() {
            for(var i = 0; i < str.length; i++) {
                var key = str[i];
                var uppercase = key !== key.toLowerCase();
                if (uppercase) { 
                    key = key.toLowerCase();
                    yield keyDown('shift'); 
                    yield wait(random(20,70)); 
                };
                yield keyDown(key);
                yield wait(random(30, 125));
                yield keyUp(key);
                yield wait(random(10, 100));
                if (uppercase) { 
                    yield keyUp('shift'); 
                    yield wait(random(10, 50)); 
                };
            }
            resolve();
        });
    });
}

var init = function() {
    pool = $.NSAutoreleasePool('alloc')('init');
    cGEventSourceRef = $.CGEventSourceCreate($.kCGEventSourceStateHIDSystemState);
}

var quit = function() {
    pool('drain');
}

init();

module.exports = {
    init: init,
    moveMouseHuman: moveMouseHuman,
    getMousePos: getMousePos,
    setMouse: setMouse,
    clickMouse: clickMouse,
    mouseDown: mouseDown,
    mouseUp: mouseUp,
    sendKeysHuman: sendKeysHuman,
    keyDown: keyDown,
    keyUp: keyUp,
    getColor: getColor,
    getRealColor: getRealColor,
    findColor: findColor,
    findColorTolerance: findColorTolerance,
    findBitmap: findBitmap,
    random: random,
    wait: wait,
    spawn: spawn,
    quit: quit
}
